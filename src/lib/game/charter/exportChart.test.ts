import { describe, expect, test } from "bun:test";
import { readChartText } from "../sources/chart";
import { chartKey, type CharterChart } from "./edit";
import { writeChart } from "./exportChart";
import { DEFAULT_GRID } from "./grid";

const chart = (over: Partial<CharterChart> = {}): CharterChart => ({
  key: chartKey({ instrument: "guitar", difficulty: "expert" }),
  instrument: "guitar",
  difficulty: "expert",
  columns: 5,
  bpm: 120,
  notes: [
    { id: "a", timeMs: 1000, lengthMs: 0, kind: "strum", column: 0, hero: false },
    { id: "b", timeMs: 1500, lengthMs: 500, kind: "strum", column: 2, hero: false },
  ],
  ...over,
});

describe("writing a .chart", () => {
  test("the file is read back by the game's own reader", () => {
    const written = writeChart({
      title: "Neon Hearts",
      artist: "Static Bloom",
      charts: [chart()],
      grid: { ...DEFAULT_GRID, bpm: 120 },
      sections: [{ timeMs: 0, name: "Intro" }],
    });
    expect(written.problems).toEqual([]);
    expect(written.fileName).toBe("neon-hearts.chart");
    expect(written.text).toContain("[ExpertSingle]");
    const read = readChartText({ text: written.text, baseUrl: null });
    expect(read.problems).toEqual([]);
    const lane = read.lanes[0];
    expect(lane.instrument).toBe("guitar");
    expect(lane.difficulty).toBe("expert");
    expect(lane.notes.map((note) => note.timeMs)).toEqual([1000, 1500]);
    expect(lane.notes.map((note) => note.column)).toEqual([0, 2]);
    expect(lane.notes[1].lengthMs).toBe(500);
  });

  test("a role writes the format's other guitar track", () => {
    const written = writeChart({
      title: "Song",
      artist: "Artist",
      charts: [chart({ role: "rhythm", key: "guitar:rhythm:expert" })],
      grid: DEFAULT_GRID,
    });
    expect(written.text).toContain("[ExpertDoubleRhythm]");
  });

  test("bass, drums and keys get their own tracks", () => {
    const written = writeChart({
      title: "Song",
      artist: "Artist",
      charts: [
        chart({ instrument: "bass", key: "bass::hard", difficulty: "hard", columns: 5 }),
        chart({ instrument: "drums", key: "drums::hard", difficulty: "hard", columns: 6 }),
        chart({ instrument: "keys", key: "keys::normal", difficulty: "normal", columns: 5 }),
      ],
      grid: DEFAULT_GRID,
    });
    expect(written.text).toContain("[HardDoubleBass]");
    expect(written.text).toContain("[HardDrums]");
    expect(written.text).toContain("[MediumKeyboard]");
  });

  test("a dance chart is named rather than written as something else", () => {
    const written = writeChart({
      title: "Song",
      artist: "Artist",
      charts: [chart({ instrument: "dance", key: "dance::hard", difficulty: "hard", columns: 4 })],
      grid: DEFAULT_GRID,
    });
    expect(written.text).toBe("");
    expect(written.problems[0]).toContain("dance");
  });

  test("two charts of one track do not overwrite each other", () => {
    const written = writeChart({
      title: "Song",
      artist: "Artist",
      charts: [chart(), chart({ role: "lead", key: "guitar:lead:expert" })],
      grid: DEFAULT_GRID,
    });
    expect(written.text).toContain("[ExpertSingle]");
    expect(written.text).toContain("[ExpertDoubleGuitar]");
    expect(written.problems).toEqual([]);
  });

  test("a slide is named and dropped, and its notes still export", () => {
    const written = writeChart({
      title: "Song",
      artist: "Artist",
      charts: [
        chart({
          notes: [
            { id: "a", timeMs: 1000, lengthMs: 0, kind: "strum", column: 0, hero: false, slideTo: "b" },
            { id: "b", timeMs: 1500, lengthMs: 0, kind: "strum", column: 2, hero: false },
          ],
        }),
      ],
      grid: DEFAULT_GRID,
    });
    // `.chart` has no field for a glide: one message per link, and the notes stay.
    expect(written.problems).toHaveLength(1);
    expect(written.problems[0]).toContain("guitar::expert");
    expect(written.problems[0]).toContain("1000");
    const read = readChartText({ text: written.text, baseUrl: null });
    expect(read.lanes[0].notes.map((note) => note.timeMs)).toEqual([1000, 1500]);
  });

  test("star power spans become S events", () => {
    const written = writeChart({
      title: "Song",
      artist: "Artist",
      charts: [chart({ phrases: [{ startMs: 1000, endMs: 2000 }] })],
      grid: DEFAULT_GRID,
    });
    expect(written.text).toContain("= S 2");
  });
});
