import { describe, expect, test } from "bun:test";
import { translator } from "../../../i18n";
import { makeBand } from "../band/types";
import type { BandPlan, BandSlot, PlayerKind } from "../band/types";
import type { InstrumentKind, Track } from "../track";
import { keyLayoutFromSteps, keysFor, learnSteps, padLayoutFromSteps, type Controller, type MidiLayout } from "./layout";
import type { SeatControl } from "./plan";
import {
  claimsOf,
  conflictsOf,
  controlPlan,
  controllerKeys,
  controllerLabels,
  keyAction,
  keyboardOrdinal,
  keyboardTypistSeat,
  midiAction,
  normalisedController,
  padAction,
  padAxisAction,
  seatControlReadout,
  seatsOnLostPads,
  type ControlPlan,
} from "./plan";

/** A song carrying a chart for each of these instruments: 5 columns, no notes. */
function song(kinds: InstrumentKind[], hasPitch = true, columns = 5): Track {
  return {
    id: "t",
    title: "T",
    durationMs: 1,
    melody: { parts: 1, hasPitch, rows: 6, rootMidi: 57, lines: [], notes: [] },
    charts: kinds.map((instrument) => ({
      instrument,
      difficulty: "normal" as const,
      columns,
      notes: [],
    })),
  };
}

const slot = (kind: PlayerKind) => ({ kind, difficulty: "normal" as const });

/** The plan for a band of these kinds, `humans` of them played by people. */
function planOf(
  kinds: PlayerKind[],
  humans: number,
  pads = 0,
  hasPitch = true,
): ControlPlan {
  const instruments = kinds.filter((kind) => kind !== "words") as InstrumentKind[];
  return controlPlan(song(instruments, hasPitch), makeBand({ slots: kinds.map(slot) }, humans), pads);
}

describe("the plan", () => {
  test("a player takes the keys their instrument is played with", () => {
    const plan = planOf(["guitar"], 1);
    expect(plan.seats[0]).toMatchObject({
      seat: 0,
      channel: "lanes",
      columns: 5,
      controller: { on: "keyboard", layout: 0 },
    });
    // A chorded instrument keeps its strum; the layout is cut to the columns.
    expect(claimsOf(plan).map((claim) => claim.control)).toContain("ArrowUp");
    expect(claimsOf(plan)).toHaveLength(8);
  });

  test("two guitar seats bound to two roles take their own chart's columns", () => {
    const twoRoles: Track = {
      id: "t",
      title: "T",
      durationMs: 1,
      melody: { parts: 1, hasPitch: false, rows: 6, rootMidi: 57, lines: [], notes: [] },
      charts: [
        { instrument: "guitar", role: "lead", difficulty: "normal", columns: 5, notes: [] },
        { instrument: "guitar", role: "rhythm", difficulty: "normal", columns: 4, notes: [] },
      ],
    };
    const plan = controlPlan(
      twoRoles,
      makeBand(
        {
          slots: [
            { kind: "guitar", role: "lead", difficulty: "normal" },
            { kind: "guitar", role: "rhythm", difficulty: "normal" },
          ],
        },
        2,
      ),
    );
    expect(plan.seats.map((seat) => seat.columns)).toEqual([5, 4]);
  });

  test("a song with no chart for an instrument asks for no keys at all", () => {
    // The bass is a person, but this song gives them nothing to play — so they
    // take no layout, and the guitar keeps the left-hand five to itself.
    const noChart = controlPlan(
      song(["guitar"]),
      makeBand({ slots: [slot("guitar"), slot("bass")] }, 2),
    );
    expect(noChart.seats[1]).toMatchObject({ seat: 1, columns: null, controller: { on: "none" } });

    const guitar = keysFor("guitar", 0, 5);
    expect(claimsOf(noChart)).toEqual(
      [...guitar.frets, ...guitar.strum, guitar.whammy].map((control) => ({
        seat: 0,
        on: "keyboard",
        control,
      })),
    );
    expect(conflictsOf(noChart)).toEqual([]);
  });

  test("the keyboard's layouts are not spent on players with nothing to play", () => {
    // The only person who can play takes the left-hand five, wherever their box is.
    const plan = controlPlan(
      song(["guitar"]),
      makeBand({ slots: [slot("bass"), slot("guitar")] }, 2),
    );
    expect(plan.seats.map((seat) => seat.controller)).toEqual([
      { on: "none" },
      { on: "keyboard", layout: 0 },
    ]);
  });

  test("the keyboard's own layouts go in the order they are needed", () => {
    const both = planOf(["guitar", "bass"], 2);
    expect(both.seats.map((seat) => seat.controller)).toEqual([
      { on: "keyboard", layout: 0 },
      { on: "keyboard", layout: 1 },
    ]);

    // A pad takes the first person's place, and the keyboard moves up to cover
    // the rest — so a lone keyboard player still gets the left-hand five.
    const padded = planOf(["guitar", "bass"], 2, 1);
    expect(padded.seats.map((seat) => seat.controller)).toEqual([
      { on: "pad", index: 0 },
      { on: "keyboard", layout: 0 },
    ]);
  });

  test("a player the machine plays has no controller at all", () => {
    const plan = planOf(["guitar", "bass"], 1);
    expect(plan.seats[1].controller).toEqual({ on: "none" });
    expect(claimsOf(plan).every((claim) => claim.seat === 0)).toBe(true);
  });

  test("a third player of one instrument takes the first player's keys again", () => {
    // One keyboard cannot tell two people apart, so the plan says so rather than
    // seating them and hoping. The player keeps their own place — the third layout
    // they *ask* for is the third, and it is `keysFor` that has only two to give.
    const plan = planOf(["guitar", "guitar", "guitar"], 3);
    expect(plan.seats[2].controller).toEqual({ on: "keyboard", layout: 2 });
    expect(conflictsOf(plan)).toEqual([
      { seats: [0, 2], controls: ["A", "S", "D", "F", "G", "↑", "↓", "Shift"] },
    ]);
  });

  test("two players on one keyboard who take different keys never conflict", () => {
    expect(conflictsOf(planOf(["guitar", "bass"], 2))).toEqual([]);
  });
});

describe("the words", () => {
  test("a pitched song is sung: everybody shares the one microphone", () => {
    const plan = planOf(["words", "words"], 1, 0, true);
    expect(plan.seats.map((seat) => seat.channel)).toEqual(["pitch", "pitch"]);
    expect(plan.seats.map((seat) => seat.controller)).toEqual([
      { on: "mic" },
      { on: "mic" },
    ]);
    // A microphone takes no typing, so a singer never conflicts with anything.
    expect(conflictsOf(plan)).toEqual([]);
  });

  test("a player can type a pitched song beside singers", () => {
    const setup = makeBand({
      slots: [
        { ...slot("words"), wordsMode: "sing" },
        { ...slot("words"), wordsMode: "type" },
      ],
    });
    const plan = controlPlan(song([], true), setup);
    expect(plan.seats.map((seat) => seat.channel)).toEqual(["pitch", "chars"]);
    expect(plan.seats.map((seat) => seat.controller)).toEqual([
      { on: "mic" },
      { on: "chars" },
    ]);
  });

  test("a song of only words is typed, and by one typist", () => {
    const plan = planOf(["words", "words"], 1, 0, false);
    expect(plan.seats.map((seat) => seat.controller)).toEqual([
      { on: "chars" },
      { on: "none" },
    ]);
  });

  test("a typist shares every key the instruments have bound", () => {
    // It is worth saying out loud: the letters a typist types *are* the guitar's
    // frets, and one keyboard is one keyboard.
    const plan = planOf(["guitar", "words"], 1, 0, false);
    expect(conflictsOf(plan)).toEqual([
      { seats: [0, 1], controls: ["A", "S", "D", "F", "G", "↑", "↓", "Shift"] },
    ]);
  });

  test("a guitar on a gamepad shares nothing with a typist", () => {
    // A typist types characters. Buttons are not characters, so a band with a
    // pad in it has nobody fighting over a key.
    const plan = planOf(["guitar", "words"], 1, 1, false);
    expect(plan.seats[0].controller).toEqual({ on: "pad", index: 0 });
    expect(conflictsOf(plan)).toEqual([]);
  });
});

describe("a controller a player set up", () => {
  test("wins over the dev panel's count of who is playing", () => {
    // `humans` marks the second player as the machine's; their own setting says
    // otherwise, and a player's own setting is what they expect to hold.
    const setup = makeBand(
      { slots: [slot("guitar"), slot("bass")] },
      1,
    );
    const set = {
      ...setup,
      players: setup.players.map((player) =>
        player.seat === 1
          ? { ...player, controller: { on: "pad", index: 0 } as const }
          : player,
      ),
    };
    const plan = controlPlan(song(["guitar", "bass"]), set);
    expect(plan.seats[1].controller).toEqual({ on: "pad", index: 0 });
  });

  test("plays the keys they learned, not the preset's", () => {
    const setup = makeBand({ slots: [slot("guitar")] }, 1);
    const keys = { frets: ["KeyZ", "KeyX", "KeyC"], strum: ["Space"], whammy: "KeyB" };
    const plan = controlPlan(song(["guitar"]), {
      ...setup,
      players: [{ ...setup.players[0], controller: { on: "keyboard", layout: 0, keys } }],
    });
    expect(keyAction(plan.seats[0], "KeyZ")).toEqual({ type: "fret", column: 0 });
    expect(keyAction(plan.seats[0], "KeyC")).toEqual({ type: "fret", column: 2 });
    expect(keyAction(plan.seats[0], "Space")).toEqual({ type: "strum" });
    expect(keyAction(plan.seats[0], "KeyB")).toEqual({ type: "whammy" });
    // The preset's third key is still free, and so is not theirs any more.
    expect(keyAction(plan.seats[0], "KeyD")).toBeNull();
  });

  test("a column their mapping does not reach falls back to the preset", () => {
    // Set up on a three-column chart, played on a five-column one: a setting must
    // never be the thing that makes a note unplayable.
    const setup = makeBand({ slots: [slot("guitar")] }, 1);
    const keys = { frets: ["KeyZ", "KeyX", "KeyC"], strum: ["Space"], whammy: "KeyB" };
    const plan = controlPlan(song(["guitar"], true, 5), {
      ...setup,
      players: [{ ...setup.players[0], controller: { on: "keyboard", layout: 0, keys } }],
    });
    expect(keyAction(plan.seats[0], "KeyZ")).toEqual({ type: "fret", column: 0 });
    // Columns 3 and 4 come from the left-hand five's own keys that are still free —
    // not the preset's third and fourth, which the player already learned.
    expect(keyAction(plan.seats[0], "KeyA")).toEqual({ type: "fret", column: 3 });
    expect(keyAction(plan.seats[0], "KeyS")).toEqual({ type: "fret", column: 4 });
  });

  test("a learned S D F plays a five-column song without a duplicate", () => {
    // The bug: filling each hole by column put the preset's F on column 3 as well
    // as column 2, so column 3 could never be played and a chord across them was
    // impossible. The fill is the preset's *remaining* controls, in preset order.
    const setup = makeBand({ slots: [slot("guitar")] }, 1);
    const steps = learnSteps("guitar", 3);
    const keys = keyLayoutFromSteps(steps, ["KeyS", "KeyD", "KeyF", "Space", null, "KeyB"]);
    const plan = controlPlan(song(["guitar"], true, 5), {
      ...setup,
      players: [{ ...setup.players[0], controller: { on: "keyboard", layout: 0, keys } }],
    });
    expect(keyAction(plan.seats[0], "KeyS")).toEqual({ type: "fret", column: 0 });
    expect(keyAction(plan.seats[0], "KeyD")).toEqual({ type: "fret", column: 1 });
    expect(keyAction(plan.seats[0], "KeyF")).toEqual({ type: "fret", column: 2 });
    expect(keyAction(plan.seats[0], "KeyA")).toEqual({ type: "fret", column: 3 });
    expect(keyAction(plan.seats[0], "KeyG")).toEqual({ type: "fret", column: 4 });
    // Every column is played by a different key: five frets, five controls.
    const frets = ["KeyS", "KeyD", "KeyF", "KeyA", "KeyG"].map((code) => {
      const action = keyAction(plan.seats[0], code);
      return action?.type === "fret" ? action.column : null;
    });
    expect(new Set(frets)).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  test("a hole in a learned mapping keeps its own column", () => {
    // Five frets learned with the middle one skipped: that column takes a preset
    // key nobody has used, and the two after it are still the player's own — not
    // one column to the left.
    const setup = makeBand({ slots: [slot("guitar")] }, 1);
    const steps = learnSteps("guitar", 5);
    const keys = keyLayoutFromSteps(steps, [
      "KeyZ",
      "KeyX",
      null,
      "KeyB",
      "KeyN",
      "Space",
      null,
      "KeyM",
    ]);
    const plan = controlPlan(song(["guitar"]), {
      ...setup,
      players: [{ ...setup.players[0], controller: { on: "keyboard", layout: 0, keys } }],
    });
    // The skipped column falls back to the left-hand five's first free key.
    expect(keyAction(plan.seats[0], "KeyA")).toEqual({ type: "fret", column: 2 });
    // The fourth and fifth are where they were learned, not shifted down.
    expect(keyAction(plan.seats[0], "KeyB")).toEqual({ type: "fret", column: 3 });
    expect(keyAction(plan.seats[0], "KeyN")).toEqual({ type: "fret", column: 4 });
    // The preset's third key is not the hole's: the preset key it took is A.
    expect(keyAction(plan.seats[0], "KeyD")).toBeNull();
  });

  test("plays the buttons they learned, not the standard set", () => {
    const setup = makeBand({ slots: [slot("guitar")] }, 1);
    const buttons = { frets: [9, 8, 7, 6, 5], strum: [1], whammy: 0 };
    const plan = controlPlan(song(["guitar"]), {
      ...setup,
      players: [{ ...setup.players[0], controller: { on: "pad", index: 2, buttons } }],
    });
    expect(padAction(plan.seats[0], 2, 9)).toEqual({ type: "fret", column: 0 });
    expect(padAction(plan.seats[0], 2, 1)).toEqual({ type: "strum" });
    expect(padAction(plan.seats[0], 2, 0)).toEqual({ type: "whammy" });
    // And the read-out names those buttons, not the standard set's.
    expect(controllerKeys(plan.seats[0])).toBe("Start Back RT LT RB · B · A");
    // Another pad's button is not theirs, and the standard set is not theirs either.
    expect(padAction(plan.seats[0], 3, 9)).toBeNull();
    expect(padAction(plan.seats[0], 2, 4)).toBeNull();
  });

  test("a pad learned on three columns fills a five-column song without a duplicate", () => {
    // The keyboard's rule, on a pad: fill each hole with a preset button nobody
    // has used yet, in preset order, and never repeat a control within the seat.
    const setup = makeBand({ slots: [slot("guitar")] }, 1);
    const steps = learnSteps("guitar", 3);
    const buttons = padLayoutFromSteps(steps, [9, 8, 7, 1, 2, 6]);
    const plan = controlPlan(song(["guitar"], true, 5), {
      ...setup,
      players: [{ ...setup.players[0], controller: { on: "pad", index: 0, buttons } }],
    });
    const columns = [9, 8, 7, 4, 2].map((button) => {
      const action = padAction(plan.seats[0], 0, button);
      return action?.type === "fret" ? action.column : null;
    });
    expect(columns).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(columns).size).toBe(5);
  });

  test("plays the strum bar on an axis they learned, either way", () => {
    const setup = makeBand({ slots: [slot("guitar")] }, 1);
    const buttons = {
      frets: [9, 8, 7, 6, 5],
      strum: [
        { axis: 2, direction: 1 as const },
        { axis: 2, direction: -1 as const },
      ],
      whammy: 0,
    };
    const plan = controlPlan(song(["guitar"]), {
      ...setup,
      players: [{ ...setup.players[0], controller: { on: "pad", index: 2, buttons } }],
    });
    expect(padAxisAction(plan.seats[0], 2, 2, 1)).toEqual({ type: "strum" });
    expect(padAxisAction(plan.seats[0], 2, 2, -1)).toEqual({ type: "strum" });
    // Another axis, a button that is a strum on no mapping, another pad, and the
    // preset's D-pad strum are none of this seat's.
    expect(padAxisAction(plan.seats[0], 2, 3, 1)).toBeNull();
    expect(padAxisAction(plan.seats[0], 3, 2, 1)).toBeNull();
    expect(padAction(plan.seats[0], 2, 12)).toBeNull();
    // A learned strum replaces the preset's, so both the axis and the read-out
    // name the bar the player actually has.
    expect(controllerKeys(plan.seats[0])).toBe("Start Back RT LT RB · Axis 2 ± · A");
  });

  test("a stored axis that names one way answers both ways", () => {
    // A spring-return bar is one axis and two directions; a mapping that stored
    // only one crossing is repaired where it is played, not left half silent.
    const setup = makeBand({ slots: [slot("guitar")] }, 1);
    const buttons = {
      frets: [4, 2, 0, 1, 5],
      strum: [{ axis: 3, direction: 1 as const }],
      whammy: 7,
    };
    const plan = controlPlan(song(["guitar"]), {
      ...setup,
      players: [{ ...setup.players[0], controller: { on: "pad", index: 0, buttons } }],
    });
    expect(padAxisAction(plan.seats[0], 0, 3, 1)).toEqual({ type: "strum" });
    expect(padAxisAction(plan.seats[0], 0, 3, -1)).toEqual({ type: "strum" });
  });

  test("a pad's claims tag an axis, and list it once", () => {
    const setup = makeBand({ slots: [slot("guitar")] }, 1);
    const plan = controlPlan(song(["guitar"]), {
      ...setup,
      players: [
        {
          ...setup.players[0],
          controller: {
            on: "pad",
            index: 0,
            buttons: {
              frets: [4, 2, 0, 1, 5],
              strum: [
                { axis: 2, direction: 1 },
                { axis: 2, direction: -1 },
              ],
              whammy: 7,
            },
          },
        },
      ],
    });
    const claims = claimsOf(plan).filter((claim) => claim.on === "pad");
    // Five frets, the one axis, the whammy: both directions are one control.
    expect(claims).toHaveLength(7);
    expect(claims.find((claim) => typeof claim.control === "object")).toEqual({
      seat: 0,
      on: "pad",
      control: { axis: 2, direction: 1 },
      device: 0,
    });
  });

  test("what they set up is what the warnings are about", () => {
    // A learned mapping that lands on another player's keys is a real conflict.
    const setup = makeBand({ slots: [slot("guitar"), slot("bass")] }, 2);
    const keys = { frets: ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG"], strum: ["ArrowUp"], whammy: "ShiftLeft" };
    const plan = controlPlan(song(["guitar", "bass"]), {
      ...setup,
      players: setup.players.map((player) =>
        player.seat === 1 ? { ...player, controller: { on: "keyboard", layout: 1, keys } } : player,
      ),
    });
    expect(conflictsOf(plan)).toEqual([
      { seats: [0, 1], controls: ["A", "S", "D", "F", "G", "↑", "Shift"] },
    ]);
  });

  test("a player can bow out of the words the song gives them", () => {
    const setup = makeBand({ slots: [slot("words")] }, 1);
    const bowed = {
      ...setup,
      players: setup.players.map((player) => ({ ...player, controller: { on: "none" as const } })),
    };
    expect(controlPlan(song([], true), bowed).seats[0].controller).toEqual({ on: "none" });
    expect(controlPlan(song([], true), setup).seats[0].controller).toEqual({ on: "mic" });
  });
});

describe("a controller the seat cannot play with", () => {
  test("only the controllers a seat's channel can use survive", () => {
    expect(normalisedController("guitar", { on: "mic" })).toBeUndefined();
    expect(normalisedController("guitar", { on: "chars" })).toBeUndefined();
    expect(normalisedController("words", { on: "keyboard", layout: 0 })).toBeUndefined();
    expect(normalisedController("words", { on: "pad", index: 0 })).toBeUndefined();
    // The ones it can use are kept exactly as they were.
    expect(normalisedController("guitar", { on: "none" })).toEqual({ on: "none" });
    expect(normalisedController("guitar", { on: "midi" })).toEqual({ on: "midi" });
    expect(normalisedController("words", { on: "mic" })).toEqual({ on: "mic" });
    expect(normalisedController("words", { on: "chars" })).toEqual({ on: "chars" });
    // No choice at all is still no choice, which is the automatic seat.
    expect(normalisedController("guitar", undefined)).toBeUndefined();
  });

  test("a microphone left on a guitar box is unset, so the guitar still plays", () => {
    // Switching a box from the words to an instrument can leave the old controller
    // behind; a seat with no claims is a player who can never hit a note.
    const setup = makeBand({ slots: [slot("guitar")] }, 1);
    const plan = controlPlan(song(["guitar"]), {
      ...setup,
      players: [{ ...setup.players[0], controller: { on: "mic" } }],
    });
    expect(plan.seats[0].controller).toEqual({ on: "keyboard", layout: 0 });
    expect(claimsOf(plan).length).toBeGreaterThan(0);
  });

  test("a gamepad left on a words box leaves the words a person is playing", () => {
    const setup = makeBand({ slots: [slot("words")] }, 1);
    const plan = controlPlan(song([], true), {
      ...setup,
      players: [{ ...setup.players[0], controller: { on: "pad", index: 0 } }],
    });
    expect(plan.seats[0].controller).toEqual({ on: "mic" });
  });

  test("a controller the seat can use is still the player's own", () => {
    const setup = makeBand({ slots: [slot("guitar")] }, 1);
    const choice: Controller = { on: "pad", index: 3 };
    const plan = controlPlan(song(["guitar"]), {
      ...setup,
      players: [{ ...setup.players[0], controller: choice }],
    });
    expect(plan.seats[0].controller).toEqual(choice);
  });
});

describe("automatic seats keep clear of an explicit choice", () => {
  /** A two-lane band, each player on the controller `chosen` says. */
  function chosen(controllers: [BandSlot["controller"], BandSlot["controller"]]) {
    const setup = makeBand({ slots: [slot("guitar"), slot("bass")] }, 2);
    return {
      ...setup,
      players: setup.players.map((player, index) => ({
        ...player,
        controller: controllers[index],
      })),
    };
  }

  test("a pad already chosen is not handed to somebody else", () => {
    const setup = chosen([{ on: "pad", index: 0 }, undefined]);
    // The one connected pad is the first player's: the second takes the keys.
    expect(
      controlPlan(song(["guitar", "bass"]), setup, 1).seats.map((seat) => seat.controller),
    ).toEqual([{ on: "pad", index: 0 }, { on: "keyboard", layout: 0 }]);
    // With a second pad, the automatic seat takes the free one.
    expect(
      controlPlan(song(["guitar", "bass"]), setup, 2).seats.map((seat) => seat.controller),
    ).toEqual([{ on: "pad", index: 0 }, { on: "pad", index: 1 }]);
  });

  test("a keyboard layout already chosen is not handed to somebody else", () => {
    const setup = chosen([{ on: "keyboard", layout: 0 }, undefined]);
    expect(
      controlPlan(song(["guitar", "bass"]), setup).seats.map((seat) => seat.controller),
    ).toEqual([{ on: "keyboard", layout: 0 }, { on: "keyboard", layout: 1 }]);
  });

  test("two explicit pads on different indices stay as they are", () => {
    const setup = chosen([{ on: "pad", index: 1 }, { on: "pad", index: 0 }]);
    expect(
      controlPlan(song(["guitar", "bass"]), setup, 2).seats.map((seat) => seat.controller),
    ).toEqual([{ on: "pad", index: 1 }, { on: "pad", index: 0 }]);
  });
});

describe("the one keyboard a typist types on", () => {
  test("a machine typist does not consume the slot", () => {
    const setup = makeBand({ slots: [slot("words"), slot("words")] }, 1);
    const bowed = {
      ...setup,
      players: setup.players.map((player) =>
        player.seat === 0 ? { ...player, controller: { on: "none" as const } } : player,
      ),
    };
    expect(
      controlPlan(song([], false), bowed).seats.map((seat) => seat.controller),
    ).toEqual([{ on: "none" }, { on: "chars" }]);
    // Two humans: the first types, the second is the machine's.
    expect(
      controlPlan(song([], false), setup).seats.map((seat) => seat.controller),
    ).toEqual([{ on: "chars" }, { on: "none" }]);
  });

  test("the keyboard's seat is the plan's, not the first typist in band order", () => {
    const setup = makeBand({ slots: [slot("words"), slot("words")] }, 1);
    const bowed = {
      ...setup,
      players: setup.players.map((player) =>
        player.seat === 0 ? { ...player, controller: { on: "none" as const } } : player,
      ),
    };
    const plan = controlPlan(song([], false), bowed);
    expect(plan.seats.map((seat) => seat.controller)).toEqual([
      { on: "none" },
      { on: "chars" },
    ]);
    // The first word seat is the machine's; the second is the typist a person is
    // playing. Reading the keyboard by position would give it to the machine.
    expect(keyboardTypistSeat(plan)).toBe(1);
    expect(keyboardTypistSeat(controlPlan(song([], false), setup))).toBe(0);
    // A band of singers has no typing keyboard at all.
    const singers = makeBand({ slots: [slot("words")] }, 1);
    expect(keyboardTypistSeat(controlPlan(song([], true), singers))).toBeNull();
  });
});

describe("a seat on MIDI", () => {
  /** One guitar seat, on MIDI, with the song carrying `columns` columns. */
  function midiPlan(columns = 5, notes?: MidiLayout) {
    const setup = makeBand({ slots: [slot("guitar")] }, 1);
    return controlPlan(song(["guitar"], true, columns), {
      ...setup,
      players: [
        {
          ...setup.players[0],
          controller: { on: "midi", ...(notes ? { notes } : {}) },
        },
      ],
    });
  }

  test("plays the preset's frets, strum and whammy", () => {
    const plan = midiPlan();
    const seat = plan.seats[0];
    expect(midiAction(seat, 60)).toEqual({ type: "fret", column: 0 });
    expect(midiAction(seat, 67)).toEqual({ type: "fret", column: 4 });
    expect(midiAction(seat, 72)).toEqual({ type: "strum" });
    expect(midiAction(seat, 76)).toEqual({ type: "whammy" });
    // The chart is 5 columns, so the preset's sixth and seventh frets are not
    // this seat's — the song says how much of the reach is used.
    expect(midiAction(seat, 69)).toBeNull();
    // And the whole map is what the countdown and the gear read.
    expect(controllerKeys(seat)).toBe("C4 D4 E4 F4 G4 · C5 D5 · E5");
  });

  test("a note nobody bound is nothing", () => {
    const seat = midiPlan().seats[0];
    expect(midiAction(seat, 61)).toBeNull();
    expect(midiAction(seat, 36)).toBeNull();
    expect(midiAction(seat, 200)).toBeNull();
  });

  test("a seat the song gives no chart claims nothing", () => {
    const setup = makeBand({ slots: [slot("bass")] }, 1);
    const plan = controlPlan(song(["guitar"]), {
      ...setup,
      players: [{ ...setup.players[0], controller: { on: "midi" } }],
    });
    const seat = plan.seats[0];
    expect(seat.columns).toBeNull();
    expect(midiAction(seat, 60)).toBeNull();
    expect(claimsOf(plan)).toEqual([]);
    expect(conflictsOf(plan)).toEqual([]);
  });

  test("learned notes win, and an unreached column falls back to the preset", () => {
    // Set up on a two-column chart: the first two frets and one strum are theirs,
    // and the whammy was skipped. Played on a five-column chart, columns 2–4 must
    // still have a note — a mapping must never make a note unplayable — and they
    // must not repeat a note the player already uses.
    const notes = { frets: [36, 38], strum: [42], whammy: null };
    const seat = midiPlan(5, notes).seats[0];
    expect(midiAction(seat, 36)).toEqual({ type: "fret", column: 0 });
    expect(midiAction(seat, 38)).toEqual({ type: "fret", column: 1 });
    expect(midiAction(seat, 42)).toEqual({ type: "strum" });
    expect(midiAction(seat, 60)).toEqual({ type: "fret", column: 2 });
    expect(midiAction(seat, 62)).toEqual({ type: "fret", column: 3 });
    expect(midiAction(seat, 64)).toEqual({ type: "fret", column: 4 });
    // The preset's later notes were not reached: they are still free, not bindings.
    expect(midiAction(seat, 65)).toBeNull();
    expect(midiAction(seat, 67)).toBeNull();
    // A skipped whammy is the preset's rather than no whammy at all.
    expect(midiAction(seat, 76)).toEqual({ type: "whammy" });
  });

  test("a hole in a learned MIDI mapping is a free preset note", () => {
    // The third fret was skipped: it takes the first preset note nobody uses, and
    // the frets after it keep their positions rather than one column to the left.
    const notes = { frets: [36, -1, 40], strum: [42], whammy: null };
    const seat = midiPlan(5, notes).seats[0];
    expect(midiAction(seat, 36)).toEqual({ type: "fret", column: 0 });
    expect(midiAction(seat, 60)).toEqual({ type: "fret", column: 1 });
    expect(midiAction(seat, 40)).toEqual({ type: "fret", column: 2 });
    expect(midiAction(seat, 62)).toEqual({ type: "fret", column: 3 });
    expect(midiAction(seat, 64)).toEqual({ type: "fret", column: 4 });
  });

  test("a learned MIDI mapping on fewer columns fills from preset notes it does not use", () => {
    // Two pedal notes on a two-column chart, then a five-column song: the three
    // new columns take three different preset notes, and none repeats a pedal.
    const notes: MidiLayout = { frets: [{ cc: 64 }, { cc: 65 }], strum: [42], whammy: null };
    const seat = midiPlan(5, notes).seats[0];
    expect(midiAction(seat, { cc: 64 })).toEqual({ type: "fret", column: 0 });
    expect(midiAction(seat, { cc: 65 })).toEqual({ type: "fret", column: 1 });
    expect(midiAction(seat, 60)).toEqual({ type: "fret", column: 2 });
    expect(midiAction(seat, 62)).toEqual({ type: "fret", column: 3 });
    expect(midiAction(seat, 64)).toEqual({ type: "fret", column: 4 });
    // Note 64 and CC 64 are different controls, so the pedal's column is not stolen.
    expect(midiAction(seat, { cc: 64 })).toEqual({ type: "fret", column: 0 });
  });

  test("claims its notes, one per fret, strum and whammy", () => {
    const claims = claimsOf(midiPlan());
    expect(claims).toHaveLength(8);
    expect(claims.map((claim) => claim.on)).toEqual(Array(8).fill("midi"));
    expect(claims.map((claim) => claim.control)).toEqual([60, 62, 64, 65, 67, 72, 74, 76]);
  });

  test("a learned control change plays its column, and is not the note with its number", () => {
    // A hi-hat pedal on the first fret, a pedal on the strum and another on the
    // whammy. Columns 2–4 are beyond the learned reach, so they take free preset
    // notes — one of which is E4, the same *number* as the pedal on column 0 and a
    // different control.
    const notes: MidiLayout = {
      frets: [{ cc: 64 }, 38],
      strum: [{ cc: 4 }],
      whammy: { cc: 1 },
    };
    const seat = midiPlan(5, notes).seats[0];
    expect(midiAction(seat, { cc: 64 })).toEqual({ type: "fret", column: 0 });
    expect(midiAction(seat, 38)).toEqual({ type: "fret", column: 1 });
    expect(midiAction(seat, 60)).toEqual({ type: "fret", column: 2 });
    expect(midiAction(seat, 62)).toEqual({ type: "fret", column: 3 });
    expect(midiAction(seat, 64)).toEqual({ type: "fret", column: 4 });
    expect(midiAction(seat, { cc: 4 })).toEqual({ type: "strum" });
    expect(midiAction(seat, { cc: 1 })).toEqual({ type: "whammy" });
    expect(midiAction(seat, { cc: 65 })).toBeNull();
  });

  test("claims a control change under its own tag", () => {
    const plan = midiPlan(2, {
      frets: [{ cc: 64 }, 38],
      strum: [{ cc: 4 }],
      whammy: { cc: 1 },
    });
    const claims = claimsOf(plan);
    expect(claims.map((claim) => claim.control)).toEqual([
      { cc: 64 },
      38,
      { cc: 4 },
      { cc: 1 },
    ]);
  });
});

describe("conflicts on MIDI", () => {
  test("two seats bound to one note are reported like two seats on one key", () => {
    const plan: ControlPlan = {
      seats: [
        { seat: 0, kind: "guitar", channel: "lanes", columns: 5, controller: { on: "midi" } },
        { seat: 1, kind: "bass", channel: "lanes", columns: 5, controller: { on: "midi" } },
      ],
    };
    expect(conflictsOf(plan)).toEqual([
      {
        seats: [0, 1],
        controls: ["C4", "D4", "E4", "F4", "G4", "C5", "D5", "E5"],
      },
    ]);
  });

  test("two seats on different notes share nothing", () => {
    const plan: ControlPlan = {
      seats: [
        {
          seat: 0,
          kind: "guitar",
          channel: "lanes",
          columns: 2,
          controller: { on: "midi", notes: { frets: [36, 38], strum: [42], whammy: null } },
        },
        {
          seat: 1,
          kind: "bass",
          channel: "lanes",
          columns: 2,
          controller: { on: "midi", notes: { frets: [48, 50], strum: [51], whammy: 78 } },
        },
      ],
    };
    expect(conflictsOf(plan)).toEqual([]);
  });

  test("a pedal and a key with the same number are different controls", () => {
    // Note 64 and CC 64 are unmistakably separate claims, so two seats on one of
    // each are not fighting over anything. Their strum and whammy are apart too,
    // because a skipped one falls back to the preset's.
    const plan: ControlPlan = {
      seats: [
        {
          seat: 0,
          kind: "guitar",
          channel: "lanes",
          columns: 1,
          controller: {
            on: "midi",
            notes: { frets: [{ cc: 64 }], strum: [{ cc: 4 }], whammy: { cc: 1 } },
          },
        },
        {
          seat: 1,
          kind: "bass",
          channel: "lanes",
          columns: 1,
          controller: {
            on: "midi",
            notes: { frets: [64], strum: [72], whammy: 76 },
          },
        },
      ],
    };
    expect(conflictsOf(plan)).toEqual([]);
  });

  test("two seats bound to one control change are reported", () => {
    const plan: ControlPlan = {
      seats: [
        {
          seat: 0,
          kind: "guitar",
          channel: "lanes",
          columns: 1,
          controller: {
            on: "midi",
            notes: { frets: [{ cc: 64 }], strum: [{ cc: 4 }], whammy: { cc: 1 } },
          },
        },
        {
          seat: 1,
          kind: "bass",
          channel: "lanes",
          columns: 1,
          controller: {
            on: "midi",
            notes: { frets: [{ cc: 64 }], strum: [{ cc: 5 }], whammy: { cc: 2 } },
          },
        },
      ],
    };
    expect(conflictsOf(plan)).toEqual([{ seats: [0, 1], controls: ["CC 64"] }]);
  });

  test("a MIDI seat shares nothing with a keyboard or a typist", () => {
    // A note is not a key code and a typist types characters: one keyboard between
    // two people never means a MIDI seat and a key seat fight over the same control.
    const plan: ControlPlan = {
      seats: [
        { seat: 0, kind: "guitar", channel: "lanes", columns: 5, controller: { on: "midi" } },
        { seat: 1, kind: "bass", channel: "lanes", columns: 5, controller: { on: "keyboard", layout: 0 } },
        { seat: 2, kind: "words", channel: "chars", columns: null, controller: { on: "chars" } },
      ],
    };
    expect(conflictsOf(plan)).toEqual([
      // The keyboard and the typist still share every key they both use; MIDI is
      // not part of that conversation.
      { seats: [1, 2], controls: ["A", "S", "D", "F", "G", "↑", "↓", "Shift"] },
    ]);
  });
});

describe("the keyboard layout a player takes when they choose one", () => {  test("is the next one that is not spoken for", () => {
    const plan: BandPlan = {
      slots: [
        { ...slot("guitar"), controller: { on: "keyboard", layout: 0 } },
        slot("bass"),
        slot("drums"),
      ],
    };
    // Nobody before the first box chose anything, so they take the left-hand five.
    expect(keyboardOrdinal(plan, 0)).toBe(0);
    // The first box's player has the left hand, so the next to choose takes the
    // right — and a box that has not chosen does not spend a layout.
    expect(keyboardOrdinal(plan, 1)).toBe(1);
    expect(keyboardOrdinal(plan, 2)).toBe(1);
  });

  test("takes the lowest free layout when a later box chose first", () => {
    // The second box chose the keyboard before the first did. Counting only the
    // boxes before the first would hand it layout 0 as well, and two seats would
    // fight over one hand.
    const plan: BandPlan = {
      slots: [slot("guitar"), { ...slot("bass"), controller: { on: "keyboard", layout: 0 } }],
    };
    expect(keyboardOrdinal(plan, 0)).toBe(1);
    // The box that already holds layout 0 keeps it rather than being pushed up.
    expect(keyboardOrdinal(plan, 1)).toBe(0);
  });
});

describe("conflicts between two players on one gamepad", () => {
  test("what they both claim is listed once, in the first player's order", () => {
    // The plan hands each person their own pad, so this is what a remapped or
    // hand-written plan must still be told about.
    const plan: ControlPlan = {
      seats: [
        { seat: 0, kind: "guitar", channel: "lanes", columns: 5, controller: { on: "pad", index: 0 } },
        { seat: 1, kind: "bass", channel: "lanes", columns: 3, controller: { on: "pad", index: 0 } },
      ],
    };
    expect(conflictsOf(plan)).toEqual([
      { seats: [0, 1], controls: ["LB", "X", "A", "D↑", "D↓", "RT"] },
    ]);
  });

  test("two players on two pads share nothing", () => {
    const plan: ControlPlan = {
      seats: [
        { seat: 0, kind: "guitar", channel: "lanes", columns: 5, controller: { on: "pad", index: 0 } },
        { seat: 1, kind: "bass", channel: "lanes", columns: 5, controller: { on: "pad", index: 1 } },
      ],
    };
    expect(conflictsOf(plan)).toEqual([]);
  });

  test("an axis and a button with the same number are different controls", () => {
    // Axis 0 and button 0 are not one control: the tag is what keeps the left
    // stick from being read as A.
    const plan: ControlPlan = {
      seats: [
        {
          seat: 0,
          kind: "guitar",
          channel: "lanes",
          columns: 1,
          controller: {
            on: "pad",
            index: 0,
            buttons: {
              frets: [0],
              strum: [
                { axis: 2, direction: 1 },
                { axis: 2, direction: -1 },
              ],
              whammy: 7,
            },
          },
        },
        {
          seat: 1,
          kind: "bass",
          channel: "lanes",
          columns: 1,
          controller: {
            on: "pad",
            index: 0,
            buttons: { frets: [1], strum: [2], whammy: 8 },
          },
        },
      ],
    };
    expect(conflictsOf(plan)).toEqual([]);
  });

  test("one axis is one claim however many ways it is played", () => {
    // Both seats learned the same bar: the warning names `Axis 2` once, not once
    // per direction. Their frets and whammy differ, so the axis is the only thing
    // they share.
    const plan: ControlPlan = {
      seats: [
        {
          seat: 0,
          kind: "guitar",
          channel: "lanes",
          columns: 1,
          controller: {
            on: "pad",
            index: 0,
            buttons: {
              frets: [0],
              strum: [
                { axis: 2, direction: 1 },
                { axis: 2, direction: -1 },
              ],
              whammy: 7,
            },
          },
        },
        {
          seat: 1,
          kind: "bass",
          channel: "lanes",
          columns: 1,
          controller: {
            on: "pad",
            index: 0,
            buttons: {
              frets: [1],
              strum: [
                { axis: 2, direction: 1 },
                { axis: 2, direction: -1 },
              ],
              whammy: 8,
            },
          },
        },
      ],
    };
    expect(conflictsOf(plan)).toEqual([
      { seats: [0, 1], controls: ["Axis 2"] },
    ]);
  });
});

describe("what each column asks for", () => {
  test("a keyboard seat gets its own hand's frets and strum", () => {
    const first = planOf(["guitar"], 1).seats[0]!;
    expect(controllerLabels(first)).toEqual({
      family: "strum",
      frets: ["A", "S", "D", "F", "G"],
      strum: "↑ ↓",
    });

    // The second keyboard player is the other hand, not the same letters twice.
    const second = planOf(["guitar", "bass"], 2).seats[1]!;
    expect(controllerLabels(second)).toEqual({
      family: "strum",
      frets: ["H", "J", "K", "L", ";"],
      strum: "← →",
    });
  });

  test("a tapped instrument labels frets but asks for no strum", () => {
    const seat = planOf(["keys"], 1).seats[0]!;
    expect(controllerLabels(seat)).toEqual({
      family: "tap",
      frets: ["A", "S", "D", "F", "G"],
      strum: null,
    });
  });

  test("a pad names its buttons and its bar", () => {
    const setup = makeBand({ slots: [slot("guitar")] }, 1);
    const plan = controlPlan(song(["guitar"]), {
      ...setup,
      players: [{ ...setup.players[0], controller: { on: "pad", index: 0 } }],
    });
    expect(controllerLabels(plan.seats[0]!)).toEqual({
      family: "strum",
      frets: ["LB", "X", "A", "B", "RB"],
      strum: "D↑ D↓",
    });
  });

  test("a MIDI seat names notes and its two strums", () => {
    const setup = makeBand({ slots: [slot("guitar")] }, 1);
    const plan = controlPlan(song(["guitar"]), {
      ...setup,
      players: [{ ...setup.players[0], controller: { on: "midi" } }],
    });
    expect(controllerLabels(plan.seats[0]!)).toEqual({
      family: "strum",
      frets: ["C4", "D4", "E4", "F4", "G4"],
      strum: "C5 D5",
    });
  });

  test("a machine, a singer, a typist or a chartless seat has no highway labels", () => {
    expect(controllerLabels(planOf(["guitar"], 0).seats[0]!)).toBeNull();
    expect(
      controllerLabels({
        seat: 0,
        kind: "words",
        channel: "pitch",
        columns: null,
        controller: { on: "mic" },
      }),
    ).toBeNull();
    expect(
      controllerLabels({
        seat: 0,
        kind: "words",
        channel: "chars",
        columns: null,
        controller: { on: "chars" },
      }),
    ).toBeNull();
    expect(
      controllerLabels({
        seat: 0,
        kind: "guitar",
        channel: "lanes",
        columns: null,
        controller: { on: "keyboard", layout: 0 },
      }),
    ).toBeNull();
  });
});

describe("what a seat plays with, as one line", () => {
  const t = translator("en");
  test("the keys, a named controller, the machine, or a dash", () => {
    const plan = planOf(["guitar"], 1);
    expect(seatControlReadout(t, plan.seats, 0, false)).toBe(
      controllerKeys(plan.seats[0]!)!,
    );
    // A typist has no keys to list, so the controller names itself.
    expect(
      seatControlReadout(
        t,
        [{ seat: 3, kind: "words", channel: "chars", columns: null, controller: { on: "chars" } }],
        3,
        false,
      ),
    ).toBe(t("band.type"));
    // A seat the plan has not got says nothing of its own, and the machine is the
    // caller's to name.
    expect(seatControlReadout(t, plan.seats, 7, true)).toBe("auto");
    expect(seatControlReadout(t, plan.seats, 7, false)).toBe("—");
  });
});

describe("seatsOnLostPads", () => {
  test("only the hand the lost pad was holding is let go", () => {
    const seats: SeatControl[] = [
      { seat: 0, kind: "guitar", channel: "lanes", columns: 5, controller: { on: "pad", index: 0 } },
      { seat: 1, kind: "bass", channel: "lanes", columns: 5, controller: { on: "pad", index: 1 } },
      { seat: 2, kind: "guitar", channel: "lanes", columns: 5, controller: { on: "keyboard", layout: 0 } },
      { seat: 3, kind: "keys", channel: "lanes", columns: 5, controller: { on: "midi" } },
    ];
    expect(seatsOnLostPads(seats, [1]).map((seat) => seat.seat)).toEqual([1]);
    expect(seatsOnLostPads(seats, [0, 1]).map((seat) => seat.seat)).toEqual([0, 1]);
    expect(seatsOnLostPads(seats, [])).toEqual([]);
  });
});
