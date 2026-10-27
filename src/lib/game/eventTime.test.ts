import { describe, expect, test } from "bun:test";
import { projectEventTime, type ClockSample } from "./eventTime";

const sample: ClockSample = { timeMs: 10_000, atMs: 5_000 };
const duration = 240_000;

describe("projectEventTime", () => {
  test("carries the playhead on by the event's distance from the sample", () => {
    // The sample was taken a frame (10ms) before the press.
    expect(projectEventTime(5_010, sample, true, duration, 5_020)).toBe(10_010);
  });

  test("an event exactly at the sample is the sampled playhead", () => {
    expect(projectEventTime(5_000, sample, true, duration, 5_020)).toBe(10_000);
  });

  test("a paused stage returns the playhead it holds", () => {
    // Wall time has passed since the sample, but the song has not moved.
    expect(projectEventTime(5_250, sample, false, duration, 5_300)).toBe(10_000);
  });

  test("an epoch-style stamp is treated as now", () => {
    // Older browsers stamped events with Date.now(): far beyond a page's uptime.
    expect(projectEventTime(1_760_000_000_000, sample, true, duration, 5_020)).toBe(10_020);
  });

  test("a stamp from the future is treated as now", () => {
    expect(projectEventTime(5_100, sample, true, duration, 5_020)).toBe(10_020);
  });

  test("a non-finite stamp is treated as now", () => {
    expect(projectEventTime(Number.NaN, sample, true, duration, 5_020)).toBe(10_020);
  });

  test("clamps the projection to the song", () => {
    expect(
      projectEventTime(5_500, { timeMs: 239_900, atMs: 5_000 }, true, duration, 5_600),
    ).toBe(duration);
    expect(
      projectEventTime(4_000, { timeMs: 50, atMs: 5_000 }, true, duration, 5_100),
    ).toBe(0);
  });

  test("clamps a paused sample to the song too", () => {
    expect(
      projectEventTime(5_010, { timeMs: 250_000, atMs: 5_000 }, false, duration, 5_020),
    ).toBe(duration);
  });

  test("an unknown length clamps only at the start of the song", () => {
    // No end to clamp to: a press deep into an unbounded song is its own moment.
    expect(projectEventTime(5_500, { timeMs: 239_900, atMs: 5_000 }, true, 0, 5_600)).toBe(
      240_400,
    );
  });

  test("projects by the transport's rate, not by wall time", () => {
    // 10ms of wall time at half speed is 5ms of song.
    expect(projectEventTime(5_010, sample, true, duration, 5_020, 0.5)).toBe(10_005);
    expect(projectEventTime(5_010, sample, true, duration, 5_020, 0.8)).toBe(10_008);
    // A broken rate is the record rather than a stopped clock.
    expect(projectEventTime(5_010, sample, true, duration, 5_020, Number.NaN)).toBe(10_010);
  });
});
