/**
 * Keeping a song's stems on one clock: which one the clock is read from, and where
 * the others are put at a transport edge.
 *
 * A song's parts are separate media elements (`SongAudio`), and no two of them stop,
 * start or buffer at exactly the same instant. `drift.ts` keeps them close **while the
 * song runs**, but it is deliberately gentle: a nudge is a rate, and a rate takes
 * seconds to close a gap. A pause and a resume are the two moments when the elements
 * can end up tens of milliseconds apart, and a 40–60 ms spread is not drift — with
 * drums, backing and vocals playing at once it is a flam, and the room hears it as an
 * echo.
 *
 * The two rules here are the same question asked twice: **the playhead is the one
 * timeline**, never a stem. The clock is read from the sounding stem nearest it, so a
 * stem that started, resumed or stalled late cannot hold the song back; and an edge
 * moves every stem onto the playhead, so a stem that *is* behind cannot drag the band
 * with it. It is a small set of decisions, which is why it is here, pure, and tested
 * without an audio device.
 */

import { stillAction, stemRate } from "./drift";

/** A stem as these rules see it. Structural, so a test can fake one. */
export interface StemTiming {
  /** The element's own position, in ms. */
  timeMs: number;
  /** `HTMLMediaElement.readyState`. Below 1 there is no timeline to move yet. */
  readyState: number;
  /** The element has a `MediaError`, so there is nothing to align. */
  failed?: boolean;
  /** The element is mid-seek, and moving it again fights the seek it is doing. */
  seeking?: boolean;
  /** The element is not playing, so the clock cannot be read from it. */
  paused?: boolean;
  /**
   * The element has played to its end. It is not a clock to read, a stem to move or
   * a stem to restart: a chart folder may cut a part short, and asking an ended element to
   * `play()` starts it from the top in the middle of the song.
   */
  ended?: boolean;
}

/** A stem as the clock-source rule sees it. */
export interface SoundingStem {
  /** The element's own position, in ms. */
  timeMs: number;
  /** It is actually playing and has a timeline to read. */
  sounding: boolean;
}

/** One stem to move, and where. */
export interface StemMove {
  index: number;
  timeMs: number;
}

/**
 * How far apart two stems may be and still count as in phase.
 *
 * Five milliseconds is inaudible as a flam and well inside a frame, so an alignment
 * that finds the stems this close does nothing rather than seek for the sake of it.
 */
export const STEM_ALIGN_TOLERANCE_MS = 5;

/**
 * How close two stems must be before the clock keeps the one it already had.
 *
 * The playhead is sampled once a frame, so every stem is a few milliseconds "ahead"
 * of it by the time they are compared; the comparison is therefore relative. A stem
 * within this much of the nearest keeps the clock, which is what stops two stems in
 * phase from handing the source back and forth every frame.
 */
export const SOURCE_PREFERENCE_MS = 8;

/**
 * How long a start waits for every stem to actually move before seating them anyway.
 *
 * A `play()` on a streamed element is not instant: each stem's pipeline takes its own
 * moment to begin advancing (tens to a few hundred ms). Seating must wait for that —
 * **not** chase it frame by frame, because a `currentTime` write on a stem that is
 * still starting restarts its startup, and eight writes in eight frames turned a six
 * millisecond natural stagger into a hundred-millisecond flam that then took the whole
 * run to close. So nothing is moved until every stem has advanced at least once, and
 * this deadline is the answer for a stem that never will (a refused start, a file that
 * will not move): seat what there is and let the ordinary rules take it from there.
 */
export const START_SEAT_DEADLINE_MS = 1200;

/**
 * Whether a start's stems are seated yet, or still waited for.
 *
 * `started` is one flag per stem: has it advanced since the edge? Once every stem has
 * moved (or the deadline has passed), one alignment puts them all on the playhead —
 * one move each, at the one moment when moving them cannot be heard, rather than a
 * seek per frame on elements whose only crime was starting a beat later.
 */
export function startSeatAction(
  started: readonly boolean[],
  sinceEdgeMs: number,
): "wait" | "seat" {
  if (sinceEdgeMs >= START_SEAT_DEADLINE_MS) return "seat";
  return started.every(Boolean) ? "seat" : "wait";
}

/** Whether there is a timeline here worth moving. */
function usable(stem: StemTiming): boolean {
  return !stem.failed && !stem.ended && stem.readyState >= 1 && !stem.seeking;
}

/**
 * Which sounding stem the clock should be read from.
 *
 * The answer is the one **closest to the playhead the game already has**, never
 * merely the first by position. A stem that started late, resumed after a pause, or
 * came back from a browser stall is *behind* the song; reading it stalls the playhead
 * (a monotonic read cannot go back to meet it), and it holds the highway still until
 * the drift rule has carried it forward. A stem that has run ahead is not preferred
 * either, because it would jump the song forward.
 *
 * `preferred` is the stem read on the last frame. It keeps the clock when it is
 * within `SOURCE_PREFERENCE_MS` of the best answer, so two stems in phase cannot make
 * the source flicker from frame to frame.
 *
 * Returns `-1` when nothing is sounding.
 */
export function sourceStem(
  stems: readonly SoundingStem[],
  expectedMs: number,
  preferred = -1,
): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < stems.length; index += 1) {
    const stem = stems[index];
    if (!stem?.sounding || !Number.isFinite(stem.timeMs)) continue;
    const distance = Math.abs(stem.timeMs - expectedMs);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  if (best < 0) return -1;
  const kept = stems[preferred];
  if (preferred >= 0 && kept?.sounding && Number.isFinite(kept.timeMs)) {
    const distance = Math.abs(kept.timeMs - expectedMs);
    if (distance <= bestDistance + SOURCE_PREFERENCE_MS) return preferred;
  }
  return best;
}

/**
 * Which stems need moving, and to what time.
 *
 * The **song's own playhead** is the target, not another stem. That is the whole
 * point: a stem that started late, resumed after a pause, or came back from a browser
 * stall is behind the song, and aligning the others to *it* would drag a perfectly
 * good band backwards to meet it. Every stem with a timeline is moved onto `targetMs`
 * unless it is already within `toleranceMs`; one with no metadata, an error, an end or
 * a seek in flight is left to `drift.ts`, which settles it once it has a clock again.
 */
export function stemAlignmentsTo(
  stems: readonly StemTiming[],
  targetMs: number,
  toleranceMs = STEM_ALIGN_TOLERANCE_MS,
): StemMove[] {
  if (!Number.isFinite(targetMs)) return [];
  const at = Math.max(0, targetMs);
  const moves: StemMove[] = [];
  for (let index = 0; index < stems.length; index += 1) {
    const stem = stems[index];
    if (!stem || !usable(stem) || !Number.isFinite(stem.timeMs)) continue;
    if (Math.abs(stem.timeMs - targetMs) <= toleranceMs) continue;
    moves.push({ index, timeMs: at });
  }
  return moves;
}

/** What one frame writes to a stem while the song stands still. */
export interface PausedWrite {
  /** The song's own rate: a nudge is for a correction the room can hear. */
  playbackRate: number;
  /** Whether this frame should move the element onto the playhead. */
  seek: boolean;
}

/**
 * The write a paused stem gets on one frame.
 *
 * A pause is a transport edge that **lasts**, and the stage's clock calls its
 * subscribers every frame whether or not the transport is moving. An alignment puts
 * the stems on one clock once, but a stem that was mid-seek then, or that arrives
 * while the song is stopped, is left for the frames after it — and the old rule moved
 * any stem more than a seek away on **every** one of them: sixty writes a second for
 * the whole pause, re-issuing a range request each time and overriding the very
 * "leave a seeking stem alone" rule the alignment keeps.
 *
 * So the patience here is a still stem's (`stillAction`): a tight hold, and a cooldown
 * after a seek. The room hears nothing of a pause, so a correction costs nothing — but
 * a correction that cannot land must not become the frame loop's whole job. The rate
 * stays the song's own: there is no moving song for a nudge to close a gap in.
 */
export function pausedAction(
  baseRate: number,
  driftMs: number,
  sinceSeekMs: number,
): PausedWrite {
  return {
    playbackRate: stemRate(baseRate, { kind: "hold" }),
    seek: stillAction(driftMs, sinceSeekMs).kind === "seek",
  };
}

/**
 * How far apart the stems with a timeline are, in ms — the read-out's number, and the
 * quickest way for a test to say whether an alignment did anything.
 *
 * Stems without a timeline are not part of the answer: one that is still loading, or
 * one that has ended because the folder cut it short, is not evidence that the song is
 * out of phase. Fewer than two of them have no spread.
 */
export function stemSpreadMs(stems: readonly StemTiming[]): number | null {
  const times = stems
    .filter((stem) => usable(stem) && Number.isFinite(stem.timeMs))
    .map((stem) => stem.timeMs);
  if (times.length < 2) return null;
  return Math.max(...times) - Math.min(...times);
}
