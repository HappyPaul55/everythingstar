import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chartProblems, MAX_NOTE_LENGTH_MS, MAX_SONG_MS } from "../track";
import { readChartText } from "./chart";
import { readUltraStar } from "./ultrastar";
import { readStepMania } from "./stepmania";
import { readLyricText } from "./lyrics";
import { detectSource } from "./detect";
import { findChartName } from "./files";
import { parseSource } from "./parse";
import { findSongs } from "../../../../scripts/import/find";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("readChartText (Clone Hero .chart)", () => {
  const text = [
    "[Song]",
    "{",
    "  Name = Nine Lives",
    '  Artist = The Example',
    "  Resolution = 480",
    "  Offset = 100",
    "}",
    "[SyncTrack]",
    "{",
    "  0 = B 120000",
    "  0 = TS 4",
    "}",
    "[Events]",
    "{",
    '  0 = E "section Intro"',
    '  4800 = E "section Verse"',
    "}",
    "[ExpertSingle]",
    "{",
    "  960 = N 0 0",
    "  1200 = N 2 480",
    "  1440 = N 1 0",
    "  1800 = S 2 960",
    "}",
    "",
  ].join("\n");

  const source = readChartText({ text, fallbackTitle: "fallback" });

  test("bounds a note past any song instead of costing the chart", () => {
    const read = readChartText({
      text: [
        "[Song]",
        "{",
        "  Name = Absurd",
        "  Resolution = 480",
        "}",
        "[SyncTrack]",
        "{",
        "  0 = B 120000",
        "}",
        "[ExpertSingle]",
        "{",
        "  960 = N 0 0",
        "  999999999999 = N 1 0",
        "}",
        "",
      ].join("\n"),
    });
    // The reachable note is still there, and the chart is still playable: a bad
    // tick cannot make the whole instrument disappear.
    expect(read.lanes[0].notes).toHaveLength(1);
    expect(chartProblems(read.lanes[0])).toEqual([]);
    // And its length is not hundreds of days.
    expect(read.meta.durationMs).toBeLessThanOrEqual(MAX_SONG_MS + 3_000);
  });

  test("clamps a hold longer than the game can draw, instead of dropping the chart", () => {
    const read = readChartText({
      text: [
        "[Song]",
        "{",
        "  Name = Held",
        "  Resolution = 480",
        "}",
        "[SyncTrack]",
        "{",
        "  0 = B 120000",
        "}",
        "[ExpertSingle]",
        "{",
        "  960 = N 0 20000000",
        "  1440 = N 1 0",
        "}",
        "",
      ].join("\n"),
    });
    expect(read.lanes[0].notes).toHaveLength(2);
    expect(read.lanes[0].notes[0].lengthMs).toBe(MAX_NOTE_LENGTH_MS);
    expect(chartProblems(read.lanes[0])).toEqual([]);
  });

  test("reads the metadata and the tempo", () => {
    expect(source.meta.title).toBe("Nine Lives");
    expect(source.meta.artist).toBe("The Example");
    expect(source.lanes[0].bpm).toBe(120);
  });

  test("places notes on the offset and the tempo", () => {
    const chart = source.lanes[0];
    expect(chart.instrument).toBe("guitar");
    expect(chart.difficulty).toBe("expert");
    expect(chart.notes.map((note) => [note.timeMs, note.column])).toEqual([
      [1100, 0],
      [1350, 2],
      [1600, 1],
    ]);
    // The held note's sustain is 480 ticks — half a second at this tempo.
    expect(chart.notes[1].lengthMs).toBe(500);
    expect(chartProblems(chart)).toEqual([]);
  });

  test("reads star power as a phrase and the events as sections", () => {
    expect(source.lanes[0].phrases).toEqual([{ startMs: 1975, endMs: 2975 }]);
    expect(source.sections).toEqual([
      { timeMs: 100, name: "Intro" },
      { timeMs: 5100, name: "Verse" },
    ]);
  });
});

describe("readChartText drums: the kick pedal and fills", () => {
  const text = [
    "[Song]",
    "{",
    "  Resolution = 480",
    "}",
    "[SyncTrack]",
    "{",
    "  0 = B 120000",
    "}",
    "[Events]",
    "{",
    '  0 = E "mix 8"',
    '  960 = E "mix 9"',
    '  1920 = E "section Drum Fill 2"',
    '  2880 = E "section Verse"',
    "}",
    "[ExpertDrums]",
    "{",
    "  0 = N 0 100",
    "  480 = N 5 100",
    "  960 = N 1 100",
    "  960 = N 5 100",
    "}",
    "",
  ].join("\n");
  const source = readChartText({ text, fallbackTitle: "Kit" });

  test("fret 5 is the kick pedal, and the chart is six columns wide", () => {
    const chart = source.lanes[0];
    expect(chart.instrument).toBe("drums");
    expect(chart.columns).toBe(6);
    expect(chart.notes.map((note) => [note.timeMs, note.column])).toEqual([
      [0, 0],
      [500, 5],
      [1000, 1],
      [1000, 5],
    ]);
    expect(chartProblems(chart)).toEqual([]);
  });

  test("reads fills from mix events and from a section named fill", () => {
    expect(source.lanes[0].fills).toEqual([
      { startMs: 0, endMs: 1000 },
      { startMs: 2000, endMs: 3000 },
    ]);
  });

  test("fret 5 on a guitar is still the open note", () => {
    const guitar = readChartText({
      text: [
        "[Song]",
        "{",
        "  Resolution = 480",
        "}",
        "[SyncTrack]",
        "{",
        "  0 = B 120000",
        "}",
        "[ExpertSingle]",
        "{",
        "  0 = N 5 0",
        "}",
        "",
      ].join("\n"),
      fallbackTitle: "Open",
    });
    const chart = guitar.lanes[0];
    expect(chart.instrument).toBe("guitar");
    expect(chart.columns).toBe(5);
    expect(chart.notes[0].column).toBeNull();
  });
});

describe("readChartText guitar roles", () => {
  const text = [
    "[Song]",
    "{",
    "  Resolution = 480",
    "}",
    "[SyncTrack]",
    "{",
    "  0 = B 120000",
    "}",
    "[ExpertSingle]",
    "{",
    "  0 = N 0 0",
    "}",
    "[ExpertDoubleRhythm]",
    "{",
    "  0 = N 1 0",
    "}",
    "",
  ].join("\n");

  test("keeps a Single and a DoubleRhythm as the lead and the rhythm", () => {
    const source = readChartText({ text, fallbackTitle: "Two Guitars" });
    expect(source.lanes).toHaveLength(2);
    expect(source.lanes.map((chart) => [chart.instrument, chart.role])).toEqual([
      ["guitar", "lead"],
      ["guitar", "rhythm"],
    ]);
    expect(source.lanes.map((chart) => chart.notes[0].column)).toEqual([0, 1]);
    expect(source.lanes.every((chart) => chartProblems(chart).length === 0)).toBe(true);
  });

  test("DoubleGuitar is the lead, so a Single replaces it rather than adding a third", () => {
    const both = readChartText({
      text: [
        "[Song]",
        "{",
        "  Resolution = 480",
        "}",
        "[SyncTrack]",
        "{",
        "  0 = B 120000",
        "}",
        "[ExpertSingle]",
        "{",
        "  0 = N 0 0",
        "}",
        "[ExpertDoubleGuitar]",
        "{",
        "  0 = N 2 0",
        "}",
        "",
      ].join("\n"),
      fallbackTitle: "Lead",
    });
    expect(both.lanes).toHaveLength(1);
    expect(both.lanes[0].role).toBe("lead");
    expect(both.lanes[0].notes[0].column).toBe(0);
    expect(both.problems.some((problem) => problem.includes("dropped"))).toBe(true);
  });
});

describe("readChartText tempo and resolution", () => {
  test("reads a B line as thousandths of a beat a minute", () => {
    // `B 150000` is 150 bpm — 400 ms a beat — and a resolution of 480 ticks.
    const source = readChartText({
      text: [
        "[Song]",
        "{",
        "  Resolution = 480",
        "}",
        "[SyncTrack]",
        "{",
        "  0 = B 150000",
        "}",
        "[ExpertSingle]",
        "{",
        "  0 = N 0 0",
        "  480 = N 1 0",
        "  960 = N 2 0",
        "}",
        "",
      ].join("\n"),
    });
    expect(source.lanes[0].bpm).toBe(150);
    expect(source.lanes[0].notes.map((note) => note.timeMs)).toEqual([0, 400, 800]);
  });

  test("a resolution that cannot divide the ticks is replaced, and named", () => {
    const text = (resolution: string) =>
      [
        "[Song]",
        "{",
        `  ${resolution}`,
        "}",
        "[SyncTrack]",
        "{",
        "  0 = B 120000",
        "}",
        "[EasySingle]",
        "{",
        "  480 = N 0 0",
        "}",
        "",
      ].join("\n");

    const zero = readChartText({ text: text("TimeDivision = 0") });
    // Clamped to 480 ticks a beat: one beat at 120 bpm.
    expect(zero.lanes[0].notes[0].timeMs).toBe(500);
    expect(zero.problems.some((problem) => problem.includes("resolution"))).toBe(true);

    const negative = readChartText({ text: text("Resolution = -480") });
    expect(negative.lanes[0].notes[0].timeMs).toBe(500);
    expect(negative.problems.some((problem) => problem.includes("resolution"))).toBe(true);
  });
});

describe("readUltraStar (.txt)", () => {
  const text = [
    "#TITLE:Hello",
    "#ARTIST:Someone",
    "#BPM:120",
    "#GAP:1000",
    "#MP3:song.mp3",
    ": 0 4 4 Hel",
    ": 4 4 6 ~lo",
    "- 8",
    ": 8 4 0 speak",
    ": 12 4 0 ~ing",
    "E",
    "",
  ].join("\n");
  const source = readUltraStar({ text });

  test("reads the headers and the audio", () => {
    expect(source.meta.title).toBe("Hello");
    expect(source.meta.artist).toBe("Someone");
    expect(source.audio.stems[0].url).toBe("song.mp3");
  });

  test("turns UltraStar beats into milliseconds", () => {
    // #BPM is implicitly quadrupled: 120 bpm is 0.125 s per beat, and the gap is 1 s.
    expect(source.melody?.notes[0].timeMs).toBe(1000);
    // The line runs to the end of its last note: beat 4 at 1.5 s plus a 0.5 s hold.
    expect(source.melody?.lines[0].endMs).toBe(2000);
  });

  test("joins a tilde continuation and breaks the line where the file does", () => {
    expect(source.melody?.lines).toHaveLength(2);
    expect(source.melody?.lines[0].words.map((word) => word.text)).toEqual(["Hello"]);
    expect(source.melody?.lines[1].words.map((word) => word.text)).toEqual(["speaking"]);
  });

  test("pitch 0 is C4, not a freeform note", () => {
    // The UltraStar pitch is relative to C4; 0 is a real note, while a rap note is
    // what carries no pitch.
    expect(source.melody?.hasPitch).toBe(true);
    expect(source.melody?.lines[1].freeform).toBe(false);
    expect(source.melody?.notes.find((note) => note.timeMs === 2000)?.row).toBe(0);
  });
});

describe("readLyricText", () => {
  test("reads LRC tags and their times", () => {
    const source = readLyricText({
      text: "[ti:Nine Lives]\n[ar:The Example]\n[00:12.30]turn the volume up\n[00:15.00]and play it loud\n",
    });
    expect(source.meta.title).toBe("Nine Lives");
    expect(source.meta.artist).toBe("The Example");
    expect(source.melody?.hasPitch).toBe(false);
    expect(source.melody?.lines).toHaveLength(2);
    expect(source.melody?.lines[0].timeMs).toBe(12300);
    expect(source.melody?.lines[0].words.map((word) => word.text)).toEqual([
      "turn",
      "the",
      "volume",
      "up",
    ]);
    // A cue runs until the next one opens.
    expect(source.melody?.lines[0].endMs).toBe(15000);
  });

  test("applies an [offset:] tag", () => {
    const source = readLyricText({ text: "[offset:500]\n[00:12.30]hello\n" });
    expect(source.melody?.lines[0].timeMs).toBe(12800);
  });

  test("keeps a bracket that is part of the words", () => {
    const source = readLyricText({
      text: "[00:12.30]hello [Chorus]\n[00:15.00]and play it loud\n",
    });
    expect(source.melody?.lines[0].words.map((word) => word.text)).toEqual([
      "hello",
      "[Chorus]",
    ]);
    expect(source.melody?.lines[0].timeMs).toBe(12300);
  });

  test("makes one cue for each timestamp on a line", () => {
    const source = readLyricText({
      text: "[00:12.30][00:20.00]hello\n[00:25.00]bye\n",
    });
    expect(
      source.melody?.lines.map((line) => [line.timeMs, line.words.map((word) => word.text).join(" ")]),
    ).toEqual([
      [12300, "hello"],
      [20000, "hello"],
      [25000, "bye"],
    ]);
  });

  test("an empty or garbage sheet has no melody, no duration and says so", () => {
    for (const text of ["", "not a lyric sheet\njust some words\n"]) {
      const source = readLyricText({ text });
      expect(source.melody).toBeNull();
      expect(source.meta.durationMs).toBe(0);
      expect(source.problems).toContain("no timed lyrics found");
    }
  });

  test("reads an SRT cue", () => {
    const source = readLyricText({
      text: "1\n00:00:12,300 --> 00:00:15,000\nturn the volume up\n\n2\n00:00:16,000 --> 00:00:18,000\nand play it loud\n",
    });
    expect(source.melody?.lines.map((line) => line.timeMs)).toEqual([12300, 16000]);
    expect(source.melody?.lines[0].endMs).toBe(15000);
  });

  test("reads a WebVTT cue with a dot in its times", () => {
    const source = readLyricText({ text: "WEBVTT\n\n00:00:12.300 --> 00:00:15.000\nturn up\n" });
    expect(source.melody?.lines[0].timeMs).toBe(12300);
  });
});

describe("parseSource", () => {
  test("hands bytes to the reader the bytes ask for", () => {
    const chart = parseSource({
      bytes: bytes('[Song]\n{\n  Name = A\n  Resolution = 480\n}\n[SyncTrack]\n{\n  0 = B 120000\n}\n[EasySingle]\n{\n  0 = N 0 0\n}\n'),
      name: "notes.chart",
    });
    expect(chart.lanes).toHaveLength(1);
    expect(chart.lanes[0].difficulty).toBe("easy");

    const sheet = parseSource({ bytes: bytes("[00:01.00]hello there\n"), name: "song.lrc" });
    expect(sheet.melody?.hasPitch).toBe(false);

    const star = parseSource({ bytes: bytes("#TITLE:x\n#BPM:120\n: 0 2 60 hi\n"), name: "song.txt" });
    expect(star.melody?.hasPitch).toBe(true);
  });

  test("a file no reader claims is not turned into a lyric sheet", () => {
    const unknown = parseSource({ bytes: bytes("hello there"), name: "mystery.bin" });
    expect(unknown.melody).toBeNull();
    expect(unknown.lanes).toEqual([]);
    expect(unknown.meta.durationMs).toBe(0);
    expect(unknown.problems.length).toBeGreaterThan(0);

    const document = parseSource({ bytes: bytes('{"schemaVersion":1}'), name: "song.json" });
    expect(document.melody).toBeNull();
    expect(document.meta.durationMs).toBe(0);
    expect(document.problems.length).toBeGreaterThan(0);
  });
});

describe("readStepMania (.sm)", () => {
  const text = [
    "#TITLE:Nine Lives;",
    "#ARTIST:The Tester;",
    "#OFFSET:0.000;",
    "#BPMS:0.000=120.000;",
    "#MUSIC:song.ogg;",
    "#NOTES:",
    "     dance-single:",
    "     :",
    "     Challenge:",
    "     10:",
    "     0,0,0,0,0:",
    "0002",
    "0000",
    "0003",
    "0000",
    ",",
    "1000",
    "0100",
    "0010",
    "0000",
    ";",
    "",
  ].join("\n");
  const source = readStepMania({ text });

  test("reads the tags and the audio", () => {
    expect(source.meta.title).toBe("Nine Lives");
    expect(source.meta.artist).toBe("The Tester");
    expect(source.audio.stems[0].url).toBe("song.ogg");
    expect(source.meta.durationMs).toBeGreaterThan(3000);
  });

  test("reads the grid as a dance chart at the level its block names", () => {
    expect(source.lanes).toHaveLength(1);
    const chart = source.lanes[0];
    expect(chart.instrument).toBe("dance");
    expect(chart.difficulty).toBe("expert");
    expect(chart.columns).toBe(4);
    expect(chart.bpm).toBe(120);
    expect(chartProblems(chart)).toEqual([]);
  });

  test("places the steps on the beat and pairs a hold with its tail", () => {
    const notes = source.lanes[0].notes;
    // A measure is four beats however many rows it is cut into: at 120 bpm a row of
    // four is a beat, so a step is 500 ms.
    expect(notes.map((note) => [note.timeMs, note.column])).toEqual([
      [0, 3],
      [2000, 0],
      [2500, 1],
      [3000, 2],
    ]);
    expect(notes[0].lengthMs).toBe(1000);
  });
});

describe("readStepMania comments and tempo", () => {
  /** A single dance chart whose grid is `rows` per measure, one measure a comma. */
  function stepfile(tags: string[], rows: string[]): string {
    return [
      ...tags,
      "#NOTES:",
      "dance-single:",
      ":",
      "Challenge:",
      "10:",
      "0,0,0,0,0:",
      ...rows,
      ";",
      "",
    ].join("\n");
  }

  test("keeps a URL's // and strips only comments", () => {
    const source = readStepMania({
      text: [
        "#TITLE:Nine Lives;",
        "#BPMS:0.000=120.000;",
        "#MUSIC:https://host/song.ogg;",
        "// a whole-line comment",
        "#NOTES:",
        "dance-single:",
        ":",
        "Challenge:",
        "10:",
        "0,0,0,0,0:",
        "1000",
        ";",
        "",
      ].join("\n"),
    });
    expect(source.audio.stems[0]?.url).toBe("https://host/song.ogg");
  });

  test("a later zero BPM is dropped and the last valid tempo continues", () => {
    const source = readStepMania({
      text: stepfile(["#TITLE:Zero;", "#BPMS:0.000=120.000,4.000=0.000;"], [
        "1000", "0100", "0010", "0001",
        ",", "1000", "0100", "0010", "0001",
      ]),
    });
    expect(source.problems.some((problem) => problem.includes("tempo"))).toBe(true);
    expect(source.lanes[0].notes.map((note) => note.timeMs)).toEqual([
      0, 500, 1000, 1500, 2000, 2500, 3000, 3500,
    ]);
  });

  test("an empty #BPMS is named once and defaults to 120", () => {
    const source = readStepMania({
      text: stepfile(["#TITLE:Empty;", "#BPMS:;"], ["1000", "0100", "0010", "0001"]),
    });
    expect(source.problems.filter((problem) => problem.includes("no #BPMS"))).toHaveLength(1);
    expect(source.lanes[0].notes.map((note) => note.timeMs)).toEqual([0, 500, 1000, 1500]);
  });

  test("reads a valid tempo map with a later change", () => {
    const source = readStepMania({
      text: stepfile(["#TITLE:Map;", "#BPMS:0.000=120.000,4.000=60.000;"], [
        "1000", "0100", "0010", "0001",
        ",", "1000", "0100", "0010", "0001",
      ]),
    });
    expect(source.problems.some((problem) => problem.includes("tempo"))).toBe(false);
    expect(source.lanes[0].notes.map((note) => note.timeMs)).toEqual([
      0, 500, 1000, 1500, 2000, 3000, 4000, 5000,
    ]);
  });

  test("a stop delays every later note, and only the later ones", () => {
    const source = readStepMania({
      text: stepfile(
        ["#TITLE:Stopped;", "#BPMS:0.000=120.000;", "#STOPS:4.000=1.000;"],
        ["1000", "0100", "0010", "0001", ",", "1000", "0100", "0010", "0001"],
      ),
    });
    // 120 bpm: a beat every 500 ms. The one-second stop at beat 4 begins on that
    // beat, so the note there keeps its time and everything after it is a second late.
    expect(source.lanes[0].notes.map((note) => note.timeMs)).toEqual([
      0, 500, 1000, 1500, 2000, 3500, 4000, 4500,
    ]);
  });

  test("skips a double chart and keeps a single one", () => {
    const source = readStepMania({
      text: [
        "#TITLE:Two Modes;",
        "#BPMS:0.000=120.000;",
        "#NOTES:",
        "dance-double:",
        ":",
        "Challenge:",
        "10:",
        "0,0,0,0,0:",
        "10000000",
        "01000000",
        "00100000",
        "00010000",
        ";",
        "#NOTES:",
        "dance-single:",
        ":",
        "Challenge:",
        "10:",
        "0,0,0,0,0:",
        "1000",
        "0100",
        "0010",
        "0001",
        ";",
        "",
      ].join("\n"),
    });
    expect(source.problems.some((problem) => problem.includes("dance-double"))).toBe(true);
    expect(source.lanes).toHaveLength(1);
    expect(source.lanes[0].columns).toBe(4);
  });
});

describe("readStepMania (.ssc)", () => {
  test("reads a #NOTEDATA block's step type and difficulty", () => {
    const source = readStepMania({
      text: [
        "#VERSION:0.83;",
        "#TITLE:Step Chart;",
        "#BPMS:0.000=120.000;",
        "#NOTEDATA:;",
        "#CHARTNAME:Challenge;",
        "#STEPSTYPE:dance-single;",
        "#DIFFICULTY:Challenge;",
        "#METER:10;",
        "#NOTES:",
        "1000",
        "0100",
        "0010",
        "0001",
        ";",
        "",
      ].join("\n"),
    });
    expect(source.lanes).toHaveLength(1);
    expect(source.lanes[0].difficulty).toBe("expert");
    expect(source.lanes[0].columns).toBe(4);
    expect(source.lanes[0].notes.map((note) => note.timeMs)).toEqual([0, 500, 1000, 1500]);
  });
});

describe("a chart's own name for its mix", () => {
  function chartText(stream: string): string {
    return [
      "[Song]",
      "{",
      "  Name = Named Mix",
      "  Resolution = 480",
      `  MusicStream = "${stream}"`,
      "}",
      "[SyncTrack]",
      "{",
      "  0 = B 120000",
      "}",
      "[ExpertSingle]",
      "{",
      "  0 = N 0 0",
      "}",
      "",
    ].join("\n");
  }

  function stepfile(music: string): string {
    return [
      "#TITLE:Named Mix;",
      "#BPMS:0.000=120.000;",
      `#MUSIC:${music};`,
      "#NOTES:",
      "dance-single:",
      ":",
      "Challenge:",
      "10:",
      "0,0,0,0,0:",
      "1000",
      ";",
      "",
    ].join("\n");
  }

  test("a .chart resolves MusicStream against the folder it came from", () => {
    // A mix under `audio/song.ogg` is not one of the table's names: without the base
    // it stayed a bare name, and the folder listed a song that played silence.
    const source = readChartText({
      text: chartText("audio/song.ogg"),
      baseUrl: "folder://library/Song/",
    });
    expect(source.audio.stems[0].url).toBe("folder://library/Song/audio/song.ogg");
  });

  test("a .chart resolves MusicStream against the URL that served it", () => {
    const source = readChartText({
      text: chartText("audio/song.ogg"),
      baseUrl: "https://example.test/songs/notes.chart",
    });
    expect(source.audio.stems[0].url).toBe("https://example.test/songs/audio/song.ogg");
  });

  test("a .sm resolves #MUSIC the same way, and a bare name with no base stays bare", () => {
    expect(
      readStepMania({
        text: stepfile("audio/song.ogg"),
        baseUrl: "folder://library/Song/",
      }).audio.stems[0].url,
    ).toBe("folder://library/Song/audio/song.ogg");
    expect(
      readStepMania({
        text: stepfile("audio/song.ogg"),
        baseUrl: "https://example.test/songs/song.sm",
      }).audio.stems[0].url,
    ).toBe("https://example.test/songs/audio/song.ogg");
    expect(readStepMania({ text: stepfile("song.ogg") }).audio.stems[0].url).toBe("song.ogg");
    expect(readChartText({ text: chartText("song.ogg") }).audio.stems[0].url).toBe("song.ogg");
  });

  test("parseSource hands the base to both readers", () => {
    const chart = parseSource({
      bytes: bytes(chartText("audio/song.ogg")),
      name: "notes.chart",
      baseUrl: "folder://library/Song/",
    });
    expect(chart.audio.stems[0].url).toBe("folder://library/Song/audio/song.ogg");

    const step = parseSource({
      bytes: bytes(stepfile("audio/song.ogg")),
      name: "song.sm",
      baseUrl: "https://example.test/songs/song.sm",
    });
    expect(step.audio.stems[0].url).toBe("https://example.test/songs/audio/song.ogg");
  });
});

describe("detectSource", () => {
  test("names each format from its own bytes", () => {
    expect(detectSource(new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6]))).toBe("midi");
    expect(detectSource(new Uint8Array([...bytes("RIFF"), 0, 0, 0, 0, ...bytes("RMID")]))).toBe("midi");
    expect(detectSource(bytes('[Song]\n{\n}'))).toBe("chart");
    expect(detectSource(bytes("#TITLE:x\n#BPM:120\n: 0 4 60 hi\n"))).toBe("ultrastar");
    expect(detectSource(bytes("#NOTEDATA:;\n#STEPSTYPE:dance-single;"))).toBe("stepmania");
    expect(detectSource(bytes("[00:12.30]hi"))).toBe("lrc");
    expect(detectSource(bytes("1\n00:00:12,300 --> 00:00:15,000 hi"))).toBe("srt");
    expect(detectSource(bytes("WEBVTT\n\n00:00:12.300 --> 00:00:15.000 hi"))).toBe("vtt");
    expect(detectSource(bytes('{"schemaVersion":1}'))).toBe("document");
  });

  test("falls back to the name when the bytes say nothing", () => {
    expect(detectSource(bytes("hello"), "notes.mid")).toBe("midi");
    expect(detectSource(bytes("hello"), "song.chart")).toBe("chart");
    expect(detectSource(bytes("hello"), "song.ssc")).toBe("stepmania");
    expect(detectSource(bytes("hello"), "whatever.txt")).toBe("ultrastar");
    expect(detectSource(bytes("hello"))).toBe("unknown");
  });
});

describe("findChartName", () => {
  test("a Guitar Hero chart wins over a song.txt in the same folder", () => {
    // The mismatch this rule exists for: listed from `notes.mid`, played from
    // `song.txt` would be a different song on stage.
    expect(findChartName(["song.txt", "notes.mid", "license.txt"])).toBe("notes.mid");
  });

  test("the conventional name is found whatever the case", () => {
    expect(findChartName(["Song.txt", "NOTES.MID"])).toBe("NOTES.MID");
  });

  test("a folder with only an UltraStar sheet chooses song.txt", () => {
    expect(findChartName(["license.txt", "song.txt", "audio.mp3"])).toBe("song.txt");
  });

  test("a chart beside a changelog or license is still the chart", () => {
    expect(findChartName(["changelog.txt", "license.txt", "song.chart"])).toBe("song.chart");
    expect(findChartName(["changelog.txt", "steps.sm", "song.txt"])).toBe("steps.sm");
  });

  test("the chart formats keep their order: notes.mid, then .chart, then .sm", () => {
    expect(findChartName(["a.sm", "b.chart", "song.txt"])).toBe("b.chart");
    expect(findChartName(["a.sm", "song.txt"])).toBe("a.sm");
  });
});

describe("the importer's chart choice", () => {
  function withFolder(names: string[], check: (root: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), "everythingstar-import-"));
    try {
      const song = join(root, "Band - One");
      mkdirSync(song);
      for (const name of names) writeFileSync(join(song, name), "x");
      check(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  test("is the folder reader's: a notes.mid beside a song.txt is the chart", () => {
    withFolder(["notes.mid", "song.txt"], (root) => {
      const song = join(root, "Band - One");
      expect(findSongs(root)).toEqual([{ dir: song, chart: join(song, "notes.mid") }]);
    });
  });

  test("a chart beside a changelog is a song, and a lone changelog is not", () => {
    withFolder(["changelog.txt", "song.chart"], (root) => {
      const song = join(root, "Band - One");
      expect(findSongs(root)).toEqual([{ dir: song, chart: join(song, "song.chart") }]);
    });
    withFolder(["changelog.txt"], (root) => {
      expect(findSongs(root)).toEqual([]);
    });
  });
});
