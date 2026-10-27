/**
 * A clock for a YouTube player, which reports its time coarsely.
 *
 * The IFrame Player API's `getCurrentTime()` is a **reference**, not an audio
 * clock: it is polled, arrives a few times a second, and can jump when the player
 * seeks or catches up after buffering. The stage's own frame loop runs between
 * those reports, so this keeps a smooth output advancing from the last report and
 * corrects it when a new one arrives. A large disagreement is a seek or a stall
 * catching up, and snaps rather than being smoothed.
 *
 * Pure and tested, so the wobble in a browser can be reasoned about without one.
 * A buffering player is handled by the caller: it returns `null` and the stage
 * waits rather than inventing a position.
 */
export interface YouTubeClockState {
  /** The last time the player reported, ms. */
  reportedMs: number;
  /** When that report arrived, `performance.now()`. */
  reportedAt: number;
  /** The last time handed to the stage, ms. */
  outputMs: number;
  /** When the output was last advanced, `performance.now()`. */
  outputAt: number;
}

/** A disagreement this large is a seek or a stall, not jitter. */
export const YOUTUBE_SNAP_MS = 400;
/**
 * How far the output may run past the last report before it waits. It has to be
 * longer than the gap between reports or the playhead would stutter between them.
 */
export const YOUTUBE_LEAD_MS = 400;
/** How much of a small disagreement is taken per report, so a correction is not a jerk. */
const CORRECTION = 0.35;
/** The most the output may move in one correction, in either direction. */
const MAX_STEP_MS = 40;

export function startYouTubeClock(reportedMs: number, now: number): YouTubeClockState {
  const at = Math.max(0, reportedMs);
  return { reportedMs: at, reportedAt: now, outputMs: at, outputAt: now };
}

export function advanceYouTubeClock(
  state: YouTubeClockState,
  reportedMs: number,
  now: number,
): YouTubeClockState {
  const elapsed = Math.max(0, now - state.outputAt);
  const predicted = state.outputMs + elapsed;

  if (reportedMs !== state.reportedMs) {
    const error = reportedMs - predicted;
    if (Math.abs(error) >= YOUTUBE_SNAP_MS) {
      return startYouTubeClock(reportedMs, now);
    }
    // Move toward the report, but only a little: the scroll should not jump
    // because a poll landed on the far side of a frame.
    const step = Math.max(-MAX_STEP_MS, Math.min(MAX_STEP_MS, error * CORRECTION));
    return {
      reportedMs,
      reportedAt: now,
      outputMs: Math.max(0, predicted + step),
      outputAt: now,
    };
  }

  // No new report: run from the last output, but never more than a lead past what
  // the player actually said. A stalled player stops the song rather than racing it.
  const capped = Math.min(predicted, state.reportedMs + YOUTUBE_LEAD_MS);
  return {
    ...state,
    outputMs: Math.max(state.outputMs, capped),
    outputAt: now,
  };
}
