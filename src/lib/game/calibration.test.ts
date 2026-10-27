import { describe, expect, test } from "bun:test";
import {
  CALIBRATION_BEAT_MS,
  CALIBRATION_BEATS,
  CALIBRATION_LEAD_IN_MS,
  CALIBRATION_MIN_TAPS,
  CALIBRATION_TAPS,
  CALIBRATION_WINDOW_MS,
  PICTURE_CALIBRATION_BEAT_MS,
  PICTURE_CALIBRATION_CROSSINGS,
  calibrationLag,
  crossingTimes,
  measureTaps,
  pictureMarkerPercent,
  type CalibrationSummary,
} from "./calibration";
import { LAG_LIMIT_MS, LAG_STEP_MS } from "./settings";

/** The beats the dialog would schedule, in the same monotonic domain as a tap. */
const beats = Array.from(
  { length: CALIBRATION_BEATS },
  (_, index) => 10_000 + CALIBRATION_LEAD_IN_MS + index * CALIBRATION_BEAT_MS,
);

/** A tap on every beat, shifted by `offset` milliseconds. */
function tapsAt(offset: number, count = CALIBRATION_TAPS): number[] {
  return beats.slice(0, count).map((beat) => beat + offset);
}

function summary(offsets: number[]): CalibrationSummary {
  const sorted = offsets.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
  return { offsets, medianMs, accepted: offsets.length, rejected: 0 };
}

describe("the calibration's constants", () => {
  test("a run aims for eight taps, with spare beats for a miss", () => {
    expect(CALIBRATION_TAPS).toBe(8);
    expect(CALIBRATION_BEATS).toBeGreaterThanOrEqual(CALIBRATION_TAPS);
    expect(CALIBRATION_LEAD_IN_MS).toBeGreaterThan(0);
  });

  test("the window is the stepper's own limit, with a beat either side", () => {
    expect(CALIBRATION_WINDOW_MS).toBe(LAG_LIMIT_MS);
    // Wider than twice the window, so a tap at its edge is still nearer its own
    // beat than the next, and one between beats is still refused.
    expect(CALIBRATION_BEAT_MS).toBeGreaterThan(CALIBRATION_WINDOW_MS * 2);
    expect(CALIBRATION_MIN_TAPS).toBeLessThan(CALIBRATION_TAPS);
  });
});

describe("measureTaps", () => {
  test("taps exactly on the beats are zero", () => {
    const measured = measureTaps(beats, tapsAt(0));
    expect(measured.offsets).toEqual(Array(CALIBRATION_TAPS).fill(0));
    expect(measured.medianMs).toBe(0);
    expect(measured.accepted).toBe(CALIBRATION_TAPS);
    expect(measured.rejected).toBe(0);
    expect(calibrationLag(measured)).toBe(0);
  });

  test("uniformly late taps are that offset", () => {
    const measured = measureTaps(beats, tapsAt(35));
    expect(measured.offsets).toEqual(Array(CALIBRATION_TAPS).fill(35));
    expect(measured.medianMs).toBe(35);
    expect(calibrationLag(measured)).toBe(35);
  });

  test("early taps are negative", () => {
    const measured = measureTaps(beats, tapsAt(-40));
    expect(measured.medianMs).toBe(-40);
    expect(calibrationLag(measured)).toBe(-40);
  });

  test("a lag the stepper accepts is measurable, up to its limit", () => {
    // 250 ms is the one the old 200 ms window threw away even though the stepper
    // accepted it; 300 is the limit itself.
    for (const lag of [250, LAG_LIMIT_MS]) {
      const measured = measureTaps(beats, tapsAt(lag));
      expect(measured.accepted).toBe(CALIBRATION_TAPS);
      expect(measured.medianMs).toBe(lag);
      expect(calibrationLag(measured)).toBe(lag);
    }
  });

  test("a tap nowhere near a beat is rejected, not averaged in", () => {
    // Halfway between two beats is a hand finding the button, not a tap on either.
    const wild = beats[2] + CALIBRATION_BEAT_MS / 2;
    const measured = measureTaps(beats, [...tapsAt(10), wild]);
    expect(measured.accepted).toBe(CALIBRATION_TAPS);
    expect(measured.rejected).toBe(1);
    expect(measured.medianMs).toBe(10);
  });

  test("a tap exactly at the window's edge still counts", () => {
    // One beat, so the edge is the edge of the rule rather than of the pulse.
    const measured = measureTaps([beats[0]], [beats[0] + CALIBRATION_WINDOW_MS]);
    expect(measured.accepted).toBe(1);
    expect(measured.medianMs).toBe(CALIBRATION_WINDOW_MS);
  });

  test("a tap a millisecond past the window does not", () => {
    const measured = measureTaps([beats[0]], [beats[0] + CALIBRATION_WINDOW_MS + 1]);
    expect(measured.accepted).toBe(0);
    expect(measured.rejected).toBe(1);
  });

  test("a beat can only be answered once, so a double tap is rejected", () => {
    const measured = measureTaps([beats[0]], [beats[0], beats[0] + 10]);
    expect(measured.offsets).toEqual([0]);
    expect(measured.accepted).toBe(1);
    expect(measured.rejected).toBe(1);
  });

  test("taps to two different beats both count", () => {
    const measured = measureTaps(beats, [beats[0] + 10, beats[1] - 20]);
    expect(measured.offsets).toEqual([10, -20]);
    expect(measured.medianMs).toBe(-5);
    expect(measured.accepted).toBe(2);
    expect(measured.rejected).toBe(0);
  });

  test("the first tap wins its beat, even when a later one is closer", () => {
    // 320 is within the window of 500 and claims it; 490 is much closer to 500
    // but arrives second, so it is a second answer to a beat already answered.
    const measured = measureTaps([0, 500], [320, 490]);
    expect(measured.offsets).toEqual([-180]);
    expect(measured.accepted).toBe(1);
    expect(measured.rejected).toBe(1);
  });

  test("a mixed run counts each accepted and rejected tap once", () => {
    const measured = measureTaps(
      [0, 500, 1000, 1500],
      [0, 500, 520, 1200, 1400, 2000],
    );
    expect(measured.offsets).toEqual([0, 0, 200, -100]);
    expect(measured.accepted).toBe(4);
    expect(measured.rejected).toBe(2);
    expect(measured.medianMs).toBe(0);
  });

  test("the median is robust to one tap that is merely near the edge", () => {
    // One late tap inside the window cannot move the middle of a clean run.
    const measured = measureTaps(beats, [...tapsAt(0, 7), beats[7] + 190]);
    expect(measured.accepted).toBe(8);
    expect(measured.offsets).toContain(190);
    expect(measured.medianMs).toBe(0);
    expect(calibrationLag(measured)).toBe(0);
  });

  test("too few accepted taps cannot be trusted", () => {
    const measured = measureTaps(beats, tapsAt(25, CALIBRATION_MIN_TAPS - 1));
    expect(measured.accepted).toBe(CALIBRATION_MIN_TAPS - 1);
    expect(measured.medianMs).toBe(25);
    expect(calibrationLag(measured)).toBeNull();
  });

  test("the minimum number of clean taps is enough", () => {
    const measured = measureTaps(beats, tapsAt(25, CALIBRATION_MIN_TAPS));
    expect(calibrationLag(measured)).toBe(25);
  });

  test("an empty run measures nothing", () => {
    expect(measureTaps([], [])).toEqual({
      offsets: [],
      medianMs: null,
      accepted: 0,
      rejected: 0,
    });
    expect(calibrationLag(measureTaps([], []))).toBeNull();
  });

  test("taps with no beats at all are rejected", () => {
    const measured = measureTaps([], [1, 2, 3]);
    expect(measured.offsets).toEqual([]);
    expect(measured.accepted).toBe(0);
    expect(measured.rejected).toBe(3);
  });

  test("nonsense times are dropped rather than measured", () => {
    const measured = measureTaps([Number.NaN, ...beats], [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      ...tapsAt(0, 2),
    ]);
    expect(measured.accepted).toBe(2);
    expect(measured.rejected).toBe(2);
  });

  test("the beats need not arrive sorted", () => {
    const shuffled = [...beats].reverse();
    expect(measureTaps(shuffled, tapsAt(15)).medianMs).toBe(15);
  });
});

describe("the picture measurement", () => {
  test("crossings are a fixed interval apart, on the tap clock", () => {
    const first = 10_000;
    const crossings = crossingTimes(first, PICTURE_CALIBRATION_CROSSINGS);
    expect(crossings).toHaveLength(PICTURE_CALIBRATION_CROSSINGS);
    expect(crossings[0]).toBe(first);
    expect(crossings[1] - crossings[0]).toBe(PICTURE_CALIBRATION_BEAT_MS);
    expect(crossings[PICTURE_CALIBRATION_CROSSINGS - 1]).toBe(
      first + (PICTURE_CALIBRATION_CROSSINGS - 1) * PICTURE_CALIBRATION_BEAT_MS,
    );
  });

  test("the same taps and median measure the picture as they do the sound", () => {
    const first = 20_000;
    const crossings = crossingTimes(first, PICTURE_CALIBRATION_CROSSINGS);
    // A hand that is 45 ms late on every crossing earns +45 ms, exactly as it
    // would on the clicks; nothing about the picture needs its own arithmetic.
    const taps = crossings.slice(0, CALIBRATION_TAPS).map((at) => at + 45);
    const measured = measureTaps(crossings, taps);
    expect(measured.accepted).toBe(CALIBRATION_TAPS);
    expect(measured.medianMs).toBe(45);
    expect(calibrationLag(measured)).toBe(45);
  });

  test("the marker is on the line at every crossing and waits before the first", () => {
    const first = 10_000;
    expect(pictureMarkerPercent(first - PICTURE_CALIBRATION_BEAT_MS / 2 - 1, first)).toBe(0);
    expect(pictureMarkerPercent(first - PICTURE_CALIBRATION_BEAT_MS / 2, first)).toBe(0);
    expect(pictureMarkerPercent(first, first)).toBe(50);
    expect(pictureMarkerPercent(first + PICTURE_CALIBRATION_BEAT_MS, first)).toBe(50);
    // The sweep reaches the right edge, then wraps to the left for the next one.
    expect(
      pictureMarkerPercent(first + PICTURE_CALIBRATION_BEAT_MS / 2 - 1, first),
    ).toBeGreaterThan(99);
    expect(pictureMarkerPercent(first + PICTURE_CALIBRATION_BEAT_MS / 2, first)).toBe(0);
  });

  test("the picture pulse leaves room inside the tap window", () => {
    // A crossing is far enough from its neighbours that a tap within the window
    // can only belong to one of them.
    expect(PICTURE_CALIBRATION_BEAT_MS).toBeGreaterThan(CALIBRATION_WINDOW_MS * 2);
  });
});

describe("calibrationLag", () => {
  test("snaps the median to the stepper's own steps", () => {
    expect(calibrationLag(summary([33, 34, 34, 35]))).toBe(35);
    expect(calibrationLag(summary([-33, -33, -34, -34]))).toBe(-35);
    // 37.5 is the boundary between 35 and 40: the store's rule rounds it up.
    expect(calibrationLag(summary([37, 38, 38, 37]))).toBe(40);
    expect(LAG_STEP_MS).toBe(5);
  });

  test("clamps at both ends", () => {
    expect(calibrationLag(summary([500, 500, 500, 500]))).toBe(LAG_LIMIT_MS);
    expect(calibrationLag(summary([-500, -500, -500, -500]))).toBe(-LAG_LIMIT_MS);
  });

  test("a summary with no median is null even with a count", () => {
    expect(calibrationLag({ offsets: [], medianMs: null, accepted: 4, rejected: 0 })).toBeNull();
  });
});
