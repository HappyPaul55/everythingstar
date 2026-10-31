import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MEASURE_MS,
  FILL_POINTS,
  HERO_MULTIPLE,
  MAX_MULTIPLIER,
  NOTE_POINTS,
  STAR_MULTIPLE,
  formatScore,
  hitRate,
  holdBasePoints,
  laneBaseScore,
  lostRun,
  measureMs,
  multiplier,
  notePoints,
  noteValue,
  notesBaseScore,
  ratingScore,
  starRating,
} from "./scoring";
import type { LaneChart, LaneNote } from "./track";

const note = (over: Partial<LaneNote> = {}): LaneNote => ({
  id: `n${Math.random()}`,
  timeMs: 1000,
  lengthMs: 0,
  kind: "strum",
  column: 1,
  hero: false,
  ...over,
});

const lane = (notes: LaneNote[], bpm?: number): Pick<LaneChart, "notes" | "bpm"> => ({
  notes,
  bpm,
});

describe("multiplier", () => {
  test("steps every ten notes and stops at four", () => {
    expect(multiplier(0)).toBe(1);
    expect(multiplier(9)).toBe(1);
    expect(multiplier(10)).toBe(2);
    expect(multiplier(19)).toBe(2);
    expect(multiplier(20)).toBe(3);
    expect(multiplier(29)).toBe(3);
    expect(multiplier(30)).toBe(4);
    expect(multiplier(900)).toBe(MAX_MULTIPLIER);
  });

  test("a missing or broken combo is the first rung, never zero", () => {
    expect(multiplier(-5)).toBe(1);
    expect(multiplier(Number.NaN)).toBe(1);
    expect(multiplier(Number.POSITIVE_INFINITY)).toBe(1);
    expect(multiplier(Number.NEGATIVE_INFINITY)).toBe(1);
  });
});

describe("note points", () => {
  test("the documented values are the ones the formulas use", () => {
    // The formulas alone cannot catch a changed constant: a hero is defined as
    // `NOTE_POINTS * HERO_MULTIPLE`, so every value would still agree. Pin the
    // numbers the game documents once, here beside them.
    expect(NOTE_POINTS).toBe(50);
    expect(HERO_MULTIPLE).toBe(5);
    expect(STAR_MULTIPLE).toBe(2);
    expect(FILL_POINTS).toBe(10);
    expect(MAX_MULTIPLIER).toBe(4);
  });

  test("a plain note is 50, and a hero is five times that", () => {
    expect(notePoints(false)).toBe(NOTE_POINTS);
    expect(notePoints(true)).toBe(NOTE_POINTS * HERO_MULTIPLE);
  });

  test("the streak multiplies after the note's own value", () => {
    expect(noteValue(false, 0)).toBe(50);
    expect(noteValue(false, 9)).toBe(50);
    expect(noteValue(false, 10)).toBe(100);
    expect(noteValue(false, 20)).toBe(150);
    expect(noteValue(false, 30)).toBe(200);
    expect(noteValue(true, 30)).toBe(1000);
  });
});

describe("measures and holds", () => {
  test("a measure is four beats at the chart's tempo", () => {
    expect(measureMs(120)).toBe(2000);
    expect(measureMs(60)).toBe(4000);
    expect(measureMs(240)).toBe(1000);
  });

  test("a chart with no tempo falls back to a 120 BPM measure", () => {
    expect(measureMs(undefined)).toBe(DEFAULT_MEASURE_MS);
    expect(measureMs(0)).toBe(DEFAULT_MEASURE_MS);
    expect(measureMs(-120)).toBe(DEFAULT_MEASURE_MS);
  });

  test("a sustain pays 25 per note per measure, prorated", () => {
    expect(holdBasePoints(2000, 120)).toBe(25);
    expect(holdBasePoints(1000, 120)).toBe(12.5);
    expect(holdBasePoints(4000, 120)).toBe(50);
    expect(holdBasePoints(2000, 60)).toBe(12.5);
    expect(holdBasePoints(0, 120)).toBe(0);
  });
});

describe("base scores", () => {
  test("a melody is 50 per note, or 250 for a hero", () => {
    expect(notesBaseScore([{ hero: false }, { hero: true }])).toBe(300);
  });

  test("a highway is its notes plus every sustain held in full at x1", () => {
    expect(laneBaseScore(lane([note({ column: 0 })]))).toBe(50);
    expect(laneBaseScore(lane([note({ column: 0, hero: true })]))).toBe(250);
    expect(laneBaseScore(lane([note({ column: 0, lengthMs: 2000 })], 120))).toBe(75);
    expect(laneBaseScore(lane([note({ column: 0, lengthMs: 2000 })]))).toBe(75);
    // A two-note chord of two-measure sustains at 120 BPM: 100 notes + 100 hold.
    expect(
      laneBaseScore(
        lane(
          [
            note({ id: "a", timeMs: 1000, column: 0, lengthMs: 4000 }),
            note({ id: "b", timeMs: 1000, column: 1, lengthMs: 4000 }),
          ],
          120,
        ),
      ),
    ).toBe(200);
  });
});

describe("starRating", () => {
  test("reads the average multiplier against the base", () => {
    expect(starRating(64, 100, 5, 10, 10).stars).toBe(1);
    expect(starRating(65, 100, 5, 10, 10).stars).toBe(2);
    expect(starRating(89, 100, 5, 10, 10).stars).toBe(2);
    expect(starRating(90, 100, 5, 10, 10).stars).toBe(3);
    expect(starRating(199, 100, 5, 10, 10).stars).toBe(3);
    expect(starRating(200, 100, 5, 10, 10).stars).toBe(4);
    expect(starRating(279, 100, 5, 10, 10).stars).toBe(4);
    expect(starRating(280, 100, 5, 10, 10).stars).toBe(5);
  });

  test("every note hit is gold, even when the song was too short to climb", () => {
    const rating = starRating(100, 100, 2, 2, 2);
    expect(rating.gold).toBe(true);
    expect(rating.stars).toBe(5);
    expect(rating.average).toBe(1);
  });

  test("one miss is not gold, however high the score", () => {
    expect(starRating(900, 100, 9, 10, 10).gold).toBe(false);
  });

  test("a partial run is not gold, however many of the judged notes it hit", () => {
    const partial = starRating(450, 10_000, 9, 9, 200);
    expect(partial.gold).toBe(false);
    expect(partial.stars).toBe(1);
  });

  test("nothing to play has no rating and no division by zero", () => {
    expect(starRating(0, 0, 0, 0, 0)).toEqual({ stars: 0, gold: false, average: 0 });
    expect(starRating(0, 100, 0, 0, 0).stars).toBe(0);
  });
});

describe("ratingScore", () => {
  test("fill points are taken back out of the figure the rating reads", () => {
    const displayed = 1000;
    const read = ratingScore(displayed, 10);
    expect(read).toBe(displayed - 10 * FILL_POINTS);
    expect(read).toBeLessThan(displayed);
    // A run with no fills rates on exactly its score.
    expect(ratingScore(displayed, 0)).toBe(displayed);
  });

  test("a fill-heavy or broken count cannot make the rating negative", () => {
    expect(ratingScore(30, 10)).toBe(0);
    expect(ratingScore(1000, -3)).toBe(1000);
    expect(ratingScore(1000, 1.7)).toBe(1000 - FILL_POINTS);
    expect(ratingScore(1000, Number.NaN)).toBe(1000);
  });

  test("the rating reads the fill-excluded score against the same base", () => {
    // 600 points of fills on a 1,000-point run would otherwise read as four stars.
    const full = starRating(1000, 500, 9, 10, 10);
    const filled = starRating(ratingScore(1000, 60), 500, 9, 10, 10);
    expect(full.stars).toBe(4);
    expect(filled.stars).toBe(2);
  });

  test("slide points come out too, because only a touch screen can earn them", () => {
    expect(ratingScore(1000, 0, 250)).toBe(750);
    expect(ratingScore(1000, 10, 250)).toBe(1000 - 10 * FILL_POINTS - 250);
    // A guitar run and a touch run on the same chart rate on the same notes.
    expect(ratingScore(1000, 0, 0)).toBe(1000);
  });

  test("slide points cannot make the rating negative, and a broken count is ignored", () => {
    expect(ratingScore(100, 0, 250)).toBe(0);
    expect(ratingScore(1000, 0, -50)).toBe(1000);
    expect(ratingScore(1000, 0, Number.NaN)).toBe(1000);
  });
});

describe("formatScore", () => {
  test("groups thousands, and copes with a fraction or a negative", () => {
    expect(formatScore(12450)).toBe("12,450");
    expect(formatScore(6.4)).toBe("6");
    expect(formatScore(-1)).toBe("-1");
    expect(formatScore(0)).toBe("0");
  });
});

describe("hitRate", () => {
  test("is the share of what was judged that was hit", () => {
    expect(hitRate(53, 63)).toBe(84);
    expect(hitRate(12, 12)).toBe(100);
    expect(hitRate(0, 42)).toBe(0);
  });

  test("nothing judged is nothing lost", () => {
    // A player the song gave nothing to play reads as 0%, not as a division by zero.
    expect(hitRate(0, 0)).toBe(0);
  });
});

describe("lostRun", () => {
  test("no runs and nothing judged is not a verdict", () => {
    expect(lostRun(0, 0)).toBe(false);
  });

  test("below the ten-judged floor is not a verdict", () => {
    expect(lostRun(0, 9)).toBe(false);
    expect(lostRun(4, 9)).toBe(false);
  });

  test("exactly half is not a loss", () => {
    expect(lostRun(5, 10)).toBe(false);
    expect(lostRun(25, 50)).toBe(false);
  });

  test("under half, once the floor is reached, is a loss", () => {
    expect(lostRun(4, 10)).toBe(true);
    expect(lostRun(0, 10)).toBe(true);
    expect(lostRun(49, 100)).toBe(true);
  });

  test("most of the song hit is never a loss", () => {
    expect(lostRun(9, 10)).toBe(false);
    expect(lostRun(10, 10)).toBe(false);
  });
});
