import { describe, expect, test } from "bun:test";
import { chartProblems, type LaneChart, type LaneNote, type MelodyChart } from "./track";
import {
  assembleTrack,
  fullMixStems,
  offerFromDoc,
  previewFor,
  readChart,
  readSongDoc,
  sourceChartFor,
  trackDuration,
  wantedCharts,
  type SourceChart,
  type SourceSongDoc,
  type SourceStem,
} from "./source";
import { SONG_TAIL_MS } from "./sources/duration";

const SONG_URL = "https://everythingstar.test/playlist/songs/song_example.json";

const laneChart = (over: Partial<SourceChart> = {}): SourceChart => ({
  id: "c_lead_gtr_expert",
  chartType: "lanes",
  difficulty: "expert",
  url: "https://everythingstar.test/playlist/charts/lead_guitar/expert.json",
  columns: 5,
  bpm: 120,
  offsetMs: 0,
  ...over,
});

describe("readSongDoc", () => {
  test("reads a song: its parts, where their charts are, and its audio", () => {
    const read = readSongDoc(
      {
        schemaVersion: 1,
        id: "song_example",
        title: "Example Song",
        artist: { id: "artist_1", name: "Example Artist" },
        album: { id: "album_1", name: "Example Album", year: 2007 },
        durationMs: 240000,
        previewStartMs: 45000,
        audio: {
          stems: [
            { id: "stem_master", name: "Master", url: "audio/master.ogg" },
            {
              id: "stem_lead_guitar",
              name: "Lead Guitar",
              url: "audio/lead_guitar.ogg",
              instrument: "lead_guitar",
              defaultGainDb: -2,
            },
          ],
          mixPresets: { full: { stemIds: ["stem_master"] } },
          preview: "audio/preview.ogg",
        },
        parts: [
          {
            id: "part_lead_guitar",
            role: "lead_guitar",
            label: "Lead Guitar",
            controllerTypes: ["guitar_controller"],
            audioControl: {
              controlledStemIds: ["stem_lead_guitar"],
              onHit: { action: "unmute", fadeMs: 20 },
              onMiss: { action: "mute", fadeMs: 80, restore: "next_hit" },
            },
            charts: [
              {
                id: "c_lead_gtr_expert",
                difficulty: "expert",
                chartType: "lanes",
                laneCount: 5,
                url: "charts/lead_guitar/expert.json",
                bpm: 120,
              },
            ],
          },
          {
            id: "part_vocals",
            role: "vocals",
            label: "Vocals",
            controllerTypes: ["microphone"],
            charts: [{ id: "c_vocals", chartType: "vocals", url: "charts/vocals.json" }],
          },
        ],
      },
      SONG_URL,
    );

    expect(read.problems).toEqual([]);
    const doc = read.doc;
    expect(doc?.id).toBe("song_example");
    expect(doc?.durationMs).toBe(240000);
    // Every file it names is resolved against the song's own URL — which is
    // `.../songs/`, so a chart beside the song comes out as `.../songs/charts/...`.
    expect(doc?.parts[0].charts[0].url).toBe(
      "https://everythingstar.test/playlist/songs/charts/lead_guitar/expert.json",
    );
    expect(doc?.parts[0].charts[0].columns).toBe(5);
    expect(doc?.parts[0].audioControl?.onMiss?.restore).toBe("next_hit");
    expect(doc?.audio.source).toBe("stems");
    expect(doc?.audio.stems[0].url).toBe(
      "https://everythingstar.test/playlist/songs/audio/master.ogg",
    );
    expect(doc?.audio.stems[1].instrument).toBe("lead_guitar");
    expect(doc?.audio.mixPresets).toEqual([{ id: "full", stemIds: ["stem_master"] }]);
    // The jukebox clip is resolved like every other file the song names.
    expect(doc?.audio.preview).toBe(
      "https://everythingstar.test/playlist/songs/audio/preview.ogg",
    );
    // The voice is one part with one chart, and no level: a singer's level is the
    // microphone's tolerance, the same on every song.
    expect(doc?.parts[1].role).toBe("vocals");
    expect(doc?.parts[1].charts[0].difficulty).toBeNull();
  });

  test("a highway chart needs a level and a lane count; the voice needs neither", () => {
    const read = readSongDoc(
      {
        schemaVersion: 1,
        id: "a",
        title: "A",
        parts: [
          { role: "bass", charts: [{ chartType: "lanes", url: "c.json" }] },
          { role: "vocals", charts: [{ chartType: "lyrics", url: "v.json" }] },
        ],
      },
      SONG_URL,
    );
    expect(read.problems.some((problem) => problem.includes("difficulty"))).toBe(true);
    expect(read.doc?.parts.map((part) => part.role)).toEqual(["vocals"]);
  });

  test("a voice chart on an instrument is refused, and the other way round", () => {
    const read = readSongDoc(
      {
        schemaVersion: 1,
        id: "a",
        title: "A",
        parts: [
          { role: "guitar", charts: [{ chartType: "vocals", url: "v.json" }] },
          {
            role: "vocals",
            charts: [{ chartType: "lanes", url: "c.json", laneCount: 5, difficulty: "hard" }],
          },
        ],
      },
      SONG_URL,
    );
    expect(read.problems).toHaveLength(4);
    expect(read.doc?.parts).toEqual([]);
  });

  test("a YouTube-backed song has no stems, and its video is the music", () => {
    const read = readSongDoc(
      {
        schemaVersion: 1,
        id: "yt_example",
        title: "YouTube Song",
        durationMs: 180000,
        video: { kind: "youtube", id: "dQw4w9WgXcQ" },
        audio: { source: "youtube" },
        parts: [
          {
            id: "part_vocals",
            role: "vocals",
            charts: [{ chartType: "lyrics", url: "vocals.json" }],
          },
        ],
      },
      SONG_URL,
    );
    expect(read.problems).toEqual([]);
    expect(read.doc?.audio.source).toBe("youtube");
    expect(read.doc?.audio.stems).toEqual([]);
    expect(read.doc?.video).toEqual({ kind: "youtube", id: "dQw4w9WgXcQ" });
  });

  test("a YouTube audio source with no YouTube video says so", () => {
    const read = readSongDoc(
      {
        schemaVersion: 1,
        id: "yt_example",
        title: "YouTube Song",
        audio: { source: "youtube" },
      },
      SONG_URL,
    );
    expect(read.doc?.audio.source).toBe("youtube");
    expect(read.problems.some((problem) => problem.includes("YouTube video"))).toBe(true);
  });

  test("a document that is not a song comes back empty", () => {
    expect(readSongDoc({ schemaVersion: 2, id: "a", title: "A" }, SONG_URL).doc).toBeNull();
    expect(readSongDoc({ id: "a" }, SONG_URL).doc).toBeNull();
  });

  test("a ref a remote song document cannot name is skipped, and named", () => {
    const read = readSongDoc(
      {
        schemaVersion: 1,
        id: "a",
        title: "A",
        art: "javascript:alert(1)",
        video: { kind: "video", url: "folder://room/clip.mp4" },
        audio: {
          stems: [
            { id: "stem_master", url: "data:audio/ogg;base64,AA" },
            { id: "stem_guitar", url: "audio/guitar.ogg", instrument: "lead_guitar" },
          ],
          preview: "file:///preview.ogg",
        },
        parts: [
          {
            role: "guitar",
            charts: [
              {
                chartType: "lanes",
                difficulty: "hard",
                laneCount: 5,
                url: "javascript:alert(1)",
              },
              { chartType: "lanes", difficulty: "easy", laneCount: 5, url: "chart.json" },
            ],
          },
        ],
      },
      SONG_URL,
    );
    // Every file a song names is a fetch or a picture, and a remote document may only
    // name http(s): anything else is skipped rather than offered and then refused.
    expect(read.doc?.art).toBeNull();
    expect(read.doc?.video).toBeNull();
    expect(read.doc?.audio.stems.map((stem) => stem.id)).toEqual(["stem_guitar"]);
    expect(read.doc?.audio.preview).toBeNull();
    expect(read.doc?.parts[0].charts.map((chart) => chart.difficulty)).toEqual(["easy"]);
    // The relative chart still resolves against the song document that wrote it.
    expect(read.doc?.parts[0].charts[0].url).toBe(
      "https://everythingstar.test/playlist/songs/chart.json",
    );
    expect(read.problems.filter((problem) => problem.includes("will fetch"))).toHaveLength(5);
  });

  test("a local song document keeps its refs as they are", () => {
    // A folder is not fetched: the browser resolves its files, so the http(s) rule
    // says nothing about them.
    const read = readSongDoc(
      {
        schemaVersion: 1,
        id: "a",
        title: "A",
        audio: { stems: [{ id: "stem_master", url: "javascript:alert(1)" }] },
      },
      "folder://library/song.json",
    );
    expect(read.doc?.audio.stems[0].url).toBe("javascript:alert(1)");
    expect(read.problems).toEqual([]);
  });

  test("reads the song's sections, in time order, dropping the untimed ones", () => {
    const read = readSongDoc(
      {
        schemaVersion: 1,
        id: "a",
        title: "A",
        parts: [],
        sections: [
          { timeMs: 8000, name: "Chorus 1" },
          { timeMs: 0, name: "Intro" },
          { name: "No time" },
          { timeMs: 100 },
        ],
      },
      SONG_URL,
    );
    expect(read.doc?.sections).toEqual([
      { timeMs: 0, name: "Intro" },
      { timeMs: 8000, name: "Chorus 1" },
    ]);
  });
});

describe("sourceChartFor", () => {
  const doc = readSongDoc(
    {
      schemaVersion: 1,
      id: "a",
      title: "A",
      parts: [
        {
          role: "guitar",
          charts: [
            { chartType: "lanes", difficulty: "easy", laneCount: 3, url: "easy.json" },
            { chartType: "lanes", difficulty: "hard", laneCount: 5, url: "hard.json" },
          ],
        },
        { role: "vocals", charts: [{ chartType: "vocals", url: "vocals.json" }] },
      ],
    },
    SONG_URL,
  ).doc;

  test("hands back the chart at the level asked for", () => {
    expect(sourceChartFor(doc!, "guitar", "hard")?.url).toContain("hard.json");
  });

  test("a level the song does not carry settles on the nearest it has", () => {
    expect(sourceChartFor(doc!, "guitar", "normal")?.difficulty).toBe("easy");
    expect(sourceChartFor(doc!, "guitar", "expert")?.difficulty).toBe("hard");
  });

  test("nothing at all for a part the song has none of", () => {
    expect(sourceChartFor(doc!, "drums", "normal")).toBeNull();
    expect(sourceChartFor(doc!, "words", "normal")?.chartType).toBe("vocals");
  });
});

describe("a song with a lead and a rhythm guitar", () => {
  const doc = readSongDoc(
    {
      schemaVersion: 1,
      id: "a",
      title: "A",
      parts: [
        {
          role: "lead_guitar",
          charts: [
            { chartType: "lanes", difficulty: "easy", laneCount: 5, url: "lead-easy.json" },
            { chartType: "lanes", difficulty: "hard", laneCount: 5, url: "lead-hard.json" },
          ],
        },
        {
          role: "rhythm_guitar",
          charts: [
            { chartType: "lanes", difficulty: "hard", laneCount: 5, url: "rhythm-hard.json" },
          ],
        },
      ],
    },
    SONG_URL,
  ).doc!;

  test("the offer keeps both roles, and their own levels", () => {
    expect(offerFromDoc(doc).instruments).toEqual([
      { kind: "guitar", role: "lead", difficulties: ["easy", "hard"] },
      { kind: "guitar", role: "rhythm", difficulties: ["hard"] },
    ]);
  });

  test("a seat bound to a role gets that role's chart", () => {
    expect(sourceChartFor(doc, "guitar", "hard", "lead")?.url).toContain("lead-hard.json");
    expect(sourceChartFor(doc, "guitar", "hard", "rhythm")?.url).toContain("rhythm-hard.json");
    // A roleless seat on a song carrying both takes the lead.
    expect(sourceChartFor(doc, "guitar", "hard")?.url).toContain("lead-hard.json");
  });

  test("two guitar seats at one level ask for two charts", () => {
    const wanted = wantedCharts(doc, [
      { kind: "guitar", difficulty: "hard", role: "lead" },
      { kind: "guitar", difficulty: "hard", role: "rhythm" },
    ]);
    expect(wanted.map((entry) => entry.chart.url).sort()).toEqual([
      "https://everythingstar.test/playlist/songs/lead-hard.json",
      "https://everythingstar.test/playlist/songs/rhythm-hard.json",
    ]);
  });
});

describe("wantedCharts", () => {
  const doc = readSongDoc(
    {
      schemaVersion: 1,
      id: "a",
      title: "A",
      parts: [
        {
          role: "guitar",
          charts: [
            { chartType: "lanes", difficulty: "hard", laneCount: 5, url: "hard.json" },
          ],
        },
        { role: "vocals", charts: [{ chartType: "vocals", url: "vocals.json" }] },
      ],
    },
    SONG_URL,
  ).doc!;

  test("a Listen run asks for the document's voice chart with no seats", () => {
    // The document offers a voice, even if a stale playlist summary did not.
    expect(offerFromDoc(doc).voice).not.toBeNull();
    const wanted = wantedCharts(doc, []);
    expect(wanted).toHaveLength(1);
    expect(wanted[0].kind).toBe("words");
    expect(wanted[0].chart.chartType).toBe("vocals");
    expect(wanted[0].chart.url).toContain("vocals.json");
  });

  test("a band asks for its own seats and never adds the voice", () => {
    const wanted = wantedCharts(doc, [{ kind: "guitar", difficulty: "normal" }]);
    expect(wanted).toHaveLength(1);
    expect(wanted[0].kind).toBe("guitar");
    expect(wanted[0].chart.difficulty).toBe("hard");
  });
});

describe("offerFromDoc", () => {
  test("reads the modes from the document, not a stale summary", () => {
    const doc: SourceSongDoc = {
      id: "song",
      title: "Song",
      artist: { id: "a", name: "Artist", art: null },
      album: null,
      art: null,
      durationMs: 1000,
      previewStartMs: 0,
      video: null,
      audio: { source: "stems", stems: [], mixPresets: [], preview: null },
      sections: [],
      parts: [
        {
          id: "part_vocals",
          role: "vocals",
          label: null,
          controllerTypes: [],
          audioControl: null,
          charts: [
            {
              ...laneChart({ chartType: "vocals", difficulty: null }),
              columns: null,
            },
          ],
        },
        {
          id: "part_lead",
          role: "lead_guitar",
          label: null,
          controllerTypes: [],
          audioControl: null,
          charts: [
            laneChart({ difficulty: "normal" }),
            laneChart({ difficulty: "hard", url: "charts/lead/hard.json" }),
          ],
        },
      ],
    };

    expect(offerFromDoc(doc)).toEqual({
      instruments: [{ kind: "guitar", role: "lead", difficulties: ["normal", "hard"] }],
      voice: { chartType: "vocals", parts: 1 },
    });
    expect(
      offerFromDoc(doc, { instruments: [], voice: { chartType: "lyrics", parts: 2 } })
        .voice,
    ).toEqual({ chartType: "vocals", parts: 2 });
  });
});

describe("readChart", () => {
  test("reads a highway, numbering the notes itself and taking the kit's kind", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "lanes",
        columns: 5,
        notes: [
          { timeMs: 3400, lengthMs: 0, kind: "strum", column: null },
          { timeMs: 1500, lengthMs: 700, kind: "strum", column: 2, hero: true },
          { timeMs: 2120, lengthMs: 0, kind: "hopo", column: 2 },
        ],
      },
      laneChart(),
      "guitar",
    );
    expect(read.problems).toEqual([]);
    const chart = read.lane as LaneChart;
    expect(chart.instrument).toBe("guitar");
    expect(chart.difficulty).toBe("expert");
    expect(chart.columns).toBe(5);
    // Sorted, whatever order the file wrote them in, and with ids of our own.
    expect(chart.notes.map((note) => note.timeMs)).toEqual([1500, 2120, 3400]);
    expect(chart.notes.map((note) => note.id)).toEqual([
      "c_lead_gtr_expert:0",
      "c_lead_gtr_expert:1",
      "c_lead_gtr_expert:2",
    ]);
    expect(chart.notes[0].hero).toBe(true);
    expect(chart.notes[2].column).toBeNull();
    expect(chartProblems(chart)).toEqual([]);
  });

  test("reads the chart's energy phrases, offset like its notes", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "lanes",
        columns: 5,
        notes: [],
        phrases: [
          { startMs: 4000, endMs: 6000 },
          { startMs: 1000, endMs: 2000 },
        ],
      },
      laneChart({ offsetMs: 500 }),
      "guitar",
    );
    expect(read.lane?.phrases).toEqual([
      { startMs: 1500, endMs: 2500 },
      { startMs: 4500, endMs: 6500 },
    ]);
    expect(chartProblems(read.lane as LaneChart)).toEqual([]);
  });

  test("a chart with no phrases carries none rather than an empty list", () => {
    const read = readChart(
      { schemaVersion: 1, chartType: "lanes", columns: 5, notes: [] },
      laneChart(),
      "guitar",
    );
    expect(read.lane?.phrases).toBeUndefined();
  });

  test("reads a drum chart's fills, offset like its notes, and only on drums", () => {
    const body = {
      schemaVersion: 1,
      chartType: "drums",
      columns: 6,
      notes: [{ timeMs: 0, column: 5 }],
      fills: [{ startMs: 1000, endMs: 2000 }],
    };
    const read = readChart(
      body,
      laneChart({ id: "c_drums_expert", chartType: "drums", columns: 6, offsetMs: 500 }),
      "drums",
    );
    expect(read.lane?.fills).toEqual([{ startMs: 1500, endMs: 2500 }]);
    expect(read.lane?.notes[0].column).toBe(5);
    expect(chartProblems(read.lane as LaneChart)).toEqual([]);
    // The same spans on a guitar are not a thing the game has.
    const guitar = readChart(
      { ...body, chartType: "lanes" },
      laneChart({ columns: 6 }),
      "guitar",
    );
    expect(guitar.lane?.fills).toBeUndefined();
  });

  test("a note with no kind is a strum, whatever the instrument", () => {    const read = readChart(
      { schemaVersion: 1, chartType: "lanes", columns: 4, notes: [{ timeMs: 100, column: 1 }] },
      laneChart({ chartType: "lanes", difficulty: "normal", columns: 4 }),
      "keys",
    );
    expect(read.lane?.notes[0].kind).toBe("strum");
  });

  test("a tapped instrument's notes load as strums, even when the file says hopo", () => {
    // A key is pressed, not strummed: the instrument's own play style decides how
    // the note is hit. The chart still carries ordinary strum notes.
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "lanes",
        columns: 4,
        notes: [
          { timeMs: 100, column: 0, kind: "strum" },
          { timeMs: 200, column: 1, kind: "hopo" },
          { timeMs: 300, column: 2 },
        ],
      },
      laneChart({ chartType: "lanes", difficulty: "normal", columns: 4 }),
      "keys",
    );
    expect(read.lane?.notes.map((note) => note.kind)).toEqual(["strum", "strum", "strum"]);
    expect(chartProblems(read.lane as LaneChart)).toEqual([]);
  });

  test("a guitar chart that opens on a hopo keeps the chart, and only that first note changes", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "lanes",
        columns: 5,
        notes: [
          { timeMs: 100, column: 0, kind: "hopo" },
          { timeMs: 200, column: 1, kind: "hopo" },
          { timeMs: 300, column: 2, kind: "tap" },
        ],
      },
      laneChart({ difficulty: "normal" }),
      "guitar",
    );
    expect(read.lane?.notes.map((note) => note.kind)).toEqual(["strum", "hopo", "strum"]);
    expect(chartProblems(read.lane as LaneChart)).toEqual([]);
  });

  test("a chart wrong in a way the instrument cannot fix is still refused", () => {
    // Coercing the kind must not paper over a real error: an open note needs a
    // strummed highway, and a tapped kit has none.
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "lanes",
        columns: 4,
        notes: [{ timeMs: 100, column: null, kind: "strum" }],
      },
      laneChart({ chartType: "lanes", difficulty: "normal", columns: 4 }),
      "keys",
    );
    expect(read.lane?.notes[0].kind).toBe("strum");
    expect(chartProblems(read.lane as LaneChart)).toEqual([
      `note ${read.lane?.notes[0].id} is an open note on a tapped instrument`,
    ]);
  });

  test("the chart's own offset is applied to its notes", () => {
    const read = readChart(
      { schemaVersion: 1, chartType: "lanes", columns: 5, notes: [{ timeMs: 1000, column: 0 }] },
      laneChart({ offsetMs: -200 }),
      "guitar",
    );
    expect(read.lane?.notes[0].timeMs).toBe(800);
  });

  test("a document's slide links the two notes it names", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "lanes",
        columns: 5,
        notes: [
          { timeMs: 1500, lengthMs: 300, column: 0 },
          { timeMs: 2250, lengthMs: 0, column: 2 },
        ],
        slides: [{ fromTimeMs: 1500, fromColumn: 0, toTimeMs: 2250, toColumn: 2 }],
      },
      laneChart(),
      "guitar",
    );
    expect(read.problems).toEqual([]);
    const notes = read.lane!.notes;
    expect(notes[0].slideTo).toBe(notes[1].id);
    // The link is a note id in memory, and both ends keep their own identity.
    expect(notes[1].slideTo).toBeUndefined();
    expect(chartProblems(read.lane as LaneChart)).toEqual([]);
  });

  test("the chart's offset moves the link with its notes", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "lanes",
        columns: 5,
        notes: [
          { timeMs: 1000, lengthMs: 0, column: 0 },
          { timeMs: 2000, lengthMs: 0, column: 2 },
        ],
        slides: [{ fromTimeMs: 1000, fromColumn: 0, toTimeMs: 2000, toColumn: 2 }],
      },
      laneChart({ offsetMs: 500 }),
      "guitar",
    );
    expect(read.problems).toEqual([]);
    expect(read.lane?.notes.map((note) => note.timeMs)).toEqual([1500, 2500]);
    expect(read.lane?.notes[0].slideTo).toBe(read.lane?.notes[1].id);
  });

  test("a bad link is named and dropped, and the rest of the chart survives", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "lanes",
        columns: 5,
        notes: [
          { timeMs: 1000, column: 0 },
          { timeMs: 2000, column: 2 },
          { timeMs: 3000, column: 2 },
          { timeMs: 4000, column: null },
          { timeMs: 5000, column: 0 },
        ],
        slides: [
          // A valid link, from the first note to the second.
          { fromTimeMs: 1000, fromColumn: 0, toTimeMs: 2000, toColumn: 2 },
          // Along one column, backwards, and from an open note: all refused.
          { fromTimeMs: 2000, fromColumn: 2, toTimeMs: 3000, toColumn: 2 },
          { fromTimeMs: 3000, fromColumn: 2, toTimeMs: 2000, toColumn: 2 },
          { fromTimeMs: 4000, fromColumn: null, toTimeMs: 5000, toColumn: 0 },
          // A coordinate no note sits on.
          { fromTimeMs: 9000, fromColumn: 0, toTimeMs: 2000, toColumn: 2 },
        ],
      },
      laneChart(),
      "guitar",
    );
    const chart = read.lane as LaneChart;
    expect(chart.notes).toHaveLength(5);
    // The one playable link is the one that stays, on the note it left.
    expect(chart.notes.filter((note) => note.slideTo !== undefined).map((note) => note.id)).toEqual([
      chart.notes[0].id,
    ]);
    expect(chart.notes[0].slideTo).toBe(chart.notes[1].id);
    expect(read.problems.some((problem) => problem.includes("is not a note"))).toBe(true);
    expect(read.problems.some((problem) => problem.includes("open note that slides"))).toBe(true);
    expect(read.problems.some((problem) => problem.includes("along its own column"))).toBe(true);
    expect(read.problems.some((problem) => problem.includes("not after it"))).toBe(true);
    expect(chartProblems(chart)).toEqual([]);
  });

  test("a coordinate on a cell two notes share is ambiguous, and named", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "lanes",
        columns: 5,
        notes: [
          { timeMs: 1000, column: 0 },
          { timeMs: 1000, column: 0 },
          { timeMs: 2000, column: 2 },
        ],
        slides: [{ fromTimeMs: 1000, fromColumn: 0, toTimeMs: 2000, toColumn: 2 }],
      },
      laneChart(),
      "guitar",
    );
    expect(read.problems.some((problem) => problem.includes("more than one note"))).toBe(true);
    expect(read.lane?.notes.every((note) => note.slideTo === undefined)).toBe(true);
  });

  test("a chart with no slides carries no links", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "lanes",
        columns: 5,
        notes: [
          { timeMs: 1000, column: 0 },
          { timeMs: 2000, column: 2 },
        ],
      },
      laneChart(),
      "guitar",
    );
    expect(read.problems).toEqual([]);
    expect(read.lane?.notes.every((note) => note.slideTo === undefined)).toBe(true);
  });

  test("a note that cannot be placed is dropped, and named", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "lanes",
        columns: 5,
        notes: [{ timeMs: 100, column: 0 }, { column: 1 }],
      },
      laneChart(),
      "guitar",
    );
    expect(read.lane?.notes).toHaveLength(1);
    expect(read.problems[0]).toContain("no time");
  });

  test("a note outside the chart's own columns is dropped, and named", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "lanes",
        columns: 5,
        notes: [
          { timeMs: 100, column: 4 },
          { timeMs: 200, column: 5 },
          { timeMs: 300, column: -1 },
          { timeMs: 400, column: null },
        ],
      },
      laneChart(),
      "guitar",
    );
    // The last column is a real one, a null column is the open note, and the two
    // outside the highway are not loaded at all.
    expect(read.lane?.notes.map((note) => note.column)).toEqual([4, null]);
    expect(read.problems).toEqual([
      "c_lead_gtr_expert: a note outside the 5 columns",
      "c_lead_gtr_expert: a note outside the 5 columns",
    ]);
    expect(chartProblems(read.lane as LaneChart)).toEqual([]);
  });

  test("a chart with no known column count bounds nothing", () => {
    // Zero is "unknown" rather than "no columns": a note it cannot place is kept
    // instead of being judged against a bound somebody invented.
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "lanes",
        columns: 0,
        notes: [{ timeMs: 100, column: 99 }],
      },
      laneChart({ columns: 0 }),
      "guitar",
    );
    expect(read.lane?.notes.map((note) => note.column)).toEqual([99]);
    expect(read.problems).toEqual([]);
  });

  test("a highway chart where the voice was expected is refused, and the other way round", () => {
    const wrong = readChart(
      { schemaVersion: 1, chartType: "lanes", columns: 5, notes: [] },
      laneChart(),
      "words",
    );
    expect(wrong.lane).toBeNull();
    expect(wrong.problems[0]).toContain("on the voice");
  });

  test("reads the melody: its roll, its parts, its words and their pitch", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "vocals",
        rows: 6,
        rootMidi: 57,
        parts: 2,
        lines: [
          {
            timeMs: 4200,
            endMs: 6000,
            parts: [{ part: 0, offset: 0 }, { part: 1, offset: 1 }],
            words: [
              { text: "turn", timeMs: 50, hero: false },
              { text: "up", timeMs: 400, hero: true },
            ],
          },
        ],
        notes: [
          { timeMs: 4250, lengthMs: 300, part: 0, row: 3, text: "turn" },
          { timeMs: 4600, lengthMs: 200, part: 1, row: 4, text: "up", hero: true },
        ],
      },
      laneChart({ chartType: "vocals", difficulty: null }),
      "words",
    );
    expect(read.problems).toEqual([]);
    const melody = read.melody as MelodyChart;
    expect(melody.parts).toBe(2);
    expect(melody.hasPitch).toBe(true);
    expect(melody.rows).toBe(6);
    expect(melody.rootMidi).toBe(57);
    expect(melody.lines[0].words.map((word) => word.text)).toEqual(["turn", "up"]);
    expect(melody.lines[0].words[1].hero).toBe(true);
    expect(melody.notes.map((note) => note.row)).toEqual([3, 4]);
    expect(melody.notes[1].part).toBe(1);
  });

  test("shares a fourth voice on the last part instead of dropping it", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "vocals",
        rows: 6,
        rootMidi: 57,
        parts: 4,
        lines: [
          {
            timeMs: 1000,
            endMs: 2000,
            parts: [{ part: 3, offset: 0 }],
            words: [{ text: "four", timeMs: 0, hero: false }],
          },
        ],
        notes: [
          { timeMs: 1000, lengthMs: 300, part: 3, row: 3, text: "four" },
        ],
      },
      laneChart({ chartType: "vocals", difficulty: null }),
      "words",
    );
    const melody = read.melody as MelodyChart;
    expect(melody.parts).toBe(3);
    expect(melody.notes[0].part).toBe(2);
    expect(melody.lines[0].parts[0].part).toBe(2);
    expect(read.problems.join(" ")).toMatch(/share the last part/);
  });

  test("a declared fourth part with no words on it needs no warning", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "vocals",
        rows: 6,
        rootMidi: 57,
        parts: 4,
        lines: [
          {
            timeMs: 1000,
            endMs: 2000,
            parts: [{ part: 0, offset: 0 }],
            words: [{ text: "one", timeMs: 0, hero: false }],
          },
        ],
        notes: [
          { timeMs: 1000, lengthMs: 300, part: 0, row: 3, text: "one" },
        ],
      },
      laneChart({ chartType: "vocals", difficulty: null }),
      "words",
    );
    expect(read.melody?.parts).toBe(3);
    expect(read.problems).toEqual([]);
  });

  test("a vocals chart keeps a freeform note's null row", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "vocals",
        rows: 6,
        rootMidi: 57,
        parts: 1,
        lines: [
          {
            timeMs: 1000,
            endMs: 1800,
            parts: [{ part: 0, offset: 0 }],
            words: [{ text: "spoken", timeMs: 0, hero: false }],
          },
        ],
        notes: [
          { timeMs: 1000, lengthMs: 300, part: 0, row: null, text: "spoken" },
        ],
      },
      laneChart({ chartType: "vocals", difficulty: null }),
      "words",
    );
    expect(read.problems).toEqual([]);
    expect(read.melody?.hasPitch).toBe(true);
    expect(read.melody?.notes[0].row).toBeNull();
  });

  test("a lyrics chart carries words with no pitch at all", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "lyrics",
        lines: [
          {
            timeMs: 1000,
            endMs: 2000,
            parts: [{ part: 0, offset: 0 }],
            words: [{ text: "hello", timeMs: 0 }],
          },
        ],
      },
      laneChart({ chartType: "lyrics", difficulty: null }),
      "words",
    );
    expect(read.melody?.hasPitch).toBe(false);
    expect(read.melody?.lines[0].words[0].text).toBe("hello");
  });

  test("a word above the roll is dropped, and named", () => {
    const read = readChart(
      {
        schemaVersion: 1,
        chartType: "vocals",
        rows: 6,
        rootMidi: 57,
        lines: [],
        notes: [{ timeMs: 0, part: 0, row: 99, text: "high" }],
      },
      laneChart({ chartType: "vocals", difficulty: null }),
      "words",
    );
    expect(read.melody?.notes).toEqual([]);
    expect(read.problems[0]).toContain("roll");
  });
});

describe("assembleTrack", () => {
  test("carries the song's sections onto the track", () => {
    const read = readSongDoc(
      {
        schemaVersion: 1,
        id: "a",
        title: "A",
        parts: [],
        sections: [{ timeMs: 0, name: "Intro" }],
      },
      SONG_URL,
    );
    expect(assembleTrack(read.doc!, [], null).track.sections).toEqual([
      { timeMs: 0, name: "Intro" },
    ]);
  });

  test("adds up to the track a run plays", () => {
    const read = readSongDoc(
      {
        schemaVersion: 1,
        id: "a",
        title: "A Song",
        durationMs: 1234,
        parts: [],
      },
      SONG_URL,
    );
    const lane = readChart(
      { schemaVersion: 1, chartType: "lanes", columns: 5, notes: [{ timeMs: 1, column: 0 }] },
      laneChart({ difficulty: "hard" }),
      "guitar",
    ).lane as LaneChart;
    const { track, problems } = assembleTrack(read.doc!, [lane], null);
    expect(track.id).toBe("a");
    expect(track.title).toBe("A Song");
    expect(track.durationMs).toBe(1234);
    expect(track.charts).toEqual([lane]);
    // A valid chart is untouched: the runtime gate only removes what is unplayable.
    expect(problems).toEqual([]);
    // A song with no words still has a melody — one with nothing in it.
    expect(track.melody.lines).toEqual([]);
    expect(track.melody.hasPitch).toBe(false);
  });

  test("fits each part's melody notes into their own turns", () => {
    const doc = readSongDoc(
      { schemaVersion: 1, id: "a", title: "A Song", parts: [] },
      SONG_URL,
    ).doc!;
    const melody: MelodyChart = {
      parts: 1,
      hasPitch: true,
      rows: 6,
      rootMidi: 57,
      lines: [],
      notes: [
        { id: "long", timeMs: 1000, lengthMs: 3000, part: 0, row: 1, text: "la", hero: false },
        { id: "short", timeMs: 2000, lengthMs: 500, part: 0, row: 2, text: "li", hero: false },
      ],
    };
    const { track, problems } = assembleTrack(doc, [], melody);
    // Neither word is lost: the long note is shortened where the short one takes over.
    expect(problems).toEqual([]);
    expect(track.melody.notes.map((note) => [note.id, note.lengthMs])).toEqual([
      ["long", 1000],
      ["short", 500],
    ]);
  });

  test("a chart with problems is dropped, and named with its instrument and difficulty", () => {
    const doc = readSongDoc(
      { schemaVersion: 1, id: "a", title: "A Song", parts: [] },
      SONG_URL,
    ).doc!;
    const bad: LaneChart = {
      instrument: "guitar",
      difficulty: "expert",
      columns: 5,
      bpm: 0,
      notes: [],
    };
    const built = assembleTrack(doc, [bad], null);
    expect(built.track.charts).toEqual([]);
    expect(built.problems).toEqual(["guitar/expert: bpm must be greater than 0"]);
  });

  test("an invalid tempo, a duplicate id and a note outside the highway are all caught", () => {
    const doc = readSongDoc(
      { schemaVersion: 1, id: "a", title: "A Song", parts: [] },
      SONG_URL,
    ).doc!;
    const note = (over: Partial<LaneNote> = {}): LaneNote => ({
      id: "n",
      timeMs: 0,
      lengthMs: 0,
      kind: "strum",
      column: 0,
      hero: false,
      ...over,
    });
    const charts: LaneChart[] = [
      { instrument: "guitar", difficulty: "easy", columns: 5, bpm: -1, notes: [note()] },
      {
        instrument: "guitar",
        difficulty: "normal",
        columns: 5,
        notes: [note(), note({ timeMs: 100, column: 1 })],
      },
      {
        instrument: "guitar",
        difficulty: "hard",
        columns: 5,
        notes: [note({ column: 6 })],
      },
    ];
    const built = assembleTrack(doc, charts, null);
    // Nothing invalid reaches the stage, and each refusal says which seat it was.
    expect(built.track.charts).toEqual([]);
    expect(built.problems).toContain("guitar/easy: bpm must be greater than 0");
    expect(built.problems).toContain("guitar/normal: duplicate note id n");
    expect(built.problems).toContain("guitar/hard: note n is outside the highway");
  });

  test("a chart too broken to inspect is named rather than thrown", () => {
    const doc = readSongDoc(
      { schemaVersion: 1, id: "a", title: "A Song", parts: [] },
      SONG_URL,
    ).doc!;
    const broken = {
      instrument: "bass",
      difficulty: "hard",
      columns: 4,
      notes: null,
    } as unknown as LaneChart;
    const built = assembleTrack(doc, [broken], null);
    expect(built.track.charts).toEqual([]);
    expect(built.problems).toEqual(["unknown/unknown: this chart could not be read"]);
  });

  test("a song that states no length takes one from its notes, plus the tail", () => {
    const doc = readSongDoc(
      { schemaVersion: 1, id: "a", title: "A Song", parts: [] },
      SONG_URL,
    ).doc!;
    const lane = readChart(
      {
        schemaVersion: 1,
        chartType: "lanes",
        columns: 5,
        // The last note ends at 5,700ms — a sustain's length counts, or the run
        // would end while it is still being held.
        notes: [{ timeMs: 5_000, lengthMs: 700, column: 0 }],
      },
      laneChart({ difficulty: "hard" }),
      "guitar",
    ).lane as LaneChart;
    const melody: MelodyChart = {
      parts: 1,
      hasPitch: false,
      rows: 6,
      rootMidi: 57,
      lines: [
        {
          timeMs: 8_000,
          endMs: 9_000,
          words: [{ text: "bye", timeMs: 8_000, hero: false }],
          parts: [{ part: 0, offset: 0 }],
          freeform: false,
        },
      ],
      notes: [],
    };
    // The last thing that sounds is the line, not the note.
    expect(assembleTrack(doc, [lane], melody).track.durationMs).toBe(9_000 + SONG_TAIL_MS);
  });

  test("a stated length is kept, whatever its notes run to", () => {
    const doc = readSongDoc(
      { schemaVersion: 1, id: "a", title: "A Song", durationMs: 12_000, parts: [] },
      SONG_URL,
    ).doc!;
    const lane = readChart(
      { schemaVersion: 1, chartType: "lanes", columns: 5, notes: [{ timeMs: 60_000, column: 0 }] },
      laneChart({ difficulty: "hard" }),
      "guitar",
    ).lane as LaneChart;
    expect(assembleTrack(doc, [lane], null).track.durationMs).toBe(12_000);
    expect(trackDuration(doc, [lane], null)).toBe(12_000);
  });

  test("a song with nothing to play has no length to invent", () => {
    // Its own sound ends it; a three-second tail would be a song nobody wrote.
    expect(trackDuration({ durationMs: 0 }, [], null)).toBe(0);
  });
});

describe("fullMixStems", () => {
  const stem = (id: string, url: string) => ({
    id,
    name: id,
    url,
    instrument: null,
    defaultGainDb: 0,
    offsetMs: 0,
  });
  const audio = (
    stems: ReturnType<typeof stem>[],
    mixPresets: { id: string; stemIds: string[] }[],
    preview: string | null = null,
  ) =>
    ({ audio: { source: "stems", stems, mixPresets, preview } }) as Pick<
      SourceSongDoc,
      "audio"
    >;

  test("plays the whole mix when the song has one", () => {
    expect(
      fullMixStems(
        audio(
          [stem("stem_master", "song.ogg"), stem("stem_guitar", "guitar.ogg")],
          [
            { id: "full", stemIds: ["stem_master"] },
            { id: "stems", stemIds: ["stem_guitar"] },
          ],
        ),
      ),
    ).toEqual(["song.ogg"]);
  });

  test("plays every part at once when there is no whole mix", () => {
    expect(
      fullMixStems(
        audio(
          [stem("stem_guitar", "guitar.ogg"), stem("stem_bass", "bass.ogg")],
          [{ id: "full", stemIds: ["stem_guitar", "stem_bass"] }],
        ),
      ),
    ).toEqual(["guitar.ogg", "bass.ogg"]);
  });

  test("falls back to everything the song has when `full` names nothing it does", () => {
    // A drift between the two — the preset says one thing and the stems another —
    // must still be a song rather than silence.
    expect(
      fullMixStems(
        audio([stem("stem_guitar", "guitar.ogg")], [{ id: "full", stemIds: ["stem_missing"] }]),
      ),
    ).toEqual(["guitar.ogg"]);
  });

  test("plays each file once, however many times it is listed", () => {
    expect(
      fullMixStems(
        audio(
          [stem("a", "bass.ogg"), stem("b", "bass.ogg")],
          [{ id: "full", stemIds: ["a", "b"] }],
        ),
      ),
    ).toEqual(["bass.ogg"]);
  });

  test("a song with no audio is a song with nothing to play", () => {
    expect(fullMixStems(audio([], []))).toEqual([]);
  });
});

describe("previewFor", () => {
  const master = (): SourceStem[] => [
    {
      id: "stem_master",
      name: "Master",
      url: "song.ogg",
      instrument: null,
      defaultGainDb: 0,
      offsetMs: 0,
    },
  ];
  const audio = (stems: ReturnType<typeof master>, preview: string | null = null) =>
    ({ audio: { source: "stems", stems, mixPresets: [], preview } }) as Pick<
      SourceSongDoc,
      "audio"
    >;

  test("a preview clip wins, played from its own start", () => {
    expect(
      previewFor({ previewStartMs: 45000, ...audio(master(), "preview.ogg") }),
    ).toEqual({ url: "preview.ogg", startMs: 0 });
  });

  test("without a clip, the master plays from the song's own cue", () => {
    expect(previewFor({ previewStartMs: 45000, ...audio(master()) })).toEqual({
      url: "song.ogg",
      startMs: 45000,
    });
    // A song that names no cue still gets a preview, from the beginning.
    expect(previewFor({ previewStartMs: 0, ...audio(master()) })).toEqual({
      url: "song.ogg",
      startMs: 0,
    });
  });

  test("a master under another id is still the master", () => {
    // A document is somebody else's file: the whole song is the stem with no
    // instrument, whatever it happens to be called.
    expect(
      previewFor({
        previewStartMs: 45000,
        ...audio([
          {
            ...master()[0],
            id: "mix",
            url: "mix.ogg",
          },
        ]),
      }),
    ).toEqual({ url: "mix.ogg", startMs: 45000 });
    // …and the conventional name wins when both are there.
    expect(
      previewFor({
        previewStartMs: 45000,
        ...audio([
          { ...master()[0], id: "mix", url: "mix.ogg" },
          ...master(),
        ]),
      }),
    ).toEqual({ url: "song.ogg", startMs: 45000 });
  });

  test("parts and no master are nothing to preview", () => {
    expect(
      previewFor({
        previewStartMs: 45000,
        ...audio([
          { ...master()[0], id: "stem_guitar", url: "guitar.ogg", instrument: "guitar" },
        ]),
      }),
    ).toBeNull();
  });
});

describe("chartProblems, on phrases", () => {  const base: LaneChart = {
    instrument: "guitar",
    difficulty: "hard",
    columns: 5,
    notes: [],
  };

  test("accepts phrases in order and refuses ones that overlap or run backwards", () => {
    expect(
      chartProblems({
        ...base,
        phrases: [
          { startMs: 0, endMs: 100 },
          { startMs: 200, endMs: 400 },
        ],
      }),
    ).toEqual([]);
    expect(
      chartProblems({ ...base, phrases: [{ startMs: 500, endMs: 400 }] })[0],
    ).toContain("before it starts");
    expect(
      chartProblems({
        ...base,
        phrases: [
          { startMs: 0, endMs: 900 },
          { startMs: 500, endMs: 700 },
        ],
      })[0],
    ).toContain("previous one ends");
  });

  test("a fill is held to the same order, and must have time in it", () => {
    const drums: LaneChart = { ...base, instrument: "drums", columns: 6 };
    expect(
      chartProblems({
        ...drums,
        fills: [
          { startMs: 0, endMs: 400 },
          { startMs: 500, endMs: 900 },
        ],
      }),
    ).toEqual([]);
    expect(chartProblems({ ...drums, fills: [{ startMs: 500, endMs: 400 }] })[0]).toContain(
      "before it starts",
    );
    // A freestyle window of no length is nothing at all.
    expect(chartProblems({ ...drums, fills: [{ startMs: 500, endMs: 500 }] })[0]).toContain(
      "before it starts",
    );
    expect(
      chartProblems({
        ...drums,
        fills: [
          { startMs: 0, endMs: 900 },
          { startMs: 500, endMs: 700 },
        ],
      })[0],
    ).toContain("previous one ends");
  });
});
