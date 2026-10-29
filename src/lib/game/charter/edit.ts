/**
 * The charter's editing rules — pure functions over a chart's note list.
 *
 * A chart is the game's own `LaneChart` plus a **key** that names it in the editor
 * (instrument, guitar role, difficulty). Every edit goes through
 * `normaliseChart`, so the list stays sorted, ids stay unique, an open note never
 * shares its moment, a sustain never runs into the next note in its column, and
 * the result is a chart `chartProblems` accepts.
 */

import {
  chartProblems,
  isOpen,
  KICK_COLUMN,
  strums,
  type ChartPhrase,
  type Difficulty,
  type InstrumentKind,
  type LaneChart,
  type LaneNote,
  type LaneNoteKind,
  type LaneRole,
} from "../track";
import { snapMs, type CharterGrid } from "./grid";

/** One chart in the charter: the game's chart plus the editor's stable key. */
export interface CharterChart extends LaneChart {
  key: string;
}

/** The key a chart is known by while it is open: its instrument, role and level. */
export function chartKey(
  chart: Pick<LaneChart, "instrument" | "difficulty" | "role">,
): string {
  return `${chart.instrument}:${chart.role ?? ""}:${chart.difficulty}`;
}

/** The label a panel and the chart list show. */
export function chartLabel(
  chart: Pick<LaneChart, "instrument" | "role" | "difficulty">,
): string {
  const role = chart.role ? ` · ${chart.role}` : "";
  return `${chart.instrument}${role} · ${chart.difficulty}`;
}

/** Does this instrument's kit play with a strum? */
export function chartStrums(chart: Pick<LaneChart, "instrument">): boolean {
  return strums(chart.instrument);
}

/** The kind a new note takes on this chart. */
export function plainKind(chart: Pick<LaneChart, "instrument">): LaneNoteKind {
  return chartStrums(chart) ? "strum" : "tap";
}

/** A fresh id for a note the editor made. */
export function noteId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `n-${crypto.randomUUID()}`;
  }
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * One canonical note list for a chart.
 *
 * A list that was already canonical is returned unchanged, so an ordinary render
 * does not copy a chart of thousands of notes.
 */
function normaliseNotes(
  notes: readonly LaneNote[],
  chart: Pick<LaneChart, "instrument" | "columns">,
): LaneNote[] {
  const strummed = chartStrums(chart);
  const plain = plainKind(chart);
  const columns = Math.max(1, chart.columns);
  const seenIds = new Set<string>();
  const byCell = new Map<string, LaneNote>();

  for (const note of notes) {
    const timeMs = Math.max(0, Math.round(note.timeMs));
    let column = note.column;
    if (column !== null) {
      column = Math.trunc(column);
      if (column < 0 || column >= columns) continue;
      // A drum kit's pedal is a column, not an open note; an open note on a
      // tapped instrument is not a note the kit can play.
    } else if (!strummed) {
      continue;
    }
    let kind = note.kind;
    if (!strummed) kind = "tap";
    else if (kind !== "hopo") kind = plain;
    // A drum chart has no open note: an open note there was a mistake in the file
    // and is dropped rather than becoming a sixth, invisible pad.
    if (chart.instrument === "drums" && column === null) continue;

    let id = note.id;
    if (!id || seenIds.has(id)) id = noteId();
    seenIds.add(id);
    const next: LaneNote = {
      id,
      timeMs,
      lengthMs: Math.max(0, Math.round(note.lengthMs)),
      kind,
      column,
      hero: note.hero === true,
    };
    // One note per column at one moment. The later entry wins: a paste over an
    // existing note is meant to replace it, and the panel draws one note there.
    byCell.set(`${timeMs}:${column === null ? "open" : column}`, next);
  }

  const list = [...byCell.values()].sort(
    (a, b) => a.timeMs - b.timeMs || (a.column ?? -1) - (b.column ?? -1),
  );

  // A hopo's first note has nothing to hammer on from. The game's readers make the
  // same correction; a charter that starts with one should export that way too.
  if (list[0]?.kind === "hopo") list[0] = { ...list[0], kind: plain };

  // An open note takes the whole highway; it cannot share its moment with a fret.
  const moments = new Map<number, LaneNote[]>();
  for (const note of list) {
    const at = moments.get(note.timeMs);
    if (at) at.push(note);
    else moments.set(note.timeMs, [note]);
  }
  const kept: LaneNote[] = [];
  for (const note of list) {
    const at = moments.get(note.timeMs) ?? [];
    if (isOpen(note) && at.length > 1) continue;
    kept.push(note);
  }

  // A sustain stops at the next note in its own column. It is a note, not a ribbon
  // across the next one. The repair is applied by walking the sorted list and
  // remembering the previous note **per column**, so the order never changes.
  const lastByColumn = new Map<string, number>();
  const fitted = kept.map((note) => ({ ...note }));
  for (let index = 0; index < fitted.length; index += 1) {
    const note = fitted[index];
    const key = note.column === null ? "open" : String(note.column);
    const previous = lastByColumn.get(key);
    if (previous !== undefined) {
      const before = fitted[previous];
      const length = Math.max(0, note.timeMs - before.timeMs);
      if (before.lengthMs > length) before.lengthMs = length;
    }
    lastByColumn.set(key, index);
  }
  return fitted;
}

/** The whole chart made canonical. */
export function normaliseChart(chart: CharterChart): CharterChart {
  return {
    ...chart,
    columns: Math.max(1, chart.columns),
    notes: normaliseNotes(chart.notes, chart),
    ...(chart.phrases && chart.phrases.length > 0 ? { phrases: cleanSpans(chart.phrases) } : { phrases: [] }),
    ...(chart.instrument === "drums" && chart.fills
      ? { fills: cleanSpans(chart.fills) }
      : {}),
  };
}

/** Spans in time order, without a negative or zero-length entry. */
function cleanSpans(spans: readonly ChartPhrase[]): ChartPhrase[] {
  return spans
    .map((span) => ({
      startMs: Math.max(0, Math.round(span.startMs)),
      endMs: Math.max(0, Math.round(span.endMs)),
    }))
    .filter((span) => span.endMs > span.startMs)
    .sort((a, b) => a.startMs - b.startMs);
}

/** What is wrong with a chart, as the game's own gate says. */
export function charterProblems(chart: CharterChart): string[] {
  const problems = chartProblems(chart);
  const length = Math.max(chart.notes.at(-1)?.timeMs ?? 0, 0);
  if (length < 0) problems.push("a note is before the start of the song");
  return problems;
}

/** Add one note and return the canonical list. */
export function addNote(
  notes: readonly LaneNote[],
  note: Omit<LaneNote, "id"> & { id?: string },
  chart: Pick<LaneChart, "instrument" | "columns">,
): LaneNote[] {
  return normaliseNotes(
    [...notes, { ...note, id: note.id ?? noteId() }],
    chart,
  );
}

/** Remove the selected notes. */
export function removeNotes(
  notes: readonly LaneNote[],
  ids: ReadonlySet<string>,
): LaneNote[] {
  if (ids.size === 0) return notes.slice();
  return notes.filter((note) => !ids.has(note.id));
}

/** Move notes by a time and column delta, clamped to the highway. */
export function moveNotes(
  notes: readonly LaneNote[],
  ids: ReadonlySet<string>,
  deltaMs: number,
  deltaColumns: number,
  chart: Pick<LaneChart, "instrument" | "columns">,
): LaneNote[] {
  if (ids.size === 0) return notes.slice();
  const columns = Math.max(1, chart.columns);
  const moved = notes.map((note) => {
    if (!ids.has(note.id)) return note;
    const column =
      note.column === null
        ? null
        : Math.max(0, Math.min(columns - 1, note.column + deltaColumns));
    return {
      ...note,
      timeMs: Math.max(0, Math.round(note.timeMs + deltaMs)),
      column,
    };
  });
  return normaliseNotes(moved, chart);
}

/** Change one note's fields. */
export function setNote(
  notes: readonly LaneNote[],
  id: string,
  patch: Partial<Omit<LaneNote, "id">>,
  chart: Pick<LaneChart, "instrument" | "columns">,
): LaneNote[] {
  return normaliseNotes(
    notes.map((note) => (note.id === id ? { ...note, ...patch } : note)),
    chart,
  );
}

/** Snap the selected notes' starts to the grid, and optionally their ends. */
export function quantizeNotes(
  notes: readonly LaneNote[],
  ids: ReadonlySet<string>,
  grid: CharterGrid,
  lengths = false,
): LaneNote[] {
  if (ids.size === 0) return notes.slice();
  return notes.map((note) => {
    if (!ids.has(note.id)) return note;
    const start = snapMs(note.timeMs, grid);
    if (!lengths || note.lengthMs <= 0) return { ...note, timeMs: start };
    const end = snapMs(note.timeMs + note.lengthMs, grid);
    return { ...note, timeMs: start, lengthMs: Math.max(0, end - start) };
  });
}

/** One note as a clipboard entry: its place is relative to the earliest note. */
export interface NoteClip {
  offsetMs: number;
  lengthMs: number;
  kind: LaneNoteKind;
  column: number | null;
  hero: boolean;
}

export interface Clipboard {
  notes: NoteClip[];
  sourceColumns: number;
}

/** Copy a selection, with times relative to its earliest note. */
export function copyNotes(
  notes: readonly LaneNote[],
  ids: ReadonlySet<string>,
  columns: number,
): Clipboard {
  const picked = notes.filter((note) => ids.has(note.id));
  const first = picked.reduce((min, note) => Math.min(min, note.timeMs), Infinity);
  return {
    sourceColumns: columns,
    notes: picked.map((note) => ({
      offsetMs: note.timeMs - first,
      lengthMs: note.lengthMs,
      kind: note.kind,
      column: note.column,
      hero: note.hero,
    })),
  };
}

/** Paste at a moment, converting the note kind to what the target plays. */
export function pasteNotes(
  notes: readonly LaneNote[],
  clipboard: Clipboard,
  atMs: number,
  chart: Pick<LaneChart, "instrument" | "columns">,
  options: { quantize?: boolean; grid?: CharterGrid } = {},
): LaneNote[] {
  if (clipboard.notes.length === 0) return notes.slice();
  const strummed = chartStrums(chart);
  const plain = plainKind(chart);
  const columns = Math.max(1, chart.columns);
  const pasted = clipboard.notes.flatMap((entry) => {
    if (entry.column !== null && entry.column >= columns) return [];
    const at = options.quantize && options.grid
      ? snapMs(atMs + entry.offsetMs, options.grid)
      : Math.max(0, Math.round(atMs + entry.offsetMs));
    return [{
      id: noteId(),
      timeMs: at,
      lengthMs: options.quantize && options.grid
        ? Math.max(0, snapMs(at + entry.lengthMs, options.grid) - at)
        : entry.lengthMs,
      kind: strummed ? (entry.kind === "hopo" ? "hopo" : plain) : "tap",
      column: entry.column,
      hero: entry.hero,
    } satisfies LaneNote];
  });
  return normaliseNotes([...notes, ...pasted], chart);
}

/** The notes whose head is inside a span. */
export function notesInSpan(
  notes: readonly LaneNote[],
  startMs: number,
  endMs: number,
): LaneNote[] {
  const from = Math.min(startMs, endMs);
  const to = Math.max(startMs, endMs);
  return notes.filter((note) => note.timeMs >= from && note.timeMs <= to);
}

/** A new empty chart for an instrument and level. */
export function emptyChart(
  instrument: InstrumentKind,
  difficulty: Difficulty,
  role?: LaneRole,
  bpm?: number,
): CharterChart {
  return {
    key: chartKey({ instrument, difficulty, ...(role ? { role } : {}) }),
    instrument,
    ...(role ? { role } : {}),
    difficulty,
    columns: defaultColumns(instrument),
    ...(bpm ? { bpm } : {}),
    phrases: [],
    ...(instrument === "drums" ? { fills: [] } : {}),
    notes: [],
  };
}

/** The column count a new chart of this instrument starts with. */
function defaultColumns(instrument: InstrumentKind): number {
  // The kit's own width, not a lane count a source happened to choose. Drums carry
  // the kick pedal as the sixth column.
  if (instrument === "drums") return KICK_COLUMN + 1;
  if (instrument === "dance") return 4;
  return 5;
}
