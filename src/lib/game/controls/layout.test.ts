import { describe, expect, test } from "bun:test";
import {
  KEY_LAYOUTS,
  MIDI_LAYOUT,
  PAD_LAYOUT,
  codeLabel,
  isTypingKey,
  keyCode,
  keyLayoutFromSteps,
  keysFor,
  keysLabel,
  layoutFamily,
  learnSteps,
  fretCount,
  fretFace,
  MIDI_CC_DOWN,
  MIDI_CC_UP,
  midiCcDown,
  midiControlKey,
  midiControlLabel,
  midiFrets,
  midiLabel,
  midiLayoutFromSteps,
  midiNoteLabel,
  padAxisLabel,
  padButtonLabel,
  padControlLabel,
  padFrets,
  padLabel,
  padLayoutFromSteps,
  stepIsOptional,
} from "./layout";

describe("layouts", () => {
  test("an instrument is played the way its notes are played", () => {
    expect(layoutFamily("guitar")).toBe("strum");
    expect(layoutFamily("drums")).toBe("strum");
    expect(layoutFamily("keys")).toBe("tap");
    expect(layoutFamily("dance")).toBe("dance");
    // A tapped instrument has nothing to strum.
    expect(keysFor("keys", 0, 5).strum).toEqual([]);
    expect(keysFor("guitar", 0, 5).strum.length).toBeGreaterThan(0);
  });

  test("the dance mat is four arrows, whichever player it is", () => {
    expect(keysFor("dance", 0, 4).frets).toEqual([
      "ArrowLeft",
      "ArrowUp",
      "ArrowDown",
      "ArrowRight",
    ]);
    expect(keysFor("dance", 1, 4).frets).not.toEqual(keysFor("dance", 0, 4).frets);
  });

  test("a layout reaches further than five, and the chart says how many", () => {
    expect(keysFor("guitar", 0, 3).frets).toEqual(["KeyA", "KeyS", "KeyD"]);
    expect(keysFor("guitar", 0, 5).frets).toHaveLength(5);
    // A chart with no columns to speak of (no chart at all) leaves it whole.
    expect(keysFor("guitar", 0, null).frets).toEqual(KEY_LAYOUTS.strum[0].frets);
    // Never nothing: a chart always has at least one column.
    expect(keysFor("guitar", 0, 0).frets).toHaveLength(1);
  });

  test("a third player of one instrument takes the first player's keys again", () => {
    // One keyboard cannot tell two people apart — `plan.ts` is what says so.
    expect(keysFor("guitar", 2, 5).frets).toEqual(keysFor("guitar", 0, 5).frets);
    expect(keysFor("guitar", 1, 5).frets).not.toEqual(keysFor("guitar", 0, 5).frets);
  });

  test("a gamepad is cut to the chart's columns the same way", () => {
    expect(padFrets(3)).toEqual(PAD_LAYOUT.frets.slice(0, 3));
    expect(padFrets(null)).toEqual(PAD_LAYOUT.frets);
  });

  test("a drum kit's sixth column is the gamepad's sixth fret", () => {
    // Five frets is a guitar, unchanged; a drum chart reaches the pedal.
    expect(padFrets(5)).toEqual([4, 2, 0, 1, 5]);
    expect(padFrets(6)).toEqual([4, 2, 0, 1, 5, 6]);
    expect(fretCount("guitar")).toBe(5);
    expect(fretCount("drums")).toBe(6);
    expect(fretCount("dance")).toBe(4);
  });

  test("MIDI's preset is a chromatic run, cut to the chart's columns", () => {
    // A keyboard sends C4 and the notes beside it; the five-column chart takes the
    // first five frets and leaves the two strums and the whammy where they are.
    expect(midiFrets(5)).toEqual([60, 62, 64, 65, 67]);
    expect(midiFrets(null)).toEqual(MIDI_LAYOUT.frets);
    expect(midiFrets(0)).toHaveLength(1);
  });
});

describe("what a typist types", () => {
  const pressed = (
    key: string,
    extra: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; isComposing?: boolean } = {},
  ) => ({ key, ...extra });

  test("a plain letter and a single space are characters", () => {
    expect(isTypingKey(pressed("a"))).toBe(true);
    expect(isTypingKey(pressed(" "))).toBe(true);
    expect(isTypingKey(pressed("é"))).toBe(true);
  });

  test("a command is the browser's, not the typist's", () => {
    expect(isTypingKey(pressed("r", { ctrlKey: true }))).toBe(false);
    expect(isTypingKey(pressed("l", { metaKey: true }))).toBe(false);
    expect(isTypingKey(pressed("a", { altKey: true }))).toBe(false);
  });

  test("a key that is not a character falls through", () => {
    expect(isTypingKey(pressed("F5"))).toBe(false);
    expect(isTypingKey(pressed("Escape"))).toBe(false);
    expect(isTypingKey(pressed("ArrowLeft"))).toBe(false);
    expect(isTypingKey(pressed("Backspace"))).toBe(false);
  });

  test("an IME composition has not arrived yet", () => {
    expect(isTypingKey(pressed("a", { isComposing: true }))).toBe(false);
  });
});

describe("labels", () => {
  test("a key reads as the key it is, not as its code", () => {
    expect(codeLabel("KeyA")).toBe("A");
    expect(codeLabel("Digit4")).toBe("4");
    expect(codeLabel("Semicolon")).toBe(";");
    expect(codeLabel("ArrowUp")).toBe("↑");
    expect(codeLabel("Space")).toBe("Space");
  });

  test("the left and right of a pair are one key", () => {
    expect(keyCode("ShiftRight")).toBe("ShiftLeft");
    expect(keyCode("ControlRight")).toBe("ControlLeft");
    expect(keyCode("KeyA")).toBe("KeyA");
    // …which is what lets a layout say Shift once and still read it back.
    expect(codeLabel("ShiftRight")).toBe("Shift");
  });

  test("a player's keys read as one line", () => {
    expect(keysLabel(keysFor("guitar", 0, 5))).toBe("A S D F G · ↑ ↓ · Shift");
    expect(keysLabel(keysFor("keys", 0, 4))).toBe("A S D F · Shift");
    expect(padLabel({ ...PAD_LAYOUT, frets: padFrets(5) })).toBe("LB X A B RB · D↑ D↓ · RT");
    expect(padButtonLabel(0)).toBe("A");
    expect(padButtonLabel(99)).toBe("#99");
  });

  test("a pad's line names the buttons it was learned with, not the preset's", () => {
    // The bug this pins: the read-out used the preset's strum and whammy whatever the
    // player had set up, so it sent them looking for controls they do not have.
    expect(padLabel({ frets: [5, 4], strum: [9, 8], whammy: 0 })).toBe(
      "RB LB · Start Back · A",
    );
    // A hole in a learned map is a dash, and a pad with nothing to strum leaves it out.
    expect(padLabel({ frets: [5, -1, 3], strum: [], whammy: -1 })).toBe("RB – Y · –");
  });

  test("an axis reads as its number and its direction, and one axis once", () => {
    expect(padAxisLabel(2)).toBe("Axis 2");
    expect(padControlLabel({ axis: 2, direction: 1 })).toBe("Axis 2 +");
    expect(padControlLabel({ axis: 2, direction: -1 })).toBe("Axis 2 −");
    // A spring-return bar's two directions are one axis, so it reads `±` rather
    // than naming the same axis twice.
    expect(padLabel({ frets: [4], strum: [{ axis: 2, direction: 1 }, { axis: 2, direction: -1 }], whammy: 7 })).toBe(
      "LB · Axis 2 ± · RT",
    );
    // One way of it keeps the direction that was learned.
    expect(padLabel({ frets: [4], strum: [{ axis: 2, direction: 1 }], whammy: 7 })).toBe(
      "LB · Axis 2 + · RT",
    );
  });

  test("a MIDI note reads as its note number's name, and the map as one line", () => {
    expect(midiNoteLabel(60)).toBe("C4");
    expect(midiNoteLabel(61)).toBe("C#4");
    expect(midiNoteLabel(0)).toBe("C-1");
    expect(midiNoteLabel(127)).toBe("G9");
    expect(midiLabel({ ...MIDI_LAYOUT, frets: midiFrets(5) })).toBe(
      "C4 D4 E4 F4 G4 · C5 D5 · E5",
    );
    // A kit with no spare pad for the whammy has no note to name.
    expect(midiLabel({ frets: [36, 38], strum: [42], whammy: null })).toBe(
      "C2 D2 · F#2",
    );
  });

  test("a control change reads as CC and is never mistaken for its note", () => {
    expect(midiControlLabel(64)).toBe("E4");
    expect(midiControlLabel({ cc: 64 })).toBe("CC 64");
    // Note 64 and CC 64 are different controls, so their identities differ.
    expect(midiControlKey(64)).toBe("note:64");
    expect(midiControlKey({ cc: 64 })).toBe("cc:64");
    expect(midiControlKey(64)).not.toBe(midiControlKey({ cc: 64 }));
    // A hi-hat pedal as a fret, a control change as the strum and the whammy, and
    // a hole where a fret was skipped.
    expect(
      midiLabel({ frets: [36, { cc: 64 }, -1], strum: [{ cc: 4 }], whammy: { cc: 1 } }),
    ).toBe("C2 CC 64 – · CC 4 · CC 1");
  });

  test("a control change is a held switch, with hysteresis", () => {
    // Nothing seen yet reads as up, so the pedal's first message can press it.
    expect(midiCcDown(undefined, 100)).toBe(true);
    expect(midiCcDown(undefined, 20)).toBe(false);
    // A value inside the band keeps where it was: a pedal resting near its edge
    // does not chatter into a second press.
    expect(midiCcDown(true, MIDI_CC_UP + 1)).toBe(true);
    expect(midiCcDown(false, MIDI_CC_DOWN - 1)).toBe(false);
    // The thresholds themselves decide it.
    expect(midiCcDown(false, MIDI_CC_DOWN)).toBe(true);
    expect(midiCcDown(true, MIDI_CC_UP)).toBe(false);
    // A stream of the same value never changes anything after the first.
    expect(midiCcDown(true, 127)).toBe(true);
  });
});

describe("setting a controller up", () => {
  test("asks for the frets of the song, then the strum both ways, then the whammy", () => {
    expect(learnSteps("guitar", 3)).toEqual([
      { on: "fret", column: 0 },
      { on: "fret", column: 1 },
      { on: "fret", column: 2 },
      { on: "strum", direction: 0 },
      { on: "strum", direction: 1 },
      { on: "whammy" },
    ]);
  });

  test("asks a tapped instrument for nothing to strum", () => {
    expect(learnSteps("keys", 4).some((step) => step.on === "strum")).toBe(false);
    expect(learnSteps("dance", 4).map((step) => step.on)).toEqual([
      "fret",
      "fret",
      "fret",
      "fret",
      "whammy",
    ]);
  });

  test("a song with no chart still gets the frets their instrument has", () => {
    expect(learnSteps("guitar", null).filter((step) => step.on === "fret")).toHaveLength(5);
    expect(learnSteps("dance", null).filter((step) => step.on === "fret")).toHaveLength(4);
    expect(learnSteps("drums", null).filter((step) => step.on === "fret")).toHaveLength(6);
  });

  test("the drum kit's last fret is asked for as the kick pedal", () => {
    const steps = learnSteps("drums", 6).filter((step) => step.on === "fret");
    expect(steps.map((step) => step.column)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(fretFace("drums", 5)).toBe("kick");
    // Every hand-played column keeps its colour, and a guitar has no pedal at all.
    expect(fretFace("drums", 4)).toBe("colour");
    expect(fretFace("guitar", 5)).toBe("colour");
    expect(fretFace("dance", 0)).toBe("arrow");
  });

  test("only the second way of the strum bar may be skipped", () => {
    const steps = learnSteps("guitar", 5);
    expect(steps.map(stepIsOptional)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
  });

  test("builds a keyboard's layout from what was pressed", () => {
    const steps = learnSteps("guitar", 2);
    const keys = keyLayoutFromSteps(steps, [
      "KeyZ",
      "KeyX",
      "Space",
      null,
      "ControlLeft",
    ]);
    expect(keys).toEqual({
      frets: ["KeyZ", "KeyX"],
      strum: ["Space"],
      whammy: "ControlLeft",
    });
  });

  test("builds a pad's layout the same way, and skips what was skipped", () => {
    const steps = learnSteps("guitar", 3);
    const buttons = padLayoutFromSteps(steps, [5, 4, 3, 7, null, 6]);
    expect(buttons).toEqual({ frets: [5, 4, 3], strum: [7], whammy: 6 });
  });

  test("one axis answers both ways of the strum bar", () => {
    // A spring-return bar reports one axis and both directions, so the second
    // strum step is not another question — the same crossing answers it the other
    // way round.
    const steps = learnSteps("guitar", 3);
    const buttons = padLayoutFromSteps(steps, [
      5,
      4,
      3,
      { axis: 2, direction: 1 },
      null,
      6,
    ]);
    expect(buttons).toEqual({
      frets: [5, 4, 3],
      strum: [
        { axis: 2, direction: 1 },
        { axis: 2, direction: -1 },
      ],
      whammy: 6,
    });
    expect(padLabel(buttons)).toBe("RB LB Y · Axis 2 ± · LT");
  });

  test("an axis is a strum bar, not a fret or a whammy", () => {
    const steps = learnSteps("guitar", 3);
    // An axis captured while a fret was asked for is a hole in that column, and
    // an axis captured for the whammy falls back to the preset's button.
    const buttons = padLayoutFromSteps(steps, [
      { axis: 0, direction: 1 },
      4,
      3,
      7,
      null,
      { axis: 1, direction: -1 },
    ]);
    expect(buttons.frets).toEqual([-1, 4, 3]);
    expect(buttons.strum).toEqual([7]);
    expect(buttons.whammy).toBe(PAD_LAYOUT.whammy);
  });

  test("builds a MIDI layout from the notes that were pressed", () => {
    const steps = learnSteps("guitar", 2);
    const notes = midiLayoutFromSteps(steps, [36, 38, 42, null, 46]);
    // The second strum was skipped: `plan.ts` fills it from the preset, and the
    // layout itself says only what was actually pressed.
    expect(notes).toEqual({ frets: [36, 38], strum: [42], whammy: 46 });
  });

  test("a MIDI layout can hold a control change wherever a note could", () => {
    const steps = learnSteps("guitar", 2);
    const notes = midiLayoutFromSteps(steps, [36, { cc: 64 }, { cc: 4 }, null, { cc: 1 }]);
    expect(notes).toEqual({
      frets: [36, { cc: 64 }],
      strum: [{ cc: 4 }],
      whammy: { cc: 1 },
    });
    expect(midiLabel(notes)).toBe("C2 CC 64 · CC 4 · CC 1");
  });

  test("a skipped middle fret leaves a hole in its own column", () => {
    // Five frets asked for, the third unanswered: columns 3 and 4 must stay where
    // they are, or the player's fourth fret plays the third note.
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
    expect(keys.frets).toEqual(["KeyZ", "KeyX", "", "KeyB", "KeyN"]);
    expect(keys.frets[2]).toBe("");
    expect(keys.frets[3]).toBe("KeyB");
    expect(keysLabel(keys)).toBe("Z X – B N · Space · M");
  });

  test("a pad's and a MIDI input's skipped fret are holes too", () => {
    const steps = learnSteps("guitar", 5);
    const buttons = padLayoutFromSteps(steps, [5, 4, null, 2, 1, 7, null, 6]);
    expect(buttons).toEqual({ frets: [5, 4, -1, 2, 1], strum: [7], whammy: 6 });
    expect(padLabel(buttons)).toBe("RB LB – X B · RT · LT");

    const notes = midiLayoutFromSteps(steps, [36, 38, null, 41, 43, 46, null, 48]);
    expect(notes).toEqual({ frets: [36, 38, -1, 41, 43], strum: [46], whammy: 48 });
    expect(midiLabel(notes)).toBe("C2 D2 – F2 G2 · A#2 · C3");
  });

  test("only the trailing holes are trimmed", () => {
    const steps = learnSteps("guitar", 5);
    const keys = keyLayoutFromSteps(steps, ["KeyZ", null, null, null, null, "Space", null, "KeyM"]);
    expect(keys.frets).toEqual(["KeyZ"]);
    const notes = midiLayoutFromSteps(steps, [36, null, null, null, null, 42, null, 46]);
    expect(notes.frets).toEqual([36]);
  });
});
