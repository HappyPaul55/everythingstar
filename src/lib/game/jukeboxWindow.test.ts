import { describe, expect, test } from "bun:test";
import type { Song } from "./song";
import type { SongGroup } from "./jukebox";
import {
  anchorTop,
  buildJukeboxLayout,
  itemAtOffset,
  jukeboxWindow,
  letterAtOffset,
  letterOffset,
  rowFrom,
  scrollTopForItem,
  type JukeboxLayout,
  type JukeboxWindow,
} from "./jukeboxWindow";

/** A song as the window reads it: only its id matters here. */
function song(id: string): Song {
  return {
    id,
    title: id,
    artist: { id: "a", name: "A", art: null },
    album: null,
    art: null,
    accent: null,
    durationMs: 1_000,
    previewStartMs: 0,
    offer: { instruments: [], voice: null },
    video: null,
    doc: `https://x/songs/${id}.json`,
    from: "https://x/playlist.json",
    revision: "test",
    seed: 1,
  };
}

/** A group of `rows` songs filed under `letter`. */
function group(letter: string, rows: number): SongGroup {
  return {
    letter,
    entries: Array.from({ length: rows }, (_, index) => ({
      song: song(`${letter.toLowerCase()}-${index}`),
      slot: `${letter}·${String(index + 1).padStart(2, "0")}`,
    })),
  };
}

const WIDE = { header: 20, row: 40 };
const MID = { header: 21, row: 57 };
const PHONE = { header: 20, row: 68 };

/**
 * What the DOM would measure if it mounted `window`: the spacers plus one
 * heading and the mounted rows of every section. It must equal `layout.total`
 * for the scrollbar to be honest at every position.
 */
function mountedHeight(layout: JukeboxLayout, window: JukeboxWindow): number {
  const sections = window.sections.reduce(
    (sum, section) =>
      sum +
      layout.heights.header +
      section.skip +
      (section.to - section.from) * layout.heights.row,
    0,
  );
  return window.top + sections + window.bottom;
}

/** How many rows a window mounts. */
function mountedRows(window: JukeboxWindow): number {
  return window.sections.reduce((sum, section) => sum + section.to - section.from, 0);
}

describe("buildJukeboxLayout", () => {
  test("an empty list has no items and no height", () => {
    const layout = buildJukeboxLayout([], WIDE);
    expect(layout.items).toEqual([]);
    expect(layout.groups).toEqual([]);
    expect(layout.offsets).toEqual([0]);
    expect(layout.total).toBe(0);
    expect(jukeboxWindow(layout, 0, 400)).toEqual({
      start: 0,
      end: 0,
      top: 0,
      bottom: 0,
      sections: [],
    });
  });

  test("one heading per group, then its rows, with running offsets", () => {
    const layout = buildJukeboxLayout([group("A", 3), group("B", 2)], WIDE);
    expect(layout.items.map((item) => `${item.kind}:${item.letter}:${item.entry}`)).toEqual([
      "letter:A:-1",
      "song:A:0",
      "song:A:1",
      "song:A:2",
      "letter:B:-1",
      "song:B:0",
      "song:B:1",
    ]);
    expect(layout.offsets).toEqual([0, 20, 60, 100, 140, 160, 200, 240]);
    expect(layout.total).toBe(240);
    expect(layout.groups.map((entry) => [entry.letter, entry.top, entry.rows, entry.bottom])).toEqual([
      ["A", 0, 3, 140],
      ["B", 140, 2, 240],
    ]);
    expect(layout.rows.get("a-1")).toBe(2);
  });

  test("a group's rows are found by their own id", () => {
    const layout = buildJukeboxLayout([group("A", 2), group("B", 1)], WIDE);
    expect(layout.items[layout.rows.get("b-0") ?? 0].letter).toBe("B");
  });
});

describe("jukeboxWindow", () => {
  const groups = [group("A", 10), group("B", 10), group("C", 10), group("D", 10)];

  test("a list shorter than the window mounts all of it", () => {
    const layout = buildJukeboxLayout([group("A", 2), group("B", 1)], WIDE);
    const window = jukeboxWindow(layout, 0, 900);
    expect(window.start).toBe(0);
    expect(window.end).toBe(layout.items.length);
    expect(window.top).toBe(0);
    expect(window.bottom).toBe(0);
    expect(mountedHeight(layout, window)).toBe(layout.total);
    expect(window.sections.map((section) => [section.group, section.from, section.to])).toEqual([
      [0, 0, 2],
      [1, 0, 1],
    ]);
  });

  test("at the top the window starts on the first heading and the bottom is a spacer", () => {
    const layout = buildJukeboxLayout(groups, WIDE);
    const window = jukeboxWindow(layout, 0, 200);
    expect(window.start).toBe(0);
    expect(window.end).toBeLessThan(layout.items.length);
    expect(window.top).toBe(0);
    expect(window.bottom).toBeGreaterThan(0);
    expect(window.sections[0]).toMatchObject({ group: 0, from: 0, skip: 0 });
    expect(mountedHeight(layout, window)).toBe(layout.total);
  });

  test("in the middle the window is a bounded slice with spacers on both sides", () => {
    const layout = buildJukeboxLayout(groups, WIDE);
    const window = jukeboxWindow(layout, 700, 200);
    expect(window.start).toBeGreaterThan(0);
    expect(window.end).toBeLessThan(layout.items.length);
    expect(window.top).toBeGreaterThan(0);
    expect(window.bottom).toBeGreaterThan(0);
    expect(mountedHeight(layout, window)).toBe(layout.total);
    // The heading of the group the window starts in is mounted even when the
    // rows between it and the viewport are not.
    expect(window.sections[0].skip).toBeGreaterThan(0);
    expect(window.sections[0].from).toBeGreaterThan(0);
  });

  test("at the bottom the window ends on the last row and the top is a spacer", () => {
    const layout = buildJukeboxLayout(groups, WIDE);
    const window = jukeboxWindow(layout, layout.total, 200);
    expect(window.end).toBe(layout.items.length);
    expect(window.start).toBeGreaterThan(0);
    expect(window.bottom).toBe(0);
    expect(window.top).toBeGreaterThan(0);
    expect(mountedHeight(layout, window)).toBe(layout.total);
    const last = layout.groups.at(-1);
    expect(window.sections.at(-1)?.group).toBe(3);
    expect(window.sections.at(-1)?.to).toBe(last?.rows ?? -1);
  });

  test("overscan mounts a few rows beyond each edge and no more", () => {
    const layout = buildJukeboxLayout(groups, WIDE);
    const window = jukeboxWindow(layout, 700, 200, 4);
    const visibleRows = Math.ceil((200 + WIDE.row) / WIDE.row);
    expect(mountedRows(window)).toBeGreaterThanOrEqual(visibleRows);
    expect(mountedRows(window)).toBeLessThanOrEqual(visibleRows + 2 * 4 + 2);
    // The slice is stable while the scroll stays inside its row: a few pixels
    // down does not re-cut the window, and a whole row down moves one item.
    const nudged = jukeboxWindow(layout, 705, 200, 4);
    expect(nudged.start).toBe(window.start);
    expect(nudged.end).toBe(window.end);
    const rowDown = jukeboxWindow(layout, 700 + WIDE.row, 200, 4);
    expect(rowDown.start).toBe(window.start + 1);
  });

  test("an ensured row is mounted even when it is far outside the window", () => {
    const layout = buildJukeboxLayout(groups, WIDE);
    const target = layout.rows.get("d-5");
    expect(target).toBeDefined();
    const window = jukeboxWindow(layout, 0, 200, 4, target ?? null);
    expect(target ?? -1).toBeGreaterThanOrEqual(window.start);
    expect(target ?? -1).toBeLessThan(window.end);
    expect(mountedHeight(layout, window)).toBe(layout.total);
    expect(mountedRows(window)).toBeLessThan(60);
  });

  test("the spacers reconstruct the whole list at every scroll position", () => {
    const layout = buildJukeboxLayout(groups, WIDE);
    for (let scrollTop = -100; scrollTop <= layout.total + 100; scrollTop += 17) {
      const window = jukeboxWindow(layout, scrollTop, 213, 5);
      expect(mountedHeight(layout, window)).toBe(layout.total);
      expect(window.start).toBeGreaterThanOrEqual(0);
      expect(window.end).toBeLessThanOrEqual(layout.items.length);
      expect(window.start).toBeLessThan(window.end);
    }
  });

  test("the three breakpoints each keep the same exact geometry", () => {
    const layoutLike = [group("A", 30), group("B", 30), group("C", 30)];
    for (const heights of [WIDE, MID, PHONE]) {
      const layout = buildJukeboxLayout(layoutLike, heights);
      expect(layout.total).toBe(3 * heights.header + 90 * heights.row);
      for (const fraction of [0, 0.15, 0.5, 0.9, 1]) {
        const window = jukeboxWindow(layout, layout.total * fraction, 420, 4);
        expect(mountedHeight(layout, window)).toBe(layout.total);
        const visibleRows = Math.ceil(420 / heights.row) + 1;
        expect(mountedRows(window)).toBeLessThanOrEqual(visibleRows + 2 * 4 + 2);
      }
    }
  });
});

describe("letterAtOffset", () => {
  const layout = buildJukeboxLayout([group("A", 10), group("B", 10), group("C", 10)], WIDE);

  test("names the group whose heading has reached the top", () => {
    expect(letterAtOffset(layout, 0, 0)).toBe("A");
    const b = letterOffset(layout, "B");
    expect(b).not.toBeNull();
    expect(letterAtOffset(layout, b ?? 0, 0)).toBe("B");
    expect(letterAtOffset(layout, (b ?? 0) - 1, 0)).toBe("A");
    expect(letterAtOffset(layout, layout.total, 0)).toBe("C");
  });

  test("works for a letter whose section is not mounted", () => {
    // Nothing about a mounted node is needed: the offset comes from the layout.
    expect(letterAtOffset(layout, letterOffset(layout, "C") ?? 0, 0)).toBe("C");
  });

  test("a missing letter has no offset", () => {
    expect(letterOffset(layout, "Z")).toBeNull();
  });
});

describe("rowFrom", () => {
  const layout = buildJukeboxLayout([group("A", 2), group("B", 2)], WIDE);

  test("moves row to row and skips the heading between groups", () => {
    const first = layout.rows.get("a-1") ?? 0;
    expect(layout.items[rowFrom(layout, first, 1) ?? 0].entry).toBe(0);
    expect(layout.items[rowFrom(layout, first, 1) ?? 0].letter).toBe("B");
    expect(rowFrom(layout, layout.rows.get("b-1") ?? 0, 1)).toBeNull();
    expect(rowFrom(layout, layout.rows.get("a-0") ?? 0, -1)).toBeNull();
  });
});

describe("scrollTopForItem", () => {
  const layout = buildJukeboxLayout([group("A", 20)], WIDE);

  test("leaves a row in view alone", () => {
    const row = layout.rows.get("a-4") ?? 0;
    expect(scrollTopForItem(layout, row, 200, 100)).toBe(100);
  });

  test("brings a row below the viewport to the bottom, and one above below the heading", () => {
    const below = layout.rows.get("a-10") ?? 0;
    const atBottom = scrollTopForItem(layout, below, 200, 0);
    expect(atBottom).toBe(layout.offsets[below] + WIDE.row - 200);
    const above = layout.rows.get("a-1") ?? 0;
    // The sticky heading covers the top of the viewport, so a row brought to the
    // top lands one heading below it rather than behind it.
    expect(scrollTopForItem(layout, above, 200, 500)).toBe(
      layout.offsets[above] - WIDE.header,
    );
  });

  test("a row under the sticky heading is brought out below it", () => {
    const row = layout.rows.get("a-2") ?? 0;
    // Its top is in the viewport but inside the heading's band.
    expect(scrollTopForItem(layout, row, 200, 95)).toBe(
      layout.offsets[row] - WIDE.header,
    );
    // At the very top the clamp keeps the first row where it is.
    const first = layout.rows.get("a-0") ?? 0;
    expect(scrollTopForItem(layout, first, 200, 100)).toBe(0);
  });

  test("the last row is reachable at the end of the list", () => {
    const last = layout.rows.get("a-19") ?? 0;
    const top = scrollTopForItem(layout, last, 200, 0);
    expect(top).toBe(layout.total - 200);
    const window = jukeboxWindow(layout, top, 200);
    expect(window.end).toBe(layout.items.length);
  });
});

describe("anchorTop", () => {
  test("keeps the song that was at the top, wherever a refresh moved it", () => {
    const before = buildJukeboxLayout([group("A", 4), group("B", 4)], WIDE);
    // The row at the top is `a-2`, and the new list has one more song above it.
    const after = buildJukeboxLayout(
      [
        {
          letter: "A",
          entries: [
            { song: song("new-0"), slot: "A·01" },
            ...group("A", 4).entries,
          ],
        },
        group("B", 4),
      ],
      WIDE,
    );
    const at = before.rows.get("a-2") ?? 0;
    const moved = after.rows.get("a-2") ?? 0;
    expect(anchorTop(before, after, before.offsets[at] ?? 0)).toBe(
      (after.offsets[moved] ?? 0) - WIDE.header,
    );
  });

  test("falls back to the letter when the song has gone", () => {
    const before = buildJukeboxLayout([group("A", 4), group("B", 4)], WIDE);
    const after = buildJukeboxLayout([group("B", 4)], WIDE);
    const at = before.rows.get("a-2") ?? 0;
    // A's heading is gone with A, so the list starts at the top again.
    expect(anchorTop(before, after, before.offsets[at] ?? 0)).toBe(0);
    // B's heading survives: a heading is anchored at its own top.
    const heading = before.rows.get("b-0") ?? 0;
    const letter = before.groups.find((entry) => entry.letter === "B");
    expect(anchorTop(before, after, (letter?.top ?? 0) + 1)).toBe(
      after.groups.find((entry) => entry.letter === "B")?.top ?? -1,
    );
    // A row of B keeps its place below the sticky heading.
    expect(anchorTop(before, after, before.offsets[heading] ?? 0)).toBe(
      (after.offsets[after.rows.get("b-0") ?? 0] ?? 0) - WIDE.header,
    );
  });
});

describe("itemAtOffset", () => {
  test("names the item containing an offset and clamps at the ends", () => {
    const layout = buildJukeboxLayout([group("A", 2), group("B", 2)], WIDE);
    expect(itemAtOffset(layout, -50)).toBe(0);
    expect(itemAtOffset(layout, 0)).toBe(0);
    expect(itemAtOffset(layout, 25)).toBe(1);
    expect(itemAtOffset(layout, 240)).toBe(layout.items.length - 1);
  });
});
