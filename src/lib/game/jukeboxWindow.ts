/**
 * The jukebox's **window**: which part of a song list is in the DOM.
 *
 * The list is one long column — a letter heading, its rows, the next heading —
 * and a library can be a folder of two thousand songs. `Songs.tsx` used to mount
 * every row once it was ready; this module is the arithmetic that keeps only the
 * rows around the viewport mounted, without changing what the list *is*.
 *
 * It is pure and unit-tested: the component measures a heading and a row (their
 * heights differ, and both change at the stylesheet's breakpoints) and this
 * says which items to render, how much spacer stands in for the rest, and where
 * a letter's heading sits. The rows are a fixed height per breakpoint — a row
 * does not grow when a title is long, it ellipsises — so a running offset is all
 * the geometry the list needs.
 *
 * **The heading of the group at the top is part of the window even when its rows
 * are not.** `position: sticky` is what makes a letter stay at the top while its
 * songs scroll under it, and a sticky element that is not mounted cannot stick.
 * So the first rendered section starts at its heading and uses a spacer between
 * that heading and the first row of the window. That is also why the window is
 * not just a `[start, end)` slice: `sections` says, per group, which of its rows
 * are actually mounted and how much stands in for the rows skipped after the
 * heading.
 *
 * Nothing here reads the DOM. Heights come in, offsets and spacers go out.
 */

import type { SongGroup } from "./jukebox";
import { clamp as clampNumber } from "./math";

/** How tall one item is. Measured by the screen; different per breakpoint. */
export interface JukeboxHeights {
  /** One letter heading (`.song-group__letter`). */
  header: number;
  /** One song row (`.song-row`). */
  row: number;
}

/** One heading or one row, in list order. */
export interface JukeboxItem {
  kind: "letter" | "song";
  /** The letter this item files under. */
  letter: string;
  /** Index into the groups the layout was built from. */
  group: number;
  /** For a row, its index in that group's entries; `-1` for a heading. */
  entry: number;
  /**
   * The song a row plays; null for a heading. It is what lets the list find the
   * item it was showing again after a library refresh, by identity rather than
   * by a flat index that has moved.
   */
  song: string | null;
}

/** One letter's place in the list: a heading and the rows under it. */
export interface JukeboxGroup {
  letter: string;
  /** Flat index of the heading. */
  header: number;
  /** Top of the heading, in the scroller's content coordinates. */
  top: number;
  /** How many rows the group has. */
  rows: number;
  /** Top just past the group's last row. */
  bottom: number;
}

/** The whole list, flattened, with every item's top. */
export interface JukeboxLayout {
  heights: JukeboxHeights;
  items: JukeboxItem[];
  /** `offsets[i]` is the top of item `i`; `offsets[items.length]` is the total. */
  offsets: number[];
  groups: JukeboxGroup[];
  total: number;
  /** A row's flat index, by song id — what focus and the arrows follow. */
  rows: Map<string, number>;
}

/** How many rows are mounted beyond each edge of the viewport. */
export const WINDOW_OVERSCAN = 4;

/** The header and its rows, as the window renders them. */
export interface JukeboxSection {
  /** Index into `layout.groups`. */
  group: number;
  /** First and last+1 entry index in that group that are mounted. */
  from: number;
  to: number;
  /**
   * Height of the spacer between the group's heading and `from`. It is non-zero
   * only for the group the window starts inside: the heading is mounted even
   * though the rows above the viewport are not.
   */
  skip: number;
}

/** What to render, and the spacers that stand in for everything else. */
export interface JukeboxWindow {
  /** Flat index of the first item in the mounted range, inclusive. */
  start: number;
  /** Flat index just past the mounted range. */
  end: number;
  /** Height of the spacer before the first rendered section. */
  top: number;
  /** Height of the spacer after the last rendered row. */
  bottom: number;
  sections: JukeboxSection[];
}

const EMPTY_WINDOW: JukeboxWindow = {
  start: 0,
  end: 0,
  top: 0,
  bottom: 0,
  sections: [],
};

/**
 * Flatten groups into items and running offsets.
 *
 * One heading for every group, then its rows in order. A group is never empty
 * (`groupSongs` filters), but the layout does not assume it: a heading with no
 * rows still occupies its heading height.
 */
export function buildJukeboxLayout(
  groups: readonly SongGroup[],
  heights: JukeboxHeights,
): JukeboxLayout {
  const header = Math.max(0, heights.header);
  const row = Math.max(0, heights.row);
  const items: JukeboxItem[] = [];
  const offsets: number[] = [];
  const built: JukeboxGroup[] = [];
  const rows = new Map<string, number>();
  let top = 0;

  groups.forEach((group, groupIndex) => {
    const headerIndex = items.length;
    const groupTop = top;
    items.push({
      kind: "letter",
      letter: group.letter,
      group: groupIndex,
      entry: -1,
      song: null,
    });
    offsets.push(top);
    top += header;
    group.entries.forEach((entry, entryIndex) => {
      rows.set(entry.song.id, items.length);
      items.push({
        kind: "song",
        letter: group.letter,
        group: groupIndex,
        entry: entryIndex,
        song: entry.song.id,
      });
      offsets.push(top);
      top += row;
    });
    built.push({
      letter: group.letter,
      header: headerIndex,
      top: groupTop,
      rows: group.entries.length,
      bottom: top,
    });
  });
  offsets.push(top);

  return {
    heights: { header, row },
    items,
    offsets,
    groups: built,
    total: top,
    rows,
  };
}

/** The item at a scroll offset: the last one whose top is at or above it. */
export function itemAtOffset(layout: JukeboxLayout, offset: number): number {
  const count = layout.items.length;
  if (count === 0) return 0;
  const at = clamp(offset, 0, layout.total);
  // The last i with offsets[i] <= at. Clamped to the last item so an offset at
  // the very bottom still names something (the last row).
  let low = 0;
  let high = count - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (layout.offsets[mid] <= at) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * The letter the list is showing at a scroll offset.
 *
 * `slack` is the same few pixels the screen used before windowing: with the
 * heading stuck at the top, the row's own content can begin a hair below the
 * scroll position, and a letter should light up as soon as its heading reaches
 * the top rather than a frame later.
 */
export function letterAtOffset(
  layout: JukeboxLayout,
  offset: number,
  slack = 8,
): string | null {
  let letter: string | null = null;
  const at = offset + slack;
  for (const group of layout.groups) {
    if (group.top <= at) letter = group.letter;
    else break;
  }
  return letter;
}

/** Where a letter's heading is, or null if the filtered list has no such group. */
export function letterOffset(layout: JukeboxLayout, letter: string): number | null {
  const group = layout.groups.find((entry) => entry.letter === letter);
  return group ? group.top : null;
}

/**
 * The window to mount.
 *
 * `scrollTop` and `viewportHeight` are in the scroller's own coordinates. The
 * visible items are expanded by `overscan` **rows** on each side (headings are
 * carried along, they are cheap and they keep the sticky letter mounted), so a
 * frame of scrolling does not mount or unmount anything. `ensure` is a flat item
 * index that must be mounted — the row an arrow or Tab has just moved to, even
 * if it is outside the overscanned range.
 *
 * `top` and `bottom` are the spacers; with the sections between them they add up
 * to `layout.total`, which is what keeps the scrollbar stable and the scroll
 * position exact as the window slides.
 */
export function jukeboxWindow(
  layout: JukeboxLayout,
  scrollTop: number,
  viewportHeight: number,
  overscan = WINDOW_OVERSCAN,
  ensure: number | null = null,
): JukeboxWindow {
  const count = layout.items.length;
  if (count === 0) return EMPTY_WINDOW;

  const top = clamp(scrollTop, 0, layout.total);
  const view = Math.max(0, viewportHeight);
  const extra = Math.max(0, Math.floor(overscan));

  let start = itemAtOffset(layout, top);
  let end = Math.min(count, itemAtOffset(layout, top + view) + 1);

  // A few rows on each side, counted as rows so a run of headings does not eat
  // the overscan.
  let seen = 0;
  while (start > 0 && seen < extra) {
    start -= 1;
    if (layout.items[start].kind === "song") seen += 1;
  }
  seen = 0;
  while (end < count && seen < extra) {
    if (layout.items[end].kind === "song") seen += 1;
    end += 1;
  }

  // A row focus has moved to is mounted even when it is outside the overscan.
  // Recentre the window on it rather than stretching the slice all the way from
  // the viewport: the caller is scrolling there at the same time, and a Home/End
  // jump must not mount the list in between.
  if (ensure !== null && ensure >= 0 && ensure < count && (ensure < start || ensure >= end)) {
    return jukeboxWindow(
      layout,
      layout.offsets[ensure] ?? 0,
      viewportHeight,
      extra,
      null,
    );
  }

  const firstGroup = layout.items[start].group;
  const lastGroup = layout.items[end - 1].group;
  const sections: JukeboxSection[] = [];
  for (let groupIndex = firstGroup; groupIndex <= lastGroup; groupIndex += 1) {
    const group = layout.groups[groupIndex];
    const firstRow = group.header + 1;
    const firstMounted = groupIndex === firstGroup ? Math.max(start, firstRow) : firstRow;
    const lastMounted = Math.min(end, firstRow + group.rows);
    const from = Math.max(0, firstMounted - firstRow);
    const to = Math.max(from, lastMounted - firstRow);
    const skip =
      groupIndex === firstGroup
        ? layout.offsets[firstMounted] - (group.top + layout.heights.header)
        : 0;
    sections.push({ group: groupIndex, from, to, skip });
  }

  return {
    start,
    end,
    top: layout.groups[firstGroup].top,
    bottom: layout.total - layout.offsets[end],
    sections,
  };
}

/**
 * The row `step` places away from `from`, skipping headings. Null at the end of
 * the list, which is what lets Tab leave the list rather than wrap.
 */
export function rowFrom(
  layout: JukeboxLayout,
  from: number,
  step: number,
): number | null {
  if (step === 0) return null;
  let index = from + step;
  while (index >= 0 && index < layout.items.length) {
    if (layout.items[index].kind === "song") return index;
    index += step;
  }
  return null;
}

/**
 * The scrollTop that brings a row into view, moving as little as possible.
 *
 * A row already in view is not moved. A row above the viewport — or one sitting
 * under the sticky letter heading, which is in the viewport but not in sight —
 * lands **below** that heading; one below the viewport lands at the bottom. The
 * result is clamped so the last row is still reachable at the end of the list.
 */
export function scrollTopForItem(
  layout: JukeboxLayout,
  index: number,
  viewportHeight: number,
  scrollTop: number,
): number {
  const top = layout.offsets[index] ?? 0;
  const bottom = layout.offsets[index + 1] ?? layout.total;
  const view = Math.max(0, viewportHeight);
  const header = Math.max(0, layout.heights.header);
  // The heading is sticky, so the first `header` pixels of the viewport are
  // covered by it: a row seated at `scrollTop` exactly would be hidden behind the
  // yellow bar. Seat it one heading lower instead.
  if (top < scrollTop + header) {
    return clamp(top - header, 0, Math.max(0, layout.total - view));
  }
  if (bottom > scrollTop + view) {
    return clamp(bottom - view, 0, Math.max(0, layout.total - view));
  }
  return scrollTop;
}

/**
 * The scrollTop that keeps showing what the list showed at `offset` after its
 * contents changed underneath it.
 *
 * The item at the top is found again **by identity** — a row by its song's id, a
 * heading by its letter — rather than by its flat index, because a library
 * refresh can insert or drop a song above it. A row is seated below the sticky
 * heading, exactly as it is when focus brings one to the top; a heading is put at
 * the top, where it belongs. A song that has gone from the list falls back to its
 * letter, and a letter that has gone too means the top.
 */
export function anchorTop(
  previous: JukeboxLayout,
  next: JukeboxLayout,
  offset: number,
): number {
  const item = previous.items[itemAtOffset(previous, offset)];
  if (!item) return 0;
  if (item.song !== null) {
    const at = next.rows.get(item.song);
    if (at !== undefined) {
      const top = (next.offsets[at] ?? 0) - Math.max(0, next.heights.header);
      return clamp(top, 0, Math.max(0, next.total));
    }
  }
  const group = next.groups.find((entry) => entry.letter === item.letter);
  return group ? group.top : 0;
}

function clamp(value: number, low: number, high: number): number {
  if (high < low) return low;
  return clampNumber(value, low, high);
}
