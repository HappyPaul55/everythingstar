import { describe, expect, test } from "bun:test";
import { nextFocus, type FocusRect } from "./focus";

/** A box from its top-left corner and size, so the tests read in layout terms. */
function box(left: number, top: number, width = 100, height = 40): FocusRect {
  return { left, top, right: left + width, bottom: top + height };
}

describe("nextFocus", () => {
  test("left from the first door finds the wordmark", () => {
    const brand = box(80, 120, 260, 90);
    const quickPlay = box(520, 260);
    const options = box(520, 320);
    const credits = box(520, 380);

    expect(nextFocus([brand, quickPlay, options, credits], quickPlay, "left")).toBe(0);
    expect(nextFocus([brand, quickPlay, options, credits], options, "left")).toBe(0);
  });

  test("down the menu finds the next door, not the one after it", () => {
    const brand = box(80, 120, 260, 90);
    const quickPlay = box(520, 260);
    const options = box(520, 320);
    const credits = box(520, 380);

    expect(nextFocus([brand, quickPlay, options, credits], quickPlay, "down")).toBe(2);
    expect(nextFocus([brand, quickPlay, options, credits], options, "down")).toBe(3);
    expect(nextFocus([brand, quickPlay, options, credits], credits, "down")).toBeNull();
  });

  test("a row across the page prefers the element in that row", () => {
    const search = box(40, 100, 300, 36);
    const playlists = box(360, 100, 140, 36);
    const firstRow = box(40, 150, 500, 38);

    expect(nextFocus([search, playlists, firstRow], search, "right")).toBe(1);
    expect(nextFocus([search, playlists, firstRow], playlists, "left")).toBe(0);
    expect(nextFocus([search, playlists, firstRow], search, "down")).toBe(2);
  });

  test("a grid moves one cell at a time", () => {
    const cells = [box(0, 0), box(120, 0), box(0, 60), box(120, 60)];
    expect(nextFocus(cells, cells[0]!, "right")).toBe(1);
    expect(nextFocus(cells, cells[1]!, "down")).toBe(3);
    expect(nextFocus(cells, cells[3]!, "left")).toBe(2);
    expect(nextFocus(cells, cells[2]!, "up")).toBe(0);
  });

  test("a panel that only overlaps is not in the direction", () => {
    const focused = box(100, 100, 200, 80);
    const behind = box(120, 110, 100, 40);
    const right = box(310, 100, 80, 40);

    expect(nextFocus([behind, right], focused, "right")).toBe(1);
  });

  test("nothing in that direction is null", () => {
    const a = box(0, 0);
    const b = box(120, 0);
    expect(nextFocus([a, b], a, "left")).toBeNull();
    expect(nextFocus([a, b], a, "up")).toBeNull();
    expect(nextFocus([], a, "down")).toBeNull();
  });

  test("no current focus starts at the first candidate", () => {
    expect(nextFocus([box(0, 0), box(100, 0)], null, "down")).toBe(0);
  });
});
