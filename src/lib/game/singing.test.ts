import { describe, expect, test } from "bun:test";
import { autoVerdict } from "./simulate";
import {
  ONSET_MS,
  SING_LEAD_MS,
  VOCAL_TOLERANCE,
  clearTrail,
  createTrail,
  pitchDistance,
  pushPitch,
  rowMidi,
  singVerdict,
  singerVerdict,
  trailInWindow,
} from "./singing";

/** A chart anchored where the mock's is: row 0 sounds A3. */
const melody = { rootMidi: 57 };

/** Sing one pitch for a stretch, a sample every 20ms. */
function sing(trail: ReturnType<typeof createTrail>, fromMs: number, toMs: number, midi: number): void {
  for (let atMs = fromMs; atMs <= toMs; atMs += 20) pushPitch(trail, atMs, midi);
}

describe("pitchDistance", () => {
  test("is zero for the same note, however many octaves apart", () => {
    expect(pitchDistance(69, 69)).toBe(0);
    expect(pitchDistance(57, 69)).toBe(0);
    expect(pitchDistance(45, 69)).toBe(0);
  });

  test("counts the shortest way round the octave", () => {
    expect(pitchDistance(70, 69)).toBe(1);
    expect(pitchDistance(68, 69)).toBe(1);
    // Seven semitones is a fifth, and five the other way: five is the answer.
    expect(pitchDistance(76, 69)).toBe(5);
  });
});

describe("rowMidi", () => {
  test("a row is a semitone from the chart's root", () => {
    expect(rowMidi(melody, 0)).toBe(57);
    expect(rowMidi(melody, 3)).toBe(60);
  });
});

describe("the trail", () => {
  test("remembers what it was given, oldest first", () => {
    const trail = createTrail(4);
    pushPitch(trail, 10, 60);
    pushPitch(trail, 20, 61);
    const seen: number[] = [];
    trailInWindow(trail, 0, 100, (atMs) => seen.push(atMs));
    expect(seen).toEqual([10, 20]);
  });

  test("forgets the oldest when it is full", () => {
    const trail = createTrail(3);
    for (const atMs of [10, 20, 30, 40]) pushPitch(trail, atMs, 60);
    const seen: number[] = [];
    trailInWindow(trail, 0, 100, (atMs) => seen.push(atMs));
    expect(seen).toEqual([20, 30, 40]);
  });

  test("a window visits only what is inside it", () => {
    const trail = createTrail(8);
    for (const atMs of [100, 200, 300, 400]) pushPitch(trail, atMs, 60);
    const seen: number[] = [];
    trailInWindow(trail, 150, 350, (atMs) => seen.push(atMs));
    expect(seen).toEqual([200, 300]);
  });

  test("is long enough to judge a held note across its own span", () => {
    expect(createTrail().times.length).toBeGreaterThanOrEqual(512);
  });

  test("a clear forgets everything, and the window then sees nothing", () => {
    const trail = createTrail(8);
    pushPitch(trail, 100, 60);
    pushPitch(trail, 200, 62);
    clearTrail(trail);
    const seen: number[] = [];
    trailInWindow(trail, 0, 10_000, (atMs) => seen.push(atMs));
    expect(seen).toEqual([]);
    expect(trail.count).toBe(0);
    expect(trail.next).toBe(0);
  });

  test("a cleared trail records the new pass from its own start", () => {
    const trail = createTrail(4);
    // The previous pass over the section, then a loop back to its start.
    for (const atMs of [10, 20, 30, 40]) pushPitch(trail, atMs, 60);
    clearTrail(trail);
    pushPitch(trail, 10, 48);
    pushPitch(trail, 20, 48);
    const seen: number[] = [];
    trailInWindow(trail, 0, 100, (atMs, midi) => {
      seen.push(atMs);
      expect(midi).toBe(48);
    });
    expect(seen).toEqual([10, 20]);
  });
});

describe("singVerdict", () => {
  const note = { timeMs: 1000, lengthMs: 500, row: 3 };

  test("lands a note the singer holds", () => {
    const trail = createTrail();
    sing(trail, 1000, 1500, 60);
    const verdict = singVerdict(note, melody, trail, VOCAL_TOLERANCE.normal);
    expect(verdict.hit).toBe(true);
    expect(verdict.share).toBeCloseTo(1, 1);
  });

  test("counts a note sung an octave out", () => {
    // The whole point: a man an octave below is singing the same note.
    const trail = createTrail();
    sing(trail, 1000, 1500, 48);
    expect(singVerdict(note, melody, trail, VOCAL_TOLERANCE.normal).hit).toBe(true);
  });

  test("too far off is a miss, and how far is the difficulty", () => {
    const trail = createTrail();
    sing(trail, 1000, 1500, 62); // two semitones sharp
    expect(singVerdict(note, melody, trail, VOCAL_TOLERANCE.hard).hit).toBe(false);
    expect(singVerdict(note, melody, trail, VOCAL_TOLERANCE.easy).hit).toBe(true);
  });

  test("samples well outside the note's span are not the note", () => {
    const trail = createTrail();
    sing(trail, 700, 900, 60);
    sing(trail, 1700, 1900, 60);
    expect(singVerdict(note, melody, trail, VOCAL_TOLERANCE.normal).hit).toBe(false);
  });

  test("a short note is heard from its lead, so an early entry still lands", () => {
    const trail = createTrail();
    const short = { timeMs: 1000, lengthMs: 300, row: 3 };
    sing(trail, 1000 - SING_LEAD_MS, 1000 + 300, 60);
    const verdict = singVerdict(short, melody, trail, VOCAL_TOLERANCE.normal);
    expect(verdict.hit).toBe(true);
    expect(verdict.share).toBeCloseTo(1, 1);
    expect(verdict.offsetMs).toBe(-SING_LEAD_MS);
  });

  test("a pitch before the lead is not the note", () => {
    const trail = createTrail();
    pushPitch(trail, 1000 - SING_LEAD_MS - 40, 60);
    expect(singVerdict(note, melody, trail, VOCAL_TOLERANCE.normal).hit).toBe(false);
  });

  test("the lead is heard but not counted: singing only early is a miss", () => {
    const trail = createTrail();
    const short = { timeMs: 1000, lengthMs: 100, row: 3 };
    // Right pitch, right length — but ending as the note begins. The lead let
    // the detector hear it; it did not make it the note.
    sing(trail, 1000 - SING_LEAD_MS, 1000, 60);
    expect(singVerdict(short, melody, trail, VOCAL_TOLERANCE.normal).hit).toBe(false);
  });

  test("a note shorter than a sample is not landed by a single one", () => {
    const trail = createTrail();
    const tiny = { timeMs: 1000, lengthMs: 1, row: 3 };
    // One in-tune sample 5ms into the note stands for the detector's own span, not
    // for the note's millisecond: 5ms of a 20ms span is a quarter, below the line.
    pushPitch(trail, 1005, 60);
    const once = singVerdict(tiny, melody, trail, VOCAL_TOLERANCE.normal);
    expect(once.share).toBeCloseTo(0.25, 5);
    expect(once.hit).toBe(false);
    // A second sample covers the span, and the same note lands.
    pushPitch(trail, 1025, 60);
    const twice = singVerdict(tiny, melody, trail, VOCAL_TOLERANCE.normal);
    expect(twice.share).toBeCloseTo(1, 5);
    expect(twice.hit).toBe(true);
  });

  test("a short note is heard through the grace, so a late entry still lands", () => {
    const trail = createTrail();
    const short = { timeMs: 1000, lengthMs: 100, row: 3 };
    // 80ms late on a 100ms note: only the grace hears the end of it.
    sing(trail, 1000 + 80, 1000 + 250, 60);
    const verdict = singVerdict(short, melody, trail, VOCAL_TOLERANCE.normal);
    expect(verdict.hit).toBe(true);
    expect(verdict.offsetMs).toBe(80);
  });

  test("singing only after the note has ended is a miss", () => {
    const trail = createTrail();
    const short = { timeMs: 1000, lengthMs: 100, row: 3 };
    // The note is over at 1100: the next phrase's voice cannot land it, even
    // though the grace is still listening.
    sing(trail, 1200, 1500, 60);
    const verdict = singVerdict(short, melody, trail, VOCAL_TOLERANCE.normal);
    expect(verdict.hit).toBe(false);
    expect(verdict.share).toBe(0);
  });

  test("a late delivery inside the note still lands", () => {
    const trail = createTrail();
    const short = { timeMs: 1000, lengthMs: 100, row: 3 };
    // 60ms late and still inside: the grace hears it, but the time credited is
    // the note's own.
    sing(trail, 1060, 1100, 60);
    const verdict = singVerdict(short, melody, trail, VOCAL_TOLERANCE.normal);
    expect(verdict.hit).toBe(true);
    expect(verdict.offsetMs).toBe(60);
    expect(verdict.share).toBeCloseTo(0.6, 5);
  });

  test("silence is a miss", () => {
    expect(singVerdict(note, melody, createTrail(8), VOCAL_TOLERANCE.normal)).toEqual({
      hit: false,
      offsetMs: 0,
      share: 0,
    });
  });

  test("a freeform note is graded on presence, not on pitch", () => {
    // Spoken or rapped: there is no row to be right about.
    const trail = createTrail(8);
    pushPitch(trail, 1005, 33);
    expect(
      singVerdict(
        { timeMs: 1000, lengthMs: 400, row: null },
        melody,
        trail,
        VOCAL_TOLERANCE.hard,
      ),
    ).toMatchObject({ hit: true, share: 1 });
  });

  test("the offset is when the first in-tune sample landed", () => {
    const trail = createTrail();
    sing(trail, 1040, 1500, 60);
    expect(singVerdict(note, melody, trail, VOCAL_TOLERANCE.normal)).toMatchObject({
      hit: true,
      offsetMs: 40,
    });
  });

  test("a sample early in the onset window no longer carries the note", () => {
    const trail = createTrail();
    pushPitch(trail, 1000, 60);
    expect(singVerdict(note, melody, trail, VOCAL_TOLERANCE.normal).hit).toBe(false);
  });

  test("a long note may start wrong and still be landed once corrected", () => {
    const trail = createTrail();
    const long = { timeMs: 1000, lengthMs: 2000, row: 3 };
    sing(trail, 1000, 1990, 63); // a fourth out, for the first half
    sing(trail, 2000, 3000, 60); // then the note itself
    const verdict = singVerdict(long, melody, trail, VOCAL_TOLERANCE.normal);
    expect(verdict.hit).toBe(true);
    expect(verdict.share).toBeCloseTo(0.5, 1);
  });

  test("starting right and then drifting off is not a hit", () => {
    const trail = createTrail();
    const long = { timeMs: 1000, lengthMs: 2000, row: 3 };
    sing(trail, 1000, 1300, 60);
    sing(trail, 1320, 3000, 66); // only a quarter of the note was in tune
    expect(singVerdict(long, melody, trail, VOCAL_TOLERANCE.normal).hit).toBe(false);
  });

  test("a gap in what was heard is silence, not held time", () => {
    const trail = createTrail();
    sing(trail, 1000, 1010, 60);
    // Nothing from 1030 to 1470: the singer stopped, and one sample at the end
    // cannot stand for the gap.
    pushPitch(trail, 1480, 60);
    const verdict = singVerdict(note, melody, trail, VOCAL_TOLERANCE.normal);
    expect(verdict.hit).toBe(false);
  });

  test("a note before the song starts is still listened to from its own start", () => {
    const trail = createTrail();
    pushPitch(trail, 1000 - ONSET_MS - 10, 60);
    expect(singVerdict(note, melody, trail, VOCAL_TOLERANCE.normal).hit).toBe(false);
  });
});

describe("singerVerdict", () => {
  const note = { id: "n-1", timeMs: 1000, lengthMs: 500, row: 3, part: 0, text: "la", hero: false };
  const judge = { tolerance: VOCAL_TOLERANCE.normal, seed: 4 };

  test("a live seat with a trail is judged from its own microphone", () => {
    const held = createTrail();
    sing(held, 1000, 1500, 60);
    expect(singerVerdict(note, melody, { ...judge, live: true, trail: held }).hit).toBe(true);
    // The microphone is the judge, not the machine: a wrong note is a miss even
    // where the simulator would have played it.
    const off = createTrail();
    sing(off, 1000, 1500, 66);
    expect(singerVerdict(note, melody, { ...judge, live: true, trail: off }).hit).toBe(false);
  });

  test("a perfect machine judge lands every note", () => {
    for (const entry of [
      note,
      { ...note, id: "n-2", row: null },
      { ...note, id: "n-3", timeMs: 4_000, row: 7 },
    ]) {
      expect(
        singerVerdict(entry, melody, {
          ...judge,
          live: false,
          trail: null,
          accuracy: 1,
        }).hit,
      ).toBe(true);
    }
  });

  test("a live seat with no trail yet plays itself", () => {
    expect(singerVerdict(note, melody, { ...judge, live: true, trail: null })).toEqual(
      autoVerdict(note, judge.seed),
    );
  });

  test("a machine seat plays itself even while the microphone hears somebody", () => {
    const trail = createTrail();
    sing(trail, 1000, 1500, 60);
    expect(singerVerdict(note, melody, { ...judge, live: false, trail })).toEqual(
      autoVerdict(note, judge.seed),
    );
  });

  test("the level is the live singer's own tolerance", () => {
    // Two semitones sharp: a miss at hard, a hit at easy.
    const trail = createTrail();
    sing(trail, 1000, 1500, 62);
    expect(
      singerVerdict(note, melody, {
        ...judge,
        live: true,
        trail,
        tolerance: VOCAL_TOLERANCE.hard,
      }).hit,
    ).toBe(false);
    expect(
      singerVerdict(note, melody, {
        ...judge,
        live: true,
        trail,
        tolerance: VOCAL_TOLERANCE.easy,
      }).hit,
    ).toBe(true);
  });
});
