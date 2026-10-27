/**
 * When an input event happened, in song time.
 *
 * The clock's playhead is only sampled once a frame, so an event stamped with
 * `timeRef.current` is stamped with the frame *before* it — up to a frame late on
 * a fast display, and later still behind Bluetooth audio. A DOM event carries its
 * own `timeStamp`, on the same time origin as `performance.now()`, so the playhead
 * at the event is the last sample plus the wall time between that sample and the
 * event.
 *
 * Pure but for the clock it is handed: the sample and the `performance.now()` to
 * compare a stamp against are both parameters, so this is testable without React.
 */

import { clamp as clampNumber } from "./math";

/** The playhead, and the `performance.now()` at which it was last sampled. */
export interface ClockSample {
  /** The playhead when the sample was taken, in ms. */
  timeMs: number;
  /** The `performance.now()` at which it was taken. */
  atMs: number;
}

/**
 * Project a DOM event's `timeStamp` onto song time.
 *
 * A paused stage holds its playhead: there is no song time passing to project
 * into, so the sample is returned. While playing, the projection is the sample
 * moved by the wall time between the sample and the event, clamped to the song.
 *
 * An event is stamped on the same time origin as `performance.now()`, but older
 * browsers stamped it with `Date.now()` instead — far larger than a page's
 * `performance.now()` — and a stamp from the future is no better. Both are
 * treated as "now" rather than allowed to throw the playhead off by years.
 *
 * A song whose length is **unknown** (zero) is clamped only at its start: there
 * is no end to clamp to, and clamping to zero would stamp every press at the top
 * of the song.
 */
export function projectEventTime(
  eventTimeStamp: number,
  sample: ClockSample,
  playing: boolean,
  durationMs: number,
  nowMs: number,
  rate = 1,
): number {
  const sampled = clamp(sample.timeMs, durationMs);
  if (!playing) return sampled;

  const at =
    Number.isFinite(eventTimeStamp) && eventTimeStamp <= nowMs ? eventTimeStamp : nowMs;
  // Song time advances at the transport's rate: at half speed, a press 10ms after
  // the sample belongs 5ms further into the song, not 10. A frame-counted clock
  // scales its own elapsed time the same way (`StageClock`).
  const speed = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return clamp(sampled + (at - sample.atMs) * speed, durationMs);
}

function clamp(timeMs: number, durationMs: number): number {
  const at = Math.max(0, timeMs);
  return durationMs > 0 && Number.isFinite(durationMs)
    ? clampNumber(at, 0, durationMs)
    : at;
}
