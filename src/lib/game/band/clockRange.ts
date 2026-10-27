/**
 * What a **known** length means for the playhead.
 *
 * A song document may state no length at all — a YouTube-backed song can only
 * learn it when the video ends, and a document read before its charts arrive has
 * nothing to infer one from. Zero is therefore **unknown**, not "already over":
 * clamping the playhead to it would end a run on its first frame, and setting
 * `ended` from it would send every such song straight to the results screen.
 *
 * The sound (or the video) still ends such a run, through `finish()`. A known
 * length behaves exactly as it always did: the playhead stops at the end and the
 * frame loop reports the song running out.
 *
 * Pure, so the boundary is tested without a React tree or an audio element.
 */

/** A real length, or `null` when the song does not know how long it is. */
export function knownLength(durationMs: number): number | null {
  return Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null;
}

/**
 * Keep the playhead inside a song of known length, and leave it alone otherwise.
 *
 * A non-finite playhead is passed through rather than turned into zero: the source
 * reader is what decides whether a bad read is a position at all (`sourcePlayhead`
 * ignores it), and rewriting it here would look like a rewind to the top.
 */
export function clampPlayhead(timeMs: number, durationMs: number): number {
  if (!Number.isFinite(timeMs)) return timeMs;
  const at = Math.max(0, timeMs);
  const length = knownLength(durationMs);
  return length === null ? at : Math.min(length, at);
}

/** Whether a song of known length has run out at this playhead. */
export function playheadEnded(timeMs: number, durationMs: number): boolean {
  const length = knownLength(durationMs);
  return length !== null && timeMs >= length;
}
