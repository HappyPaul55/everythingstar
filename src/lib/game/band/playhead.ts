/**
 * Reading the stage's playhead from the song's own sound.
 *
 * A run's clock **is** the music, so the playhead is whatever a sounding stem
 * says. The stem the clock is read from can change mid-run — one part ends
 * early, one is seeking, another finishes buffering — and no two media elements
 * hold quite the same clock: the new one can be a few tens of milliseconds
 * behind the old one. Assigned directly, that steps the playhead **backwards**,
 * which a run reads as a deliberate rewind and wipes itself.
 *
 * So the source is read **monotonically**: a read at or ahead of the playhead is
 * taken, a read behind it is not. A deliberate seek is the exception, because it
 * moves the playhead on purpose — and it needs a **guard**, because the elements
 * are seeked asynchronously and can still report their old position for a frame
 * or two. During that guard a read far from the playhead is the old position and
 * is ignored; a read near it is the target settling and is taken. Outside the
 * guard there is no seek to explain a backward read, so none is accepted.
 *
 * Pure, and wall time is used only to measure the guard — never to advance the
 * song.
 */

/** How long after a deliberate seek the old positions are ignored, in ms. */
export const SEEK_GUARD_MS = 1000;

/**
 * How far from the playhead a read may be during that guard and still be the
 * seek's own target rather than the position from before it. A stem switch is
 * tens of milliseconds, so a quarter of a second is comfortably "the new place".
 */
export const SEEK_GUARD_SLACK_MS = 250;

/**
 * The playhead after reading the source.
 *
 * `next` is what the sound says, `current` is the playhead being kept, and
 * `seekGuardRemainingMs` is how much of `SEEK_GUARD_MS` is left after the last
 * deliberate move (zero or less when there was none).
 */
export function sourcePlayhead(
  next: number,
  current: number,
  seekGuardRemainingMs: number,
): number {
  if (!Number.isFinite(next)) return current;
  if (seekGuardRemainingMs > 0) {
    // Just after a seek: the elements may still be reporting where they were
    // before it. A read that far from the playhead is that old position, not the
    // new one; a read close to it is the seek arriving.
    return Math.abs(next - current) > SEEK_GUARD_SLACK_MS ? current : next;
  }
  // No seek to explain a backward read, so the playhead only ever moves forward:
  // the stem the clock reads from changing must not rewind the song.
  return next >= current ? next : current;
}
