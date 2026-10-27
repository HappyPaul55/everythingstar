import { describe, expect, test } from "bun:test";
import { chartProblems } from "../track";
import { readPlaylist } from "../playlist";
import { songArt } from "../song";
import { readChart, readSongDoc, sourceChartFor } from "../source";
import { roleKind } from "../song";
import { MOCK_FILE_COUNT, mockLibraryFiles } from "./files";
import { MOCK_SONGS } from "./songs";
import { buildMockTrack } from "./track";
import { chartJson } from "../sources/write";
import type { LaneChart } from "../track";

/**
 * The default playlist, the whole way round.
 *
 * The generator writes files and the readers read them, so this is the one place
 * that can prove the two agree: every song document parses, every chart it names
 * parses, every chart is playable by the rules the stage judges by, and what the
 * playlist *says* a song has is what the song actually has. A drift between them is
 * a menu that offers a part nobody can play.
 */
const BASE = "https://lib.test/";
const files = mockLibraryFiles();
const byUrl = new Map(files.map((file) => [new URL(file.path, BASE).href, file.body]));

function json(url: string): unknown {
  const body = byUrl.get(url);
  if (body === undefined) throw new Error(`no file at ${url}`);
  return JSON.parse(body) as unknown;
}

const playlistUrl = `${BASE}playlist/default.json`;
const library = readPlaylist(json(playlistUrl), playlistUrl);

describe("the generated fixture playlist", () => {
  test("is a playlist we can read, with the songs it says it has", () => {
    expect(library.problems).toEqual([]);
    expect(library.name).toBeTruthy();
    expect(library.songs).toHaveLength(MOCK_FILE_COUNT);
  });

  test("has no duplicate ids", () => {
    const ids = library.songs.map((song) => song.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("keeps what a library needs to draw: a hash bucket, no parts, lyrics, a duet", () => {
    expect(library.songs.some((song) => song.title.startsWith("1"))).toBe(true);
    expect(library.songs.some((song) => song.offer.instruments.length === 0)).toBe(true);
    expect(library.songs.some((song) => song.offer.voice?.chartType === "lyrics")).toBe(true);
    expect(library.songs.some((song) => song.offer.voice?.parts === 2)).toBe(true);
    // A chart that only exists at one level: a song is not a range of levels.
    expect(
      library.songs.some((song) =>
        song.offer.instruments.some((entry) => entry.difficulties.length === 1),
      ),
    ).toBe(true);
  });

  test("says what a song looks like at every level art can come from", () => {
    const levels = library.songs.map((song) => ({
      song: song.art !== null,
      album: song.album?.art != null,
      artist: song.artist.art !== null,
    }));
    expect(levels.some((level) => level.song)).toBe(true);
    expect(levels.some((level) => !level.song && level.album)).toBe(true);
    expect(levels.some((level) => !level.song && !level.album && level.artist)).toBe(true);
    expect(library.songs.some((song) => songArt(song) === null)).toBe(true);
  });

  test("has a backdrop on some songs, and none at all on others", () => {
    expect(library.songs.some((song) => song.video !== null)).toBe(true);
    expect(library.songs.some((song) => song.video === null)).toBe(true);
  });

  test("names a file that exists for every song, and for its art", () => {
    for (const song of library.songs) {
      expect(byUrl.has(song.doc)).toBe(true);
      for (const art of [song.art, song.album?.art, song.artist.art]) {
        if (art) expect(byUrl.has(art)).toBe(true);
      }
    }
  });
});

describe("the notes themselves", () => {
  test("the chart writer keeps the tempo and phrases the fixture relies on", () => {
    // The mock's lane documents go through the same builder as an imported
    // library's, so a mock cannot lose what a real chart carries.
    const chart: LaneChart = {
      instrument: "guitar",
      difficulty: "normal",
      columns: 5,
      bpm: 120,
      phrases: [{ startMs: 0, endMs: 1000 }],
      notes: [],
    };
    const doc = chartJson(chart) as { bpm?: number; phrases?: unknown };
    expect(doc.bpm).toBe(120);
    expect(doc.phrases).toEqual([{ startMs: 0, endMs: 1000 }]);
  });

  test("come back exactly as the mock wrote them", () => {
    // One song, note for note: a chart that loses a note on the way through a file
    // is a chart that is quietly easier than it should be.
    const song = library.songs.find(
      (entry) => entry.offer.instruments.length > 0 && entry.offer.voice !== null,
    );
    expect(song).toBeDefined();
    if (!song) return;
    const mock = MOCK_SONGS.find((entry) => entry.id === song.id);
    expect(mock).toBeDefined();
    if (!mock) return;

    const original = buildMockTrack({
      seed: mock.seed,
      parts: mock.parts,
      hasPitch: mock.hasPitch,
      durationMs: mock.durationMs,
      title: mock.title,
      charts: mock.charts,
    });
    const doc = readSongDoc(json(song.doc), song.doc).doc;
    expect(doc).not.toBeNull();
    if (!doc) return;

    for (const chart of original.charts) {
      const listed = sourceChartFor(doc, chart.instrument, chart.difficulty);
      expect(listed).not.toBeNull();
      if (!listed) continue;
      const parsed = readChart(json(listed.url), listed, chart.instrument);
      expect(parsed.lane?.columns).toBe(chart.columns);
      expect(parsed.lane?.bpm).toBe(chart.bpm);
      expect(parsed.lane?.notes.length).toBe(chart.notes.length);
      expect(parsed.lane?.notes[0]?.timeMs).toBe(chart.notes[0]?.timeMs);
      expect(parsed.lane?.notes.at(-1)?.lengthMs).toBe(chart.notes.at(-1)?.lengthMs);
    }

    const voice = sourceChartFor(doc, "words", "normal");
    expect(voice).not.toBeNull();
    if (!voice) return;
    const melody = readChart(json(voice.url), voice, "words").melody;
    expect(melody?.lines.length).toBe(original.melody.lines.length);
    expect(melody?.notes.length).toBe(original.melody.notes.length);
  });
});

describe("every generated song", () => {  for (const song of library.songs) {
    test(`${song.id}: says what it has, and has what it says`, () => {
      const read = readSongDoc(json(song.doc), song.doc);
      expect(read.problems).toEqual([]);
      const doc = read.doc;
      expect(doc).not.toBeNull();
      if (!doc) return;

      // The summary and the song are two documents describing one thing.
      const kinds = [...new Set(doc.parts.map((part) => roleKind(part.role)))].filter(
        (kind) => kind !== "words",
      );
      expect(kinds.sort()).toEqual(
        song.offer.instruments.map((entry) => entry.kind).sort(),
      );
      expect(doc.parts.some((part) => roleKind(part.role) === "words")).toBe(
        song.offer.voice !== null,
      );

      for (const instrument of song.offer.instruments) {
        for (const difficulty of instrument.difficulties) {
          const chart = sourceChartFor(doc, instrument.kind, difficulty);
          expect(chart).not.toBeNull();
          if (!chart) continue;
          expect(chart.difficulty).toBe(difficulty);
          expect(byUrl.has(chart.url)).toBe(true);
          const parsed = readChart(json(chart.url), chart, instrument.kind);
          expect(parsed.problems).toEqual([]);
          if (parsed.lane) {
            expect(chartProblems(parsed.lane)).toEqual([]);
          } else {
            expect(parsed.melody).not.toBeNull();
          }
        }
      }

      if (song.offer.voice) {
        const voice = sourceChartFor(doc, "words", "normal");
        expect(voice).not.toBeNull();
        if (!voice) return;
        expect(byUrl.has(voice.url)).toBe(true);
        const parsed = readChart(json(voice.url), voice, "words");
        expect(parsed.problems).toEqual([]);
        expect(parsed.melody?.hasPitch).toBe(song.offer.voice.chartType === "vocals");
        expect(parsed.melody?.parts).toBe(song.offer.voice.parts);
        // A song with words has words, whichever way they are played.
        expect(parsed.melody?.lines.length).toBeGreaterThan(0);
      }
    });
  }
});
