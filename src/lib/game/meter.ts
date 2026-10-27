/**
 * The meter: how much of the part is still in the song.
 *
 * Both judging engines keep one — the melody's run (`run.ts`) and a highway's
 * (`lanes.ts`) — and they must fill and drain it identically, because a band
 * reading two meters that disagree is reading two games. The numbers and the
 * arithmetic live here; the engines only say what happened.
 */

import { clamp } from "./math";

/** How much a hit puts in the meter, and a miss takes out. */
export const METER_FILL = 4.2;
export const METER_MISS_DRAIN = 16;

/** A full meter drains away in about eighteen seconds of nothing. */
export const METER_DRAIN_PER_MS = 100 / 18000;

/** How long a full meter buys when it is spent as star power, in ms. */
export const STAR_POWER_MS = 8000;

/** The gauge's own range. */
function meterValue(value: number): number {
  return clamp(value, 0, 100);
}

/**
 * Where the gauge reads as **full**.
 *
 * A meter is filled before a frame's drain and the run the panel sees is what
 * followed that drain, so a gauge that was just filled to 100 publishes a hair
 * under it (a hundredth of a percent per millisecond of silence). Reading "full"
 * as the top of the gauge rather than an exact 100 is what makes a gauge somebody
 * just filled spendable; the fill step is 4.2 a note, so the previous rung below
 * this is 96.6 and cannot be mistaken for the top.
 */
export const METER_FULL_AT = 99;

/**
 * May a full meter be spent?
 *
 * Read at the top of the gauge rather than at an exact 100: a frame fills before it
 * drains, so a gauge that was just filled to the top is published a hair under it.
 * An exact 100 would be a meter nobody could ever spend, because the press always
 * lands on a later frame than the note that filled it.
 */
export function canActivateStar(meter: number): boolean {
  return meter >= METER_FULL_AT;
}

/**
 * Whether a star-power window bought until `untilMs` is still live at `nowMs`.
 *
 * `0` means one has never been bought, so it is never active. The window ends on
 * its own edge: at exactly `untilMs` it is spent.
 */
export function starPowerActive(untilMs: number, nowMs: number): boolean {
  return untilMs > 0 && nowMs < untilMs;
}

/** A hit, or `notes` of one chord, fills the meter. */
export function fillMeter(meter: number, notes = 1): number {
  return meterValue(meter + METER_FILL * notes);
}

/** A miss, or `notes` dropped by one gesture, drains the meter. */
export function missMeter(meter: number, notes = 1): number {
  return meterValue(meter - METER_MISS_DRAIN * notes);
}

/** Let the meter fall over `gapMs` of nothing played. */
export function drainMeter(meter: number, gapMs: number): number {
  return meterValue(meter - Math.max(0, gapMs) * METER_DRAIN_PER_MS);
}
