import { describe, expect, test } from "bun:test";
import { chartProblems, type LaneChart, type MelodyChart } from "../track";
import { readChart, readSongDoc, sourceChartFor } from "../source";
import { readPlaylist } from "../playlist";
import { chartJson, trackFromSource, sourceToSongDoc, writeSource } from "./write";
import type { ParsedSource } from "./types";

const LANE: LaneChart = {
  instrument: "guitar",
  difficulty: "expert",
  columns: 5,
  bpm: 150,
  phrases: [{ startMs: 1000, endMs: 3000 }],
  notes: [
    { id: "g-0", timeMs: 500, lengthMs: 0, kind: "strum", column: 0, hero: false },
    { id: "g-1", timeMs: 800, lengthMs: 400, kind: "hopo", column: 2, hero: true },
    { id: "g-2", timeMs: 1200, lengthMs: 0, kind: "strum", column: null, hero: false },
  ],
};

const MELODY: MelodyChart = {
  parts: 1,
  hasPitch: true,
  rows: 6,
  rootMidi: 57,
  lines: [
    {
      timeMs: 1000,
      endMs: 2000,
      parts: [{ part: 0, offset: 0 }],
      freeform: false,
      words: [
        { text: "hello", timeMs: 1000, hero: false },
        { text: "world", timeMs: 1500, hero: true },
      ],
    },
  ],
  notes: [
    { id: "v-0", timeMs: 1000, lengthMs: 400, part: 0, row: 2, text: "hel", hero: false },
    { id: "v-1", timeMs: 1500, lengthMs: 400, part: 0, row: 4, text: "lo", hero: true },
  ],
};

const SOURCE: ParsedSource = {
  meta: {
    id: "nine-lives",
    title: "Nine Lives",
    artist: "The Example",
    album: "First Light",
    year: 2007,
    durationMs: 240000,
    previewStartMs: 60000,
    art: "art.png",
    video: null,
  },
  audio: {
    source: "stems",
    stems: [
      { id: "stem_master", name: "Master", url: "song.ogg", instrument: null, defaultGainDb: 0, offsetMs: 0 },
      {
        id: "stem_lead_guitar",
        name: "Lead Guitar",
        url: "guitar.ogg",
        instrument: "lead_guitar",
        defaultGainDb: 0,
        offsetMs: 0,
      },
      {
        id: "stem_vocals",
        name: "Vocals",
        url: "vocals.ogg",
        instrument: "vocals",
        defaultGainDb: 0,
        offsetMs: 0,
      },
    ],
    mixPresets: [{ id: "full", stemIds: ["stem_master"] }],
    preview: "preview.ogg",
  },
  lanes: [LANE],
  melody: MELODY,
  sections: [
    { timeMs: 0, name: "Intro" },
    { timeMs: 30000, name: "Verse" },
  ],
  problems: [],
};

const PLAYLIST_URL = "https://everythingstar.test/library/playlist.json";
const LIBRARY = "https://everythingstar.test/library/";

describe("writeSource", () => {
  const written = writeSource(SOURCE);
  const byPath = new Map(written.files.map((file) => [file.path, JSON.parse(file.body) as unknown]));

  test("writes the song document, its charts and its melody", () => {
    expect(written.files.map((file) => file.path).sort()).toEqual([
      "charts/nine-lives/guitar-expert.json",
      "charts/nine-lives/vocals.json",
      "songs/nine-lives.json",
    ]);
  });

  test("the playlist entry reads back as a song, with its offer", () => {
    const playlist = readPlaylist(
      { schemaVersion: 1, name: "Test", songs: [written.entry] },
      PLAYLIST_URL,
    );
    expect(playlist.problems).toEqual([]);
    const song = playlist.songs[0];
    expect(song.title).toBe("Nine Lives");
    expect(song.artist.name).toBe("The Example");
    expect(song.offer.instruments).toEqual([{ kind: "guitar", difficulties: ["expert"] }]);
    expect(song.offer.voice).toEqual({ chartType: "vocals", parts: 1 });
  });

  test("the documents read back into the same track the source was", () => {
    const playlist = readPlaylist(
      { schemaVersion: 1, name: "Test", songs: [written.entry] },
      PLAYLIST_URL,
    );
    const song = playlist.songs[0];
    const fileFor = (url: string) => byPath.get(url.replace(LIBRARY, ""));

    const read = readSongDoc(fileFor(song.doc), song.doc);
    expect(read.problems).toEqual([]);
    const doc = read.doc!;
    expect(doc.sections).toEqual(SOURCE.sections);

    const chart = sourceChartFor(doc, "guitar", "expert")!;
    expect(chartProblems(readChart(fileFor(chart.url), chart, "guitar").lane!).length).toBe(0);
    const lane = readChart(fileFor(chart.url), chart, "guitar").lane!;

    const voice = sourceChartFor(doc, "words", "normal")!;
    const melody = readChart(fileFor(voice.url), voice, "words").melody!;

    const fromFiles = { ...trackFromSource(SOURCE).track, charts: [lane], melody };
    // The reader numbers notes itself, so compare what the notes *are*.
    const shape = (chart: LaneChart) =>
      chart.notes.map(({ timeMs, lengthMs, kind, column, hero }) => ({ timeMs, lengthMs, kind, column, hero }));
    expect(shape(fromFiles.charts[0])).toEqual(shape(SOURCE.lanes[0]));
    const voiceShape = (melody: MelodyChart) => ({
      parts: melody.parts,
      hasPitch: melody.hasPitch,
      rows: melody.rows,
      rootMidi: melody.rootMidi,
      lines: melody.lines,
      notes: melody.notes.map(({ id: _id, ...rest }) => rest),
    });
    expect(voiceShape(fromFiles.melody!)).toEqual(voiceShape(SOURCE.melody!));
    expect(fromFiles.sections).toEqual(SOURCE.sections);
  });

  test("the song document carries the audio and the part controls", () => {
    const doc = byPath.get("songs/nine-lives.json") as Record<string, unknown>;
    expect(doc.schemaVersion).toBe(1);
    const audio = doc.audio as { preview?: string };
    // A jukebox clip is not a stem, and the document says where it is.
    expect(audio.preview).toBe("preview.ogg");
    const parts = doc.parts as { role: string; audioControl: { controlledStemIds?: string[] } | null }[];
    expect(parts[0].role).toBe("guitar");
    // Only the stems that *are* the instrument: the master is nobody's to drop.
    expect(parts[0].audioControl?.controlledStemIds).toEqual(["stem_lead_guitar"]);
  });

  test("a chart document carries phrases and the packed nothing else", () => {
    const chart = byPath.get("charts/nine-lives/guitar-expert.json") as Record<string, unknown>;
    expect(chart.phrases).toEqual([{ startMs: 1000, endMs: 3000 }]);
    expect((chart.notes as unknown[]).length).toBe(3);
  });

  test("a per-song layout writes the same documents into one folder", () => {
    const folder = "the-example-nine-lives";
    const out = writeSource(SOURCE, {
      song: () => `${folder}/song.json`,
      chart: (_id, instrument, difficulty) => `${folder}/${instrument}-${difficulty}.json`,
      voice: (_id, hasPitch) => `${folder}/${hasPitch ? "vocals" : "lyrics"}.json`,
      chartUrl: (_id, instrument, difficulty) => `${instrument}-${difficulty}.json`,
      voiceUrl: (_id, hasPitch) => `${hasPitch ? "vocals" : "lyrics"}.json`,
    });
    expect(out.files.map((file) => file.path).sort()).toEqual([
      `${folder}/guitar-expert.json`,
      `${folder}/song.json`,
      `${folder}/vocals.json`,
    ]);
    expect((out.entry as { song: string }).song).toBe(`${folder}/song.json`);

    const body = JSON.parse(
      out.files.find((file) => file.path.endsWith("/song.json"))!.body,
    ) as { parts: { role: string; charts: { url: string }[] }[] };
    const voice = body.parts.find((part) => part.role === "vocals")!;
    expect(voice.charts[0].url).toBe("vocals.json");

    const songUrl = `${LIBRARY}${folder}/song.json`;
    const read = readSongDoc(body, songUrl);
    expect(read.problems).toEqual([]);
    expect(sourceChartFor(read.doc!, "words", "normal")!.url).toBe(
      `${LIBRARY}${folder}/vocals.json`,
    );
  });
});

describe("a chart folder that calls its bass `rhythm.ogg`", () => {
  const BASS: LaneChart = { ...LANE, instrument: "bass" };
  const RHYTHM = {
    id: "stem_rhythm_guitar",
    name: "Rhythm",
    url: "rhythm.ogg",
    instrument: "rhythm_guitar" as const,
    defaultGainDb: 0,
    offsetMs: 0,
  };
  const withRhythm = (): ParsedSource => ({
    ...SOURCE,
    lanes: [LANE, BASS],
    audio: { ...SOURCE.audio, stems: [...SOURCE.audio.stems, RHYTHM] },
  });
  const stemsOf = (doc: ReturnType<typeof sourceToSongDoc>, role: string) =>
    doc.parts.find((part) => part.role === role)?.audioControl?.stems;

  test("a bass chart and no bass.ogg gives the second instrument file to the bass", () => {
    // Measured on a bass-led test song: `rhythm.ogg` is the bass track, so a missed guitar
    // note must not take it out.
    const doc = sourceToSongDoc(withRhythm());
    expect(stemsOf(doc, "guitar")).toEqual(["stem_lead_guitar"]);
    expect(stemsOf(doc, "bass")).toEqual(["stem_rhythm_guitar"]);
  });

  test("a bass.ogg present means the names mean what they say", () => {
    const source = withRhythm();
    const doc = sourceToSongDoc({
      ...source,
      audio: {
        ...source.audio,
        stems: [
          ...source.audio.stems,
          {
            id: "stem_bass",
            name: "Bass",
            url: "bass.ogg",
            instrument: "bass",
            defaultGainDb: 0,
            offsetMs: 0,
          },
        ],
      },
    });
    expect(stemsOf(doc, "guitar")).toEqual(["stem_lead_guitar", "stem_rhythm_guitar"]);
    expect(stemsOf(doc, "bass")).toEqual(["stem_bass"]);
  });

  test("a song with no bass chart keeps its rhythm file on the guitar", () => {
    const doc = sourceToSongDoc({ ...withRhythm(), lanes: [LANE] });
    expect(stemsOf(doc, "guitar")).toEqual(["stem_lead_guitar", "stem_rhythm_guitar"]);
  });
});

describe("a source with a lead and a rhythm guitar", () => {
  const LEAD: LaneChart = { ...LANE, role: "lead" };
  const RHYTHM: LaneChart = { ...LANE, role: "rhythm" };
  const written = writeSource({ ...SOURCE, lanes: [LEAD, RHYTHM] });
  const byPath = new Map(written.files.map((file) => [file.path, JSON.parse(file.body) as unknown]));

  test("writes a chart a role, so neither overwrites the other", () => {
    expect(written.files.map((file) => file.path).sort()).toEqual([
      "charts/nine-lives/guitar-lead-expert.json",
      "charts/nine-lives/guitar-rhythm-expert.json",
      "charts/nine-lives/vocals.json",
      "songs/nine-lives.json",
    ]);
    expect(byPath.get("charts/nine-lives/guitar-lead-expert.json")).toMatchObject({ role: "lead" });
    expect(byPath.get("charts/nine-lives/guitar-rhythm-expert.json")).toMatchObject({ role: "rhythm" });
  });

  test("writes a song part per role, and offers both", () => {
    const doc = byPath.get("songs/nine-lives.json") as {
      parts: { id: string; role: string }[];
    };
    expect(doc.parts.filter((part) => part.role.endsWith("guitar"))).toEqual([
      expect.objectContaining({ id: "part_lead_guitar", role: "lead_guitar" }),
      expect.objectContaining({ id: "part_rhythm_guitar", role: "rhythm_guitar" }),
    ]);

    const playlist = readPlaylist(
      { schemaVersion: 1, name: "Test", songs: [written.entry] },
      PLAYLIST_URL,
    );
    expect(playlist.songs[0].offer.instruments).toEqual([
      { kind: "guitar", role: "lead", difficulties: ["expert"] },
      { kind: "guitar", role: "rhythm", difficulties: ["expert"] },
    ]);
  });

  test("a chart folder with both guitar stems gives each role its own, so one miss cannot mute the other", () => {
    const source: ParsedSource = {
      ...SOURCE,
      lanes: [LEAD, RHYTHM],
      audio: {
        ...SOURCE.audio,
        stems: [
          ...SOURCE.audio.stems,
          {
            id: "stem_rhythm_guitar",
            name: "Rhythm Guitar",
            url: "rhythm.ogg",
            instrument: "rhythm_guitar",
            defaultGainDb: 0,
            offsetMs: 0,
          },
        ],
      },
    };
    const doc = sourceToSongDoc(source);
    const stemsOf = (role: string) =>
      doc.parts.find((part) => part.role === role)?.audioControl?.stems;
    expect(stemsOf("lead_guitar")).toEqual(["stem_lead_guitar"]);
    expect(stemsOf("rhythm_guitar")).toEqual(["stem_rhythm_guitar"]);
  });

  test("each role reads back as its own chart", () => {
    const playlist = readPlaylist(
      { schemaVersion: 1, name: "Test", songs: [written.entry] },
      PLAYLIST_URL,
    );
    const song = playlist.songs[0];
    const fileFor = (url: string) => byPath.get(url.replace(LIBRARY, ""));
    const read = readSongDoc(fileFor(song.doc), song.doc);
    expect(read.problems).toEqual([]);

    const lead = sourceChartFor(read.doc!, "guitar", "expert", "lead")!;
    const rhythm = sourceChartFor(read.doc!, "guitar", "expert", "rhythm")!;
    expect(lead.url).toContain("guitar-lead-expert.json");
    expect(rhythm.url).toContain("guitar-rhythm-expert.json");
    expect(readChart(fileFor(lead.url), lead, "guitar").lane?.role).toBe("lead");
    expect(readChart(fileFor(rhythm.url), rhythm, "guitar").lane?.role).toBe("rhythm");
  });
});

describe("a drum chart's fills", () => {
  const chart: LaneChart = {
    instrument: "drums",
    difficulty: "expert",
    columns: 6,
    fills: [{ startMs: 500, endMs: 1500 }],
    notes: [
      { id: "d-0", timeMs: 0, lengthMs: 0, kind: "strum", column: 5, hero: false },
      { id: "d-1", timeMs: 500, lengthMs: 0, kind: "strum", column: 0, hero: false },
    ],
  };
  const meta = {
    id: "kit-drums-expert",
    chartType: "drums" as const,
    difficulty: "expert" as const,
    url: "https://everythingstar.test/library/charts/kit/drums-expert.json",
    columns: 6,
    bpm: null,
    offsetMs: 0,
  };

  test("are written into the chart document and read back", () => {
    const json = chartJson(chart) as Record<string, unknown>;
    expect(json.fills).toEqual([{ startMs: 500, endMs: 1500 }]);
    const read = readChart(json, meta, "drums");
    expect(read.problems).toEqual([]);
    expect(read.lane?.columns).toBe(6);
    expect(read.lane?.fills).toEqual([{ startMs: 500, endMs: 1500 }]);
    // The kick is a note like any other on the document: column 5 of six.
    expect(read.lane?.notes.map((note) => note.column)).toEqual([5, 0]);
    expect(chartProblems(read.lane!)).toEqual([]);
  });

  test("a chart with no fills carries none rather than an empty list", () => {
    const json = chartJson({ ...chart, fills: undefined }) as Record<string, unknown>;
    expect(json.fills).toBeUndefined();
    expect(readChart(json, meta, "drums").lane?.fills).toBeUndefined();
  });

  test("a fill with no length is dropped, and a guitar chart's is ignored", () => {
    const read = readChart(
      { schemaVersion: 1, chartType: "drums", columns: 6, fills: [{ startMs: 900, endMs: 900 }], notes: [] },
      meta,
      "drums",
    );
    expect(read.lane?.fills).toBeUndefined();
    const guitar = readChart(
      { schemaVersion: 1, chartType: "lanes", columns: 5, fills: [{ startMs: 0, endMs: 100 }], notes: [] },
      { ...meta, id: "kit-guitar-expert", chartType: "lanes", columns: 5 },
      "guitar",
    );
    expect(guitar.lane?.fills).toBeUndefined();
  });
});

describe("trackFromSource", () => {
  test("a source's chart is validated at runtime too, and dropped when it fails", () => {    // A folder or a `.sng` never writes documents: its track comes straight from the
    // parsed source, so the same gate has to be on this path as on the fetched one.
    const source: ParsedSource = {
      ...SOURCE,
      lanes: [LANE, { ...LANE, difficulty: "hard", bpm: 0 }],
    };
    const built = trackFromSource(source);
    expect(built.track.charts.map((chart) => chart.difficulty)).toEqual(["expert"]);
    expect(built.problems).toEqual(["guitar/hard: bpm must be greater than 0"]);
  });

  test("a playable source comes through untouched and unremarked", () => {
    const built = trackFromSource(SOURCE);
    expect(built.problems).toEqual([]);
    expect(built.track.charts).toHaveLength(1);
    expect(chartProblems(built.track.charts[0])).toEqual([]);
  });
});
