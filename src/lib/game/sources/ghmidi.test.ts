import { describe, expect, test } from "bun:test";
import { chartProblems } from "../track";
import { readGameMidi } from "./ghmidi";
import { readIni } from "./ini";

/** A MIDI event at a tick, as raw bytes (running status is not used). */
interface Event {
  tick: number;
  data: number[];
}

function vlq(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}

function text(type: number, value: string): number[] {
  const bytes = [...value].map((char) => char.charCodeAt(0) & 0xff);
  return [0xff, type, bytes.length, ...bytes];
}

function buildTrack(name: string, events: Event[]): number[] {
  const out: number[] = [];
  let last = 0;
  // Stably sorted, so a caller can list events in any order and two at one tick
  // keep the order they were written in.
  const all: Event[] = [{ tick: 0, data: text(0x03, name) }, ...events].sort(
    (a, b) => a.tick - b.tick,
  );
  for (const event of all) {
    out.push(...vlq(event.tick - last), ...event.data);
    last = event.tick;
  }
  out.push(...vlq(0), 0xff, 0x2f, 0x00);
  return out;
}

function midiFile(tracks: number[][]): Uint8Array {
  const header = [
    0x4d, 0x54, 0x68, 0x64, // MThd
    0, 0, 0, 6,
    0, 1, // format 1
    (tracks.length >> 8) & 0xff, tracks.length & 0xff,
    0x01, 0xe0, // 480 ticks a quarter
  ];
  const body: number[] = [];
  for (const track of tracks) {
    body.push(0x4d, 0x54, 0x72, 0x6b, (track.length >>> 24) & 0xff, (track.length >> 16) & 0xff, (track.length >> 8) & 0xff, track.length & 0xff, ...track);
  }
  return new Uint8Array([...header, ...body]);
}

const on = (pitch: number): number[] => [0x90, pitch, 100];
const off = (pitch: number): number[] => [0x80, pitch, 0];

/** A voice track: a lyric event and a note at each syllable's tick. */
function voiceTrack(
  name: string,
  syllables: { tick: number; text: string; pitch: number }[],
): number[] {
  const events: Event[] = [];
  for (const syllable of syllables) {
    events.push({ tick: syllable.tick, data: text(0x05, syllable.text) });
    events.push({ tick: syllable.tick, data: on(syllable.pitch) });
    events.push({ tick: syllable.tick + 240, data: off(syllable.pitch) });
  }
  return buildTrack(name, events);
}

type Melody = NonNullable<ReturnType<typeof readGameMidi>["melody"]>;

/** The words one part of a melody sings, from its lines. */
function wordsOfPart(melody: Melody, part: number): string[] {
  return melody.lines
    .filter((line) => line.parts.some((entry) => entry.part === part))
    .flatMap((line) => line.words.map((word) => word.text));
}

/** A song with one guitar part, a voice, sections and star power. */
function song(): Uint8Array {
  const tempo: Event[] = [{ tick: 0, data: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] }]; // 120 bpm
  const events: Event[] = [
    { tick: 0, data: text(0x01, "[section Intro]") },
    { tick: 1920, data: text(0x01, "[section Verse]") },
  ];
  const guitar: Event[] = [
    { tick: 480, data: on(96) },
    { tick: 480, data: on(102) }, // a strum flag
    { tick: 600, data: off(96) },
    { tick: 600, data: off(102) },
    { tick: 720, data: on(97) },
    { tick: 720, data: on(101) }, // a hopo flag
    { tick: 840, data: off(97) },
    { tick: 840, data: off(101) },
    { tick: 960, data: on(95) }, // open
    { tick: 960, data: on(102) },
    { tick: 1080, data: off(95) },
    { tick: 1080, data: off(102) },
    { tick: 1200, data: on(100) }, // orange, a hold
    { tick: 1200, data: on(102) },
    { tick: 1680, data: off(100) },
    { tick: 1680, data: off(102) },
    { tick: 1440, data: on(116) }, // star power
    { tick: 2160, data: off(116) },
  ];
  const vocals: Event[] = [
    { tick: 1920, data: on(105) }, // a lyric line opens here
    { tick: 1925, data: text(0x05, "Hel-") },
    { tick: 1925, data: on(60) },
    { tick: 2100, data: off(60) },
    { tick: 2160, data: text(0x05, "lo") },
    { tick: 2160, data: on(62) },
    { tick: 2300, data: off(62) },
  ];
  return midiFile([
    buildTrack("", tempo),
    buildTrack("EVENTS", events),
    buildTrack("PART GUITAR", guitar),
    buildTrack("PART VOCALS", vocals),
  ]);
}

describe("readGameMidi", () => {
  const source = readGameMidi({
    bytes: song(),
    ini: readIni("[song]\nname = Test Song\nartist = Test Artist\nsong_length = 30000\n"),
    stems: { master: "song.ogg", lead_guitar: "guitar.ogg", vocals: "vocals.ogg" },
  });

  test("reads the metadata from song.ini", () => {
    expect(source.meta.title).toBe("Test Song");
    expect(source.meta.artist).toBe("Test Artist");
    expect(source.meta.id).toBe("test-song");
    expect(source.meta.durationMs).toBe(30000);
  });

  test("reads the note track, one chart at the level it carries", () => {
    // Only expert carries notes in this file.
    expect(source.lanes).toHaveLength(1);
    const chart = source.lanes[0];
    expect(chart.instrument).toBe("guitar");
    expect(chart.difficulty).toBe("expert");
    expect(chart.columns).toBe(5);
    expect(chart.bpm).toBe(120);
    expect(chartProblems(chart)).toEqual([]);
  });

  test("decodes frets, the strum/hopo flag and the open note", () => {
    const notes = source.lanes[0].notes;
    expect(notes.map((note) => [note.column, note.kind])).toEqual([
      [0, "strum"],
      [1, "hopo"],
      [null, "strum"],
      [4, "strum"],
    ]);
    // The orange note is a hold; the others are taps.
    expect(notes[3].lengthMs).toBe(500);
    expect(notes[0].lengthMs).toBe(125);
  });

  test("reads star power as a phrase, and its timing from the tempo map", () => {
    expect(source.lanes[0].phrases).toEqual([{ startMs: 1500, endMs: 2250 }]);
  });

  test("reads the sections from the EVENTS track", () => {
    expect(source.sections).toEqual([
      { timeMs: 0, name: "Intro" },
      { timeMs: 2000, name: "Verse" },
    ]);
  });

  test("reads the voice: its words, its roll and the line the marker opens", () => {
    const melody = source.melody;
    expect(melody).not.toBeNull();
    expect(melody!.parts).toBe(1);
    expect(melody!.hasPitch).toBe(true);
    expect(melody!.lines).toHaveLength(1);
    expect(melody!.lines[0].words.map((word) => word.text)).toEqual(["Hello"]);
    // Two semitones centred in a six-row roll.
    expect(melody!.rows).toBe(6);
    expect(melody!.rootMidi).toBe(59);
    expect(melody!.notes.map((note) => note.row)).toEqual([1, 3]);
  });

  test("reads the audio files it was handed", () => {
    expect(source.audio.stems.map((stem) => stem.id)).toEqual([
      "stem_master",
      "stem_lead_guitar",
      "stem_vocals",
    ]);
    expect(source.audio.stems[1].instrument).toBe("lead_guitar");
    // One master and two parts: the master is the backing, so the song is all three.
    expect(source.audio.mixPresets[0]).toEqual({
      id: "full",
      stemIds: ["stem_master", "stem_lead_guitar", "stem_vocals"],
    });
  });

  test("a file that is not MIDI comes back empty with a problem", () => {
    const bad = readGameMidi({ bytes: new Uint8Array([1, 2, 3, 4]) });
    expect(bad.lanes).toEqual([]);
    expect(bad.melody).toBeNull();
    expect(bad.problems[0]).toContain("not a MIDI");
  });

  test("a song whose file states no length gets one from its own notes", () => {
    // Some early charts have no `song_length` at all, and a jukebox full of
    // `0:00` is worse than an approximate length.
    const bare = readGameMidi({ bytes: song(), ini: readIni("[song]\nname = No Length\n") });
    expect(bare.meta.durationMs).toBeGreaterThan(5000);
    expect(bare.meta.durationMs).toBeLessThan(6500);
  });

  test("reads a karaoke file's voice even though no track is called PART VOCALS", () => {
    // A `.kar` — or any MIDI that never used the convention — carries its words
    // as lyric events on whatever track it likes.
    const bytes = midiFile([
      buildTrack("", [{ tick: 0, data: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] }]),
      buildTrack("Melody", [
        { tick: 0, data: text(0x05, "Hel-") },
        { tick: 0, data: on(60) },
        { tick: 200, data: off(60) },
        { tick: 240, data: text(0x05, "lo") },
        { tick: 240, data: on(62) },
        { tick: 440, data: off(62) },
      ]),
    ]);
    const source = readGameMidi({ bytes, fallbackTitle: "Karaoke" });
    expect(source.melody).not.toBeNull();
    expect(source.melody!.hasPitch).toBe(true);
    expect(source.melody!.lines[0].words.map((word) => word.text)).toEqual(["Hello"]);
  });

  test("reads the `T1 GEMS` guitar track", () => {
    // Some charts do not call it `PART GUITAR`; its frets sit in the same
    // bands, so the chart reads the same.
    const bytes = midiFile([
      buildTrack("midi_export", []),
      buildTrack("T1 GEMS", [
        { tick: 0, data: on(96) },
        { tick: 100, data: off(96) },
        { tick: 480, data: on(100) },
        { tick: 580, data: off(100) },
      ]),
      buildTrack("EVENTS", []),
    ]);
    const source = readGameMidi({ bytes, fallbackTitle: "All of This" });
    expect(source.lanes).toHaveLength(1);
    expect(source.lanes[0].instrument).toBe("guitar");
    expect(source.lanes[0].notes.map((note) => note.column)).toEqual([0, 4]);
    expect(chartProblems(source.lanes[0])).toEqual([]);
  });

  test("keeps a lead and a rhythm guitar at the same level, each with its role", () => {
    const bytes = midiFile([
      buildTrack("", [{ tick: 0, data: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] }]),
      buildTrack("PART GUITAR", [
        { tick: 0, data: on(96) },
        { tick: 100, data: off(96) },
      ]),
      buildTrack("PART RHYTHM", [
        { tick: 0, data: on(97) },
        { tick: 100, data: off(97) },
      ]),
    ]);
    const source = readGameMidi({ bytes, fallbackTitle: "Two Guitars" });
    expect(source.lanes).toHaveLength(2);
    expect(source.lanes.map((chart) => [chart.instrument, chart.role])).toEqual([
      ["guitar", "lead"],
      ["guitar", "rhythm"],
    ]);
    // Their own charts, at the same level: one seat each.
    expect(source.lanes.map((chart) => chart.notes[0].column).sort()).toEqual([0, 1]);
    expect(source.lanes.every((chart) => chart.difficulty === "expert")).toBe(true);
    expect(source.lanes.every((chart) => chartProblems(chart).length === 0)).toBe(true);
  });

  test("applies the song.ini offset to notes, lyrics, sections and the end", () => {
    const bytes = midiFile([
      buildTrack("", [{ tick: 0, data: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] }]), // 120 bpm
      buildTrack("EVENTS", [
        { tick: 0, data: text(0x01, "[section Intro]") },
        { tick: 960, data: text(0x01, "[end]") },
      ]),
      buildTrack("PART GUITAR", [
        { tick: 600, data: on(96) },
        { tick: 648, data: off(96) },
      ]),
      buildTrack("PART VOCALS", [
        { tick: 600, data: text(0x05, "Ah") },
        { tick: 600, data: on(60) },
        { tick: 648, data: off(60) },
      ]),
    ]);

    // 600 ticks at 480 a quarter and 120 BPM is 625 ms; no offset leaves it there.
    const plain = readGameMidi({ bytes, ini: readIni("[song]\nname = Not Shifted\n") });
    expect(plain.lanes[0].notes[0].timeMs).toBe(625);
    expect(plain.melody!.notes[0].timeMs).toBe(625);
    expect(plain.sections).toEqual([{ timeMs: 0, name: "Intro" }]);
    // The `[end]` marker at tick 960 is 1000 ms, and the length follows it.
    expect(plain.meta.durationMs).toBe(4000);

    // A positive offset moves the chart later, `.chart`'s own convention.
    const shifted = readGameMidi({
      bytes,
      ini: readIni("[song]\nname = Shifted\noffset = 250\n"),
    });
    expect(shifted.lanes[0].notes[0].timeMs).toBe(875);
    expect(shifted.melody!.notes[0].timeMs).toBe(875);
    expect(shifted.sections).toEqual([{ timeMs: 250, name: "Intro" }]);
    expect(shifted.meta.durationMs).toBe(4250);
  });

  test("compacts harmonies into parts 0 and 1 when the lead is missing", () => {
    // A harmonies chart can write HARM1/HARM2 with no PART VOCALS; their own
    // indices 1 and 2 would leave part 0 empty and push part 2 past MAX_PARTS.
    const bytes = midiFile([
      buildTrack("", [{ tick: 0, data: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] }]),
      voiceTrack("HARM2", [
        { tick: 0, text: "Har-", pitch: 64 },
        { tick: 240, text: "mo", pitch: 65 },
      ]),
      voiceTrack("HARM1", [
        { tick: 0, text: "One", pitch: 60 },
        { tick: 240, text: "Two", pitch: 62 },
      ]),
    ]);
    const melody = readGameMidi({ bytes, fallbackTitle: "Harmonies" }).melody!;
    expect(melody.parts).toBe(2);
    // HARM1 is the lowest present, so it becomes part 0; HARM2 follows as part 1.
    expect(wordsOfPart(melody, 0)).toEqual(["One", "Two"]);
    expect(wordsOfPart(melody, 1)).toEqual(["Harmo"]);
    expect(melody.notes.filter((note) => note.part === 0)).toHaveLength(2);
    expect(melody.notes.filter((note) => note.part === 1)).toHaveLength(2);
  });

  test("shares a fourth voice on the last part instead of dropping its words", () => {
    const bytes = midiFile([
      buildTrack("", [{ tick: 0, data: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] }]),
      voiceTrack("PART VOCALS", [{ tick: 0, text: "One", pitch: 60 }]),
      voiceTrack("HARM1", [{ tick: 240, text: "Two", pitch: 62 }]),
      voiceTrack("HARM2", [{ tick: 480, text: "Three", pitch: 64 }]),
      voiceTrack("HARM3", [{ tick: 720, text: "Four", pitch: 65 }]),
    ]);
    const source = readGameMidi({ bytes, fallbackTitle: "Four voices" });
    const melody = source.melody!;
    expect(melody.parts).toBe(3);
    expect(wordsOfPart(melody, 2)).toEqual(["Three", "Four"]);
    expect(source.problems.join(" ")).toMatch(/shares the last part/);
  });

  test("keeps the lead on part 0 and the harmony on part 1", () => {
    const bytes = midiFile([
      buildTrack("", [{ tick: 0, data: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] }]),
      // Written harmony first, so the parts come out in index order rather than by
      // the order the tracks happen to sit in the file.
      voiceTrack("HARM1", [{ tick: 0, text: "Two", pitch: 64 }]),
      voiceTrack("PART VOCALS", [{ tick: 0, text: "One", pitch: 60 }]),
    ]);
    const melody = readGameMidi({ bytes, fallbackTitle: "Duet" }).melody!;
    expect(melody.parts).toBe(2);
    expect(wordsOfPart(melody, 0)).toEqual(["One"]);
    expect(wordsOfPart(melody, 1)).toEqual(["Two"]);
  });
});

describe("readGameMidi drums: the kick pedal and fills", () => {
  const tempo: Event = { tick: 0, data: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] }; // 120 bpm
  /** 480 ticks is 500 ms at 120 bpm. */
  const kick = (tick: number): Event[] => [
    { tick, data: on(95) },
    { tick: tick + 100, data: off(95) },
  ];

  test("reads the kick pitch as column 5, alone and beside a pad", () => {
    const bytes = midiFile([
      buildTrack("", [tempo]),
      buildTrack("PART DRUMS", [
        ...kick(0),
        { tick: 480, data: on(96) }, // green, and the pedal at the same moment
        { tick: 580, data: off(96) },
        ...kick(480),
        { tick: 960, data: on(97) },
        { tick: 1060, data: off(97) },
      ]),
    ]);
    const chart = readGameMidi({ bytes, fallbackTitle: "Kit" }).lanes[0];
    expect(chart.instrument).toBe("drums");
    // Six columns: five pads under the hands and the pedal under the foot.
    expect(chart.columns).toBe(6);
    // Within a tick the order is the file's, so compare the pair by column.
    const notes = chart.notes
      .map((note) => [note.timeMs, note.column] as const)
      .sort((a, b) => a[0] - b[0] || (a[1] ?? -1) - (b[1] ?? -1));
    expect(notes).toEqual([
      [0, 5],
      [500, 0],
      [500, 5],
      [1000, 1],
    ]);
    expect(chartProblems(chart)).toEqual([]);
  });

  test("a drum chart with no kick still has the pedal's column", () => {
    const bytes = midiFile([
      buildTrack("", [tempo]),
      buildTrack("PART DRUMS", [
        { tick: 0, data: on(96) },
        { tick: 100, data: off(96) },
      ]),
    ]);
    const chart = readGameMidi({ bytes, fallbackTitle: "No Pedal" }).lanes[0];
    expect(chart.columns).toBe(6);
    expect(chart.notes[0].column).toBe(0);
  });

  test("a guitar's open pitch is still an open note, not a sixth column", () => {
    const bytes = midiFile([
      buildTrack("", [tempo]),
      buildTrack("PART GUITAR", [
        { tick: 0, data: on(95) },
        { tick: 100, data: off(95) },
      ]),
    ]);
    const chart = readGameMidi({ bytes, fallbackTitle: "Open" }).lanes[0];
    expect(chart.instrument).toBe("guitar");
    expect(chart.columns).toBe(5);
    expect(chart.notes[0].column).toBeNull();
  });

  test("reads a fill from [mix 8] to the next mix marker, and a section named fill", () => {
    const bytes = midiFile([
      buildTrack("", [tempo]),
      buildTrack("PART DRUMS", [
        { tick: 0, data: on(96) },
        { tick: 100, data: off(96) },
        { tick: 480, data: text(0x01, "[mix 8]") },
        { tick: 1440, data: text(0x01, "[mix 9]") },
        { tick: 1920, data: text(0x01, "[section Big Drum Fill]") },
        { tick: 2880, data: text(0x01, "[section Verse]") },
        { tick: 3840, data: text(0x01, "[end]") },
      ]),
    ]);
    const chart = readGameMidi({ bytes, fallbackTitle: "Fills" }).lanes[0];
    expect(chart.fills).toEqual([
      { startMs: 500, endMs: 1500 },
      { startMs: 2000, endMs: 3000 },
    ]);
    expect(chartProblems(chart)).toEqual([]);
  });

  test("a fill reaches a chart from an EVENTS track, and never a guitar's", () => {
    const bytes = midiFile([
      buildTrack("", [tempo]),
      buildTrack("EVENTS", [
        { tick: 480, data: text(0x01, "[mix 8]") },
        { tick: 960, data: text(0x01, "[mix 9]") },
      ]),
      buildTrack("PART DRUMS", [
        { tick: 0, data: on(96) },
        { tick: 100, data: off(96) },
      ]),
      buildTrack("PART GUITAR", [
        { tick: 0, data: on(96) },
        { tick: 100, data: off(96) },
      ]),
    ]);
    const source = readGameMidi({ bytes, fallbackTitle: "Mixed" });
    const drums = source.lanes.find((chart) => chart.instrument === "drums")!;
    const guitar = source.lanes.find((chart) => chart.instrument === "guitar")!;
    expect(drums.fills).toEqual([{ startMs: 500, endMs: 1000 }]);
    expect(guitar.fills).toBeUndefined();
  });
});
