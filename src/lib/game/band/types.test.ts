import { describe, expect, test } from "bun:test";
import {
  MAX_PLAYERS,
  PLAYER_KINDS,
  firstBand,
  hasLanes,
  hasMelody,
  isLaneKind,
  isMelodyKind,
  joinSlotAt,
  lanePlayers,
  lineupPlayers,
  makeBand,
  melodyPlayers,
  melodyRoles,
  melodyView,
  nextSlot,
  patchSlot,
  setSlotAt,
  withOfferedRoles,
  wordsCount,
  type BandPlan,
} from "./types";
import { lineupKey } from "../scores";
import type { SongOffer } from "../song";

/** A plan with nothing on stage, so a test says only what it is about. */
function plan(over: Partial<BandPlan> = {}): BandPlan {
  return { slots: [], ...over };
}

const slot = (
  kind: "guitar" | "bass" | "drums" | "keys" | "dance" | "words",
  difficulty: "easy" | "normal" | "hard" | "expert" = "normal",
) => ({ kind, difficulty });

describe("the kinds", () => {
  test("a slot is an instrument, or the one place at the words", () => {
    expect(PLAYER_KINDS).toEqual(["guitar", "bass", "drums", "keys", "dance", "words"]);
    expect(isLaneKind("guitar")).toBe(true);
    expect(isLaneKind("words")).toBe(false);
    expect(isMelodyKind("words")).toBe(true);
    expect(isMelodyKind("drums")).toBe(false);
  });
});

describe("makeBand", () => {
  test("a slot is a player: their own kind and their own difficulty", () => {
    const band = makeBand(
      plan({ slots: [slot("bass", "hard"), slot("words", "easy"), slot("drums")] }),
    );
    expect(band.players.map((player) => player.kind)).toEqual(["bass", "words", "drums"]);
    expect(band.players.map((player) => player.difficulty)).toEqual(["hard", "easy", "normal"]);
    expect(band.players.map((player) => player.id)).toEqual([
      "player-1",
      "player-2",
      "player-3",
    ]);
  });

  test("one keyboard: the first lanes take it and the rest play themselves", () => {
    const three = plan({
      slots: [slot("guitar"), slot("words"), slot("bass"), slot("drums")],
    });
    // Whoever is on the words is not a lane, so they do not consume a keyboard.
    expect(makeBand(three).players.map((player) => player.auto)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(makeBand(three, 2).players.map((player) => player.auto)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(makeBand(three, 0).players.map((player) => player.auto)).toEqual([
      true,
      false,
      true,
      true,
    ]);
  });

  test("a controller the player chose decides who plays them", () => {
    const machine = plan({
      slots: [{ ...slot("guitar"), controller: { on: "none" } }],
    });
    expect(makeBand(machine).players[0].auto).toBe(true);

    // No humans at all, but this player said they are playing: the dev count
    // does not overrule a player's own choice.
    const ownKeys = plan({
      slots: [{ ...slot("guitar"), controller: { on: "keyboard", layout: 0 } }],
    });
    expect(makeBand(ownKeys, 0).players[0].auto).toBe(false);
  });

  test("without a controller, the dev count still decides", () => {
    const lanes = plan({ slots: [slot("guitar"), slot("bass")] });
    expect(makeBand(lanes, 1).players.map((player) => player.auto)).toEqual([false, true]);
    expect(makeBand(lanes, 2).players.map((player) => player.auto)).toEqual([false, false]);
  });

  test("clamps to the band's size", () => {
    const many = plan({
      slots: Array.from({ length: 99 }, () => slot("guitar")),
    });
    expect(makeBand(many).players).toHaveLength(MAX_PLAYERS);
  });

  test("an empty plan is an empty band", () => {
    const band = makeBand(plan());
    expect(band.players).toEqual([]);
    expect(hasMelody(band)).toBe(false);
    expect(hasLanes(band)).toBe(false);
  });
});

describe("the two families", () => {
  test("splits the band into instruments and whoever is on the words", () => {
    const band = makeBand(
      plan({ slots: [slot("guitar"), slot("words"), slot("words"), slot("drums")] }),
    );
    expect(lanePlayers(band).map((player) => player.kind)).toEqual(["guitar", "drums"]);
    expect(melodyPlayers(band).map((player) => player.kind)).toEqual(["words", "words"]);
    expect(hasLanes(band)).toBe(true);
    expect(hasMelody(band)).toBe(true);
  });

  test("counts who is on the words", () => {
    const band = makeBand(plan({ slots: [slot("guitar"), slot("words"), slot("words")] }));
    expect(wordsCount(band)).toBe(2);
    expect(hasMelody(makeBand(plan({ slots: [slot("guitar")] })))).toBe(false);
    expect(wordsCount(makeBand(plan({ slots: [slot("guitar")] })))).toBe(0);
  });

  test("a band of one instrument is a band of one instrument", () => {
    const band = makeBand(plan({ slots: [slot("guitar"), slot("bass")] }));
    expect(hasMelody(band)).toBe(false);
    expect(melodyPlayers(band)).toEqual([]);
  });
});

describe("stable seats", () => {
  test("filling a box does not shift players in later seats", () => {
    const start = plan({
      slots: [
        slot("guitar"),
        { kind: "guitar", difficulty: "normal", active: false },
        slot("drums"),
      ],
    });
    const filled = setSlotAt(start, 1, slot("bass"));
    expect(makeBand(filled).players.map((player) => [player.seat, player.kind])).toEqual([
      [0, "guitar"],
      [1, "bass"],
      [2, "drums"],
    ]);
    expect(makeBand(start).players.map((player) => player.seat)).toEqual([0, 2]);
  });

  test("patching a slot changes one player and leaves an empty box alone", () => {
    const start = plan({
      slots: [
        slot("guitar"),
        { kind: "guitar", difficulty: "normal", active: false },
        slot("drums"),
      ],
    });
    const patched = patchSlot(start, 0, { difficulty: "expert" });
    expect(patched.slots.map((entry) => entry.difficulty)).toEqual([
      "expert",
      "normal",
      "normal",
    ]);
    // The plan handed in is not edited.
    expect(start.slots[0]?.difficulty).toBe("normal");
    // A reserved seat is nobody: there is no player there to patch.
    const empty = patchSlot(start, 1, { difficulty: "expert" });
    expect(empty.slots[1]).toEqual({
      kind: "guitar",
      difficulty: "normal",
      active: false,
    });
    // A seat outside the band changes nothing.
    expect(patchSlot(start, 9, { difficulty: "expert" }).slots).toHaveLength(3);
  });

  test("a guitar role is part of a slot, and of the player it makes", () => {
    const band = makeBand(
      plan({ slots: [{ kind: "guitar", role: "rhythm", difficulty: "hard" }] }),
    );
    expect(band.players[0]).toMatchObject({ kind: "guitar", role: "rhythm" });
  });

  test("empty boxes cycle through both guitar roles and both pitched words modes", () => {
    const song = {
      offer: {
        instruments: [
          { kind: "guitar" as const, role: "lead" as const, difficulties: ["normal" as const] },
          { kind: "guitar" as const, role: "rhythm" as const, difficulties: ["normal" as const] },
          { kind: "drums" as const, difficulties: ["normal" as const] },
        ],
        voice: { chartType: "vocals" as const, parts: 1 },
      },
    };
    expect([0, 1, 2, 3, 4].map((seat) => nextSlot(song, seat))).toEqual([
      { kind: "guitar", role: "lead", difficulty: "normal" },
      { kind: "guitar", role: "rhythm", difficulty: "normal" },
      { kind: "drums", difficulty: "normal" },
      { kind: "words", difficulty: "normal", wordsMode: "sing" },
      { kind: "words", difficulty: "normal", wordsMode: "type" },
    ]);
  });

  test("empty boxes cycle through instruments and both pitched words modes", () => {
    const song = {
      offer: {
        instruments: [
          { kind: "guitar" as const, difficulties: ["normal" as const] },
          { kind: "drums" as const, difficulties: ["normal" as const] },
        ],
        voice: { chartType: "vocals" as const, parts: 1 },
      },
    };
    expect([0, 1, 2, 3].map((seat) => nextSlot(song, seat))).toEqual([
      { kind: "guitar", difficulty: "normal" },
      { kind: "drums", difficulty: "normal" },
      { kind: "words", difficulty: "normal", wordsMode: "sing" },
      { kind: "words", difficulty: "normal", wordsMode: "type" },
    ]);
  });
});

describe("withOfferedRoles", () => {
  const twoRoles = {
    instruments: [
      { kind: "guitar" as const, role: "lead" as const, difficulties: ["normal" as const] },
      { kind: "guitar" as const, role: "rhythm" as const, difficulties: ["normal" as const] },
    ],
    voice: null,
  };
  const leadOnly = {
    instruments: [
      { kind: "guitar" as const, role: "lead" as const, difficulties: ["normal" as const] },
    ],
    voice: null,
  };

  test("a roleless guitar takes the lead when the song has both", () => {
    const start = plan({ slots: [slot("guitar")] });
    expect(withOfferedRoles(start, twoRoles).slots[0]).toEqual({
      kind: "guitar",
      role: "lead",
      difficulty: "normal",
    });
  });

  test("a role the song does not carry falls back to the one it has", () => {
    const start = plan({ slots: [{ kind: "guitar", role: "rhythm", difficulty: "normal" }] });
    expect(withOfferedRoles(start, leadOnly).slots[0]).toEqual({
      kind: "guitar",
      role: "lead",
      difficulty: "normal",
    });
  });

  test("a plan that already fits the song is handed back as it is", () => {
    const start = plan({
      slots: [
        { kind: "guitar", role: "rhythm", difficulty: "normal" },
        { kind: "bass", difficulty: "normal" },
      ],
    });
    expect(withOfferedRoles(start, twoRoles)).toBe(start);
  });

  test("an instrument that is not a guitar carries no role", () => {
    const start = plan({ slots: [{ kind: "bass", role: "lead", difficulty: "normal" }] });
    expect(withOfferedRoles(start, twoRoles).slots[0]).toEqual({
      kind: "bass",
      difficulty: "normal",
    });
  });
});

describe("joinSlotAt", () => {
  const leadOnly = {
    offer: {
      instruments: [
        {
          kind: "guitar" as const,
          role: "lead" as const,
          difficulties: ["normal" as const],
        },
      ],
      voice: null,
    },
  };

  test("a rhythm guitar is not forgotten when the song only offers a lead", () => {
    const remembered = plan({
      slots: [
        { kind: "guitar", role: "rhythm", difficulty: "normal" },
        { kind: "guitar", difficulty: "normal", active: false },
      ],
    });
    // The song forces the box to **show** a lead for its own run ...
    expect(withOfferedRoles(remembered, leadOnly.offer).slots[0]?.role).toBe("lead");

    // ... but joining the empty box patches the plan that is remembered, so the
    // rhythm choice is still there for the next song that carries one.
    const joined = joinSlotAt(remembered, 1, leadOnly);
    expect(joined.slots[0]).toEqual({
      kind: "guitar",
      role: "rhythm",
      difficulty: "normal",
    });
    // And the new player takes what the song actually offers in their box.
    expect(joined.slots[1]).toMatchObject({
      kind: "guitar",
      role: "lead",
      difficulty: "normal",
      active: true,
    });
  });
});

describe("melodyRoles", () => {
  test("the pitch is the default words role, but a player may choose typing", () => {
    const band = makeBand(plan({ slots: [slot("words", "easy")] }));
    // A song with pitch is sung.
    expect(melodyRoles(band, { parts: 1, hasPitch: true }).players).toEqual([
      { role: "sing", seat: 0, part: 0, difficulty: "easy" },
    ]);
    // One whose words are only words is typed, and has no levels at all.
    expect(melodyRoles(band, { parts: 1, hasPitch: false }).players).toEqual([
      { role: "type", seat: 0, part: 0, difficulty: null },
    ]);

    const typist = makeBand({
      slots: [{ kind: "words", difficulty: "normal", wordsMode: "type" }],
    });
    expect(melodyRoles(typist, { parts: 1, hasPitch: true }).players[0]).toMatchObject({
      role: "type",
      difficulty: null,
    });
  });

  test("a singer's difficulty is settled against the three vocals carry", () => {
    // Expert is an instrument's; singing never has it, so it comes back as hard.
    const band = makeBand(plan({ slots: [slot("words", "expert")] }));
    expect(melodyRoles(band, { parts: 1, hasPitch: true }).players[0].difficulty).toBe(
      "hard",
    );
  });

  test("the song owns its parts, and a player count never changes them", () => {
    // A solo song stays a solo however many turn up: they share it.
    const one = makeBand(plan({ slots: [slot("words")] }));
    const two = makeBand(plan({ slots: [slot("words"), slot("words")] }));
    const song = { parts: 1, hasPitch: true };
    expect(melodyRoles(one, song).parts).toBe(1);
    expect(melodyRoles(one, song).players.map((player) => player.part)).toEqual([0]);
    expect(melodyRoles(two, song).players.map((player) => player.part)).toEqual([0, 0]);
    expect(
      melodyRoles(two, { parts: 2, hasPitch: true }).players.map((player) => player.part),
    ).toEqual([0, 1]);
  });

  test("only the words' players get a role", () => {
    const band = makeBand(plan({ slots: [slot("guitar"), slot("words")] }));
    expect(melodyRoles(band, { parts: 2, hasPitch: true }).players).toHaveLength(1);
  });

  test("a role knows the seat it sits in, whichever place that is", () => {
    // The words are the band's second and third players, and the roles say so
    // rather than counting their own kind.
    const band = makeBand(plan({ slots: [slot("guitar"), slot("words"), slot("words")] }));
    expect(
      melodyRoles(band, { parts: 1, hasPitch: true }).players.map((player) => player.seat),
    ).toEqual([1, 2]);
  });

  test("a song with no parts still has one, and players still fit it", () => {
    const band = makeBand(plan({ slots: [slot("words")] }));
    const roles = melodyRoles(band, { parts: 0, hasPitch: true });
    expect(roles.parts).toBe(1);
    expect(roles.players[0].part).toBe(0);
  });
});

describe("melodyView", () => {
  test("pitch plus a singer is the keys view", () => {
    expect(melodyView(true)).toBe("keys");
    expect(melodyView(true, true)).toBe("keys");
  });

  test("no pitch, or only typists, is the lyrics view", () => {
    expect(melodyView(false)).toBe("lyrics");
    expect(melodyView(false, true)).toBe("lyrics");
    expect(melodyView(true, false)).toBe("lyrics");
  });
});

describe("lineupPlayers", () => {
  const songWith = (offer: SongOffer) => ({ offer });

  test("a singer is keyed at the level their voice is judged at", () => {
    const band = makeBand(plan({ slots: [slot("words", "expert")] }));
    const song = songWith({
      instruments: [],
      voice: { chartType: "vocals", parts: 1 },
    });
    expect(lineupPlayers(band, song)).toEqual([
      { kind: "words", difficulty: "hard", wordsMode: "sing" },
    ]);
    expect(lineupKey(lineupPlayers(band, song))).toBe("words:hard:sing");
  });

  test("a typist has no level, so normal and hard are one band", () => {
    const song = songWith({
      instruments: [],
      voice: { chartType: "vocals", parts: 1 },
    });
    const normal = makeBand(
      plan({ slots: [{ kind: "words", difficulty: "normal", wordsMode: "type" }] }),
    );
    const hard = makeBand(
      plan({ slots: [{ kind: "words", difficulty: "hard", wordsMode: "type" }] }),
    );
    expect(lineupPlayers(normal, song)[0]).toMatchObject({
      difficulty: null,
      wordsMode: "type",
    });
    expect(lineupKey(lineupPlayers(normal, song))).toBe(
      lineupKey(lineupPlayers(hard, song)),
    );
    expect(lineupKey(lineupPlayers(normal, song))).toBe("words:free:type");
  });

  test("an instrument is keyed at the nearest chart the song carries", () => {
    const band = makeBand(plan({ slots: [slot("guitar", "expert")] }));
    const song = songWith({
      instruments: [{ kind: "guitar", difficulties: ["hard"] }],
      voice: null,
    });
    expect(lineupPlayers(band, song)[0].difficulty).toBe("hard");
    expect(lineupKey(lineupPlayers(band, song))).toBe("guitar:hard");
  });

  test("a kind or role the song does not carry is still a stable key", () => {
    const band = makeBand(
      plan({
        slots: [
          { kind: "guitar", role: "rhythm", difficulty: "hard" },
          slot("bass", "expert"),
        ],
      }),
    );
    const song = songWith({
      instruments: [{ kind: "guitar", role: "lead", difficulties: ["normal"] }],
      voice: null,
    });
    const players = lineupPlayers(band, song);
    expect(players[0]).toMatchObject({
      kind: "guitar",
      role: "rhythm",
      difficulty: "normal",
    });
    expect(players[1]).toMatchObject({ kind: "bass", difficulty: "expert" });
    expect(lineupKey(players)).toBe("bass:expert+guitar:normal:rhythm");
  });
});

describe("firstBand", () => {
  test("starts on a guitar and somebody on the words", () => {
    const band = makeBand(firstBand());
    expect(lanePlayers(band).map((player) => player.kind)).toEqual(["guitar"]);
    expect(melodyPlayers(band).map((player) => player.kind)).toEqual(["words"]);
  });
});
