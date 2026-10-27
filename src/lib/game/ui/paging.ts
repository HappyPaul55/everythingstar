/**
 * Where a page button (LB/RB) lands in a screen's controls.
 *
 * The pad moves the browser's real focus in DOM order, not by geometry. Paging
 * normally wraps at the ends, which suits a short screen with a handful of
 * controls. The jukebox is the exception: only the rows around the viewport are
 * mounted, so wrapping from the last mounted row to the first control on the
 * screen would read as a teleport. With `wrap` false a page past an end stays
 * where it is, and the list's own arrow/Tab stepping remains the way through the
 * rest of it.
 *
 * Pure, and `null` means "do not move focus at all".
 */
export function pageIndex(
  currentIndex: number,
  count: number,
  delta: -1 | 1,
  wrap: boolean,
): number | null {
  if (count === 0) return null;
  // Nothing is focused: start at the near end, which is not a wrap.
  if (currentIndex < 0) return delta > 0 ? 0 : count - 1;
  const next = currentIndex + delta;
  if (next >= 0 && next < count) return next;
  if (!wrap) return null;
  return (next + count) % count;
}
