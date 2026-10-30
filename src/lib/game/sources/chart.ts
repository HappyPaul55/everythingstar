/**
 * The `.chart` file: Clone Hero's and Phase Shift's own text format.
 *
 * A `.chart` is closer to our own shape than a MIDI is — it already names one
 * section per **instrument and difficulty** (`[ExpertSingle]`, `[HardDrums]`), so
 * nothing has to be pulled apart by pitch. A note is `tick = N fret length`, star
 * power is `S`, section names are `E` events, and the tempo is a `SyncTrack` of
 * `B` (thousandths of a beat a minute) lines.
 *
 * ```text
 * [Song]        { Resolution = 480   MusicStream = "song.ogg" }
 * [SyncTrack]   { 0 = B 120000       0 = TS 4 }
 * [Events]      { 0 = E "section Intro" }
 * [ExpertSingle]{ 3840 = N 2 479     9600 = S 2 1920 }
 * ```
 *
 * A **drum** section is six columns wide: fret 5 is the kick pedal, and `[Events]`
 * can mark fills with `E "mix 8"` or a section named "…fill…".
 */

import {
  strums,
  type ChartPhrase,
  type Difficulty,
  type InstrumentKind,
  type LaneChart,
  type LaneNote,
  type LaneNoteKind,
  type TrackSection,
  type LaneRole,
} from "../track";
import type { SourceAudio } from "../source";
import { audioFromFiles } from "./files";
import { emptySource, type ParsedSource, type StemRole } from "./types";
import { SONG_TAIL_MS } from "./duration";
import { slug } from "../text";
import { mergeSpans, resolveFileRef, yearOf } from "./common";

/** The difficulties, by the word a section starts with. */
const DIFFICULTY_WORDS: Record<string, Difficulty> = {
  easy: "easy",
  medium: "normal",
  hard: "hard",
  expert: "expert",
};

/** What a section's instrument word means, and how wide it is. */
interface ChartInstrument {
  instrument: InstrumentKind;
  /** Which guitar part it is, when the section's word says so. */
  role?: LaneRole;
  priority: number;
  width: number;
}

function instrumentFor(word: string): ChartInstrument | null {
  switch (word) {
    case "Single":
      return { instrument: "guitar", role: "lead", priority: 3, width: 5 };
    case "DoubleGuitar":
      return { instrument: "guitar", role: "lead", priority: 2, width: 5 };
    case "DoubleRhythm":
      return { instrument: "guitar", role: "rhythm", priority: 2, width: 5 };
    case "DoubleBass":
      return { instrument: "bass", priority: 3, width: 5 };
    case "Drums":
    case "DrumsReal":
      // The drum kit's sixth column is the **kick pedal**, written as fret 5.
      return { instrument: "drums", priority: word === "Drums" ? 3 : 2, width: 6 };
    case "Keyboard":
      return { instrument: "keys", priority: 3, width: 5 };
    case "GHLGuitar":
      return { instrument: "guitar", role: "lead", priority: 1, width: 6 };
    default:
      return null;
  }
}

export interface ChartTextInput {
  text: string;
  ini?: { get(key: string): string | undefined } | null;
  stems?: Partial<Record<StemRole, string>>;
  video?: { kind: "youtube"; id: string } | null;
  id?: string;
  fallbackTitle?: string;
  art?: string | null;
  /**
   * The chart's own absolute URL. A `MusicStream` the folder table did not find is
   * resolved against it, so a mix under `audio/song.ogg` is played rather than listed
   * as a bare name. A local folder passes its `folder://` URL.
   */
  baseUrl?: string | null;
}

/** Read a Clone Hero / Phase Shift `.chart`. */
export function readChartText(input: ChartTextInput): ParsedSource {
  const sections = parseSections(input.text);
  const song = sections.get("Song") ?? [];
  const values = readValues(song);

  const problems: string[] = [];
  const resolution = readResolution(values, problems);
  const offsetMs = number(values.get("offset"), 0);
  const tempo = readTempo(sections.get("SyncTrack") ?? [], resolution);
  const toMs = (tick: number) => offsetMs + tempo.toMs(tick);

  const title =
    text(values.get("name")) ?? input.ini?.get("name") ?? input.fallbackTitle ?? "Untitled";
  const artist = text(values.get("artist")) ?? input.ini?.get("artist") ?? "";
  const album = text(values.get("album")) ?? input.ini?.get("album") ?? null;
  const year = yearOf(number(values.get("year"), 0)) ?? yearOf(Number(input.ini?.get("year")));
  const source = emptySource(input.id ?? (slug(title) || "song"), title);
  source.problems.push(...problems);
  source.meta = {
    id: source.meta.id,
    title,
    artist,
    album,
    year,
    durationMs: 0,
    previewStartMs: 0,
    art: input.art ?? null,
    video: input.video ?? null,
  };
  source.audio = readAudio(values, input.stems ?? {}, input.baseUrl ?? null);
  source.sections = readSections(sections.get("Events") ?? [], toMs);

  const charts = new Map<string, { chart: LaneChart; priority: number }>();
  const events = sections.get("Events") ?? [];
  const fills = readFills(events, toMs);
  for (const [name, lines] of sections) {
    const parsed = /^(Easy|Medium|Hard|Expert)(.+)$/.exec(name);
    if (!parsed) continue;
    const difficulty = DIFFICULTY_WORDS[parsed[1].toLowerCase()];
    const part = instrumentFor(parsed[2]);
    if (!difficulty || !part) continue;
    const chart = readChartNotes(lines, difficulty, part, tempo.bpm, toMs);
    if (!chart) continue;
    // A fill is the EVENTS track's, so every drum chart at every level reads the
    // same windows; a chart on any other instrument carries none.
    if (part.instrument === "drums" && fills.length > 0) chart.fills = fills;
    const key = `${part.instrument}:${part.role ?? ""}:${difficulty}`;
    const existing = charts.get(key);
    if (existing && existing.priority >= part.priority) {
      source.problems.push(`dropped ${name}: another chart is already there`);
      continue;
    }
    charts.set(key, { chart, priority: part.priority });
  }
  source.lanes = [...charts.values()].map((entry) => entry.chart);

  // The song's length: what its own `song.ini` states, or the last note plus a tail
  // when it states nothing.
  const lastNote = source.lanes.reduce(
    (max, chart) => Math.max(max, chart.notes.reduce((end, note) => Math.max(end, note.timeMs + note.lengthMs), 0)),
    0,
  );
  const end = source.sections.reduce((max, section) => Math.max(max, section.timeMs), 0);
  const stated = Number(input.ini?.get("song_length"));
  source.meta.durationMs =
    Number.isFinite(stated) && stated > 0 ? stated : Math.max(lastNote, end) + SONG_TAIL_MS;
  return source;
}

/** The file's `[Section]\n{ ... }` blocks, as raw lines, in file order. */
function parseSections(text: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      current = [];
      sections.set(header[1], current);
      continue;
    }
    if (line === "{" || line === "}") continue;
    if (current && line) current.push(line);
  }
  return sections;
}

/** `Key = value` lines as a lower-cased map. */
function readValues(lines: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of lines) {
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim().toLowerCase();
    values.set(key, stripQuotes(line.slice(equals + 1).trim()));
  }
  return values;
}

/** A `tick = B <thousandths of a bpm>` map, as a tick → milliseconds clock. */
function readTempo(
  lines: readonly string[],
  resolution: number,
): { toMs: (tick: number) => number; bpm: number } {
  const changes: { tick: number; usPerBeat: number }[] = [];
  for (const line of lines) {
    // The line is `0 = B 120000`: split at the first `=`, then the right-hand side
    // into the kind and its value.
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const tick = Number(line.slice(0, equals).trim());
    if (!Number.isFinite(tick)) continue;
    const [kind, raw] = line.slice(equals + 1).trim().split(/\s+/);
    if ((kind ?? "").toUpperCase() !== "B") continue;
    // A `B` value is thousandths of a bpm, so 150000 is 150 bpm and 400 ms a beat.
    const micro = Number(raw) / 1000;
    if (!(Number.isFinite(micro) && micro > 0)) continue;
    changes.push({ tick, usPerBeat: 60_000_000 / micro });
  }
  changes.sort((a, b) => a.tick - b.tick);
  if (changes.length === 0) changes.push({ tick: 0, usPerBeat: 500_000 });
  const opening = changes[0].usPerBeat;
  const toMs = (tick: number) => {
    let ms = 0;
    let last = 0;
    let usPerBeat = opening;
    for (const change of changes) {
      if (change.tick >= tick) break;
      ms += ((change.tick - last) * usPerBeat) / resolution / 1000;
      last = change.tick;
      usPerBeat = change.usPerBeat;
    }
    return ms + ((tick - last) * usPerBeat) / resolution / 1000;
  };
  return { toMs, bpm: Math.round((60_000_000 / opening) * 100) / 100 };
}

/**
 * The chart's ticks a quarter note is cut into, which every time in the file is
 * measured against.
 *
 * A resolution that is negative, zero or not a number would divide every tick by
 * it and put the whole chart at `Infinity` or `NaN`, so it is replaced — and named,
 * because a file whose timing cannot be trusted should not read as one that can.
 */
function readResolution(values: Map<string, string>, problems: string[]): number {
  const stated = values.get("resolution") ?? values.get("timedivision");
  if (stated === undefined) return 480;
  const resolution = Number(stated);
  if (Number.isFinite(resolution) && resolution > 0) return resolution;
  problems.push("the chart's resolution is invalid; assuming 480");
  return 480;
}

/** The song's sections, from the `E "section …"` events. */
function readSections(lines: readonly string[], toMs: (tick: number) => number): TrackSection[] {
  const sections: TrackSection[] = [];
  for (const line of lines) {
    const match = /=\s*E\s+"(.*)"\s*$/.exec(line);
    if (!match) continue;
    const name = /^section\s+(.+)$/i.exec(match[1]);
    if (!name) continue;
    const tick = Number(line.split("=")[0].trim());
    if (!Number.isFinite(tick)) continue;
    sections.push({ timeMs: Math.max(0, Math.round(toMs(tick))), name: name[1].trim() });
  }
  return sections.sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * The drum fills, from the `[Events]` track's `E "mix 8"` events and from sections
 * whose own name says "fill".
 *
 * The rule is `ghmidi.ts`'s, read from the text format rather than from MIDI: a
 * fill opens at `mix 8` and closes at the next mix marker, section or `[end]`; a
 * section named "…fill…" is a fill to the next section. Overlaps are merged, so a
 * chart folder that marks a fill both ways reads as one window.
 */
function readFills(lines: readonly string[], toMs: (tick: number) => number): ChartPhrase[] {
  const events: { tick: number; name: string }[] = [];
  for (const line of lines) {
    const match = /=\s*E\s+"(.*)"\s*$/.exec(line);
    if (!match) continue;
    const tick = Number(line.split("=")[0].trim());
    if (!Number.isFinite(tick)) continue;
    events.push({ tick, name: match[1].trim() });
  }
  events.sort((a, b) => a.tick - b.tick);
  const spans: ChartPhrase[] = [];
  let open: number | null = null;
  const close = (tick: number) => {
    if (open === null) return;
    spans.push({ startMs: toMs(open), endMs: toMs(tick) });
    open = null;
  };
  for (const event of events) {
    const mix = /^mix\s+(\d+)$/i.exec(event.name);
    if (mix) {
      if (Number(mix[1]) === 8) {
        if (open === null) open = event.tick;
      } else close(event.tick);
      continue;
    }
    const section = /^section\s+(.+)$/i.exec(event.name);
    if (section) {
      close(event.tick);
      if (/fill/i.test(section[1])) open = event.tick;
      continue;
    }
    if (/^end$/i.test(event.name)) close(event.tick);
  }
  return mergeSpans(spans);
}

function readChartNotes(
  lines: readonly string[],
  difficulty: Difficulty,
  part: ChartInstrument,
  bpm: number,
  toMs: (tick: number) => number,
): LaneChart | null {
  const strummed = strums(part.instrument);
  const plain: LaneNoteKind = "strum";
  const notes: LaneNote[] = [];
  const phrases: ChartPhrase[] = [];
  for (const line of lines) {
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const tick = Number(line.slice(0, equals).trim());
    if (!Number.isFinite(tick)) continue;
    const tokens = line.slice(equals + 1).trim().split(/\s+/);
    const kind = tokens[0]?.toUpperCase();
    if (kind === "N") {
      const fret = Number(tokens[1]);
      // `N fret length` in the original format, `N fret type length` in newer ones.
      const typed = tokens.length >= 4;
      const type = typed ? Number(tokens[2]) : -1;
      const lengthTicks = Number(tokens[typed ? 3 : 2]) || 0;
      const note = fretNote(fret, type, part, plain, strummed);
      if (!note) continue;
      notes.push({
        id: "",
        timeMs: Math.max(0, Math.round(toMs(tick))),
        lengthMs: Math.max(0, Math.round(toMs(tick + lengthTicks) - toMs(tick))),
        ...note,
        hero: false,
      });
    } else if (kind === "S") {
      // `S <value> <length>`: 2 is the star power phrase.
      if (Number(tokens[1]) !== 2) continue;
      const lengthTicks = Number(tokens[2]) || 0;
      const startMs = Math.max(0, Math.round(toMs(tick)));
      const endMs = Math.max(0, Math.round(toMs(tick + lengthTicks)));
      if (endMs > startMs) phrases.push({ startMs, endMs });
    }
  }
  notes.sort((a, b) => a.timeMs - b.timeMs);
  if (notes.length === 0) return null;
  if (strummed && notes[0].kind === "hopo") notes[0] = { ...notes[0], kind: "strum" };

  const highest = notes.reduce((max, note) => (note.column === null ? max : Math.max(max, note.column)), -1);
  let columns = highest + 1;
  if (notes.some((note) => note.column === null)) columns = Math.max(columns, part.width);
  // A drum highway always has a pedal column, used or not: six columns is what a
  // kit is, and the band's learn flow asks a drummer for six controls.
  if (part.instrument === "drums") columns = Math.max(part.width, columns);
  columns = Math.max(1, columns);
  return {
    instrument: part.instrument,
    ...(part.role ? { role: part.role } : {}),
    difficulty,
    columns,
    ...(bpm > 0 ? { bpm } : {}),
    ...(phrases.length > 0 ? { phrases } : {}),
    notes: notes.map((note, index) => ({
      ...note,
      id: `${part.role ?? part.instrument}-${difficulty}-${index}`,
    })),
  };
}

function fretNote(
  fret: number,
  type: number,
  part: ChartInstrument,
  plain: LaneNoteKind,
  strummed: boolean,
): Pick<LaneNote, "column" | "kind"> | null {
  if (!Number.isFinite(fret) || fret < 0) return null;
  // Type 1 is the forced hopo; everything else on a strummed instrument is a
  // strum. A tap only exists on the instruments whose notes are tapped, where the
  // instrument's own kind is the answer anyway.
  const kind: LaneNoteKind = strummed ? (type === 1 ? "hopo" : "strum") : plain;
  if (fret >= 0 && fret < part.width) return { column: Math.trunc(fret), kind };
  // On a **drum** chart the width is six, so fret 5 was already taken as the kick
  // pedal above; on a strummed instrument whose highway is five wide it is the open
  // note. 6 and up are six-fret-only, which this highway is not.
  if (fret === 5 && strummed) return { column: null, kind };
  return null;
}

/** The chart's own `MusicStream` is the mix when the folder has no `song.ogg`. */
function readAudio(
  values: Map<string, string>,
  stems: Partial<Record<StemRole, string>>,
  baseUrl: string | null,
): SourceAudio {
  const merged: Partial<Record<StemRole, string>> = { ...stems };
  if (!merged.master) {
    // A name the folder table did not know is still a file beside the chart: resolved
    // against the chart's own URL, so `audio/song.ogg` is where the sound is.
    const named = resolveFileRef(text(values.get("musicstream")), baseUrl);
    if (named) merged.master = named;
  }
  return audioFromFiles(merged);
}

function stripQuotes(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value;
}

function text(value: string | undefined): string | null {
  return value !== undefined && value.trim() !== "" ? value.trim() : null;
}

function number(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
