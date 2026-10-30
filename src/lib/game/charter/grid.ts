/**
 * The charter's beat grid — pure, so snapping and bar arithmetic are the same
 * answer in the panel, the record take and the tests.
 *
 * The grid is **one per project**. A chart document carries a BPM of its own, but
 * the game draws one beat grid from it, and a charter comparing a guitar chart with
 * a bass chart wants one grid under both. `division` is how many steps make a beat:
 * 1 is a beat, 2 an eighth, 4 a sixteenth, 3 an eighth triplet.
 */

import { clamp } from "../math";

export interface CharterGrid {
  /** Beats per minute. A broken value is the 120 the editor starts from. */
  bpm: number;
  /** Beats in a bar, for the brighter lines and the bar read-out. */
  beatsPerBar: number;
  /** Steps per beat: 1, 2, 3, 4, 6 or 8. */
  division: number;
}

export const DEFAULT_GRID: CharterGrid = {
  bpm: 120,
  beatsPerBar: 4,
  division: 4,
};

/** The divisions the editor offers, with the label the toolbar shows. */
export const GRID_DIVISIONS: readonly { division: number; label: string }[] = [
  { division: 1, label: "1/4" },
  { division: 2, label: "1/8" },
  { division: 3, label: "1/8T" },
  { division: 4, label: "1/16" },
  { division: 6, label: "1/16T" },
  { division: 8, label: "1/32" },
];

/** A BPM the editor can work with: finite, inside a musical range. */
export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return DEFAULT_GRID.bpm;
  // Outside this range a step is either a blur or longer than the song. It is a
  // guard on a tampered value, not a limit on a real tempo.
  return Math.round(clamp(bpm, 20, 400) * 1000) / 1000;
}

/** A beats-per-bar a bar line can be drawn for. */
function clampBeatsPerBar(beats: number): number {
  if (!Number.isFinite(beats)) return DEFAULT_GRID.beatsPerBar;
  return Math.trunc(clamp(beats, 1, 16));
}

/** A division in the set above, or the nearest one to it. */
function clampDivision(division: number): number {
  if (!Number.isFinite(division)) return DEFAULT_GRID.division;
  const wanted = Math.trunc(division);
  return GRID_DIVISIONS.reduce(
    (best, entry) =>
      Math.abs(entry.division - wanted) < Math.abs(best - wanted)
        ? entry.division
        : best,
    DEFAULT_GRID.division,
  );
}

/** A grid made safe whatever was stored or typed. */
export function clampGrid(grid: Partial<CharterGrid>): CharterGrid {
  return {
    bpm: clampBpm(grid.bpm ?? DEFAULT_GRID.bpm),
    beatsPerBar: clampBeatsPerBar(grid.beatsPerBar ?? DEFAULT_GRID.beatsPerBar),
    division: clampDivision(grid.division ?? DEFAULT_GRID.division),
  };
}

/** One step of the grid, in ms: a beat divided by the subdivision. */
export function stepMs(grid: CharterGrid): number {
  return 60_000 / clampBpm(grid.bpm) / clampDivision(grid.division);
}

/** One beat, in ms. */
export function beatMs(grid: CharterGrid): number {
  return 60_000 / clampBpm(grid.bpm);
}

/** One bar, in ms. */
export function barMs(grid: CharterGrid): number {
  return beatMs(grid) * clampBeatsPerBar(grid.beatsPerBar);
}

/** The nearest grid time to a moment. */
export function snapMs(timeMs: number, grid: CharterGrid): number {
  const step = stepMs(grid);
  const value = Math.max(0, Math.round(timeMs / step) * step);
  // Whole milliseconds keep a note from carrying float noise into a file, and the
  // step is re-derived from the same grid, so two snaps of one moment agree.
  return Math.round(value);
}

/** The grid time at or before a moment. */
export function floorMs(timeMs: number, grid: CharterGrid): number {
  const step = stepMs(grid);
  return Math.round(Math.max(0, Math.floor(timeMs / step) * step));
}

/** The grid time at or after a moment. */
export function ceilMs(timeMs: number, grid: CharterGrid): number {
  const step = stepMs(grid);
  return Math.round(Math.max(0, Math.ceil(timeMs / step) * step));
}

export interface GridPosition {
  /** One-based bar. */
  bar: number;
  /** One-based beat in the bar. */
  beat: number;
  /** The step within the beat, one-based. */
  step: number;
}

/** Where a moment sits on the grid, as a reader says it. */
export function gridPosition(timeMs: number, grid: CharterGrid): GridPosition {
  const safe = Math.max(0, timeMs);
  const beat = beatMs(grid);
  const bar = Math.floor(safe / (beat * clampBeatsPerBar(grid.beatsPerBar))) + 1;
  const withinBar = safe - (bar - 1) * beat * clampBeatsPerBar(grid.beatsPerBar);
  const beatInBar = Math.floor(withinBar / beat) + 1;
  const step = Math.floor((withinBar - (beatInBar - 1) * beat) / (beat / clampDivision(grid.division))) + 1;
  return { bar, beat: beatInBar, step };
}

/** A moment as `Bar 33 · Beat 2`. */
export function positionLabel(timeMs: number, grid: CharterGrid): string {
  const at = gridPosition(timeMs, grid);
  return `Bar ${at.bar} · Beat ${at.beat}`;
}

export interface GridLine {
  timeMs: number;
  /** A bar line, which is drawn brighter than a beat or a step. */
  bar: boolean;
  /** A beat line, which is brighter than a subdivision. */
  beat: boolean;
}

/**
 * The grid lines inside a window, in time order.
 *
 * Lines are anchored to **song time** rather than to the window, so they move with
 * the music as the window slides. A grid longer than the window is still one line;
 * a window before zero is empty.
 */
export function gridLines(
  fromMs: number,
  toMs: number,
  grid: CharterGrid,
): GridLine[] {
  const step = stepMs(grid);
  // Steps rather than milliseconds: a bar is a whole number of steps by
  // construction, so `index % stepsPerBar` cannot be hidden by float noise.
  const stepsPerBeat = Math.max(1, Math.round(1 / (step / beatMs(grid))));
  const stepsPerBar = stepsPerBeat * clampBeatsPerBar(grid.beatsPerBar);
  if (!(step > 0) || !Number.isFinite(step) || toMs < fromMs) return [];
  const first = Math.max(0, Math.floor(fromMs / step));
  const last = Math.ceil(toMs / step);
  const lines: GridLine[] = [];
  for (let index = first; index <= last; index += 1) {
    lines.push({
      timeMs: Math.round(index * step),
      bar: index % stepsPerBar === 0,
      beat: index % stepsPerBeat === 0,
    });
  }
  return lines;
}
