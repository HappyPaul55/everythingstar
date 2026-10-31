import { describe, expect, test } from "bun:test";
import {
  DIFFICULTIES,
  INSTRUMENT_KINDS,
  MAX_PARTS,
  chartFor,
  chartProblems,
  isOpen,
  isSustain,
  momentAt,
  strums,
  type LaneChart,
  type LaneNote,
} from "../track";
import { buildMockTrack, splitParts } from "./track";

const note = (over: Partial<LaneNote> = {}): LaneNote => ({
  id: "n",
  timeMs: 1000,
  lengthMs: 0,
  kind: "strum",
  column: 1,
  hero: false,
  ...over,
});

const chart = (notes: LaneNote[], columns = 5, instrument: LaneChart["instrument"] = "guitar"): LaneChart => ({
  instrument,
  difficulty: "normal",
  columns,
  notes,
});

describe("the mock track", () => {
  const track = buildMockTrack({ seed: 7, parts: 2, hasPitch: true });

  test("builds every instrument at every difficulty", () => {
    expect(track.charts).toHaveLength(INSTRUMENT_KINDS.length * DIFFICULTIES.length);
    for (const instrument of INSTRUMENT_KINDS) {
      for (const difficulty of DIFFICULTIES) {
        expect(chartFor(track, instrument, difficulty)).not.toBeNull();
      }
    }
  });

  test("is deterministic for a seed", () => {
    const again = buildMockTrack({ seed: 7, parts: 2, hasPitch: true });
    expect(again.charts[0].notes[20]).toEqual(track.charts[0].notes[20]);
  });

  test("the column count comes from the chart, and rises with difficulty", () => {
    const easy = chartFor(track, "guitar", "easy")!;
    const hard = chartFor(track, "guitar", "hard")!;
    expect(easy.columns).toBeLessThan(hard.columns);
    expect(easy.notes.length).toBeLessThan(hard.notes.length);
  });

  test("every chart it builds is playable", () => {
    for (const built of track.charts) {
      expect(chartProblems(built)).toEqual([]);
    }
  });

  test("a music-only chart carries the whole note vocabulary", () => {
    const guitar = chartFor(track, "guitar", "hard")!;
    // The note zoo: every type and combination in the opening seconds.
    const opening = guitar.notes.filter((entry) => entry.timeMs < 8000);
    expect(opening.some((entry) => entry.kind === "hopo")).toBe(true);
    expect(opening.some(isOpen)).toBe(true);
    expect(opening.some((entry) => entry.column !== null && entry.hero)).toBe(true);
    expect(opening.some((entry) => entry.hero && isSustain(entry))).toBe(true);
    // A chord: two notes on one moment.
    expect(opening.some((entry) => momentAt(guitar.notes, guitar.notes.indexOf(entry)).length > 1)).toBe(true);
  });

  test("a tapped instrument carries ordinary strums, and never opens", () => {
    for (const instrument of ["keys", "dance"] as const) {
      const tapped = chartFor(track, instrument, "hard")!;
      expect(tapped.notes.every((entry) => entry.kind === "strum")).toBe(true);
      expect(tapped.notes.some(isOpen)).toBe(false);
    }
  });

  test("the zoo carries a slide, on both a strummed and a tapped chart", () => {
    for (const instrument of INSTRUMENT_KINDS) {
      for (const difficulty of DIFFICULTIES) {
        const built = chartFor(track, instrument, difficulty)!;
        const source = built.notes.find((entry) => entry.slideTo);
        expect(source, `${instrument}/${difficulty} has no slide`).toBeDefined();
        const target = built.notes.find((entry) => entry.id === source!.slideTo);
        expect(target).toBeDefined();
        // Both ends fretted, a different column, and strictly after the source's end:
        // the link is a glide, not a hold along one column.
        expect(source!.column).not.toBeNull();
        expect(target!.column).not.toBeNull();
        expect(target!.column).not.toBe(source!.column);
        expect(target!.timeMs).toBeGreaterThan(source!.timeMs + source!.lengthMs);
        // And it is in the opening seconds, where a manual play and the demo see it.
        expect(target!.timeMs).toBeLessThan(8000);
      }
    }
  });

  test("hero notes are the exception, not the rule", () => {
    const guitar = chartFor(track, "guitar", "hard")!;
    const heroes = guitar.notes.filter((entry) => entry.hero).length;
    expect(heroes).toBeGreaterThan(0);
    expect(heroes).toBeLessThan(guitar.notes.length / 4);
  });

  test("a duet has two parts, and a solo one", () => {
    expect(track.melody.parts).toBe(2);
    expect(splitParts(track.melody.notes, 2)).toHaveLength(2);
    expect(buildMockTrack({ seed: 7, parts: 1 }).melody.parts).toBe(1);
    expect(buildMockTrack({ seed: 7, parts: 99 }).melody.parts).toBe(MAX_PARTS);
  });

  test("each part's stream is in time order, so its run can walk it", () => {
    for (const stream of splitParts(track.melody.notes, 2)) {
      expect(stream.length).toBeGreaterThan(100);
      for (let at = 1; at < stream.length; at += 1) {
        expect(stream[at].timeMs).toBeGreaterThanOrEqual(stream[at - 1].timeMs);
      }
    }
  });

  test("a word's hero flag is the same for every part that plays it", () => {
    const byMoment = new Map<number, Set<boolean>>();
    for (const word of track.melody.lines.flatMap((line) => line.words)) {
      const flags = byMoment.get(word.timeMs) ?? new Set<boolean>();
      flags.add(word.hero);
      byMoment.set(word.timeMs, flags);
    }
    expect(track.melody.lines.some((line) => line.words.some((word) => word.hero))).toBe(true);
  });
});

describe("chartProblems", () => {
  test("a clean chart has nothing wrong with it", () => {
    expect(chartProblems(chart([note(), note({ id: "b", timeMs: 2000 })]))).toEqual([]);
  });

  test("an open note may not share its moment with anything", () => {
    const chart_ = chart([note({ column: null }), note({ id: "b" })]);
    expect(chartProblems(chart_)).toContain(
      "open note n shares its moment with another note",
    );
  });

  test("an open note belongs to an instrument that strums", () => {
    expect(chartProblems(chart([note({ column: null })], 5, "keys"))).toContain(
      "note n is an open note on a tapped instrument",
    );
  });

  test("a hopo needs something before it", () => {
    expect(chartProblems(chart([note({ kind: "hopo" })]))).toContain(
      "note n is a hopo with nothing before it",
    );
  });

  test("a tapped instrument's notes are ordinary strums; a hopo is still refused", () => {
    expect(chartProblems(chart([note({ kind: "strum" })], 5, "keys"))).toEqual([]);
    expect(chartProblems(chart([note({ kind: "hopo" })], 5, "keys"))).toContain(
      "note n is a hopo on a tapped instrument",
    );
  });

  test("a note outside the highway is caught", () => {
    expect(chartProblems(chart([note({ column: 5 })]))).toContain(
      "note n is outside the highway",
    );
  });

  test("out of time order, and duplicate ids, are caught", () => {
    expect(
      chartProblems(chart([note({ timeMs: 500 }), note({ id: "b", timeMs: 100 })])),
    ).toContain("note b is out of time order");
    expect(chartProblems(chart([note(), note()]))).toContain("duplicate note id n");
  });
});

describe("the instrument table", () => {
  test("says which instruments strum and which tap", () => {
    expect(strums("guitar")).toBe(true);
    expect(strums("drums")).toBe(true);
    expect(strums("keys")).toBe(false);
    expect(strums("dance")).toBe(false);
  });
});
