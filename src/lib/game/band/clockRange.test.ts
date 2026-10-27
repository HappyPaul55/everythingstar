import { describe, expect, test } from "bun:test";
import { clampPlayhead, knownLength, playheadEnded } from "./clockRange";

describe("knownLength", () => {
  test("a positive number of milliseconds is a length", () => {
    expect(knownLength(240_000)).toBe(240_000);
  });

  test("zero, negative and non-finite lengths are unknown", () => {
    expect(knownLength(0)).toBeNull();
    expect(knownLength(-1)).toBeNull();
    expect(knownLength(Number.NaN)).toBeNull();
    expect(knownLength(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("clampPlayhead", () => {
  test("stops at a known end and never goes below the start", () => {
    expect(clampPlayhead(250_000, 240_000)).toBe(240_000);
    expect(clampPlayhead(-50, 240_000)).toBe(0);
  });

  test("an unknown length clamps only at the start", () => {
    expect(clampPlayhead(250_000, 0)).toBe(250_000);
    expect(clampPlayhead(-50, 0)).toBe(0);
  });

  test("a non-finite playhead is passed through for the reader to judge", () => {
    expect(clampPlayhead(Number.NaN, 240_000)).toBeNaN();
  });
});

describe("playheadEnded", () => {
  test("a known length ends at its own end", () => {
    expect(playheadEnded(239_999, 240_000)).toBe(false);
    expect(playheadEnded(240_000, 240_000)).toBe(true);
    expect(playheadEnded(250_000, 240_000)).toBe(true);
  });

  test("an unknown length never ends the run from the playhead", () => {
    expect(playheadEnded(0, 0)).toBe(false);
    expect(playheadEnded(250_000, 0)).toBe(false);
    expect(playheadEnded(250_000, Number.NaN)).toBe(false);
  });
});
