import { describe, expect, test } from "bun:test";
import { applyAction, autoInput, emptyAuto, emptyInput, type InputState } from "./input";
import type { Action } from "./controls/layout";
import type { LaneTrigger } from "./lanes";
import { autoVerdict } from "./simulate";
import type { LaneChart } from "./track";

const chart: LaneChart = {
  instrument: "guitar",
  difficulty: "normal",
  columns: 5,
  notes: [
    { id: "a", timeMs: 1000, lengthMs: 0, kind: "strum", column: 1, hero: false },
    { id: "b", timeMs: 1000, lengthMs: 0, kind: "strum", column: 2, hero: false },
    { id: "c", timeMs: 2000, lengthMs: 0, kind: "hopo", column: 0, hero: false },
  ],
};

const fret = (column: number): Action => ({ type: "fret", column });
const STRIKE: Action = { type: "strum" };
const WAVE: Action = { type: "whammy" };

const act = (state: InputState, action: Action, timeMs = 0, down = true) =>
  applyAction(state, { action, down, repeat: false, timeMs });

describe("applyAction", () => {
  const base = emptyInput(5);

  test("a fret press holds the column and can hammer", () => {
    const result = act(base, fret(1));
    expect(result.state.held[1]).toBe(true);
    expect(result.triggers).toHaveLength(1);
    expect(result.triggers[0]).toMatchObject({ signal: "fret", column: 1 });
  });

  test("a release changes nothing but the hold", () => {
    const held = act(base, fret(1)).state;
    const result = applyAction(held, {
      action: fret(1),
      down: false,
      repeat: false,
      timeMs: 50,
    });
    expect(result.state.held[1]).toBe(false);
    expect(result.triggers).toEqual([]);
  });

  test("a strum takes the frets that are held", () => {
    const held = act(act(base, fret(1)).state, fret(2)).state;
    const result = act(held, STRIKE);
    expect(result.triggers[0]).toMatchObject({ signal: "strum" });
    expect(result.triggers[0].frets[1]).toBe(true);
    expect(result.triggers[0].frets[2]).toBe(true);
  });

  test("the whammy is a trigger of its own", () => {
    expect(act(base, WAVE).triggers[0]).toMatchObject({ signal: "whammy" });
  });

  test("auto-repeat never counts as a press", () => {
    for (const action of [fret(1), STRIKE, WAVE]) {
      const repeated = applyAction(base, {
        action,
        down: true,
        repeat: true,
        timeMs: 0,
      });
      expect(repeated.triggers).toEqual([]);
    }
  });

  test("a fret past the chart's columns has nothing to play", () => {
    // A layout reaches further than a song asks; the song is what decides.
    const four = emptyInput(4);
    expect(act(four, fret(4)).triggers).toEqual([]);
    expect(act(four, fret(4)).state.held).toHaveLength(4);
  });
});

describe("the simulated player", () => {
  test("presses the chord's frets together, through one strum", () => {
    // Walk forward until it plays the opening chord.
    let state = emptyAuto(chart);
    const triggers: { timeMs: number; frets: boolean[] }[] = [];
    for (let now = 900; now <= 1200; now += 20) {
      const result = autoInput(chart, 3, state, now);
      state = result.state;
      for (const trigger of result.triggers) triggers.push(trigger);
    }
    // One gesture per moment, not one per note: a second strum at the same
    // moment would be an overstrum with the chord already judged.
    expect(triggers).toHaveLength(1);
    expect(triggers[0].frets[1]).toBe(true);
    expect(triggers[0].frets[2]).toBe(true);
  });

  test("does not strum a chord it is going to miss part of", () => {
    // Seed 7 hits "b" but not "a": a chord is all or nothing, so the simulator
    // lets the whole moment pass rather than strumming it short.
    let state = emptyAuto(chart);
    const triggers: LaneTrigger[] = [];
    for (let now = 900; now <= 1200; now += 20) {
      const result = autoInput(chart, 7, state, now);
      state = result.state;
      triggers.push(...result.triggers);
    }
    expect(triggers).toEqual([]);
  });

  test("seeded at a seek point, does not play the notes before it", () => {
    const later: LaneChart = {
      ...chart,
      notes: [
        { id: "early", timeMs: 1000, lengthMs: 0, kind: "strum", column: 1, hero: false },
        { id: "late", timeMs: 3000, lengthMs: 0, kind: "strum", column: 2, hero: false },
      ],
    };
    let state = emptyAuto(later, 2500);
    // The first note at or after the seek is the one it starts from.
    expect(state.next).toBe(1);

    // A seed the bot lands, so a missing trigger would mean something.
    const seed = Array.from({ length: 20 }, (_, index) => index).find(
      (candidate) => autoVerdict(later.notes[1], candidate).hit,
    );
    expect(seed).toBeDefined();

    const triggers: LaneTrigger[] = [];
    for (let now = 2500; now <= 3500; now += 20) {
      const result = autoInput(later, seed ?? 0, state, now);
      state = result.state;
      triggers.push(...result.triggers);
    }
    expect(triggers.length).toBeGreaterThan(0);
    // Nothing is stamped with the early note's time, or played before the seek.
    expect(triggers.every((trigger) => trigger.timeMs >= 2500)).toBe(true);
    expect(state.next).toBe(2);
  });

  test("seeding at zero is the ordinary empty simulator", () => {
    expect(emptyAuto(chart)).toEqual(emptyAuto(chart, 0));
    expect(emptyAuto(chart).next).toBe(0);
  });

  test("holds a sustain, and lets go when it is done", () => {
    const withHold: LaneChart = {
      ...chart,
      notes: [{ id: "h", timeMs: 1000, lengthMs: 500, kind: "strum", column: 2, hero: false }],
    };
    let state = emptyAuto(withHold);
    let held = false;
    for (let now = 900; now <= 1600; now += 20) {
      const result = autoInput(withHold, 3, state, now);
      state = result.state;
      if (now > 1000 && now < 1500 && result.held[2]) held = true;
    }
    expect(held).toBe(true);
  });

  test("a perfect accuracy plays every moment", () => {
    const played = autoInput(chart, 3, emptyAuto(chart), 3_000, 1);
    // The chord at 1 s is one gesture and the note at 2 s is another. Nothing is
    // skipped, which is what lets the attract demo claim a full hit record.
    expect(played.triggers).toHaveLength(2);
    expect(played.state.next).toBe(chart.notes.length);
  });
});
