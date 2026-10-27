import { describe, expect, test } from "bun:test";
import {
  LINE_INTRO_MS,
  WORD_BREATH_MS,
  activeLineIndex,
  activeWordIndex,
  advanceRun,
  emptyRun,
  emptyRunFrom,
  introProgress,
  isSounding,
  judgedAt,
} from "./run";
import { HIT_WINDOW_MS } from "./scoring";
import { SING_GRACE_MS } from "./singing";
import { fitMelodyTurns, type MelodyLine, type MelodyNote } from "./track";

const notes: MelodyNote[] = Array.from({ length: 40 }, (_, index) => ({
  id: `n${index}`,
  timeMs: index * 500,
  lengthMs: 0,
  part: 0,
  row: index % 6,
  text: `w${index}`,
  hero: false,
}));

const hit = () => ({ hit: true, offsetMs: 0 });
const miss = () => ({ hit: false, offsetMs: 0 });

describe("advanceRun", () => {
  test("leaves a word alone until its window has passed", () => {
    expect(advanceRun(emptyRun(), notes, 100, hit).judged).toBe(0);
    expect(advanceRun(emptyRun(), notes, HIT_WINDOW_MS, hit).judged).toBe(1);
  });

  test("scores hits and counts them at the note value", () => {
    const run = advanceRun(emptyRun(), notes, 700, hit);
    expect(run.judged).toBe(2);
    expect(run.hits).toBe(2);
    expect(run.misses).toBe(0);
    expect(run.combo).toBe(2);
    // Two notes at 50 each, the second with the multiplier still at ×1.
    expect(run.score).toBe(100);
  });

  test("a missed word breaks the chain and costs nothing but the chain", () => {
    const withMiss = (note: MelodyNote) => (note.id === "n2" ? miss() : hit());
    const run = advanceRun(emptyRun(), notes, 1700, withMiss);
    expect(run.judged).toBe(4);
    expect(run.hits).toBe(3);
    expect(run.misses).toBe(1);
    expect(run.combo).toBe(1);
    expect(run.bestCombo).toBe(2);
  });

  test("a long note is judged once its own span has passed, not at its onset", () => {
    const long = [{ ...notes[0], lengthMs: 2000 }];
    const due = 2000 + SING_GRACE_MS;
    expect(advanceRun(emptyRun(), long, 1000, hit).judged).toBe(0);
    expect(advanceRun(emptyRun(), long, due - 1, hit).judged).toBe(0);
    expect(advanceRun(emptyRun(), long, due, hit).judged).toBe(1);
  });

  test("a short note inside a long one is judged at its own end, not the long one's", () => {
    // A 3000ms note at 1000 contains a 500ms note at 2000. Left overlapping, the
    // short note waited for the long one's verdict at 4120; fitted, its own turn
    // ends at 2500 and it is judged at 2620.
    const fitted = fitMelodyTurns([
      { ...notes[0], id: "long", timeMs: 1000, lengthMs: 3000 },
      { ...notes[1], id: "short", timeMs: 2000, lengthMs: 500 },
    ]);
    expect(fitted).toHaveLength(2);
    expect(judgedAt(fitted[0])).toBe(2000 + SING_GRACE_MS);
    expect(judgedAt(fitted[1])).toBe(2500 + SING_GRACE_MS);
    expect(judgedAt(fitted[1])).toBeLessThan(4000);
    // The short note's verdict is in at its own end + grace: both have been judged,
    // because the long one ended where the short one began.
    expect(advanceRun(emptyRun(), fitted, 2500 + SING_GRACE_MS, hit).judged).toBe(2);
    expect(advanceRun(emptyRun(), fitted, 2500 + SING_GRACE_MS - 1, hit).judged).toBe(1);
  });

  test("a very short note still gets the highway's window", () => {
    const tap = [{ ...notes[0], lengthMs: 0 }];
    expect(advanceRun(emptyRun(), tap, HIT_WINDOW_MS - 1, hit).judged).toBe(0);
    expect(advanceRun(emptyRun(), tap, HIT_WINDOW_MS, hit).judged).toBe(1);
  });

  test("a sung note is worth the same once it is a hit, however much was in tune", () => {
    const held = [{ ...notes[0], lengthMs: 1000 }];
    const perfect = advanceRun(emptyRun(), held, 1200, () => ({
      hit: true,
      offsetMs: 0,
      share: 1,
    }));
    const good = advanceRun(emptyRun(), held, 1200, () => ({
      hit: true,
      offsetMs: 0,
      share: 0.5,
    }));
    expect(good.score).toBe(50);
    expect(good.score).toBe(perfect.score);
  });

  test("a hero word is worth five times as much", () => {
    const plain = advanceRun(emptyRun(), [{ ...notes[0] }], 200, hit);
    const hero = advanceRun(emptyRun(), [{ ...notes[0], hero: true }], 200, hit);
    expect(hero.score).toBe(plain.score * 5);
  });

  test("a hero word is counted when it is hit, and a plain one is not", () => {
    const plain = advanceRun(emptyRun(), [{ ...notes[0] }], 200, hit);
    const hero = advanceRun(emptyRun(), [{ ...notes[0], hero: true }], 200, hit);
    expect(plain.heroHits).toBe(0);
    expect(hero.heroHits).toBe(1);
    // A hero word that was missed is a miss, not a hero hit.
    const missed = advanceRun(emptyRun(), [{ ...notes[0], hero: true }], 200, miss);
    expect(missed.heroHits).toBe(0);
  });

  test("hero hits accumulate over a run and come back with a rewind", () => {
    const chart: MelodyNote[] = notes.map((note, index) => ({
      ...note,
      hero: index % 2 === 0,
    }));
    const run = advanceRun(emptyRun(), chart, 5000, hit);
    expect(run.hits).toBe(10);
    expect(run.heroHits).toBe(5);
    // A seek replays from the top, so the counter is that run's own again.
    expect(advanceRun(run, chart, 1200, hit).heroHits).toBe(2);
  });

  test("is incremental, and asking again changes nothing", () => {
    const once = advanceRun(emptyRun(), notes, 3000, hit);
    expect(advanceRun(once, notes, 3000, hit)).toBe(once);
  });

  test("replays from the top when asked for an earlier time", () => {
    const deep = advanceRun(emptyRun(), notes, 12_000, hit);
    expect(deep.judged).toBeGreaterThan(20);
    const rewound = advanceRun(deep, notes, 1000, hit);
    expect(rewound.judged).toBe(2);
    expect(rewound.cursor).toBe(2);
  });

  test("a time at or before zero is just the beginning, never a loop", () => {
    expect(advanceRun(emptyRun(), notes, -0.0001, hit)).toEqual(emptyRun());
    const deep = advanceRun(emptyRun(), notes, 9000, hit);
    expect(advanceRun(deep, notes, -1, hit)).toEqual(emptyRun());
  });

  test("the meter drains away over silence", () => {
    const played = advanceRun(emptyRun(), notes, 5000, hit);
    expect(played.meter).toBeGreaterThan(0);
    const silent = advanceRun(played, [], 5000 + 30_000, hit);
    expect(silent.meter).toBe(0);
  });
});

describe("emptyRunFrom", () => {
  test("starts at the first note at or after the seek, judging none before it", () => {
    const seeded = emptyRunFrom(notes, 2500);
    expect(seeded.atMs).toBe(2500);
    // The notes are every 500ms, so 2500 is the sixth.
    expect(seeded.cursor).toBe(5);
    expect(seeded.judged).toBe(0);

    // Only the note at 2500 is judged by 3000; everything before it is skipped.
    const run = advanceRun(seeded, notes, 3000, hit);
    expect(run.judged).toBe(1);
    expect(run.hits).toBe(1);
    expect(run.misses).toBe(0);
  });

  test("a note exactly at the seek point is judged", () => {
    expect(emptyRunFrom(notes, 2000).cursor).toBe(4);
  });

  test("seeding at zero is the ordinary empty run", () => {
    expect(emptyRunFrom(notes, 0)).toEqual(emptyRun());
  });
});

describe("isSounding", () => {
  test("lasts the word's own length, and a breath past it", () => {
    expect(isSounding(1000, 500, 999)).toBe(false);
    expect(isSounding(1000, 500, 1000)).toBe(true);
    expect(isSounding(1000, 500, 1499)).toBe(true);
    expect(isSounding(1000, 500, 1500 + WORD_BREATH_MS)).toBe(false);
  });
});

describe("introProgress", () => {
  test("is nothing while the moment is still well off", () => {
    expect(introProgress(10_000, 1000)).toBe(0);
    expect(introProgress(10_000, 10_000 - LINE_INTRO_MS - 1)).toBe(0);
  });

  test("runs from nothing to all there as the moment arrives", () => {
    expect(introProgress(10_000, 10_000 - LINE_INTRO_MS / 2)).toBeCloseTo(0.5, 5);
    expect(introProgress(10_000, 10_000)).toBe(1);
  });

  test("a moment that never comes stays at nothing", () => {
    expect(introProgress(Infinity, 1000)).toBe(0);
  });
});

describe("activeLineIndex", () => {
  const lines: MelodyLine[] = [1000, 5000, 9000].map((timeMs, index) => ({
    timeMs,
    endMs: timeMs + 3000,
    words: [{ text: `w${index}`, timeMs, hero: false }],
    parts: [{ part: 0, offset: 0 }],
    freeform: false,
  }));

  test("finds the line being sung, and holds it until the next", () => {
    expect(activeLineIndex(lines, 500)).toBe(-1);
    expect(activeLineIndex(lines, 1000)).toBe(0);
    expect(activeLineIndex(lines, 4000)).toBe(0);
    expect(activeLineIndex(lines, 5000)).toBe(1);
    expect(activeLineIndex(lines, 60_000)).toBe(2);
  });
});

describe("activeWordIndex", () => {
  const line: MelodyLine = {
    timeMs: 1000,
    endMs: 4000,
    words: [
      { text: "one", timeMs: 1000, hero: false },
      { text: "two", timeMs: 2000, hero: false },
      { text: "three", timeMs: 3000, hero: false },
    ],
    parts: [{ part: 0, offset: 0 }],
    freeform: false,
  };

  test("walks the words as time passes", () => {
    expect(activeWordIndex(line, 500)).toBe(-1);
    expect(activeWordIndex(line, 1000)).toBe(0);
    expect(activeWordIndex(line, 2500)).toBe(1);
    expect(activeWordIndex(undefined, 1000)).toBe(-1);
  });

  test("lets a word go once it is over, rather than holding it to the next", () => {
    expect(activeWordIndex(line, 3950)).toBe(2);
    expect(activeWordIndex(line, 4000 + WORD_BREATH_MS)).toBe(-1);
    expect(activeWordIndex(line, 9999)).toBe(-1);
  });
});
