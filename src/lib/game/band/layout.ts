/**
 * The band layout engine — pure geometry, no DOM.
 *
 * Everything the stage needs to place its regions and its 1:1 panels is derived
 * here, so the layout can be reasoned about and unit-tested without a browser.
 * Given the stage size it returns the melody region (if anyone is singing or on
 * keys, or Listen is showing the words), the lanes region, and the grid of square
 * panels to fit inside it.
 *
 * Rules (see the layout tests):
 * - A single row of panels is the default — N players sit side by side.
 * - A single row is only abandoned when it would fall below `minPanelSize`
 *   (a phone in portrait); then the arrangement wraps and the largest usable
 *   square wins, so four players land as a 2×2 rather than four slivers.
 * - Panels are always exactly 1:1.
 * - When both regions play, the melody takes `melodyShare` of the height.
 */

import { hasLanes, hasMelody, lanePlayers, type BandSetup, type Box } from "./types";

/** Gap between lane panels, in px. Shared with the component's inline styles. */
export const DEFAULT_GAP = 8;

/** Clear space the stage keeps between the play areas and its own edge, in px. */
export const STAGE_GUTTER = 16;

const MIN_PANEL = 140;
/**
 * The melody region's share of the height, alone or alongside the lanes.
 *
 * Exported for the layout tests; the stage reads the box this produces rather
 * than working a height out itself.
 */
export const MELODY_SHARE = 0.5;

const EPSILON = 1e-6;

export interface PanelGrid {
  columns: number;
  rows: number;
  /** Each panel's width in px. */
  width: number;
  /** Each panel's height in px — equal to the width unless a lone player fills. */
  height: number;
}

export interface BandLayout {
  /** The melody region (the singers' lyrics or keys view), or null when absent. */
  melody: Box | null;
  /** The lanes region. */
  lanes: Box;
  /** The panel grid inside the lanes region. */
  grid: PanelGrid;
  /**
   * True when a lone lane has the stage to itself: it fills the region and drops
   * its panel frame, so the backdrop shows through.
   */
  bare: boolean;
  /** True when even the best arrangement is below `minPanelSize`. */
  tooSmall: boolean;
}

export interface LayoutOptions {
  gap?: number;
  minPanelSize?: number;
  /** Share of the height the melody region takes when both regions play. */
  melodyShare?: number;
  /**
   * The song has words but nobody is on them: Listen draws the melody region
   * without any player owning it, so the layout must reserve it like any other.
   * The stage measures its content box and applies the safe-area and gutter
   * padding itself, so no inset is taken here.
   */
  listenOnly?: boolean;
}

const EMPTY_GRID: PanelGrid = { columns: 0, rows: 0, width: 0, height: 0 };

/**
 * Fit the lane panels into `area`: squares, arranged to make them as large as
 * possible and never narrowed to a single column (a stack reads as a row turned
 * on its side and wastes the width). Pure.
 */
export function fitPanels(area: Box, count: number, gap: number): PanelGrid {
  if (count <= 0 || area.w <= 0 || area.h <= 0) return EMPTY_GRID;
  const measure = (columns: number): PanelGrid => {
    const rows = Math.ceil(count / columns);
    const w = (area.w - (columns - 1) * gap) / columns;
    const h = (area.h - (rows - 1) * gap) / rows;
    const size = Math.max(0, Math.min(w, h));
    return { columns, rows, width: size, height: size };
  };

  const firstColumn = Math.min(2, count);
  let best = measure(firstColumn);
  for (let columns = firstColumn + 1; columns <= count; columns += 1) {
    const candidate = measure(columns);
    const bigger = candidate.width > best.width + EPSILON;
    // On a tie, fewer columns wins: 2×2 beats 3×2 with an empty cell.
    const neater =
      Math.abs(candidate.width - best.width) <= EPSILON &&
      candidate.columns < best.columns;
    if (bigger || neater) best = candidate;
  }
  return best;
}

/** Lay out the whole band for a stage of `area`. Pure. */
export function computeBandLayout(
  setup: BandSetup,
  area: Box,
  options: LayoutOptions = {},
): BandLayout {
  const gap = options.gap ?? DEFAULT_GAP;
  const minPanelSize = options.minPanelSize ?? MIN_PANEL;
  const melodyShare = options.melodyShare ?? MELODY_SHARE;

  // The stage measures its own content box, so `area` is already the play area:
  // no inset is taken here or the stage's padding would be counted twice.
  const melodyPresent = hasMelody(setup) || (options.listenOnly ?? false);
  const lanesPresent = hasLanes(setup);
  // Only the instruments get a panel; singers and typists share the melody region.
  const panelCount = lanePlayers(setup).length;

  let melody: Box | null = null;
  let lanes: Box = { w: area.w, h: 0 };
  if (melodyPresent && lanesPresent) {
    const melodyH = Math.round(area.h * melodyShare);
    melody = { w: area.w, h: melodyH };
    lanes = { w: area.w, h: area.h - melodyH };
  } else if (melodyPresent) {
    // Alone the melody keeps half the height and sits at the top of the stage.
    melody = { w: area.w, h: Math.round(area.h * melodyShare) };
  } else {
    // Alone, the lanes get the whole stage: more room for bigger panels.
    lanes = { w: area.w, h: area.h };
  }

  // A lone lane with nothing else on stage takes the whole of it: a 1:1 square
  // would leave most of the stage doing nothing. Alongside a melody it stays a
  // square, like every other band.
  const bare = lanesPresent && !melodyPresent && panelCount === 1;
  let grid = lanesPresent ? fitPanels(lanes, panelCount, gap) : EMPTY_GRID;
  if (bare) {
    grid = { columns: 1, rows: 1, width: lanes.w, height: lanes.h };
  }

  const measured = area.w > 0 && area.h > 0;
  const tooSmall =
    lanesPresent && measured && Math.min(grid.width, grid.height) < minPanelSize;

  return { melody, lanes, grid, bare, tooSmall };
}
