import { describe, expect, test } from "bun:test";
import { parseMidi } from "./midi";

/** A variable-length quantity, the format's own integer encoding. */
function vlq(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}

/** A 120 bpm tempo event at tick 0. */
const TEMPO = [0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20];

/** One note, held for a beat. */
const NOTE = [0x00, 0x90, 60, 100, ...vlq(480), 0x80, 60, 0];

const END_OF_TRACK = [0x00, 0xff, 0x2f, 0x00];

interface FileOptions {
  headerLength?: number;
  extraHeader?: number[];
  track: number[];
  declaredTrackLength?: number;
}

/** A `MThd` and one `MTrk`, with a hand-written header. */
function midiFile(options: FileOptions): Uint8Array {
  const headerLength = options.headerLength ?? 6;
  const length = options.declaredTrackLength ?? options.track.length;
  const header = [
    0x4d, 0x54, 0x68, 0x64, // MThd
    (headerLength >>> 24) & 0xff,
    (headerLength >> 16) & 0xff,
    (headerLength >> 8) & 0xff,
    headerLength & 0xff,
    0, 1, // format 1
    0, 1, // one track
    0x01, 0xe0, // 480 ticks a quarter
    ...(options.extraHeader ?? []),
  ];
  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b, // MTrk
    (length >>> 24) & 0xff,
    (length >> 16) & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
  ];
  return new Uint8Array([...header, ...trackHeader, ...options.track]);
}

/** A MIDI file inside a RIFF `RMID` container, as some collections ship it. */
function riffMidi(inner: Uint8Array): Uint8Array {
  const chunkSize = inner.length;
  const riffSize = 4 + 8 + chunkSize;
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // RIFF
    riffSize & 0xff,
    (riffSize >> 8) & 0xff,
    (riffSize >> 16) & 0xff,
    (riffSize >> 24) & 0xff,
    0x52, 0x4d, 0x49, 0x44, // RMID
    0x64, 0x61, 0x74, 0x61, // data
    chunkSize & 0xff,
    (chunkSize >> 8) & 0xff,
    (chunkSize >> 16) & 0xff,
    (chunkSize >> 24) & 0xff,
    ...inner,
  ]);
}

describe("parseMidi", () => {
  test("a track whose declared length runs past the file ends instead of spinning", () => {
    // The fixture is tiny but claims 4096 bytes: the loop must stop at EOF and
    // keep the note it already read rather than reading zeroes forever.
    const doc = parseMidi(midiFile({ track: [...TEMPO, ...NOTE], declaredTrackLength: 4096 }));
    expect(doc.problems.some((problem) => problem.includes("past the end"))).toBe(true);
    expect(doc.tracks[0].notes).toHaveLength(1);
    expect(doc.tracks[0].notes[0].pitch).toBe(60);
    expect(doc.tracks[0].notes[0].endTick).toBe(480);
    expect(doc.toMs(480)).toBe(500);
  }, { timeout: 1000 });

  test("reads a MIDI inside a RIFF RMID container", () => {
    const inner = midiFile({ track: [...TEMPO, ...NOTE, ...END_OF_TRACK] });
    const doc = parseMidi(riffMidi(inner));
    expect(doc.problems).toEqual([]);
    expect(doc.tracks).toHaveLength(1);
    expect(doc.tracks[0].notes[0].pitch).toBe(60);
    expect(doc.toMs(480)).toBe(500);
  });

  test("a header longer than six bytes keeps its three fields", () => {
    // The fields come before the extra bytes, so reading them after a skip put
    // `format`, `trackCount` and `division` off by the header's own length.
    const doc = parseMidi(
      midiFile({
        headerLength: 8,
        extraHeader: [0xff, 0x00],
        track: [...TEMPO, ...NOTE, ...END_OF_TRACK],
      }),
    );
    expect(doc.division).toBe(480);
    expect(doc.problems).toEqual([]);
    expect(doc.tracks).toHaveLength(1);
    expect(doc.tracks[0].notes).toHaveLength(1);
    expect(doc.toMs(480)).toBe(500);
  });
});
