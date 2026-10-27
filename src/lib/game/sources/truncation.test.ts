import { describe, expect, test } from "bun:test";
import { detectSource } from "./detect";
import { readIni } from "./ini";
import { parseMidi } from "./midi";
import { parseSource } from "./parse";
import { readSngHeader, readSngHeaderFromFile } from "./sng";
import type { ParsedSource } from "./types";

/**
 * A truncation pass over every source reader.
 *
 * A chart in a real library can arrive cut short — a half-finished download, a
 * folder copied while it was being written, a package whose index is nonsense. The
 * readers are meant to be forgiving: whatever was read comes back, and what was
 * missing is named. This test is the guard for that promise, and for the two
 * failures a tolerant reader can still have: a loop that never advances, and a
 * throw out of the parser.
 *
 * A small fixture is tried at **every** prefix, because that is where an off-by-one
 * boundary lives. A large one is tried at its structural offsets and on a stride,
 * because every byte of a song is not a different lesson.
 */

/** Files up to this size are cut at every byte. */
const SMALL_FILE = 2048;

const encoder = new TextEncoder();

/* ------------------------------------------------------------------ sampling */

/**
 * The prefixes to try.
 *
 * `boundaries` are the offsets a format's own lengths point at — track headers,
 * file-table entries, chunk ends — and each one is tried a few bytes either side,
 * because a reader is most likely to misjudge the byte next to a length.
 */
function cutPoints(length: number, boundaries: readonly number[] = []): number[] {
  const cuts = new Set<number>();
  if (length <= SMALL_FILE) {
    for (let cut = 0; cut <= length; cut += 1) cuts.add(cut);
  } else {
    for (let cut = 0; cut <= 32; cut += 1) cuts.add(cut);
    for (let cut = Math.max(0, length - 32); cut <= length; cut += 1) cuts.add(cut);
    for (const boundary of boundaries) {
      for (let delta = -3; delta <= 3; delta += 1) {
        const cut = boundary + delta;
        if (cut >= 0 && cut <= length) cuts.add(cut);
      }
    }
    const stride = Math.max(1, Math.floor(length / 400));
    for (let cut = 0; cut <= length; cut += stride) cuts.add(cut);
  }
  return [...cuts].sort((a, b) => a - b);
}

/** The line starts of an ASCII text fixture, for a large file's sampled cuts. */
function lineStarts(text: string): number[] {
  const offsets: number[] = [];
  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === "\n") offsets.push(at + 1);
  }
  return offsets;
}

/** The shape every reader promises, whether it read the file or refused it. */
function expectSource(source: ParsedSource): void {
  expect(typeof source.meta.id).toBe("string");
  expect(typeof source.meta.title).toBe("string");
  expect(Number.isFinite(source.meta.durationMs)).toBe(true);
  expect(source.meta.durationMs).toBeGreaterThanOrEqual(0);
  expect(Array.isArray(source.lanes)).toBe(true);
  expect(Array.isArray(source.sections)).toBe(true);
  expect(Array.isArray(source.problems)).toBe(true);
  expect(source.melody === null || Array.isArray(source.melody.notes)).toBe(true);
}

/* --------------------------------------------------------------------- MIDI */

interface MidiEvent {
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

function metaText(type: number, value: string): number[] {
  const bytes = [...value].map((char) => char.charCodeAt(0) & 0xff);
  return [0xff, type, bytes.length, ...bytes];
}

function midiTrack(name: string, events: readonly MidiEvent[]): number[] {
  const out: number[] = [];
  let last = 0;
  // Stably sorted, so two events at one tick keep the order they were written in.
  const all: MidiEvent[] = [{ tick: 0, data: metaText(0x03, name) }, ...events].sort(
    (a, b) => a.tick - b.tick,
  );
  for (const event of all) {
    out.push(...vlq(event.tick - last), ...event.data);
    last = event.tick;
  }
  out.push(...vlq(0), 0xff, 0x2f, 0x00);
  return out;
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

interface MidiFixture {
  bytes: Uint8Array;
  /** Where each `MTrk` starts, and where its declared payload ends. */
  trackStarts: number[];
  trackEnds: number[];
}

function midiFixture(tracks: readonly number[][]): MidiFixture {
  const header = [
    0x4d, 0x54, 0x68, 0x64, // MThd
    0, 0, 0, 6,
    0, 1, // format 1
    (tracks.length >> 8) & 0xff, tracks.length & 0xff,
    0x01, 0xe0, // 480 ticks a quarter
  ];
  const body: number[] = [];
  const trackStarts: number[] = [];
  const trackEnds: number[] = [];
  let at = header.length;
  for (const track of tracks) {
    trackStarts.push(at);
    trackEnds.push(at + 8 + track.length);
    body.push(0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track);
    at += 8 + track.length;
  }
  return { bytes: new Uint8Array([...header, ...body]), trackStarts, trackEnds };
}

const on = (pitch: number): number[] => [0x90, pitch, 100];
const off = (pitch: number): number[] => [0x80, pitch, 0];

/** A song with a tempo map, sections, one guitar part and one voice. */
function smallMidi(): MidiFixture {
  return midiFixture([
    midiTrack("", [{ tick: 0, data: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] }]),
    midiTrack("EVENTS", [
      { tick: 0, data: metaText(0x01, "[section Intro]") },
      { tick: 1920, data: metaText(0x01, "[section Verse]") },
      { tick: 3840, data: metaText(0x01, "[end]") },
    ]),
    midiTrack("PART GUITAR", [
      { tick: 480, data: on(96) },
      { tick: 480, data: on(102) },
      { tick: 600, data: off(96) },
      { tick: 600, data: off(102) },
      { tick: 720, data: on(97) },
      { tick: 720, data: on(101) },
      { tick: 840, data: off(97) },
      { tick: 840, data: off(101) },
      { tick: 1200, data: on(100) },
      { tick: 1200, data: on(102) },
      { tick: 1680, data: off(100) },
      { tick: 1680, data: off(102) },
      { tick: 1440, data: on(116) },
      { tick: 2160, data: off(116) },
    ]),
    midiTrack("PART VOCALS", [
      { tick: 1920, data: on(105) },
      { tick: 1925, data: metaText(0x05, "Hel-") },
      { tick: 1925, data: on(60) },
      { tick: 2100, data: off(60) },
      { tick: 2160, data: metaText(0x05, "lo") },
      { tick: 2160, data: on(62) },
      { tick: 2300, data: off(62) },
    ]),
  ]);
}

/** A song with enough notes that its file is sampled rather than enumerated. */
function largeMidi(): MidiFixture {
  const guitar: MidiEvent[] = [];
  for (let index = 0; index < 300; index += 1) {
    const tick = 480 + index * 60;
    const pitch = 96 + (index % 5);
    guitar.push({ tick, data: on(pitch) }, { tick: tick + 30, data: off(pitch) });
  }
  return midiFixture([
    midiTrack("", [{ tick: 0, data: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] }]),
    midiTrack("EVENTS", [{ tick: 0, data: metaText(0x01, "[section Intro]") }]),
    midiTrack("PART GUITAR", guitar),
  ]);
}

/* -------------------------------------------------------------- text charts */

const CHART_TEXT = [
  "[Song]",
  "{",
  "  Name = Nine Lives",
  "  Artist = The Example",
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

const STEPMANIA_TEXT = [
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

const ULTRASTAR_TEXT = [
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

const LRC_TEXT = "[ti:Nine Lives]\n[ar:The Example]\n[00:12.30]turn the volume up\n[00:15.00]and play it loud\n";

const SRT_TEXT =
  "1\n00:00:12,300 --> 00:00:15,000\nturn the volume up\n\n2\n00:00:16,000 --> 00:00:18,000\nand play it loud\n";

const VTT_TEXT = "WEBVTT\n\n00:00:12.300 --> 00:00:15.000\nturn up\n\n00:00:16.000 --> 00:00:18.000\nand play it loud\n";

const INI_TEXT = [
  "[song]",
  "name = Nine Lives",
  "artist = The Example",
  "album = First Light",
  "song_length = 240000",
  "",
].join("\n");

/** A chart long enough to sample rather than enumerate. */
const LARGE_CHART_TEXT = (() => {
  const lines = [
    "[Song]",
    "{",
    "  Name = A Long One",
    "  Resolution = 480",
    "}",
    "[SyncTrack]",
    "{",
    "  0 = B 120000",
    "}",
    "[ExpertSingle]",
    "{",
  ];
  for (let index = 0; index < 320; index += 1) {
    lines.push(`  ${index * 120} = N ${index % 5} 0`);
  }
  lines.push("}", "");
  return lines.join("\n");
})();

const TEXT_FIXTURES: { name: string; text: string }[] = [
  { name: "notes.chart", text: CHART_TEXT },
  { name: "steps.sm", text: STEPMANIA_TEXT },
  { name: "song.txt", text: ULTRASTAR_TEXT },
  { name: "song.lrc", text: LRC_TEXT },
  { name: "song.srt", text: SRT_TEXT },
  { name: "song.vtt", text: VTT_TEXT },
];

/* --------------------------------------------------------------------- .sng */

/** A deliberately non-zero mask, so a test that forgets to unmask cannot pass. */
const SNG_MASK = new Uint8Array([
  0x13, 0x9a, 0x2c, 0x44, 0xf1, 0x08, 0xa7, 0x5d,
  0xe2, 0x71, 0x3b, 0xc6, 0x90, 0x1d, 0x6e, 0xbb,
]);

function pushU32(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function pushU64(out: number[], value: number): void {
  let left = BigInt(value);
  for (let index = 0; index < 8; index += 1) {
    out.push(Number(left & 0xffn));
    left >>= 8n;
  }
}

function writeU64(bytes: Uint8Array, at: number, value: number): void {
  let left = BigInt(value);
  for (let index = 0; index < 8; index += 1) {
    bytes[at + index] = Number(left & 0xffn);
    left >>= 8n;
  }
}

function maskBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    out[index] = bytes[index]! ^ (SNG_MASK[index % 16]! ^ (index & 0xff));
  }
  return out;
}

interface SngFile {
  name: string;
  bytes: Uint8Array;
}

interface SngFixture {
  bytes: Uint8Array;
  /** The structural offsets a length field points at. */
  boundaries: number[];
  /** Where the data section's own u64 length is written. */
  dataLengthAt: number;
  /** Where the file table's u64 count is written. */
  fileCountAt: number;
  /** Where each file entry's u64 length is written. */
  entryLengthsAt: number[];
}

/** Build a real `.sng` header, file index and masked data. */
function sngFixture(
  metadata: Record<string, string>,
  files: readonly SngFile[],
): SngFixture {
  const metadataPairs: number[] = [];
  pushU64(metadataPairs, 0);
  pushU64(metadataPairs, Object.keys(metadata).length);
  for (const [key, value] of Object.entries(metadata)) {
    const keyBytes = encoder.encode(key);
    const valueBytes = encoder.encode(value);
    pushU32(metadataPairs, keyBytes.length);
    metadataPairs.push(...keyBytes);
    pushU32(metadataPairs, valueBytes.length);
    metadataPairs.push(...valueBytes);
  }
  // Replace the placeholder with the section's body length (the count and pairs,
  // not the length field itself).
  writeBodyLength(metadataPairs);

  const metadataEnd = 26 + metadataPairs.length;
  const entries = files.map((file) => {
    const nameBytes = encoder.encode(file.name);
    return { nameBytes, length: file.bytes.length, masked: maskBytes(file.bytes) };
  });
  const fileMetaLen = entries.reduce((total, entry) => total + 1 + entry.nameBytes.length + 16, 0) + 8;
  const fileMetaEnd = metadataEnd + 8 + fileMetaLen;
  const dataStart = fileMetaEnd + 8;

  const fileMeta: number[] = [];
  pushU64(fileMeta, fileMetaLen);
  pushU64(fileMeta, entries.length);
  const boundaries: number[] = [26, metadataEnd, metadataEnd + 8, fileMetaEnd, dataStart];
  const entryLengthsAt: number[] = [];
  const dataBytes: number[] = [];
  let dataAt = dataStart;
  let entryAt = metadataEnd + 16;
  for (const entry of entries) {
    const nameEnd = entryAt + 1 + entry.nameBytes.length;
    boundaries.push(entryAt, entryAt + 1, nameEnd, nameEnd + 8, nameEnd + 16);
    entryLengthsAt.push(nameEnd);
    fileMeta.push(entry.nameBytes.length);
    fileMeta.push(...entry.nameBytes);
    pushU64(fileMeta, entry.length);
    pushU64(fileMeta, dataAt);
    boundaries.push(dataAt);
    if (entry.masked.length > 0) {
      boundaries.push(dataAt + 1, dataAt + entry.masked.length - 1);
    }
    boundaries.push(dataAt + entry.masked.length);
    dataBytes.push(...entry.masked);
    dataAt += entry.masked.length;
    entryAt += 1 + entry.nameBytes.length + 16;
  }

  const out: number[] = [];
  out.push(...encoder.encode("SNGPKG"));
  pushU32(out, 1);
  out.push(...SNG_MASK);
  out.push(...metadataPairs);
  out.push(...fileMeta);
  pushU64(out, dataBytes.length);
  out.push(...dataBytes);

  return {
    bytes: new Uint8Array(out),
    boundaries,
    dataLengthAt: fileMetaEnd,
    fileCountAt: metadataEnd + 8,
    entryLengthsAt,
  };
}

/**
 * Replace the metadata section's placeholder length with its body length, once the
 * count and the key/value pairs are known. The section is held as a plain array
 * while it is built, so this is the one write that happens afterwards.
 */
function writeBodyLength(bytes: number[]): void {
  let left = BigInt(bytes.length - 8);
  for (let index = 0; index < 8; index += 1) {
    bytes[index] = Number(left & 0xffn);
    left >>= 8n;
  }
}

const SNG_CHART_TEXT = [
  "[Song]",
  "{",
  "  Name = Package Song",
  "  Resolution = 480",
  '  MusicStream = "music.bin"',
  "}",
  "[SyncTrack]",
  "{",
  "  0 = B 120000",
  "}",
  "[ExpertSingle]",
  "{",
  "  960 = N 0 0",
  "}",
  "",
].join("\n");

function smallSng(): SngFixture {
  return sngFixture(
    { name: "Package Song", artist: "The Packager", song_length: "216181" },
    [
      { name: "notes.chart", bytes: encoder.encode(SNG_CHART_TEXT) },
      { name: "music.bin", bytes: new Uint8Array([1, 2, 3, 4, 5]) },
      { name: "album.jpg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
    ],
  );
}

function largeSng(): SngFixture {
  const audio = new Uint8Array(3000);
  for (let index = 0; index < audio.length; index += 1) audio[index] = index & 0xff;
  return sngFixture({ name: "A Long Package" }, [
    { name: "notes.chart", bytes: encoder.encode(LARGE_CHART_TEXT) },
    { name: "music.ogg", bytes: audio },
  ]);
}

/* ------------------------------------------------------------------- tests */

describe("truncated text sources", () => {
  test("every prefix of a small chart is read or refused, never thrown", () => {
    const failures: string[] = [];
    const started = performance.now();
    for (const fixture of TEXT_FIXTURES) {
      const bytes = encoder.encode(fixture.text);
      for (const cut of cutPoints(bytes.length)) {
        const slice = bytes.subarray(0, cut);
        try {
          const format = detectSource(slice, fixture.name);
          expect(typeof format).toBe("string");
          const source = parseSource({ bytes: slice, name: fixture.name, format });
          expectSource(source);
        } catch (error) {
          failures.push(`${fixture.name} at ${cut}/${bytes.length}: ${String(error)}`);
        }
      }
    }
    expect(failures).toEqual([]);
    // A reader that loops instead of returning can only be caught from outside;
    // this is the budget the whole pass is expected to cost.
    expect(performance.now() - started).toBeLessThan(10_000);
  }, { timeout: 30_000 });

  test("a larger chart is sampled at its line boundaries", () => {
    const bytes = encoder.encode(LARGE_CHART_TEXT);
    expect(bytes.length).toBeGreaterThan(SMALL_FILE);
    const failures: string[] = [];
    for (const cut of cutPoints(bytes.length, lineStarts(LARGE_CHART_TEXT))) {
      try {
        const source = parseSource({ bytes: bytes.subarray(0, cut), name: "long.chart" });
        expectSource(source);
      } catch (error) {
        failures.push(`long.chart at ${cut}/${bytes.length}: ${String(error)}`);
      }
    }
    expect(failures).toEqual([]);
  }, { timeout: 30_000 });

  test("the fixtures themselves are valid, so a prefix is a truncation", () => {
    const chart = parseSource({ bytes: encoder.encode(CHART_TEXT), name: "notes.chart" });
    expect(chart.lanes).toHaveLength(1);
    expect(chart.problems).toEqual([]);

    const steps = parseSource({ bytes: encoder.encode(STEPMANIA_TEXT), name: "steps.sm" });
    expect(steps.lanes).toHaveLength(1);
    expect(steps.problems).toEqual([]);

    const star = parseSource({ bytes: encoder.encode(ULTRASTAR_TEXT), name: "song.txt" });
    expect(star.melody).not.toBeNull();
    expect(star.problems).toEqual([]);

    for (const [name, text] of [
      ["song.lrc", LRC_TEXT],
      ["song.srt", SRT_TEXT],
      ["song.vtt", VTT_TEXT],
    ] as const) {
      const sheet = parseSource({ bytes: encoder.encode(text), name });
      expect(sheet.melody).not.toBeNull();
      expect(sheet.problems).toEqual([]);
    }
  }, { timeout: 10_000 });
});

describe("truncated MIDI", () => {
  test("every prefix of a small MIDI names what is missing and never throws", () => {
    const fixture = smallMidi();
    const full = parseMidi(fixture.bytes);
    expect(full.problems).toEqual([]);

    const failures: string[] = [];
    for (const cut of cutPoints(fixture.bytes.length, fixture.trackStarts)) {
      const slice = fixture.bytes.subarray(0, cut);
      try {
        const doc = parseMidi(slice);
        if (cut < fixture.bytes.length && doc.problems.length === 0) {
          failures.push(`parseMidi at ${cut}/${fixture.bytes.length}: read as a whole file`);
        }
        const source = parseSource({
          bytes: slice,
          name: "notes.mid",
          format: detectSource(slice, "notes.mid"),
        });
        expectSource(source);
        if (cut < fixture.bytes.length && source.problems.length === 0) {
          failures.push(`parseSource at ${cut}/${fixture.bytes.length}: named no problem`);
        }
      } catch (error) {
        failures.push(`notes.mid at ${cut}/${fixture.bytes.length}: ${String(error)}`);
      }
    }
    expect(failures).toEqual([]);
  }, { timeout: 30_000 });

  test("a MIDI cut inside its header is named, not read as an empty song", () => {
    // Every one of these used to come back with no tracks and no problem: a
    // half-downloaded chart listed as a song with nothing to play and no reason.
    const fixture = smallMidi();
    for (const cut of [4, 8, 12, 13]) {
      const doc = parseMidi(fixture.bytes.subarray(0, cut));
      expect(doc.problems).toContain("the MIDI header is truncated");
      expect(doc.tracks).toEqual([]);
    }
  }, { timeout: 10_000 });

  test("a MIDI cut between tracks names the tracks that are missing", () => {
    const fixture = smallMidi();
    const doc = parseMidi(fixture.bytes.subarray(0, fixture.trackEnds[0]!));
    expect(doc.tracks).toHaveLength(1);
    expect(
      doc.problems.some((problem) => problem.includes("ends after 1 of 4 tracks")),
    ).toBe(true);
  }, { timeout: 10_000 });

  test("a MIDI cut inside a track header names the truncated header", () => {
    const fixture = smallMidi();
    const start = fixture.trackStarts[1]!;
    for (const extra of [4, 5, 7]) {
      const doc = parseMidi(fixture.bytes.subarray(0, start + extra));
      expect(
        doc.problems.some((problem) => problem.includes("header is truncated")),
      ).toBe(true);
    }
  }, { timeout: 10_000 });

  test("a declared track length past the file keeps its notes and names the bytes", () => {
    const fixture = smallMidi();
    const cut = fixture.bytes.length - 1;
    const doc = parseMidi(fixture.bytes.subarray(0, cut));
    expect(doc.problems.some((problem) => problem.includes("past the end"))).toBe(true);
    // The notes read before the cut are still there: forgiving, not all-or-nothing.
    expect(doc.tracks.flatMap((track) => track.notes).length).toBeGreaterThan(0);
  }, { timeout: 10_000 });

  test("a large MIDI sampled at its track boundaries always names a truncation", () => {
    const fixture = largeMidi();
    expect(fixture.bytes.length).toBeGreaterThan(SMALL_FILE);
    expect(parseMidi(fixture.bytes).problems).toEqual([]);

    const failures: string[] = [];
    const boundaries = fixture.trackStarts.flatMap((start, index) => [
      start,
      start + 4,
      start + 8,
      fixture.trackEnds[index]!,
    ]);
    for (const cut of cutPoints(fixture.bytes.length, boundaries)) {
      try {
        const doc = parseMidi(fixture.bytes.subarray(0, cut));
        if (cut < fixture.bytes.length && doc.problems.length === 0) {
          failures.push(`long.mid at ${cut}/${fixture.bytes.length}: read as a whole file`);
        }
      } catch (error) {
        failures.push(`long.mid at ${cut}/${fixture.bytes.length}: ${String(error)}`);
      }
    }
    expect(failures).toEqual([]);
  }, { timeout: 30_000 });
});

describe("truncated .sng packages", () => {
  test("every prefix refuses the header and names why", () => {
    const fixture = smallSng();
    expect(readSngHeader(fixture.bytes).problems).toEqual([]);

    const failures: string[] = [];
    for (const cut of cutPoints(fixture.bytes.length, fixture.boundaries)) {
      const read = readSngHeader(fixture.bytes.subarray(0, cut));
      if (cut === fixture.bytes.length) {
        expect(read.header).not.toBeNull();
        expect(read.problems).toEqual([]);
        continue;
      }
      if (read.header !== null) {
        failures.push(`header at ${cut}/${fixture.bytes.length}: accepted a truncated package`);
      }
      if (read.problems.length === 0) {
        failures.push(`header at ${cut}/${fixture.bytes.length}: refused with no reason`);
      }
    }
    expect(failures).toEqual([]);
  }, { timeout: 30_000 });

  test("the Blob reader resolves every prefix and never rejects", async () => {
    const fixture = smallSng();
    const cuts = cutPoints(fixture.bytes.length, fixture.boundaries);
    const results = await Promise.allSettled(
      cuts.map((cut) => readSngHeaderFromFile(new Blob([fixture.bytes.slice(0, cut)]))),
    );

    const failures: string[] = [];
    for (let index = 0; index < results.length; index += 1) {
      const cut = cuts[index]!;
      const result = results[index]!;
      if (result.status === "rejected") {
        failures.push(`Blob at ${cut}/${fixture.bytes.length}: ${String(result.reason)}`);
        continue;
      }
      if (cut === fixture.bytes.length) {
        if (result.value.header === null) failures.push(`Blob at ${cut}: refused the whole file`);
        if (result.value.problems.length > 0) {
          failures.push(`Blob at ${cut}: named ${result.value.problems.join("; ")}`);
        }
      } else if (result.value.header !== null) {
        failures.push(`Blob at ${cut}/${fixture.bytes.length}: accepted a truncated package`);
      }
      if (cut < fixture.bytes.length && result.value.problems.length === 0) {
        failures.push(`Blob at ${cut}/${fixture.bytes.length}: named no problem`);
      }
    }
    expect(failures).toEqual([]);
  }, { timeout: 30_000 });

  test("a large package is sampled at its file table and data boundaries", () => {
    const fixture = largeSng();
    expect(fixture.bytes.length).toBeGreaterThan(SMALL_FILE);
    expect(readSngHeader(fixture.bytes).problems).toEqual([]);

    const failures: string[] = [];
    for (const cut of cutPoints(fixture.bytes.length, fixture.boundaries)) {
      const read = readSngHeader(fixture.bytes.subarray(0, cut));
      if (cut === fixture.bytes.length) continue;
      if (read.header !== null) {
        failures.push(`large package at ${cut}/${fixture.bytes.length}: accepted a truncation`);
      }
      if (read.problems.length === 0) {
        failures.push(`large package at ${cut}/${fixture.bytes.length}: named no problem`);
      }
    }
    expect(failures).toEqual([]);
  }, { timeout: 30_000 });

  test("a data length that runs past the file is refused by name", () => {
    const fixture = smallSng();
    const bytes = fixture.bytes.slice();
    writeU64(bytes, fixture.dataLengthAt, bytes.length + 1);
    const read = readSngHeader(bytes);
    expect(read.header).toBeNull();
    expect(read.problems.some((problem) => problem.includes("data is longer than the file"))).toBe(
      true,
    );
  }, { timeout: 10_000 });

  test("a file count past the table is refused by name", () => {
    const fixture = smallSng();
    const bytes = fixture.bytes.slice();
    writeU64(bytes, fixture.fileCountAt, 9999);
    const read = readSngHeader(bytes);
    expect(read.header).toBeNull();
    expect(
      read.problems.some((problem) => problem.includes("file entry is truncated")),
    ).toBe(true);
  }, { timeout: 10_000 });

  test("a file entry that runs past the package is named and dropped", () => {
    const fixture = smallSng();
    const bytes = fixture.bytes.slice();
    writeU64(bytes, fixture.entryLengthsAt[0]!, bytes.length);
    const read = readSngHeader(bytes);
    expect(read.header).not.toBeNull();
    // Only the offending entry goes; a package with one bad member is still
    // worth listing for the files that are whole.
    expect(read.header!.files.map((entry) => entry.name)).toEqual(["music.bin", "album.jpg"]);
    expect(
      read.problems.some((problem) =>
        problem.includes("notes.chart: its bytes are outside the package"),
      ),
    ).toBe(true);
  }, { timeout: 10_000 });
});

describe("truncated song.ini", () => {
  test("every prefix is a map, never a throw", () => {
    const bytes = encoder.encode(INI_TEXT);
    for (const cut of cutPoints(bytes.length)) {
      const values = readIni(new TextDecoder().decode(bytes.subarray(0, cut)));
      expect(values).toBeInstanceOf(Map);
    }
  }, { timeout: 10_000 });
});
