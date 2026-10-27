import { describe, expect, test } from "bun:test";
import type { Controller } from "../controls/layout";
import { parsePlan } from "./store";
import { MAX_PLAYERS } from "./types";

describe("parsePlan", () => {
  test("nothing stored is the first band", () => {
    const plan = parsePlan(null);
    expect(plan.slots).toEqual([
      { kind: "guitar", difficulty: "normal" },
      { kind: "words", difficulty: "normal" },
    ]);
  });

  test("unreadable storage is the first band, not a broken one", () => {
    expect(parsePlan("{not json").slots).toHaveLength(2);
    expect(parsePlan("42").slots).toHaveLength(2);
    expect(parsePlan('"guitar"').slots).toHaveLength(2);
  });

  test("remembers a band, slot by slot", () => {
    const plan = parsePlan(
      JSON.stringify({
        slots: [
          { kind: "bass", difficulty: "expert" },
          { kind: "words", difficulty: "normal" },
          { kind: "keys", difficulty: "hard" },
        ],
      }),
    );
    expect(plan.slots).toEqual([
      { kind: "bass", difficulty: "expert" },
      { kind: "words", difficulty: "normal" },
      { kind: "keys", difficulty: "hard" },
    ]);
  });

  test("an empty stage is a stage, not a fallback", () => {
    expect(parsePlan(JSON.stringify({ slots: [] })).slots).toEqual([]);
  });

  test("keeps untrusted seat gaps instead of shifting later players", () => {
    const plan = parsePlan(
      JSON.stringify({
        slots: [
          { kind: "theremin", difficulty: "hard" },
          null,
          { kind: "drums", difficulty: "impossible" },
          "guitar",
        ],
      }),
    );
    expect(plan.slots).toEqual([
      { kind: "guitar", difficulty: "normal", active: false },
      { kind: "guitar", difficulty: "normal", active: false },
      { kind: "drums", difficulty: "normal" },
      { kind: "guitar", difficulty: "normal", active: false },
    ]);
  });

  test("remembers which guitar role a seat takes, and only on a guitar", () => {
    const plan = parsePlan(
      JSON.stringify({
        slots: [
          { kind: "guitar", role: "lead", difficulty: "expert" },
          { kind: "guitar", role: "rhythm", difficulty: "hard" },
          { kind: "bass", role: "lead", difficulty: "normal" },
          { kind: "guitar", role: "sideways", difficulty: "normal" },
        ],
      }),
    );
    expect(plan.slots).toEqual([
      { kind: "guitar", role: "lead", difficulty: "expert" },
      { kind: "guitar", role: "rhythm", difficulty: "hard" },
      { kind: "bass", difficulty: "normal" },
      { kind: "guitar", difficulty: "normal" },
    ]);
  });

  test("remembers a typist on a pitched song", () => {
    const plan = parsePlan(
      JSON.stringify({ slots: [{ kind: "words", difficulty: "normal", wordsMode: "type" }] }),
    );
    expect(plan.slots[0]).toEqual({
      kind: "words",
      difficulty: "normal",
      wordsMode: "type",
    });
  });

  test("caps a store that has been tampered with", () => {
    const plan = parsePlan(
      JSON.stringify({
        slots: Array.from({ length: 40 }, () => ({ kind: "guitar", difficulty: "normal" })),
      }),
    );
    expect(plan.slots).toHaveLength(MAX_PLAYERS);
  });
});

describe("a controller somebody set up", () => {
  const controller: Controller = {
    on: "pad",
    index: 1,
    buttons: { frets: [4, 2, 0], strum: [12], whammy: 7 },
  };

  test("is remembered with the band, mapping and all", () => {
    const plan = parsePlan(
      JSON.stringify({ slots: [{ kind: "guitar", difficulty: "hard", controller }] }),
    );
    expect(plan.slots[0]).toEqual({ kind: "guitar", difficulty: "hard", controller });
  });

  test("keeps the device when the mapping does not hold together", () => {
    // A half-learned mapping is worse than none: it would leave notes unplayable.
    const plan = parsePlan(
      JSON.stringify({
        slots: [
          { kind: "guitar", difficulty: "normal", controller: { on: "pad", index: 2, buttons: { frets: [] } } },
          {
            kind: "bass",
            difficulty: "normal",
            controller: { on: "keyboard", layout: 1, keys: { frets: [], strum: [], whammy: "ShiftLeft" } },
          },
        ],
      }),
    );
    expect(plan.slots[0].controller).toEqual({ on: "pad", index: 2 });
    expect(plan.slots[1].controller).toEqual({ on: "keyboard", layout: 1 });
  });

  test("keeps a hole in a keyboard mapping where it was, so later keys do not slide", () => {
    const plan = parsePlan(
      JSON.stringify({
        slots: [
          {
            kind: "guitar",
            difficulty: "normal",
            controller: {
              on: "keyboard",
              layout: 1,
              keys: { frets: ["KeyA", "", "KeyD"], strum: ["ArrowUp"], whammy: "ShiftLeft" },
            },
          },
        ],
      }),
    );
    expect(plan.slots[0].controller).toEqual({
      on: "keyboard",
      layout: 1,
      keys: { frets: ["KeyA", "", "KeyD"], strum: ["ArrowUp"], whammy: "ShiftLeft" },
    });
  });

  test("drops a controller that could not be one", () => {
    const plan = parsePlan(
      JSON.stringify({
        slots: [
          { kind: "guitar", difficulty: "normal", controller: { on: "pad", index: -3 } },
          { kind: "bass", difficulty: "normal", controller: { on: "brain" } },
          { kind: "drums", difficulty: "normal", controller: 7 },
        ],
      }),
    );
    expect(plan.slots.map((slot) => slot.controller)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  test("remembers a MIDI mapping as plain data, held to notes", () => {
    const plan = parsePlan(
      JSON.stringify({
        slots: [
          {
            kind: "drums",
            difficulty: "normal",
            controller: {
              on: "midi",
              index: 1,
              notes: { frets: [36, 38], strum: [42], whammy: 46 },
            },
          },
          {
            kind: "guitar",
            difficulty: "normal",
            controller: {
              on: "midi",
              index: -1,
              notes: { frets: [999, 200], strum: [], whammy: null },
            },
          },
        ],
      }),
    );
    expect(plan.slots[0].controller).toEqual({
      on: "midi",
      index: 1,
      notes: { frets: [36, 38], strum: [42], whammy: 46 },
    });
    // A note outside 0–127 is dropped, a negative index is not an index, and a
    // mapping with no usable frets is not a mapping.
    expect(plan.slots[1].controller).toEqual({ on: "midi" });
  });

  test("remembers a control change, and keeps a skipped fret's hole", () => {
    const notes = {
      frets: [36, { cc: 64 }, -1],
      strum: [{ cc: 4 }],
      whammy: { cc: 1 },
    };
    const plan = parsePlan(
      JSON.stringify({
        slots: [{ kind: "drums", difficulty: "normal", controller: { on: "midi", notes } }],
      }),
    );
    // Plain numbers are notes, `{ cc }` is a control change, and `-1` is the hole a
    // skipped column leaves — kept in its place so the columns after it do not
    // shift one to the left.
    expect(plan.slots[0].controller).toEqual({ on: "midi", notes });
  });

  test("drops a MIDI control that could not be one", () => {
    const plan = parsePlan(
      JSON.stringify({
        slots: [
          {
            kind: "drums",
            difficulty: "normal",
            controller: {
              on: "midi",
              notes: {
                frets: [{ cc: 200 }, { cc: -1 }, { cc: 1.5 }, { cc: "64" }, { cc: 64 }, 38, 999],
                strum: [{ cc: 200 }, { cc: 4 }, -1],
                whammy: { cc: 999 },
              },
            },
          },
          {
            kind: "guitar",
            difficulty: "normal",
            controller: {
              on: "midi",
              notes: { frets: [-1, { cc: 999 }, 200], strum: [], whammy: null },
            },
          },
        ],
      }),
    );
    // Only the controls that are 0–127 survive; a malformed one is dropped rather
    // than guessed at, and a strum's `-1` is not a hole (nothing skips a strum).
    expect(plan.slots[0].controller).toEqual({
      on: "midi",
      notes: { frets: [{ cc: 64 }, 38], strum: [{ cc: 4 }], whammy: null },
    });
    // A mapping with no usable fret at all is not a mapping: the seat keeps MIDI
    // and takes the preset.
    expect(plan.slots[1].controller).toEqual({ on: "midi" });
  });

  test("remembers a strum bar on an axis, both ways", () => {
    const axis = {
      on: "pad" as const,
      index: 0,
      buttons: {
        frets: [4, 2, 0],
        strum: [
          { axis: 2, direction: 1 as const },
          { axis: 2, direction: -1 as const },
        ],
        whammy: 7,
      },
    };
    const plan = parsePlan(
      JSON.stringify({ slots: [{ kind: "guitar", difficulty: "normal", controller: axis }] }),
    );
    expect(plan.slots[0].controller).toEqual(axis);
  });

  test("an old numeric strum is still buttons", () => {
    const plan = parsePlan(
      JSON.stringify({
        slots: [
          {
            kind: "guitar",
            difficulty: "normal",
            controller: {
              on: "pad",
              index: 0,
              buttons: { frets: [4], strum: [12, 13], whammy: 7 },
            },
          },
        ],
      }),
    );
    expect(plan.slots[0].controller).toEqual({
      on: "pad",
      index: 0,
      buttons: { frets: [4], strum: [12, 13], whammy: 7 },
    });
  });

  test("drops a malformed axis rather than guessing at it", () => {
    const plan = parsePlan(
      JSON.stringify({
        slots: [
          {
            kind: "guitar",
            difficulty: "normal",
            controller: {
              on: "pad",
              index: 0,
              buttons: {
                frets: [4, 2],
                strum: [
                  { axis: -1, direction: 1 },
                  { axis: 2, direction: 2 },
                  { axis: 2 },
                  { axis: "3", direction: 1 },
                  { axis: 2.5, direction: 1 },
                  4,
                ],
                whammy: 7,
              },
            },
          },
        ],
      }),
    );
    // The button that did hold together stays; every impossible axis is gone.
    expect(plan.slots[0].controller).toEqual({
      on: "pad",
      index: 0,
      buttons: { frets: [4, 2], strum: [4], whammy: 7 },
    });
  });

  test("keeps who is not playing, which is a setting too", () => {
    const plan = parsePlan(
      JSON.stringify({
        slots: [{ kind: "guitar", difficulty: "normal", controller: { on: "none" } }],
      }),
    );
    expect(plan.slots[0].controller).toEqual({ on: "none" });
  });
});
