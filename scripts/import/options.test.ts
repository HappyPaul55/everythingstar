import { describe, expect, test } from "bun:test";
import { emptySource } from "../../src/lib/game/sources/types";
import { writeSource } from "../../src/lib/game/sources/write";
import type { LaneChart, LaneNote } from "../../src/lib/game/track";
import {
  DEFAULT_AUDIO_BASE,
  exitCodeFor,
  parseArgs,
  reportOf,
  rootRelative,
  songIds,
  stemUrl,
  usableCharts,
  type ImportProblem,
} from "./options";

function note(id: string, column: number | null, timeMs = 0): LaneNote {
  return { id, timeMs, lengthMs: 0, kind: "strum", column, hero: false };
}

function chart(overrides: Partial<LaneChart> = {}): LaneChart {
  return {
    instrument: "guitar",
    difficulty: "normal",
    columns: 5,
    notes: [note("n1", 0)],
    ...overrides,
  };
}

describe("arguments", () => {
  test("--limit 0 means zero songs, not unlimited", () => {
    const result = parseArgs(["--from", "charts", "--limit", "0"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.options.limit).toBe(0);
  });

  test("--limit abc is refused", () => {
    const result = parseArgs(["--from", "charts", "--limit", "abc"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("--limit");
  });

  test("--limit 2 is two", () => {
    const result = parseArgs(["--from", "charts", "--limit", "2"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.options.limit).toBe(2);
  });

  test("a missing --from is refused", () => {
    const result = parseArgs(["--to", "library"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("--from");
  });

  test("the default audio base is the one the manifest layout uses", () => {
    const result = parseArgs(["--from", "charts"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.options.audioBase).toBe(DEFAULT_AUDIO_BASE);
    expect(DEFAULT_AUDIO_BASE).toBe("../audio");
  });

  test("--audio-base overrides it", () => {
    const result = parseArgs(["--from", "charts", "--audio-base", "https://cdn.test/audio"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.options.audioBase).toBe("https://cdn.test/audio");
  });
});

describe("song ids", () => {
  test("two same-titled folders in different paths are two ids", () => {
    const [rock, pop] = songIds(["Rock/The Middle", "Pop/The Middle"]);
    expect(rock).toBe("rock-the-middle");
    expect(pop).toBe("pop-the-middle");
    expect(rock).not.toBe(pop);
  });

  test("an id is stable across runs", () => {
    const paths = ["Rock/The Middle", "Pop/The Middle", "Jazz/The Middle"];
    expect(songIds(paths)).toEqual(songIds(paths));
  });

  test("paths that slug the same get a suffix, whatever the walk order", () => {
    const [first, second] = songIds(["A/B", "A B"]);
    expect(first).not.toBe(second);
    expect(songIds(["A B", "A/B"])).toEqual([second, first]);
  });

  test("two same-titled songs write the documents their own ids name", () => {
    const ids = songIds(["Rock/The Middle", "Pop/The Middle"]);
    const paths = ids.map((id) => {
      const source = emptySource(id, "The Middle");
      source.lanes = [chart()];
      return writeSource(source).files.map((file) => file.path);
    });
    expect(paths[0]).toContain("songs/rock-the-middle.json");
    expect(paths[0]).toContain("charts/rock-the-middle/guitar-normal.json");
    expect(paths[1]).toContain("songs/pop-the-middle.json");
    expect(paths[1]).toContain("charts/pop-the-middle/guitar-normal.json");
  });
});

describe("audio paths", () => {
  const root = "/charts";
  const file = "/charts/Album/Disc 1/Artist - Song/song.ogg";

  test("the default base keeps the song document's audio beside the library", () => {
    expect(stemUrl(file, root, DEFAULT_AUDIO_BASE)).toBe(
      "../audio/Album/Disc 1/Artist - Song/song.ogg",
    );
  });

  test("a custom base replaces it", () => {
    expect(stemUrl(file, root, "https://cdn.test/audio/")).toBe(
      "https://cdn.test/audio/Album/Disc 1/Artist - Song/song.ogg",
    );
  });

  test("a nested file keeps its whole path under the base", () => {
    expect(stemUrl(file, root, DEFAULT_AUDIO_BASE)).toBe(
      `${DEFAULT_AUDIO_BASE}/${rootRelative(file, root)}`,
    );
  });

  test("the document and the manifest name one layout", () => {
    expect(stemUrl(file, root, DEFAULT_AUDIO_BASE)).toBe(
      `${DEFAULT_AUDIO_BASE}/${rootRelative(file, root)}`,
    );
    expect(rootRelative(file, root)).toBe("Album/Disc 1/Artist - Song/song.ogg");
  });
});

describe("charts", () => {
  test("a valid chart is written and an invalid one is reported and absent", () => {
    const source = emptySource("two-charts", "Two charts");
    const good = chart({ difficulty: "easy" });
    const bad = chart({ difficulty: "normal", notes: [note("bad", 9)] });
    source.lanes = [good, bad];

    const gate = usableCharts(source);
    expect(gate.lanes).toEqual([good]);
    expect(gate.charts).toBe(1);
    expect(gate.notes).toBe(1);
    expect(gate.problems).toEqual([
      { song: "two-charts", problem: "guitar/normal: note bad is outside the highway" },
    ]);

    source.lanes = gate.lanes;
    const result = writeSource(source);
    const paths = result.files.map((file) => file.path);
    expect(paths).toContain("charts/two-charts/guitar-easy.json");
    expect(paths).not.toContain("charts/two-charts/guitar-normal.json");
  });
});

describe("the report", () => {
  test("songs counts entries, not folders attempted", () => {
    const problems: ImportProblem[] = [{ song: "bad", problem: "could not be read" }];
    const report = reportOf({
      entries: [{}, {}],
      attempted: 5,
      charts: 3,
      notes: 9,
      failed: 3,
      files: 7,
      problems,
    });
    expect(report.songs).toBe(2);
    expect(report.attempted).toBe(5);
    expect(report.failed).toBe(3);
  });

  test("a failed folder makes the run exit non-zero", () => {
    expect(exitCodeFor(1)).toBe(1);
    expect(exitCodeFor(0)).toBe(0);
  });
});
