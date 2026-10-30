/**
 * Turning a take into notes.
 *
 * A take is the same actions a run judges (`ActionEvent`s), stamped on the song
 * clock. The conversion is pure so a charter can be tested without a controller:
 *
 * - a **strummed** instrument records a note for every fret held at the strum, or
 *   an open note when none is;
 * - a **tapped** instrument records a note on each fret press;
 * - a fret held after the note began is a sustain, ended by the release;
 * - a strum with nothing to play is ignored, not an error.
 *
 * The take never reads the game's judging, another player's state or the audio; it
 * is a transcription of what the charter played.
 */

import type { ActionEvent } from "../input";
import type { LaneNote } from "../track";
import type { CharterChart } from "./edit";
import { chartStrums, noteId, plainKind } from "./edit";
import { snapMs, type CharterGrid } from "./grid";

export interface TakeOptions {
  /** Where the recording started. Notes before it are not part of the take. */
  startMs: number;
  /** Where the recording stopped, used to close a note still held. */
  endMs: number;
  /** Snap starts and ends to the grid. */
  quantize: boolean;
  grid: CharterGrid;
}

interface Pending {
  note: LaneNote;
}

/** A hold shorter than this is the instrument's own tap, not a sustain. */
const MIN_SUSTAIN_MS = 20;

/**
 * A take as notes. The events are read in the order they happened; an out-of-order
 * event is put back into time order first, because a DOM event's timestamp and the
 * order its listener saw it are not always the same thing.
 */
export function takeNotes(
  events: readonly ActionEvent[],
  chart: Pick<CharterChart, "instrument" | "columns">,
  options: TakeOptions,
): LaneNote[] {
  const plain = plainKind(chart);
  const strummed = chartStrums(chart);
  const held = Array.from({ length: Math.max(1, chart.columns) }, () => false);
  const pending = new Map<number, Pending>();
  const notes: LaneNote[] = [];
  const end = Math.max(options.startMs, options.endMs);
  const ordered = [...events].sort((a, b) => a.timeMs - b.timeMs);

  const at = (timeMs: number): number =>
    options.quantize
      ? snapMs(timeMs, options.grid)
      : Math.max(0, Math.round(timeMs));

  const start = (column: number | null, timeMs: number): void => {
    // A drum kit has no open note: a strum with no pad down is a hand moving.
    if (column === null && chart.instrument === "drums") return;
    const key = column === null ? -1 : column;
    // A second start on a column still sounding is the same hold: a repeat is not
    // a second note.
    if (pending.has(key)) return;
    const note: LaneNote = {
      id: noteId(),
      timeMs: at(timeMs),
      lengthMs: 0,
      kind: plain,
      column,
      hero: false,
    };
    pending.set(key, { note });
    notes.push(note);
  };

  const release = (column: number | null, timeMs: number): void => {
    const key = column === null ? -1 : column;
    const entry = pending.get(key);
    if (!entry) return;
    const length = Math.max(0, at(timeMs) - entry.note.timeMs);
    // A hold under one grid step is a tap; writing a two-millisecond sustain is
    // noise in a chart.
    entry.note.lengthMs = length >= MIN_SUSTAIN_MS ? length : 0;
    pending.delete(key);
  };

  for (const event of ordered) {
    // A press that happened before the count-in is not this take's note.
    if (event.timeMs < options.startMs) continue;
    if (event.action.type === "whammy") continue;
    const column = event.action.type === "fret" ? event.action.column : null;
    if (column !== null && (column < 0 || column >= chart.columns)) continue;

    if (event.action.type === "fret") {
      const fret = event.action.column;
      // A release always lands, even one that started before the take.
      if (!event.down) {
        held[fret] = false;
        release(fret, event.timeMs);
        continue;
      }
      if (event.repeat) continue;
      held[fret] = true;
      if (!strummed) start(fret, event.timeMs);
      continue;
    }

    if (event.action.type === "strum" && event.down && !event.repeat) {
      const down = held
        .map((on, index) => (on ? index : -1))
        .filter((index) => index >= 0);
      if (down.length === 0) {
        // An open note is a strum with no frets, and only a strummed instrument
        // has one.
        if (strummed) start(null, event.timeMs);
      } else {
        for (const fret of down) start(fret, event.timeMs);
      }
    }
  }

  // Every hold still down ends with the take.
  for (const { note } of pending.values()) {
    const releaseAt = note.timeMs >= end ? note.timeMs : end;
    note.lengthMs = Math.max(0, at(releaseAt) - note.timeMs);
    if (note.lengthMs < MIN_SUSTAIN_MS) note.lengthMs = 0;
  }

  return notes
    .filter((note) => note.timeMs >= options.startMs - 1 && note.timeMs <= end + 1)
    .sort((a, b) => a.timeMs - b.timeMs || (a.column ?? -1) - (b.column ?? -1));
}

/**
 * Replace the notes in a recorded span with a take, or lay the take over them.
 *
 * `replace` is the default because a take is usually a correction of one section;
 * `overdub` is for adding a second part by hand. The caller normalises the result.
 */
export function mergeTake(
  notes: readonly LaneNote[],
  take: readonly LaneNote[],
  options: { startMs: number; endMs: number; mode: "replace" | "overdub" },
): LaneNote[] {
  if (options.mode === "overdub") return [...notes, ...take];
  const from = Math.min(options.startMs, options.endMs);
  const to = Math.max(options.startMs, options.endMs);
  return [
    ...notes.filter((note) => note.timeMs < from || note.timeMs > to),
    ...take,
  ];
}

