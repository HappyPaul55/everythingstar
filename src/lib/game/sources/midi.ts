/**
 * The MIDI file, read as bytes.
 *
 * Nearly every chart worth having arrives as a `.mid`: Guitar Hero, YARG,
 * YARG, Clone Hero and karaoke all use the format, and they all use it the same
 * way (one track per part, notes as note-on/note-off pairs, meta events for tempo,
 * section names and lyrics). This is the **binary layer** — header, tracks, notes,
 * tempo — and says nothing about what a note *means*; the note-track convention is
 * `ghmidi.ts`'s business.
 *
 * It is deliberately forgiving: a truncated or odd file yields what it could be
 * read, with a problem named, rather than throwing the song away.
 */

import { ByteReader, decodeText } from "./bytes";

export interface MidiNote {
  tick: number;
  endTick: number;
  pitch: number;
  velocity: number;
}

export interface MidiText {
  tick: number;
  text: string;
}

export interface MidiTrack {
  name: string;
  notes: MidiNote[];
  /** Meta text events (`[section Verse]`, `[music_start]`, `[end]`, …). */
  texts: MidiText[];
  /** Lyric meta events (type `0x05`), one per sung syllable. */
  lyrics: MidiText[];
}

export interface MidiDoc {
  division: number;
  tracks: MidiTrack[];
  problems: string[];
  /** The tempo the song opens at, in beats per minute (120 when it never says). */
  bpm: number;
  /** Ticks → song milliseconds, from the file's own tempo map. */
  toMs(tick: number): number;
}

const DEFAULT_US_PER_BEAT = 500_000;
const SMPTE_BIT = 0x8000;

/**
 * The MIDI inside a RIFF `RMID` wrapper, when the file is one.
 *
 * `RMID` is a RIFF container whose `data` chunk is an ordinary MIDI file. Some
 * collections ship `.rmi`/`.mid` files this way, and `parseMidi` used to read the
 * wrapper as an unreadable file. RIFF chunk sizes are little-endian and each chunk
 * is padded to an even length, unlike MIDI's own big-endian lengths.
 */
function unwrapRiffMidi(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 20) return null;
  if (asciiAt(bytes, 0) !== "RIFF" || asciiAt(bytes, 8) !== "RMID") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = asciiAt(bytes, at);
    const size = view.getUint32(at + 4, true);
    const start = at + 8;
    if (id === "data") return bytes.subarray(start, Math.min(bytes.length, start + size));
    at = start + size + (size & 1);
  }
  return null;
}

function asciiAt(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(
    bytes[at] ?? 0,
    bytes[at + 1] ?? 0,
    bytes[at + 2] ?? 0,
    bytes[at + 3] ?? 0,
  );
}

/**
 * Parse a standard MIDI file.
 *
 * Running status, multi-track format 1, and the four meta events that matter are
 * all handled; everything else is skipped by its declared length, which is what
 * makes an unfamiliar file read without surprises.
 */
export function parseMidi(input: Uint8Array): MidiDoc {
  const problems: string[] = [];
  const bytes = unwrapRiffMidi(input) ?? input;
  const reader = new ByteReader(bytes);
  const tag = reader.latin1(4);
  if (tag !== "MThd") {
    return emptyDoc(["not a MIDI file"]);
  }
  const headerLength = reader.u32();
  // A header declares its own length, so a file shorter than that was cut before
  // it began. Reading the fields past the end answers zeroes, which used to turn a
  // half-downloaded `notes.mid` into an empty song with no reason given.
  if (bytes.length < 8 + Math.max(6, headerLength)) {
    return emptyDoc(["the MIDI header is truncated"]);
  }
  // The three fields the header is for come first; only what a non-standard
  // header adds after them is skipped.
  const format = reader.u16();
  const trackCount = reader.u16();
  let division = reader.u16();
  reader.skip(Math.max(0, headerLength - 6));
  if (division & SMPTE_BIT) {
    // SMPTE division carries its own frame rate rather than a tempo map; almost no
    // chart uses it, so fall back to a quarter-note division from the frame rate.
    const framesPerSecond = 256 - (division >> 8);
    const ticksPerFrame = division & 0xff;
    division = Math.max(1, framesPerSecond * ticksPerFrame);
    problems.push("the file uses SMPTE timing; its tempo map is approximated");
  }
  if (division <= 0) division = 480;

  const rawTracks: MidiTrack[] = [];
  const tempoMap: { tick: number; usPerBeat: number }[] = [];
  for (let index = 0; index < trackCount; index += 1) {
    // A track header is its four-byte tag and a four-byte length. A file that ends
    // inside one, or between two tracks, is a truncated file — and saying so is the
    // difference between a chart with nothing to play and a chart that says why.
    if (reader.remaining < 8) {
      problems.push(
        reader.eof()
          ? `the file ends after ${rawTracks.length} of ${trackCount} tracks`
          : `track ${index}'s header is truncated`,
      );
      break;
    }
    if (reader.latin1(4) !== "MTrk") {
      problems.push(`track ${index} is not a track`);
      break;
    }
    const length = reader.u32();
    const end = reader.offset + length;
    // `readTrack` can stop at a valid end-of-track event before the declared
    // length, so it cannot tell a short track from a truncated file. The declared
    // length can: anything past the file's own end is missing bytes.
    if (end > bytes.length) {
      problems.push("a track's length runs past the end of the file");
    }
    rawTracks.push(readTrack(reader, end, tempoMap, problems));
    reader.offset = Math.max(reader.offset, end);
  }
  if (format === 2) problems.push("the file is MIDI format 2; track timing may drift");

  const map = [...tempoMap].sort((a, b) => a.tick - b.tick);
  const openingTempo = map[0]?.usPerBeat ?? DEFAULT_US_PER_BEAT;
  return {
    division,
    tracks: rawTracks,
    problems,
    bpm: openingTempo > 0 ? 60_000_000 / openingTempo : 120,
    toMs: makeTickClock(division, map),
  };
}

function emptyDoc(problems: string[]): MidiDoc {
  return {
    division: 480,
    tracks: [],
    problems,
    bpm: 120,
    toMs: () => 0,
  };
}

/** Read a variable-length quantity, the format's own integer encoding. */
function readVarInt(reader: ByteReader): number {
  let value = 0;
  for (let i = 0; i < 4; i += 1) {
    const byte = reader.u8();
    value = (value << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) break;
  }
  return value;
}

function readTrack(
  reader: ByteReader,
  end: number,
  tempoMap: { tick: number; usPerBeat: number }[],
  problems: string[],
): MidiTrack {
  const track: MidiTrack = { name: "", notes: [], texts: [], lyrics: [] };
  const active = new Map<string, { tick: number; velocity: number }>();
  let tick = 0;
  let running = 0;
  while (reader.offset < end) {
    // A declared length can run past the file — a truncated download — and every
    // read past the end answers zero without moving. Without this guard the loop
    // would sit on one offset forever. `parseMidi` has already named the missing
    // bytes, because this loop can also stop at an end-of-track event before the
    // declared length and cannot tell the two apart.
    if (reader.eof()) break;
    const at = reader.offset;
    tick += readVarInt(reader);
    let status = reader.peek();
    if (status < 0x80) {
      status = running;
    } else {
      reader.offset += 1;
      // **Running status is for channel messages only.** A meta or sysex event must
      // not become the status a following data byte is read against, or the very
      // next note — written with running status — is swallowed as another sysex and
      // the rest of the track drifts by a byte.
      if (status < 0xf0) running = status;
    }
    const type = status & 0xf0;
    const channel = status & 0x0f;

    if (status === 0xff) {
      const metaType = reader.u8();
      const length = readVarInt(reader);
      const data = reader.read(length);
      if (metaType === 0x03) track.name = midiText(data);
      else if (metaType === 0x01) track.texts.push({ tick, text: midiText(data) });
      else if (metaType === 0x05) track.lyrics.push({ tick, text: midiText(data) });
      else if (metaType === 0x51 && data.length >= 3) {
        const usPerBeat = (data[0] << 16) | (data[1] << 8) | data[2];
        if (usPerBeat > 0) tempoMap.push({ tick, usPerBeat });
      } else if (metaType === 0x2f) break;
    } else if (status === 0xf0 || status === 0xf7) {
      reader.skip(readVarInt(reader));
    } else if (type === 0x90 || type === 0x80) {
      const pitch = reader.u8();
      const velocity = reader.u8();
      const key = `${channel}:${pitch}`;
      if (type === 0x90 && velocity > 0) {
        active.set(key, { tick, velocity });
      } else {
        closeNote(track, active, key, tick);
      }
    } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
      reader.skip(2);
    } else if (type === 0xc0 || type === 0xd0) {
      reader.skip(1);
    } else {
      problems.push("a track had an event that could not be read");
      break;
    }
    if (reader.offset <= at) {
      problems.push("a track stopped advancing before its declared length");
      break;
    }
  }
  // Anything still held when the track ends finishes there, rather than vanishing.
  for (const key of active.keys()) closeNote(track, active, key, tick);
  track.notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
  return track;
}

function closeNote(
  track: MidiTrack,
  active: Map<string, { tick: number; velocity: number }>,
  key: string,
  tick: number,
): void {
  const start = active.get(key);
  if (!start) return;
  active.delete(key);
  track.notes.push({
    tick: start.tick,
    endTick: Math.max(start.tick, tick),
    pitch: Number(key.split(":")[1]),
    velocity: start.velocity,
  });
}

/**
 * MIDI text has no declared encoding. Try UTF-8 first (modern charts) and fall
 * back to Windows-1252 (the legacy convention); `decodeText` does both, and a
 * byte-for-byte Latin-1 read turned `’`/`ä` into mojibake.
 */
function midiText(data: Uint8Array): string {
  return decodeText(data);
}

/**
 * Ticks → milliseconds, from the file's tempo map.
 *
 * Most charts ramp the tempo all over the place (a chart can carry a
 * tempo event every bar), so the map is walked once into breakpoints and then
 * looked up, rather than recomputed per note.
 */
function makeTickClock(
  division: number,
  map: { tick: number; usPerBeat: number }[],
): (tick: number) => number {
  const breakpoints: { tick: number; ms: number; usPerBeat: number }[] = [];
  let usPerBeat = DEFAULT_US_PER_BEAT;
  let ms = 0;
  let lastTick = 0;
  for (const change of map) {
    if (change.tick > lastTick) {
      ms += ((change.tick - lastTick) * usPerBeat) / division / 1000;
      lastTick = change.tick;
    }
    usPerBeat = change.usPerBeat;
    breakpoints.push({ tick: change.tick, ms, usPerBeat });
  }
  return (tick: number) => {
    if (breakpoints.length === 0) return (tick * DEFAULT_US_PER_BEAT) / division / 1000;
    let low = 0;
    let high = breakpoints.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (breakpoints[mid].tick <= tick) low = mid;
      else high = mid - 1;
    }
    const at = breakpoints[low];
    return at.ms + ((tick - at.tick) * at.usPerBeat) / division / 1000;
  };
}
