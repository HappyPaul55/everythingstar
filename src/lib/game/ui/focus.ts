/**
 * Where a directional press should take the focus next.
 *
 * A controller has no Tab key, so its D-pad is a **spatial** cursor. The DOM still
 * owns focus — the same focus a keyboard and a screen reader use — and this module
 * is only the geometry that decides which focusable element is "left" or "down".
 *
 * Pure: the component hands it rectangles, so the rule can be tested without a
 * browser. A candidate must lie in the pressed direction by its **centre**; the
 * nearest one wins, and an element sharing the current row or column is preferred
 * over a diagonal one with a similar distance.
 */

export type Direction = "up" | "down" | "left" | "right";

/** The part of a DOM rect this rule needs, in viewport coordinates. */
export interface FocusRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const CENTRE_EPSILON = 1;

function centreX(rect: FocusRect): number {
  return (rect.left + rect.right) / 2;
}

function centreY(rect: FocusRect): number {
  return (rect.top + rect.bottom) / 2;
}

/** Do two boxes share any part of the axis across the direction of travel? */
function aligned(from: FocusRect, to: FocusRect, direction: Direction): boolean {
  if (direction === "left" || direction === "right") {
    return to.bottom > from.top && to.top < from.bottom;
  }
  return to.right > from.left && to.left < from.right;
}

/**
 * The index of the next focusable box, or `null` when there is nothing in that
 * direction. `current` is the focused element's own box; a dialog panel focused as
 * itself is a perfectly good origin even though it is not in `rects`.
 */
export function nextFocus(
  rects: readonly FocusRect[],
  current: FocusRect | null,
  direction: Direction,
): number | null {
  if (rects.length === 0) return null;
  if (!current) return 0;

  const cx = centreX(current);
  const cy = centreY(current);
  let best: { index: number; score: number } | null = null;

  for (let index = 0; index < rects.length; index += 1) {
    const candidate = rects[index]!;
    const dx = centreX(candidate) - cx;
    const dy = centreY(candidate) - cy;

    // The candidate's centre has to be genuinely in the pressed direction. A box
    // that merely overlaps the current one is not "to the right".
    const primary =
      direction === "right" ? dx : direction === "left" ? -dx : direction === "down" ? dy : -dy;
    if (primary <= CENTRE_EPSILON) continue;

    const cross = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    // A neighbour on the same row/column is what a player means; a diagonal is a
    // fallback, not the first choice. The small centre-distance term keeps two
    // aligned candidates ordered by how far they are.
    const score = primary + cross * (aligned(current, candidate, direction) ? 0.6 : 3) + cross * 0.01;

    if (best === null || score < best.score) best = { index, score };
  }

  return best?.index ?? null;
}
