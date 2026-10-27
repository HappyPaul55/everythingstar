/**
 * When a run hands its state to React.
 *
 * Judging happens every frame, in a ref; publishing to React is a throttle,
 * because a render per frame is a render per note. But a throttle alone loses the
 * **end** of a run: the clock stops the song, the screen machine leaves the stage,
 * and the last notes judged after the final tick never reach the results screen,
 * the score or the board.
 *
 * So there are three reasons to publish, and one condition that gates them all:
 * there must be something new to say (`dirty`). Without that, a paused stage would
 * publish on every frame for ever.
 *
 * - the throttle has elapsed (`PUBLISH_MS` since the last publish);
 * - the playhead has reached a **known** length, which is the song running out;
 * - the transport is no longer playing — a pause or an end — so the last judged
 *   state goes out before the stage unmounts.
 *
 * Pure, so the rule can be read and tested without a clock or a React tree.
 */

/** How often a run is handed to React. The judging itself runs on every frame. */
export const PUBLISH_MS = 80;

export interface PublishCheck {
  /** The playhead this frame, in ms. */
  now: number;
  /** The playhead at the last publish. */
  published: number;
  /**
   * The song's length, or zero when it is not known. A song may only learn it
   * when its video ends, so zero is "unknown" rather than "already over".
   */
  durationMs: number;
  /** Whether the transport is moving. */
  playing: boolean;
  /** Whether the run has changed since the last publish. */
  dirty: boolean;
}

/** Whether this frame's run should be handed to React. */
export function publishDue({
  now,
  published,
  durationMs,
  playing,
  dirty,
}: PublishCheck): boolean {
  // Nothing new to say: a paused stage, or a frame between two notes, stays quiet.
  if (!dirty) return false;
  // The song is over. The stage may unmount before the next throttle tick, so the
  // final notes must go out now — and a known length is the only way to say this
  // from the playhead alone.
  if (durationMs > 0 && now >= durationMs) return true;
  // A pause or an end: the last judged state is published once, rather than
  // waiting for a tick that will never come.
  if (!playing) return true;
  return now - published >= PUBLISH_MS;
}
