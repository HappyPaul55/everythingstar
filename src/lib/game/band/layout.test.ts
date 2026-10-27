import { describe, expect, test } from "bun:test";
import { DEFAULT_GAP, MELODY_SHARE, computeBandLayout, fitPanels } from "./layout";
import { makeBand, type BandSlot } from "./types";

const GAP = DEFAULT_GAP;
const DESKTOP = { w: 1920, h: 1080 };

/**
 * A band of `lanes` guitar players plus however many are on the words. A band is one
 * list of slots, so the grid must count only the instruments.
 */
function band(lanes = 0, words = 0) {
  const slots: BandSlot[] = [
    ...Array.from({ length: lanes }, (): BandSlot => ({ kind: "guitar", difficulty: "normal" })),
    ...Array.from({ length: words }, (): BandSlot => ({ kind: "words", difficulty: "normal" })),
  ];
  return makeBand({ slots });
}

describe("fitPanels", () => {
  test("a lone player is a square, until the stage hands it the lot", () => {
    expect(fitPanels(DESKTOP, 1, GAP)).toEqual({
      columns: 1,
      rows: 1,
      width: 1080,
      height: 1080,
    });
  });

  test("two players stay side by side", () => {
    const grid = fitPanels(DESKTOP, 2, GAP);
    expect(grid.columns).toBe(2);
    expect(grid.rows).toBe(1);
  });

  test("three players stay in one row — a 2×2 would leave a cell empty", () => {
    const grid = fitPanels(DESKTOP, 3, GAP);
    expect(grid.columns).toBe(3);
    expect(grid.rows).toBe(1);
  });

  test("four players take a 2×2, which uses the height", () => {
    const grid = fitPanels(DESKTOP, 4, GAP);
    expect(grid.columns).toBe(2);
    expect(grid.rows).toBe(2);
    expect(grid.width).toBeCloseTo((DESKTOP.h - GAP) / 2, 5);
    expect(grid.height).toBe(grid.width);
  });

  test("eight players take a 4×2 on a wide stage", () => {
    const grid = fitPanels(DESKTOP, 8, GAP);
    expect(grid.columns).toBe(4);
    expect(grid.rows).toBe(2);
    expect(grid.width).toBeCloseTo((DESKTOP.w - 3 * GAP) / 4, 5);
  });

  test("a short lane band keeps four players in one row", () => {
    // The bottom half of a 1920×1080 stage: 1920×540.
    const grid = fitPanels({ w: 1920, h: 540 }, 4, GAP);
    expect(grid.columns).toBe(4);
    expect(grid.rows).toBe(1);
    expect(grid.width).toBeCloseTo((1920 - 3 * GAP) / 4, 5);
  });

  test("portrait wraps four players into a 2×2", () => {
    const grid = fitPanels({ w: 390, h: 422 }, 4, GAP);
    expect(grid.columns).toBe(2);
    expect(grid.rows).toBe(2);
    expect(grid.width).toBeCloseTo((390 - GAP) / 2, 5);
  });

  test("two players are never stacked into a single column", () => {
    // Side by side is smaller here, but a stack wastes the width.
    const grid = fitPanels({ w: 390, h: 422 }, 2, GAP);
    expect(grid.columns).toBe(2);
    expect(grid.rows).toBe(1);
    expect(grid.width).toBeCloseTo((390 - GAP) / 2, 5);
  });

  test("nothing to lay out yields an empty grid", () => {
    expect(fitPanels({ w: 800, h: 600 }, 0, GAP)).toEqual({
      columns: 0,
      rows: 0,
      width: 0,
      height: 0,
    });
    expect(fitPanels({ w: 0, h: 0 }, 3, GAP)).toEqual({
      columns: 0,
      rows: 0,
      width: 0,
      height: 0,
    });
  });
});

describe("computeBandLayout", () => {
  test("a lone lane with nothing else takes the whole stage", () => {
    const layout = computeBandLayout(band(1), DESKTOP);
    expect(layout.melody).toBeNull();
    expect(layout.lanes).toEqual({ w: 1920, h: 1080 });
    expect(layout.grid).toEqual({
      columns: 1,
      rows: 1,
      width: 1920,
      height: 1080,
    });
    expect(layout.bare).toBe(true);
    expect(layout.tooSmall).toBe(false);
  });

  test("solo lanes with the whole stage wrap four into a 2×2", () => {
    const layout = computeBandLayout(band(4), DESKTOP);
    expect(layout.grid.columns).toBe(2);
    expect(layout.grid.rows).toBe(2);
  });

  test("solo singers keep half the height, always at the top", () => {
    const layout = computeBandLayout(band(0, 1), DESKTOP);
    expect(layout.melody).toEqual({ w: 1920, h: 540 });
    expect(layout.lanes).toEqual({ w: 1920, h: 0 });
    expect(layout.grid.columns).toBe(0);
  });

  test("the melody region is the same size whoever is on the words", () => {
    const one = computeBandLayout(band(0, 1), DESKTOP);
    const two = computeBandLayout(band(0, 2), DESKTOP);
    // Which view it shows is the region's own affair, not the stage's.
    expect(two.melody).toEqual(one.melody);
  });

  test("singers and lanes split the height 50/50", () => {
    const layout = computeBandLayout(band(1, 1), DESKTOP);
    expect(layout.melody).toEqual({ w: 1920, h: 540 });
    expect(layout.lanes).toEqual({ w: 1920, h: 540 });
  });

  test("a lone lane alongside a melody stays a square", () => {
    // Only a lane with the stage to itself stretches to fill it.
    const layout = computeBandLayout(band(1, 1), DESKTOP);
    expect(layout.grid).toEqual({
      columns: 1,
      rows: 1,
      width: 540,
      height: 540,
    });
    expect(layout.bare).toBe(false);
  });

  test("two lanes alone keep their panel frame", () => {
    expect(computeBandLayout(band(2), DESKTOP).bare).toBe(false);
  });

  test("with the melody sharing, four players stay in one row", () => {
    const layout = computeBandLayout(band(4, 1), DESKTOP);
    expect(layout.grid.columns).toBe(4);
    expect(layout.grid.rows).toBe(1);
  });

  test("only the instruments count towards the grid", () => {
    // A band is one list of slots: six people on stage is still two panels, so
    // the players on the words must not squeeze them.
    const alone = computeBandLayout(band(2), DESKTOP);
    const withWords = computeBandLayout(band(2, 4), DESKTOP);
    expect(withWords.grid.columns).toBe(alone.grid.columns);
    expect(withWords.grid.rows).toBe(alone.grid.rows);
  });

  test("flags a stage too small for the band", () => {
    const layout = computeBandLayout(band(4), { w: 200, h: 100 });
    expect(layout.tooSmall).toBe(true);
  });

  test("a tight band still gets a grid to mount", () => {
    // The stage draws the "remove a player or rotate" notice over the panels
    // rather than replacing them: a run is judged through its panel, so the
    // layout must hand back something to mount even when it is cramped.
    const layout = computeBandLayout(band(4), { w: 200, h: 100 });
    expect(layout.tooSmall).toBe(true);
    expect(layout.grid.columns).toBeGreaterThan(0);
    expect(layout.grid.width).toBeGreaterThan(0);
    expect(layout.grid.height).toBeGreaterThan(0);
  });

  test("does not cry wolf before the stage is measured", () => {
    const layout = computeBandLayout(band(4), { w: 0, h: 0 });
    expect(layout.tooSmall).toBe(false);
    expect(layout.grid.width).toBe(0);
  });

  test("a listen-only melody returns the half-height box", () => {
    // Listen has words on screen and nobody on them: the stage must not work
    // out a height of its own, or the two boxes drift apart.
    const layout = computeBandLayout(band(0), DESKTOP, { listenOnly: true });
    expect(layout.melody).toEqual({
      w: DESKTOP.w,
      h: Math.round(DESKTOP.h * MELODY_SHARE),
    });
    expect(layout.lanes).toEqual({ w: DESKTOP.w, h: 0 });
    expect(layout.grid.columns).toBe(0);
  });
});
