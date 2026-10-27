import type { LaneChart } from "./track";

/**
 * The scoring rules, in one place: how close a hit has to be, what a note is
 * worth, how the multiplier climbs, how a sustain pays, and how a run is rated.
 *
 * The model is the one a band game has used for years: a note is worth a flat
 * **50 points**, a chord is the sum of its notes, and the points are multiplied by
 * the streak. Timing decides whether a note is a hit at all; it does not grade the
 * hit into a smaller or larger score. A hero note keeps its old five-times value,
 * and a sustain pays again for every measure it is held.
 *
 * The numbers are deliberately round. A song's whole score is its notes and holds;
 * the **base score** is what the same song pays at ×1, and a run's rating is its
 * score divided by that base. That is what makes the star rating a measure of the
 * multiplier a run sustained rather than a second accuracy figure.
 */

/** How close to the beat a note counts at all, in ms. The window is **inclusive at
 * both edges**, and the miss rule closes a note only strictly after it — so the last
 * millisecond a late note can be played is the same one the run still has it
 * pending for. */
export const HIT_WINDOW_MS = 150;

/** What a plain note is worth before the multiplier. */
export const NOTE_POINTS = 50;

/** What a hero note (or word) is worth, on top of its own value. Not the combo. */
export const HERO_MULTIPLE = 5;

/**
 * What a note is worth while star power is live, on top of the streak multiplier.
 *
 * It is a scoring rule like the combo — score over the song's base — so the base
 * score and `laneBaseScore` are deliberately left alone.
 */
export const STAR_MULTIPLE = 2;

/** One step of the streak multiplier every this many consecutive notes. */
const MULTIPLIER_STEP = 10;

/** The highest the streak multiplier goes. */
export const MAX_MULTIPLIER = 4;

/** What one held sustain pays per measure, per note, before the multiplier. */
export const HOLD_POINTS_PER_MEASURE = 25;

/**
 * What one **fill hit** pays: a strike inside a freestyle window that had no note
 * to judge.
 *
 * It is deliberately small and **not** multiplied by the streak, and it does not
 * grow the combo. A fill is a place to play with the kit, not a second score
 * ladder: paying it like a note would make a busy fill worth more than the notes
 * around it, and letting it feed the multiplier would let a fill carry a streak
 * nobody played a note for. `lanes.ts` caps how often it can pay at all.
 */
export const FILL_POINTS = 10;

/** A measure is four beats, the convention every chart's tempo grid uses. */
const MEASURE_BEATS = 4;

/**
 * The measure a chart with no tempo is scored against. There is no beat to read,
 * and a sustain still has to pay something; two seconds is a 120 BPM measure, the
 * tempo most charts sit around.
 */
export const DEFAULT_MEASURE_MS = 2000;

/** The points a note is worth, before the streak multiplier. */
export function notePoints(hero: boolean): number {
  return NOTE_POINTS * (hero ? HERO_MULTIPLE : 1);
}

/**
 * The streak multiplier: ×1 for the first nine notes, ×2 from ten, ×3 from
 * twenty, and ×4 from thirty on. A miss resets the combo to zero, which starts
 * the ladder again.
 */
export function multiplier(combo: number): number {
  // A missing or broken count is the first rung, never a ×0: the multiplier is a
  // reward, so there is no state in which it takes points away.
  const count = Number.isFinite(combo) ? Math.max(0, combo) : 0;
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(count / MULTIPLIER_STEP));
}

/** What a note is worth at a given combo. */
export function noteValue(hero: boolean, combo: number): number {
  return notePoints(hero) * multiplier(combo);
}

/** How long a measure is for a chart's tempo, in ms. */
export function measureMs(bpm?: number): number {
  if (typeof bpm !== "number" || !Number.isFinite(bpm) || bpm <= 0) {
    return DEFAULT_MEASURE_MS;
  }
  return (60000 / bpm) * MEASURE_BEATS;
}

/**
 * What a sustain pays for being held for `lengthMs`, before the multiplier. It is
 * prorated: half a measure is half the points, not nothing and not a whole one.
 */
export function holdBasePoints(lengthMs: number, bpm?: number): number {
  if (!(lengthMs > 0)) return 0;
  return HOLD_POINTS_PER_MEASURE * (lengthMs / measureMs(bpm));
}

/**
 * The base score of a melody or a typed lyric: every note or word at ×1. A hero
 * note is part of the base at its five-times value, so a perfect run against a
 * chart full of them still has an average multiplier of ×1.
 */
export function notesBaseScore(notes: readonly { hero: boolean }[]): number {
  return notes.reduce((total, note) => total + notePoints(note.hero), 0);
}

/**
 * The base score of a highway chart: every note at ×1, plus every sustain held for
 * its whole length at ×1. This is the denominator a run's average multiplier is
 * read against.
 */
export function laneBaseScore(chart: Pick<LaneChart, "notes" | "bpm">): number {
  return chart.notes.reduce(
    (total, note) =>
      total + notePoints(note.hero) + holdBasePoints(note.lengthMs, chart.bpm),
    0,
  );
}

/** One run's rating: the stars, whether they are gold, and the average multiplier. */
export interface StarRating {
  /** 0 when there was nothing to rate, otherwise 1..5. */
  stars: 0 | 1 | 2 | 3 | 4 | 5;
  /** Every note in the part was hit and judged. */
  gold: boolean;
  /** Final score divided by the base score; 0 when there is no base. */
  average: number;
}

/**
 * Rate a run from the score it made against what the same song pays at ×1.
 *
 * The thresholds are the table's, read with lower bounds so its overlapping rows
 * have one answer: 0.65 is two stars, 0.9 is three, 2.0 is four and 2.8 is five.
 * Anything below 0.65 is one star. A run that hit every note **the part has** is
 * gold instead — the literal "100% notes hit" rule — even when the song was too
 * short for the multiplier to climb. `total` is that count, not the notes judged:
 * a seek or a quit must not turn a partial run gold.
 */
export function starRating(
  score: number,
  baseScore: number,
  hits: number,
  judged: number,
  total: number,
): StarRating {
  if (!(baseScore > 0) || total <= 0 || judged <= 0) {
    return { stars: 0, gold: false, average: 0 };
  }
  const average = score / baseScore;
  if (judged >= total && hits === total) {
    return { stars: 5, gold: true, average };
  }
  const stars =
    average >= 2.8
      ? 5
      : average >= 2.0
        ? 4
        : average >= 0.9
          ? 3
          : average >= 0.65
            ? 2
            : 1;
  return { stars, gold: false, average };
}

/**
 * A run's score as the **star rating** reads it: the freestyle fill points taken
 * back out.
 *
 * A fill is paid and shown — the drummer played it — but it is not in the base
 * score the rating divides by, so leaving it in the numerator let a busy fill buy
 * four or five stars with no note played. This is the rating's own figure, not the
 * run's; the board still reads the full score. Zero is the floor, because a stored
 * oddity with more fill points than score must rate as nothing rather than as a
 * negative.
 */
export function ratingScore(score: number, fillHits = 0): number {
  const fills = Number.isFinite(fillHits) ? Math.max(0, Math.trunc(fillHits)) : 0;
  return Math.max(0, score - fills * FILL_POINTS);
}

/** A score, with thousands separators. */
export function formatScore(score: number): string {
  return Math.round(score).toLocaleString("en-GB");
}

/**
 * How much of what a run judged it actually hit, as a percentage.
 *
 * Nothing judged is nothing missed: a player the song gave nothing to play reads
 * as 0%, not as a division by zero.
 */
export function hitRate(hits: number, judged: number): number {
  return judged > 0 ? Math.round((hits / judged) * 100) : 0;
}

/** How many notes or words a run must judge before it can be lost. */
const LOST_RUN_FLOOR = 10;

/**
 * Whether a finished run was **lost**: the band judged at least
 * `LOST_RUN_FLOOR` notes or words in all and hit **less than half** of them.
 *
 * One thing judged is not a verdict, and exactly half is not a loss — a ten-note
 * song with four hits is a loss, while five of ten got through. A lost run is not
 * a score, so the results screen does not put it on the local board; this is a
 * read-out of what the runs reported, never an input to judging.
 */
export function lostRun(hits: number, judged: number): boolean {
  return judged >= LOST_RUN_FLOOR && hits * 2 < judged;
}

/** What a score rail needs from any run, whether it is a highway's or a voice's. */
export interface RunSummary {
  score: number;
  combo: number;
  meter: number;
}
