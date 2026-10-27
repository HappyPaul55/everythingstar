import { describe, expect, test } from "bun:test";
import {
  AUTO_ACCURACY,
  PERFECT_ACCURACY,
  autoTyping,
  autoVerdict,
} from "./simulate";
import { hashUnit } from "./hash";
import { emptyTyping, type TypingConfig } from "./typing";

const notes = Array.from({ length: 4000 }, (_, index) => ({
  id: `l0-${index}`,
  timeMs: index * 300,
  lengthMs: 0,
}));

describe("autoVerdict", () => {
  test("is stable for a given note and seed", () => {
    expect(autoVerdict(notes[7], 3)).toEqual(autoVerdict(notes[7], 3));
  });

  test("lands close to the requested accuracy", () => {
    const hits = notes.filter((note) => autoVerdict(note, 3).hit).length;
    expect(hits / notes.length).toBeCloseTo(AUTO_ACCURACY, 1);
  });

  test("misses some notes and hits most", () => {
    const verdicts = notes.slice(0, 500).map((note) => autoVerdict(note, 5));
    expect(verdicts.some((verdict) => !verdict.hit)).toBe(true);
    expect(verdicts.filter((verdict) => verdict.hit).length).toBeGreaterThan(400);
  });

  test("jitter stays within a player's reach", () => {
    for (const note of notes.slice(0, 1000)) {
      expect(Math.abs(autoVerdict(note, 11).offsetMs)).toBeLessThanOrEqual(85);
    }
  });

  test("a different seed gives a different run", () => {
    const a = notes.slice(0, 200).map((note) => autoVerdict(note, 1).hit);
    const b = notes.slice(0, 200).map((note) => autoVerdict(note, 2).hit);
    expect(a).not.toEqual(b);
  });

  test("the attract demo's perfect player lands every note", () => {
    for (const note of notes.slice(0, 500)) {
      expect(autoVerdict(note, 13, PERFECT_ACCURACY).hit).toBe(true);
    }
  });
});

/** Two lines, so one word's success and one's miss both move the run on. */
const typing: TypingConfig = {
  words: [
    { text: "Hold", start: 0, end: 1_000, line: 0, hero: false },
    { text: "On", start: 4_000, end: 5_000, line: 1, hero: false },
  ],
  lines: [
    { start: 0, end: 4_000 },
    { start: 4_000, end: 6_000 },
  ],
  level: "normal",
};

/** The first seed whose word at `start` is typed or missed, as the bot would. */
function seedFor(type: "hit" | "miss", start = 0): number {
  for (let seed = 0; seed < 10_000; seed += 1) {
    const value = hashUnit(`${seed}:type:${start}`);
    if (type === "hit" ? value < AUTO_ACCURACY : value >= AUTO_ACCURACY) return seed;
  }
  throw new Error("no seed for that verdict");
}

describe("autoTyping", () => {
  test("types the word out through the real engine", () => {
    const typed = autoTyping(emptyTyping(typing), typing, seedFor("hit"), 0);
    expect(typed.results[0]).toBe("hit");
    expect(typed.pointer).toBe(1);
    // Every required letter went through `applyTypingKey`, and the word paid what
    // the engine pays for a plain word at the first rung of the multiplier.
    expect(typed.correctKeys).toBe("hold".length);
    expect(typed.score).toBe(50);
    expect(typed.combo).toBe(1);
  });

  test("lets a word it is going to miss run out to its deadline", () => {
    const state = emptyTyping(typing);
    const seed = seedFor("miss");
    // Before the deadline the bot does nothing at all — it is not a late keystroke.
    expect(autoTyping(state, typing, seed, 3_999)).toBe(state);
    const missed = autoTyping(state, typing, seed, 4_000);
    expect(missed.results[0]).toBe("miss");
    expect(missed.pointer).toBe(1);
    expect(missed.score).toBe(0);
    expect(missed.combo).toBe(0);
  });

  test("moves across two lines, keeping the run's own score and combo", () => {
    const first = autoTyping(emptyTyping(typing), typing, seedFor("hit"), 0);
    const second = autoTyping(first, typing, seedFor("hit", 4_000), 4_000);
    expect(second.results).toEqual(["hit", "hit"]);
    expect(second.pointer).toBe(2);
    expect(second.bestCombo).toBe(2);
    expect(second.score).toBe(100);
    expect(second.finished).toBe(true);
  });

  test("a perfect typist types a word it would otherwise miss", () => {
    const typed = autoTyping(
      emptyTyping(typing),
      typing,
      seedFor("miss"),
      0,
      PERFECT_ACCURACY,
    );
    expect(typed.results[0]).toBe("hit");
    expect(typed.pointer).toBe(1);
  });

  test("a word not yet open is left alone", () => {
    const state = emptyTyping(typing);
    // The second line opens at 4 s; before then the bot has no word to type.
    const first = autoTyping(state, typing, seedFor("hit"), 0);
    expect(autoTyping(first, typing, seedFor("hit", 4_000), 3_999)).toBe(first);
  });
});
