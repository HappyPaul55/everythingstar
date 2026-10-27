import { describe, expect, test } from "bun:test";
import { SEEK_GUARD_MS, SEEK_GUARD_SLACK_MS, sourcePlayhead } from "./playhead";

describe("sourcePlayhead", () => {
  test("takes a read that is ahead of the playhead", () => {
    expect(sourcePlayhead(1016, 1000, 0)).toBe(1016);
  });

  test("holds the playhead when the sound reads behind it", () => {
    // A stem switch: the new element is a frame or two behind the old one.
    expect(sourcePlayhead(1000 - 16, 1000, 0)).toBe(1000);
    expect(sourcePlayhead(1000 - 60, 1000, 0)).toBe(1000);
  });

  test("does not move for a read at exactly the playhead", () => {
    expect(sourcePlayhead(1000, 1000, 0)).toBe(1000);
  });

  test("a stem switch never rewinds, however many frames it takes to settle", () => {
    let playhead = 5000;
    for (const read of [4980, 4960, 4990, 5005, 5010]) {
      playhead = sourcePlayhead(read, playhead, 0);
    }
    // Only the reads that reached the playhead moved it.
    expect(playhead).toBe(5010);
  });

  test("just after a seek, an old position far away is ignored", () => {
    // A backward seek to 5000 while the elements still report 40s.
    expect(sourcePlayhead(40_000, 5000, SEEK_GUARD_MS)).toBe(5000);
    // A forward seek to 40s while the elements still report 5s.
    expect(sourcePlayhead(5000, 40_000, SEEK_GUARD_MS)).toBe(40_000);
  });

  test("just after a seek, a read near the playhead is the seek settling", () => {
    expect(sourcePlayhead(5030, 5000, SEEK_GUARD_MS)).toBe(5030);
    expect(sourcePlayhead(4980, 5000, SEEK_GUARD_MS)).toBe(4980);
    // Exactly at the slack is still the target.
    expect(sourcePlayhead(5000 + SEEK_GUARD_SLACK_MS, 5000, SEEK_GUARD_MS)).toBe(5250);
  });

  test("once the guard has run out the monotonic rule returns", () => {
    expect(sourcePlayhead(4980, 5000, 0)).toBe(5000);
    expect(sourcePlayhead(4980, 5000, -1)).toBe(5000);
  });

  test("a non-finite read leaves the playhead where it was", () => {
    expect(sourcePlayhead(Number.NaN, 1234, 0)).toBe(1234);
  });
});
