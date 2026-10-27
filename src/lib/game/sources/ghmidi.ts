/**
 * Guitar Hero and YARG: the **note-track convention**.
 *
 * The charts all write the same MIDI: one track per part (`PART GUITAR`,
 * `PART DRUMS`, `PART VOCALS`, `HARM1`…), every difficulty inside one track, and
 * the meaning of a note carried by its pitch. The bands are a fixed set of bases,
 * one per difficulty:
 *
 * ```
 *           green red yellow blue orange  open  hopo  strum
 *  easy       60   61    62    63    64     59    65     66
 *  medium     72   73    74    75    76     71    77     78
 *  hard       84   85    86    87    88     83    89     90
 *  expert     96   97    98    99   100     95   101    102
 * ```
 *
 * The `+5`/`+6` pitches are not notes: they are the **strum/hopo flag** the chart
 * writes once per moment, so a chart says exactly which notes must be strummed
 * instead of leaving the game to infer it. `116` is star power; on a voice track
 * `105` opens a lyric line and the lyric events carry the syllables.
 *
 * On a **drum** track the open-note pitch (`95`/`83`/`71`/`59`) is the **kick
 * pedal**, not an open note: drums have six columns and the last one is the pedal.
 * Its `[mix 8]` text events mark the **fills** — freestyle windows with no notes to
 * get right.
 *
 * All of that is read here and normalised away: what comes out is our own chart, and
 * nothing downstream knows a MIDI was involved.
 */

import {
  KICK_COLUMN,
  MAX_PARTS,
  strums,
  type ChartPhrase,
  type Difficulty,
  type InstrumentKind,
  type LaneChart,
  type LaneNote,
  type LaneNoteKind,
  type MelodyChart,
  type MelodyLine,
  type MelodyNote,
  type TrackSection,
  type LaneRole,
} from "../track";
import { type IniValues, iniNumber, iniText } from "./ini";
import { contentDuration, SONG_TAIL_MS } from "./duration";
import { audioFromFiles } from "./files";
import { groupLyrics, type Syllable } from "./lyricLines";
import { type MidiDoc, type MidiTrack, parseMidi } from "./midi";
import { slug } from "../text";
import { mergeSpans, yearOf } from "./common";
import { emptySource, type ParsedSource, type StemRole } from "./types";

/** The four difficulty bands, by the pitch green sits on. */
const BANDS: { difficulty: Difficulty; base: number }[] = [
  { difficulty: "easy", base: 60 },
  { difficulty: "normal", base: 72 },
  { difficulty: "hard", base: 84 },
  { difficulty: "expert", base: 96 },
];

const FRET_COUNT = 5;
const OPEN_OFFSET = -1;
const HOPO_OFFSET = 5;
const STRUM_OFFSET = 6;
/** Star power, and the tempo event that names it. */
const STAR_POWER = 116;
/** The note that opens a lyric line on a voice track. */
const LINE_MARKER = 105;
/** Below this a voice note is a talkie — spoken, with no pitch to judge. */
const TALKIE_FLOOR = 40;

/** How a stem is named, and what instrument it is. */
/** One instrument a track carries, and how a chart for it behaves. */
interface LanePart {
  instrument: InstrumentKind;
  /** Which guitar part it is, when the track's name says so. */
  role?: LaneRole;
  /** Higher wins when two parts map to one instrument and role at one level. */
  priority: number;
  /** The instrument's full width, for a chart that narrows itself. */
  width: number;
  /** Six-fret charts carry no strum/hopo flags. */
  sixFret: boolean;
}

export interface GameMidiInput {
  bytes: Uint8Array;
  /** The `song.ini` beside the chart, when there is one. */
  ini?: IniValues | null;
  /** The audio files found beside the chart, by the role they play. */
  stems?: Partial<Record<StemRole, string>>;
  /** The song's own id; derived from the title when absent. */
  id?: string;
  /** What to call the song when the file does not name it (usually the folder). */
  fallbackTitle?: string;
  /** The art reference the caller found, resolved by the caller. */
  art?: string | null;
}

/** Read a Guitar Hero / YARG `notes.mid`, with its `song.ini` if any. */
export function readGameMidi(input: GameMidiInput): ParsedSource {
  const ini = input.ini ?? null;
  // The `song.ini`'s offset moves the whole chart against the audio, and it is applied
  // here rather than in `parseMidi` so the binary reader stays a file reader.
  const doc = withOffset(parseMidi(input.bytes), offsetMsOf(ini));
  const problems = [...doc.problems];

  const meta = readMeta(input, ini);
  const source = emptySource(meta.id, meta.title);
  source.meta = { ...source.meta, ...meta };
  source.problems = problems;
  source.sections = readSections(doc);
  source.audio = audioFromFiles(input.stems ?? {});
  source.lanes = readLanes(doc, problems);
  source.melody = readVoice(doc, meta.id, problems);
  // A length the file states always wins; a chart that never says gets one from its
  // own notes, or it would read `0:00` in the jukebox.
  if (source.meta.durationMs <= 0) {
    source.meta.durationMs =
      Math.max(contentDuration(source.lanes, source.melody), endMarkerMs(doc)) + SONG_TAIL_MS;
  }
  return source;
}

/**
 * The `song.ini`'s `offset`, in milliseconds: the chart's shift against the audio.
 *
 * Charts write one whenever the chart and the stems
 * disagree (a chart export is regularly a quarter-second out without it),
 * and a missing or unreadable value is `0`.
 *
 * **The sign is `chart.ts`'s**, whose own offset is `offsetMs + tempo.toMs(tick)`:
 * positive moves the chart **later**. The two formats mean the same thing by it, and
 * one convention in the codebase is what stops a folder that ships both files from being
 * shifted two ways.
 */
function offsetMsOf(ini: IniValues | null): number {
  return ini ? iniNumber(ini, "offset", 0) : 0;
}

/**
 * The same document on a shifted clock, so every reader below — notes, lyrics,
 * sections and the `[end]` marker — takes the offset **once**, from one place.
 */
function withOffset(doc: MidiDoc, offsetMs: number): MidiDoc {
  if (offsetMs === 0) return doc;
  return { ...doc, toMs: (tick) => offsetMs + doc.toMs(tick) };
}

/** Where the `[end]` event says the song stops, or 0 when there is none. */
function endMarkerMs(doc: MidiDoc): number {
  let end = 0;
  for (const track of doc.tracks) {
    for (const event of track.texts) {
      if (/^\[end\]$/i.test(event.text.trim())) end = Math.max(end, doc.toMs(event.tick));
    }
  }
  return end;
}

/* ------------------------------------------------------------------- meta */

function readMeta(input: GameMidiInput, ini: IniValues | null) {
  const title =
    (ini && iniText(ini, "name")) ?? input.fallbackTitle ?? "Untitled";
  return {
    id: input.id ?? (slug(title) || "song"),
    title,
    artist: (ini && iniText(ini, "artist")) ?? "",
    album: ini ? iniText(ini, "album") : null,
    year: ini ? yearOf(iniNumber(ini, "year", 0)) : null,
    durationMs: ini ? Math.max(0, iniNumber(ini, "song_length", 0)) : 0,
    previewStartMs: ini ? Math.max(0, iniNumber(ini, "preview_start_time", 0)) : 0,
    art: input.art ?? null,
    video: null,
  };
}

/** The sections the `EVENTS` track names, in time order. */
function readSections(doc: MidiDoc): TrackSection[] {
  const sections: TrackSection[] = [];
  for (const track of doc.tracks) {
    for (const event of track.texts) {
      const match = /^\[section\s+(.+?)\]$/i.exec(event.text.trim());
      if (!match) continue;
      sections.push({ name: match[1].trim(), timeMs: Math.max(0, Math.round(doc.toMs(event.tick))) });
    }
  }
  return sections.sort((a, b) => a.timeMs - b.timeMs);
}

/* ------------------------------------------------------------------ audio */

/* The stems, and which of them is the song, are the same question for every source:
   see `audioFromFiles` in `files.ts` for the rule and why it is what it is. */

/* ------------------------------------------------------------------ lanes */

function readLanes(doc: MidiDoc, problems: string[]): LaneChart[] {
  const charts = new Map<string, { chart: LaneChart; priority: number; part: string }>();
  for (const track of doc.tracks) {
    const part = lanePart(track.name);
    if (!part) continue;
    for (const band of BANDS) {
      const chart = readBand(doc, track, band, part);
      if (!chart) continue;
      const key = `${part.instrument}:${part.role ?? ""}:${band.difficulty}`;
      const existing = charts.get(key);
      if (existing && existing.priority >= part.priority) {
        problems.push(`dropped ${track.name} at ${band.difficulty}: ${existing.part} is already there`);
        continue;
      }
      if (existing) {
        problems.push(`${track.name} at ${band.difficulty} replaced ${existing.part}`);
      }
      charts.set(key, { chart, priority: part.priority, part: track.name.trim() });
    }
  }
  return [...charts.values()].map((entry) => entry.chart);
}

function readBand(
  doc: MidiDoc,
  track: MidiTrack,
  band: { difficulty: Difficulty; base: number },
  part: LanePart,
): LaneChart | null {
  const inBand = track.notes.filter(
    (note) => note.pitch >= band.base + OPEN_OFFSET && note.pitch <= band.base + STRUM_OFFSET,
  );
  if (inBand.length === 0) return null;

  const strummed = strums(part.instrument);
  const drums = part.instrument === "drums";
  const plain: LaneNoteKind = strummed ? "strum" : "tap";
  const byTick = new Map<number, { frets: { column: number; lengthMs: number }[]; flag: LaneNoteKind | null; open: number | null }>();
  for (const note of inBand) {
    const offset = note.pitch - band.base;
    const lengthMs = Math.max(0, Math.round(doc.toMs(note.endTick) - doc.toMs(note.tick)));
    const moment = byTick.get(note.tick) ?? { frets: [], flag: null, open: null };
    if (offset >= 0 && offset < FRET_COUNT) {
      moment.frets.push({ column: offset, lengthMs });
    } else if (offset === HOPO_OFFSET) {
      moment.flag = "hopo";
    } else if (offset === STRUM_OFFSET) {
      moment.flag = "strum";
    } else if (offset === OPEN_OFFSET) {
      // On a drum kit the open-note pitch is the **kick pedal**, and it is a pad
      // like the others: it joins the moment's frets, so a kick and a pad on one
      // tick are a chord rather than one of them being dropped.
      if (drums) moment.frets.push({ column: KICK_COLUMN, lengthMs });
      else moment.open = lengthMs;
    }
    byTick.set(note.tick, moment);
  }

  const sorted = [...byTick.entries()].sort((a, b) => a[0] - b[0]);
  const notes: LaneNote[] = [];
  for (const [tick, moment] of sorted) {
    const timeMs = Math.max(0, Math.round(doc.toMs(tick)));
    // A tap instrument ignores the flags: its notes are tapped whatever the file
    // called them, which is what `chartProblems` insists on.
    const kind: LaneNoteKind = strummed ? (moment.flag ?? "strum") : plain;
    if (moment.frets.length === 0) {
      if (moment.open !== null && strummed) {
        notes.push({ id: "", timeMs, lengthMs: moment.open, kind: plain, column: null, hero: false });
      }
      continue;
    }
    for (const fret of moment.frets) {
      notes.push({ id: "", timeMs, lengthMs: fret.lengthMs, kind, column: fret.column, hero: false });
    }
  }
  if (notes.length === 0) return null;
  // The first note of a chart is always a strum: there is nothing before it to
  // hammer on from, and a chart that says otherwise would be unplayable.
  if (strummed && notes[0].kind === "hopo") notes[0] = { ...notes[0], kind: "strum" };

  const highest = notes.reduce(
    (max, note) => (note.column === null ? max : Math.max(max, note.column)),
    -1,
  );
  let columns = highest + 1;
  if (notes.some((note) => note.column === null)) columns = Math.max(columns, part.width);
  if (part.sixFret) columns = Math.max(6, columns);
  // A drum highway always has the pedal's column, whether or not this chart uses
  // it: six columns is what a kit is, and the band's learn flow asks for six.
  if (drums) columns = Math.max(KICK_COLUMN + 1, columns);
  columns = Math.max(1, columns);

  const bpm = Math.round(doc.bpm * 100) / 100;
  const phrases = readPhrases(doc, track);
  const fills = drums ? readFills(doc, track) : [];
  return {
    instrument: part.instrument,
    ...(part.role ? { role: part.role } : {}),
    difficulty: band.difficulty,
    columns,
    ...(bpm > 0 ? { bpm } : {}),
    ...(phrases.length > 0 ? { phrases } : {}),
    ...(fills.length > 0 ? { fills } : {}),
    notes: notes.map((note, index) => ({
      ...note,
      id: `${part.role ?? part.instrument}-${band.difficulty}-${index}`,
    })),
  };
}

/** Star power, as the spans between the `116` notes (which a file may write either way). */
function readPhrases(doc: MidiDoc, track: MidiTrack): ChartPhrase[] {
  const events = track.notes.filter((note) => note.pitch === STAR_POWER).sort((a, b) => a.tick - b.tick);
  if (events.length === 0) return [];
  const phrases: ChartPhrase[] = [];
  const sustained = events.every((note) => note.endTick > note.tick);
  if (sustained) {
    for (const note of events) {
      phrases.push({ startMs: doc.toMs(note.tick), endMs: doc.toMs(note.endTick) });
    }
  } else {
    for (let index = 0; index < events.length; index += 2) {
      const start = events[index];
      const next = events[index + 1];
      const endTick = next ? next.tick : start.endTick;
      phrases.push({ startMs: doc.toMs(start.tick), endMs: doc.toMs(endTick) });
    }
  }
  return phrases
    .map((phrase) => ({
      startMs: Math.max(0, Math.round(phrase.startMs)),
      endMs: Math.max(0, Math.round(phrase.endMs)),
    }))
    .filter((phrase) => phrase.endMs > phrase.startMs)
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * The drum track's **fills**: the freestyle windows a chart marks with `[mix 8]`.
 *
 * A fill opens at `[mix 8]` and closes at the next mix marker that is not 8, or at
 * the next `[section …]` / `[end]`. A section whose own name says "fill" is a fill
 * too, to the next section — some chart folders write only that. The events live on the
 * drum track, but EVENTS is read as well: a file that puts its mix markers there
 * means the same thing, and being lenient about where a marker sits cannot make a
 * chart less playable.
 *
 * Overlapping spans are merged, so a file that writes both a section fill and a
 * `[mix 8]` inside it reads as one window rather than two that `chartProblems`
 * would refuse.
 */
function readFills(doc: MidiDoc, track: MidiTrack): ChartPhrase[] {
  const shared = doc.tracks.filter((entry) => /EVENTS/i.test(entry.name));
  const events = [...track.texts, ...shared.flatMap((entry) => entry.texts)]
    .sort((a, b) => a.tick - b.tick);
  const spans: ChartPhrase[] = [];
  let open: number | null = null;
  const close = (tick: number) => {
    if (open === null) return;
    spans.push({ startMs: doc.toMs(open), endMs: doc.toMs(tick) });
    open = null;
  };
  for (const event of events) {
    const text = event.text.trim();
    const mix = /^\[\s*mix\s+(\d+)\s*\]$/i.exec(text);
    if (mix) {
      if (Number(mix[1]) === 8) {
        if (open === null) open = event.tick;
      } else close(event.tick);
      continue;
    }
    const section = /^\[\s*section\s+(.+?)\s*\]$/i.exec(text);
    if (section) {
      close(event.tick);
      if (/fill/i.test(section[1])) open = event.tick;
      continue;
    }
    if (/^\[\s*end\s*\]$/i.test(text)) close(event.tick);
  }
  return mergeSpans(spans);
}

function lanePart(name: string): LanePart | null {
  const upper = name.trim().toUpperCase();
  if (upper.includes("TOUCH")) return null;
  if (upper.includes("GHL")) {
    return { instrument: "guitar", role: "lead", priority: 1, width: 6, sixFret: true };
  }
  // Some early charts name their guitar track `T1 GEMS` rather than `PART GUITAR`.
  // Its frets sit in the same bands, so reading it as a guitar is enough; the extra
  // pitches beside them are markers it does not need.
  if (/^T\d+\s+GEMS$/.test(upper)) {
    return { instrument: "guitar", role: "lead", priority: 2, width: FRET_COUNT, sixFret: false };
  }
  switch (upper) {
    case "PART GUITAR":
    case "PART GUITAR COOP":
      return { instrument: "guitar", role: "lead", priority: 3, width: FRET_COUNT, sixFret: false };
    case "PART RHYTHM":
      return { instrument: "guitar", role: "rhythm", priority: 2, width: FRET_COUNT, sixFret: false };
    case "PART BASS":
      return { instrument: "bass", priority: 3, width: FRET_COUNT, sixFret: false };
    case "PART KEYS":
      return { instrument: "keys", priority: 3, width: FRET_COUNT, sixFret: false };
    case "PART DRUMS":
      return { instrument: "drums", priority: 3, width: FRET_COUNT, sixFret: false };
    case "PART REAL_DRUMS_PS":
      return { instrument: "drums", priority: 2, width: FRET_COUNT, sixFret: false };
    case "PART DANCE":
      return { instrument: "dance", priority: 3, width: FRET_COUNT, sixFret: false };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ voice */

/**
 * Which part of the melody a track sings **in the file**: 0 is the lead, 1 and 2 are
 * harmonies. `readVoice` compacts these into our own 0..n-1.
 */
function voicePart(name: string): number | null {
  switch (name.trim().toUpperCase()) {
    case "PART VOCALS":
      return 0;
    case "HARM1":
      return 1;
    case "HARM2":
      return 2;
    case "HARM3":
      return 3;
    default:
      return null;
  }
}

function readVoice(doc: MidiDoc, id: string, problems: string[]): MelodyChart | null {
  const voices: { part: number; syllables: Syllable[] }[] = [];
  for (const track of doc.tracks) {
    const part = voicePart(track.name);
    if (part === null) continue;
    const syllables = readSyllables(doc, track, true);
    if (syllables.length > 0) voices.push({ part, syllables });
  }
  if (voices.length === 0) {
    // No part names at all: this is a **karaoke** file. A `.kar` — or any MIDI whose
    // maker never heard of `PART VOCALS` — carries its words as lyric events on
    // whatever track it felt like, so the one with the most of them is the voice.
    const sung = doc.tracks
      .filter((track) => track.lyrics.length > 0)
      .sort((a, b) => b.lyrics.length - a.lyrics.length)[0];
    if (sung) {
      const syllables = readSyllables(doc, sung, false);
      if (syllables.length > 0) voices.push({ part: 0, syllables });
    }
  }
  if (voices.length === 0) return null;
  // No lyric events at all means no words: an instrumental's empty voice track is
  // not a melody, and inventing one would put a blank region on the stage.
  const hasWords = voices.some((voice) =>
    voice.syllables.some((syllable) => syllable.text.trim() !== "" && syllable.text.trim() !== "+"),
  );
  if (!hasWords) return null;

  // **The parts are compacted.** A file can carry HARM1 and HARM2 with no
  // `PART VOCALS` — a harmonies chart writes them that way — so their own
  // indices 1 and 2 would leave part 0 empty and put part 2 past `parts`, where
  // `readMelody` clamps it away. Sorting by the file's own index (the lead first when
  // it is there, otherwise the lowest harmony) and renumbering 0..n-1 keeps every
  // voice and makes `parts` the truth, so a singer on part 0 always has a part.
  //
  // A fourth voice is **shared**, not dropped: the stage's ceiling is `MAX_PARTS`
  // colours, but a chart that wrote a fourth harmony still has words, and losing a
  // whole track because of a palette limit is worse than sharing the last part.
  const sorted = [...voices].sort((a, b) => a.part - b.part);
  const kept = sorted.slice(0, MAX_PARTS);
  const sharedPart = Math.max(0, kept.length - 1);
  // A fourth voice is **shared** on the last part, but it stays its own stream:
  // concatenating the syllables before grouping would let one voice's `+`
  // placeholder split the other's word, and would duplicate a unison word. Group
  // each stream separately, then drop an exact duplicate note/line from the shared
  // part so two voices singing together are heard once.
  const overflow = sorted.slice(MAX_PARTS);
  if (overflow.length > 0) {
    problems.push(`a harmony beyond ${MAX_PARTS} voices shares the last part`);
  }
  const parts = kept.map((voice, index) => ({ part: index, syllables: voice.syllables }));
  const groups = [
    ...parts,
    ...overflow.map((voice) => ({
      part: sharedPart,
      syllables: voice.syllables.filter((syllable) => syllable.text.trim() !== "+"),
    })),
  ];

  const pitched = groups
    .flatMap((voice) => voice.syllables)
    .filter((syllable): syllable is Syllable & { midi: number } => syllable.midi !== null);
  const hasPitch = pitched.length > 0;
  let rootMidi = 57;
  let rows = 6;
  if (hasPitch) {
    const pitches = pitched.map((syllable) => syllable.midi);
    const low = Math.min(...pitches);
    const high = Math.max(...pitches);
    const span = Math.max(1, high - low + 1);
    if (span < rows) {
      rootMidi = low - Math.floor((rows - span) / 2);
    } else {
      rootMidi = low;
      rows = span;
    }
  }

  const lines: MelodyLine[] = [];
  const notes: Omit<MelodyNote, "id">[] = [];
  const lineKeys = new Set<string>();
  const noteKeys = new Set<string>();
  for (const voice of groups) {
    const grouped = groupLyrics(voice.syllables, voice.part, { rootMidi, rows });
    for (const line of grouped.lines) {
      const key = `${line.timeMs}:${line.endMs}:${line.words.map((word) => word.text).join("|")}`;
      if (lineKeys.has(key)) continue;
      lineKeys.add(key);
      lines.push(line);
    }
    for (const note of grouped.notes) {
      const key = `${note.part}:${note.timeMs}:${note.text}`;
      if (noteKeys.has(key)) continue;
      noteKeys.add(key);
      notes.push(note);
    }
    problems.push(...grouped.problems);
  }
  lines.sort((a, b) => a.timeMs - b.timeMs);
  notes.sort((a, b) => a.timeMs - b.timeMs || a.part - b.part);

  return {
    parts: parts.length,
    hasPitch,
    rows,
    rootMidi,
    lines,
    notes: notes.map((note, index) => ({ ...note, id: `${id}-voice:${index}` })),
  };
}

function readSyllables(doc: MidiDoc, track: MidiTrack, markers: boolean): Syllable[] {
  const lineMarkers = markers
    ? track.notes
        .filter((note) => note.pitch === LINE_MARKER)
        .map((note) => note.tick)
        .sort((a, b) => a - b)
    : [];
  const lyricAt = new Map<number, string>();
  for (const lyric of track.lyrics) {
    if (!lyricAt.has(lyric.tick)) lyricAt.set(lyric.tick, lyric.text);
  }
  const syllables: Syllable[] = [];
  for (const note of track.notes) {
    // A named part's markers sit above its frets; a karaoke file's notes are a tune,
    // and anything above 100 there is simply a high note.
    if (note.pitch === STAR_POWER || (markers && note.pitch >= 100)) continue;
    syllables.push({
      timeMs: doc.toMs(note.tick),
      lengthMs: Math.max(0, doc.toMs(note.endTick) - doc.toMs(note.tick)),
      midi: note.pitch < TALKIE_FLOOR ? null : note.pitch,
      text: lyricAt.get(note.tick) ?? "+",
      lineStart: false,
    });
  }
  syllables.sort((a, b) => a.timeMs - b.timeMs);
  // A line marker sits a breath before the word it opens, so it marks the first
  // syllable at or after it rather than the note on its own tick.
  let at = 0;
  for (const marker of lineMarkers) {
    while (at < syllables.length && syllables[at].timeMs < doc.toMs(marker)) at += 1;
    if (at < syllables.length) syllables[at].lineStart = true;
  }
  return syllables;
}
