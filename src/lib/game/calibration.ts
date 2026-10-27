/**
 * The measured audio calibration: what a run of taps says the lag is.
 *
 * The stepper in Options is a fine adjustment made by ear, and by ear is the one
 * thing a delay is hard to judge — a player nudges until it feels right, which is
 * not the same as measuring it. This module is the measuring half: it is handed the
 * times the clicks were scheduled for and the times the player tapped, and it works
 * out the offset between them. It is pure, so the arithmetic can be tested without
 * an audio context or a pair of hands.
 *
 * Everything here is in **milliseconds on the same monotonic clock** — the audio
 * context's schedule mapped onto `performance.now()` by the dialog, and the tap's
 * own `event.timeStamp`. No wall-clock dates, and no frame loop.
 *
 * The dialog is the caller. The same rules measure the **picture** half too: the
 * marker's crossings are beats and a tap on one is a tap on a click, so both
 * offsets come out of `measureTaps`/`calibrationLag` with no second arithmetic.
 */

import { LAG_LIMIT_MS, snapLag } from "./settings";

/** How many clean taps a measurement aims for. */
export const CALIBRATION_TAPS = 8;

/**
 * How many beats the dialog schedules. A tap that lands nowhere near a beat is not
 * a tap to it, so a few spare beats let a player recover from a miss and still
 * reach `CALIBRATION_TAPS`.
 */
export const CALIBRATION_BEATS = 12;

/**
 * The gap between clicks: a slow, comfortable pulse to tap to.
 *
 * It is more than twice `CALIBRATION_WINDOW_MS`, so a tap at the window's edge is
 * still nearer its own beat than the next one, and a tap between beats is refused
 * rather than paired with whichever beat happens to be closer. At the original half
 * second a 300 ms tap was already nearer the *next* click, and the wider window
 * would have had nothing left to reject.
 */
export const CALIBRATION_BEAT_MS = LAG_LIMIT_MS * 2 + 100;

/** The quiet moment before the first click, so a player can find the pulse. */
export const CALIBRATION_LEAD_IN_MS = 1500;

/**
 * How far a tap may sit from its nearest beat and still be a tap to it. Beyond
 * this it is a hand finding the button rather than a tap on the beat, and counting
 * it would drag the median away from the truth.
 *
 * It is the lag **limit** itself, not a fraction of a second: the stepper accepts
 * ±`LAG_LIMIT_MS`, so a window narrower than that would leave a display at the
 * limit measurable by hand and not by the dialog. The pulse is wider than twice
 * this, so a tap at the edge is still the closer of two beats and the measurement
 * reads the whole range rather than aliasing to the next click.
 */
export const CALIBRATION_WINDOW_MS = LAG_LIMIT_MS;

/** Fewer accepted taps than this is not a measurement, however clean they look. */
export const CALIBRATION_MIN_TAPS = 4;

/**
 * The picture calibration's pulse: how far apart its crossings are. The eye
 * follows a sweep rather than hearing a tick, so its pulse is a slow, visible one
 * of its own.
 */
export const PICTURE_CALIBRATION_BEAT_MS = 700;

/** How many crossings the picture run draws, with the same spare ones as the clicks. */
export const PICTURE_CALIBRATION_CROSSINGS = 12;

/** The quiet moment before the marker begins its first sweep. */
export const PICTURE_CALIBRATION_LEAD_IN_MS = 1500;

/** What a run of taps measured: the accepted offsets and how they read. */
export interface CalibrationSummary {
  /** One offset per accepted tap, in milliseconds: positive is late. */
  offsets: number[];
  /** The middle offset, or null when no tap was close enough to a beat. */
  medianMs: number | null;
  /** How many taps were close enough to a beat to count. */
  accepted: number;
  /** How many were dropped as not a tap to any beat. */
  rejected: number;
}

/**
 * Measure a run of taps against the beats they were played to.
 *
 * Each tap is paired with its **nearest** scheduled beat, because a tap can be
 * early or late and the beat it belongs to is the one it is closest to. A tap
 * further than `CALIBRATION_WINDOW_MS` from that beat is rejected rather than
 * folded in: a mistimed press is not evidence about the audio delay.
 *
 * **A beat can be answered once.** The first tap to claim a beat is the one
 * measured; a later tap to the same beat is rejected. Otherwise a double tap on
 * one click would count twice and could reach the target without half the beats
 * being played, which drags the median toward whichever beat was double-tapped.
 *
 * The median is the summary's answer rather than the mean, so one tap that is
 * merely near the edge of the window cannot move the result much.
 */
export function measureTaps(
  beats: readonly number[],
  taps: readonly number[],
): CalibrationSummary {
  const scheduled = beats.filter(Number.isFinite).slice().sort((a, b) => a - b);
  const offsets: number[] = [];
  /** The beats a tap has already answered, by their index in `scheduled`. */
  const claimed = new Set<number>();
  let rejected = 0;

  for (const tap of taps) {
    if (!Number.isFinite(tap) || scheduled.length === 0) {
      rejected += 1;
      continue;
    }
    const nearest = nearestBeat(scheduled, tap);
    const offset = tap - scheduled[nearest];
    if (Math.abs(offset) > CALIBRATION_WINDOW_MS || claimed.has(nearest)) {
      rejected += 1;
      continue;
    }
    claimed.add(nearest);
    offsets.push(offset);
  }

  return {
    offsets,
    medianMs: median(offsets),
    accepted: offsets.length,
    rejected,
  };
}

/**
 * The moments the picture marker crosses the line, on the same monotonic clock
 * as a tap.
 *
 * They are the picture run's **beats**: `measureTaps` pairs a tap with its
 * nearest crossing exactly as it pairs one with a click, so the two measurements
 * share one set of rules and one result. The first crossing is `firstMs`; each
 * later one is one interval after it.
 */
export function crossingTimes(
  firstMs: number,
  count = PICTURE_CALIBRATION_CROSSINGS,
  intervalMs = PICTURE_CALIBRATION_BEAT_MS,
): number[] {
  if (!Number.isFinite(firstMs) || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    return [];
  }
  return Array.from(
    { length: Math.max(0, Math.floor(count)) },
    (_, index) => firstMs + index * intervalMs,
  );
}

/**
 * Where the picture marker sits across the track, 0..100, at a moment.
 *
 * It waits at the left edge through the lead-in, then sweeps to the right over
 * one interval, crossing the line (50) halfway through — which is the first
 * crossing. The next sweep begins at the left edge after the wrap, so every
 * interval is one crossing and the line is only ever crossed on a beat. Pure, so
 * the crossing and the drawing cannot disagree about where the line is.
 */
export function pictureMarkerPercent(
  nowMs: number,
  firstCrossingMs: number,
  intervalMs = PICTURE_CALIBRATION_BEAT_MS,
): number {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return 50;
  const sweepStartMs = firstCrossingMs - intervalMs / 2;
  if (!Number.isFinite(nowMs) || nowMs <= sweepStartMs) return 0;
  const phase = ((nowMs - sweepStartMs) / intervalMs) % 1;
  return phase * 100;
}

/**
 * The setting a measurement earns: the median snapped to the stepper's own 5 ms
 * steps and clamped to the lag's limit, or **null** when there were too few clean
 * taps to trust.
 *
 * It returns null rather than a default on purpose: "the measurement failed" and
 * "the lag is zero" are different answers, and the dialog says the first one.
 */
export function calibrationLag(summary: CalibrationSummary): number | null {
  if (summary.accepted < CALIBRATION_MIN_TAPS || summary.medianMs === null) return null;
  return snapLag(summary.medianMs);
}

/** The index of the scheduled beat closest to a tap. Ties go to the earlier beat. */
function nearestBeat(beats: readonly number[], tap: number): number {
  let best = 0;
  let bestDistance = Math.abs(tap - beats[0]);
  for (let index = 1; index < beats.length; index += 1) {
    const distance = Math.abs(tap - beats[index]);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/** The middle value: an even run averages its two middles, as a median does. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}
