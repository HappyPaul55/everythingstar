/**
 * When a sound that promised to be the clock has stopped answering.
 *
 * A registered source returns `null` while it is buffering, and the playhead
 * waits — right for a moment, fatal for a run. A stem that never arrives, a
 * `.sng` member the browser refuses, a video blocked by a region or an adblocker:
 * none of them will ever answer, and waiting for them holds the song at 0:00 for
 * ever. After `SOURCE_STALL_MS` the frame clock takes over so the run can finish,
 * and the stage says the sound is gone.
 *
 * Pure, so the boundary is tested without an audio element: `firstSilentAt` is the
 * moment the source first answered `null` this run (`null` when it is answering).
 */
export const SOURCE_STALL_MS = 1500;

export interface Stall {
  /** Where the silence began: this call's `nowMs` when it is the first. */
  since: number;
  /** May the frame clock take over? */
  stalled: boolean;
}

export function sourceStalled(
  firstSilentAt: number | null,
  nowMs: number,
  limitMs = SOURCE_STALL_MS,
): Stall {
  const since = firstSilentAt ?? nowMs;
  return { since, stalled: nowMs - since >= limitMs };
}
