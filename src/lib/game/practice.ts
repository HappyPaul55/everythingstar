/**
 * Practice: a stretch of a song, played at a speed a player chooses.
 *
 * A practice plan is a **window into one song**, not a second kind of run. It
 * says where the run starts and ends, how fast the song plays, and whether the
 * window repeats. The screens still see an ordinary run (the countdown, the
 * stage, the pause), which is why practice adds one event to the machine and no
 * screen of its own.
 *
 * The speed is the song's own tempo, not the player's note speed: **0.5–1.0 in
 * 0.1 steps**, where `1` is the record and `0.5` is half speed. Every stem and
 * the fallback frame clock are moved by it (`SongAudio`, `YouTubeStageAudio`,
 * `StageClock`), so the chart, the judging windows and the scoring are untouched.
 *
 * A plan never leaves its song: `clampPractice` keeps both ends inside the
 * duration, repairs a reversed or empty span by stretching it to the end (or to
 * the whole song), and snaps the speed to one of the steps above. Nothing here
 * touches the score board — a practice run never reaches the results screen.
 */

import type { Track } from "./track";
import { clamp } from "./math";

/** The slowest a practice run may go. */
export const PRACTICE_MIN_SPEED = 0.5;

/** The speed of the record, and the fastest a practice run may go. */
export const PRACTICE_MAX_SPEED = 1;

/** The gap between the speeds a practice dialog offers. */
const PRACTICE_SPEED_STEP = 0.1;

/** Every speed the practice dialog offers: 50%, 60% … 100%. */
export const PRACTICE_SPEEDS: readonly number[] = Array.from(
  { length: Math.round((PRACTICE_MAX_SPEED - PRACTICE_MIN_SPEED) / PRACTICE_SPEED_STEP) + 1 },
  // Tenths as whole numbers, then divided once: `0.5 + 2 * 0.1` can land a
  // floating-point hair away from the 0.7 the dialog draws.
  (_, index) => (50 + index * 10) / 100,
);

/** What a practice run is: a span of the song, at a speed, possibly repeated. */
export interface PracticePlan {
  /** Where the run starts, in the song's own time. */
  startMs: number;
  /** Where it stops — and where the next pass starts when `loop` is on. */
  endMs: number;
  /** The song's playback speed: 0.5–1.0, in 0.1 steps. */
  speed: number;
  /** Repeat the span instead of stopping at its end. */
  loop: boolean;
}

/** One named stretch a player can choose to practise. */
export interface PracticeSection {
  label: string;
  startMs: number;
  endMs: number;
}

/** The part of a track this module reads: its charts, its sections and its length. */
type PracticeTrack = Pick<Track, "durationMs" | "charts" | "sections">;

/** The nearest offered speed to `speed`, with a missing or broken value at full speed. */
export function clampPracticeSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return PRACTICE_MAX_SPEED;
  const clamped = clamp(speed, PRACTICE_MIN_SPEED, PRACTICE_MAX_SPEED);
  // The steps are tenths, and folding through whole tenths kills the float noise
  // a repeated addition would otherwise leave in (0.7000000000000001).
  const steps = Math.round(1 / PRACTICE_SPEED_STEP);
  return Math.round(clamped * steps) / steps;
}

/**
 * Keep a plan inside its song, and make a broken span playable.
 *
 * A reversed or empty range means "from here to the end": that is the useful
 * repair for a plan whose end was lost or set before its start. If the start is
 * already the end of the song there is no tail to stretch, so the whole song is
 * the answer. A plan for a song with no length is an empty plan at zero rather
 * than a negative one.
 */
export function clampPractice(plan: PracticePlan, durationMs: number): PracticePlan {
  const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  let startMs = clampTime(plan.startMs, 0, duration);
  let endMs = clampTime(plan.endMs, 0, duration);
  if (endMs <= startMs) {
    if (duration <= 0) {
      startMs = 0;
      endMs = 0;
    } else if (startMs < duration) {
      endMs = duration;
    } else {
      startMs = 0;
      endMs = duration;
    }
  }
  return {
    startMs,
    endMs,
    speed: clampPracticeSpeed(plan.speed),
    loop: plan.loop === true,
  };
}

/**
 * Read a plan from storage or a message, or null when there is nothing to read.
 *
 * Tolerant on purpose: a value that is not an object is not a plan, and a missing
 * field falls back to the whole song at full speed. The result is always clamped,
 * so a tampered value cannot put a run outside its song.
 */
export function parsePractice(value: unknown, durationMs: number): PracticePlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return clampPractice(
    {
      startMs: numberOr(raw.startMs, 0),
      endMs: numberOr(raw.endMs, durationMs),
      speed: numberOr(raw.speed, PRACTICE_MAX_SPEED),
      loop: raw.loop === true,
    },
    durationMs,
  );
}

/**
 * The stretches a player may choose.
 *
 * The song's own **sections** are the first answer, because they are what its
 * source called the parts: `Verse 1`, `Chorus`. A source that carried none leaves
 * the chart's energy **phrases**, which are still real spans of the song; those
 * are numbered rather than named because they have no name. A song with neither
 * is one choice: the whole song.
 *
 * The list is always sorted, never empty on a song with a length, and never
 * reaches past the song: a section's end is the next section's start, and the
 * last one ends at the duration. Empty spans (two markers at the same moment, a
 * phrase that runs backwards) are dropped rather than offered.
 *
 * A song whose first marker is after the top has an **Intro** before its first
 * section: 0 → first marker is a real stretch of the song, and starting the list
 * at the marker would leave it unplayable. Section-to-section spans are unchanged,
 * and so is the phrase fallback, which already begins where its first phrase does.
 */
export function practiceSections(track: PracticeTrack): PracticeSection[] {
  const duration =
    Number.isFinite(track.durationMs) && track.durationMs > 0 ? track.durationMs : 0;
  if (duration <= 0) return [];

  const sections = track.sections ?? [];
  if (sections.length > 0) {
    const starts = sections
      .map((section, index) => ({
        // A section marker outside the song is clamped to the song, and a name a
        // source left empty is still a choice worth drawing.
        timeMs: clampTime(section.timeMs, 0, duration),
        label: section.name.trim() || `Section ${index + 1}`,
        order: index,
      }))
      .filter((section) => section.timeMs < duration)
      .sort((a, b) => a.timeMs - b.timeMs || a.order - b.order);
    const spans = starts
      .map((section, index) => ({
        label: section.label,
        startMs: section.timeMs,
        endMs: index + 1 < starts.length ? starts[index + 1].timeMs : duration,
      }))
      .filter((section) => section.endMs > section.startMs);
    if (spans.length > 0) {
      // The first marker can be anywhere: a bar in, or half a minute in. Either
      // way the song before it is a stretch somebody may want to practise.
      return spans[0].startMs > 0
        ? [{ label: "Intro", startMs: 0, endMs: spans[0].startMs }, ...spans]
        : spans;
    }
  }

  const phrases = track.charts[0]?.phrases ?? [];
  if (phrases.length > 0) {
    const spans = phrases
      .map((phrase, index) => ({
        startMs: clampTime(phrase.startMs, 0, duration),
        endMs: clampTime(phrase.endMs, 0, duration),
        order: index,
      }))
      .filter((phrase) => phrase.endMs > phrase.startMs)
      .sort((a, b) => a.startMs - b.startMs || a.order - b.order)
      // Numbered after the empty ones are dropped, so the choices read 1..n.
      .map(({ startMs, endMs }, index) => ({
        label: `Phrase ${index + 1}`,
        startMs,
        endMs,
      }));
    if (spans.length > 0) return spans;
  }

  return [{ label: "Whole song", startMs: 0, endMs: duration }];
}

/**
 * The section a moment falls in.
 *
 * Used by the practice read-out: a plan stores where it starts, and the stage
 * needs the name the player chose. The end is exclusive so the boundary between
 * two sections belongs to the later one, except at the song's very end, where
 * the last section keeps it rather than the read-out going blank.
 */
export function sectionAt(
  sections: readonly PracticeSection[],
  timeMs: number,
): PracticeSection | null {
  if (sections.length === 0) return null;
  const found = sections.find(
    (section, index) =>
      timeMs >= section.startMs &&
      (timeMs < section.endMs || (index === sections.length - 1 && timeMs <= section.endMs)),
  );
  return found ?? null;
}

/**
 * Has the practice span reached its end?
 *
 * `>=` is deliberate: the frame that lands exactly on the boundary ends the
 * pass. The caller either seeks back to `startMs` (loop) or pauses on `endMs`
 * (one pass). Pure, so the boundary is tested rather than discovered live.
 */
export function practiceEnded(plan: PracticePlan, timeMs: number): boolean {
  return timeMs >= plan.endMs;
}

/**
 * A moment in the song, or the start when it is not a number at all.
 *
 * A section or phrase whose time the source never said is at the top of the
 * song; only a real number is clamped into the duration.
 */
function clampTime(value: number, min: number, max: number): number {
  return clamp(Number.isFinite(value) ? value : min, min, max);
}

/**
 * A stored field as a number, or the fallback. Only a real, finite number is
 * accepted: a stored plan writes numbers, so a string, `null`, a boolean or a
 * missing field is not one. `Number(null)` is 0, which would turn a null speed
 * into half speed rather than the record's own.
 */
function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
