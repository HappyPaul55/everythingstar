/**
 * When a song's stems are ready to play.
 *
 * The band screen preloads every stem a run will use, and pressing Play waits for
 * them. "Ready" is the browser's own answer: `HAVE_ENOUGH_DATA` (`readyState` 4),
 * the state behind `canplaythrough` — enough buffered that the element expects to
 * play through without stopping. It is **not** a measure of the whole file: a
 * browser may have downloaded part of a long stem and still know it can keep up.
 *
 * A stem that has **failed** or **ended** counts as settled, because a file that
 * will never arrive must not trap the loader. The run can go on without it, and
 * `SongProblems` on the band screen names what is missing.
 *
 * The count is latched by the caller: a stem that was ready once stays counted
 * for this song, so a buffer eviction while the player is still choosing a band
 * does not turn the Play button back into a spinner. Readiness is a **start**
 * gate, not a promise about every second of the run.
 *
 * Pure: the provider hands in the states, so the arithmetic is tested without a
 * media element.
 */

/**
 * `HTMLMediaElement.HAVE_ENOUGH_DATA`.
 *
 * A named number rather than the DOM constant so this module stays pure and can
 * be read on a server. 3 (`HAVE_FUTURE_DATA`) only says the element can start;
 * 4 is the browser saying it expects to keep going, which is the promise the
 * loader makes.
 */
export const PRELOAD_READY_STATE = 4;

/**
 * How long the Play button waits before it offers to start anyway.
 *
 * A stem that is slow is ordinary; a stem that is never arriving must not trap
 * the player on the band screen. This is the escape hatch's own clock, owned by
 * the screen that shows it (the screen turns it into “Play anyway”), not a
 * readiness rule: the run is not started automatically when it passes.
 */
export const PRELOAD_GRACE_MS = 45_000;

/** One stem as the rule sees it. Structural, so a test can fake one. */
export interface PreloadStem {
  /** `HTMLMediaElement.readyState`. */
  readyState: number;
  /** The element has a `MediaError`; there is nothing more to wait for. */
  failed?: boolean;
  /** The element has played to its end. */
  ended?: boolean;
}

/**
 * Has this stem stopped needing to be waited for?
 *
 * `failed` and `ended` are both settled: one has no file, the other has no more
 * file to fetch. Only a stem with current data below `HAVE_ENOUGH_DATA` is still
 * loading.
 */
export function stemSettled(stem: PreloadStem): boolean {
  return (
    stem.failed === true ||
    stem.ended === true ||
    stem.readyState >= PRELOAD_READY_STATE
  );
}

/** What the loader reads out: how many stems are settled, and whether all are. */
export interface PreloadProgress {
  /** Stems that are ready or settled, capped at the total. */
  done: number;
  /** The stems the run expects to play. */
  total: number;
  /** Every expected stem is settled, so the run can start. */
  ready: boolean;
}

/**
 * The loader's arithmetic.
 *
 * `missing` is the count of stems that could not even be turned into elements —
 * a local file the browser would not read, for example. They are settled without
 * an element to watch, and are named by the caller's own warning.
 *
 * An expected total of zero is ready: a song with no stems (a YouTube-backed
 * song, lyrics-only Listen, or the silent demo) has nothing to wait for.
 */
export function preloadProgress(
  stems: readonly PreloadStem[],
  expected: number,
  missing = 0,
): PreloadProgress {
  const total = Number.isFinite(expected) ? Math.max(0, Math.round(expected)) : 0;
  const absent = Number.isFinite(missing)
    ? Math.max(0, Math.min(total, Math.round(missing)))
    : 0;
  const settled = stems.filter(stemSettled).length;
  const done = Math.min(total, settled + absent);
  return { done, total, ready: total === 0 || done >= total };
}
