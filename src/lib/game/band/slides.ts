/**
 * The shape a **slide** draws between two notes.
 *
 * Pure geometry, in the highway's own percentages: x across the columns, y down
 * the neck. A slide leaves the source note's **end** (its tail when it is a
 * sustain) and arrives at the target note's head, so the drawing and the judging
 * agree about where the glide starts.
 *
 * The line is a **band**, not a stroke: a div whose bottom-left or bottom-right
 * quarter is the ellipse between the two points. The source sits at the bottom
 * **centre** of that box and the target at its right or left **centre**, which
 * makes the band leave the source **across** the neck and turn **up** into the
 * target. That direction is the same whichever way the slide goes — a quarter of
 * an ellipse has one tangent at each end — and it is made of a border and a huge
 * radius, so there is no SVG and nothing to repaint on a frame.
 *
 * The colour is neutral gray, in CSS: a slide belongs to neither note's column.
 */
export interface SlidePoint {
  x: number;
  y: number;
}

/** The track the band is drawn in, in CSS pixels. */
export interface SlideSize {
  width: number;
  height: number;
}

/**
 * A positioned box whose visible quarter is the band. `side` says which bottom
 * quarter is kept: the side the target is on, so the band goes across towards it.
 */
export interface SlideRibbon {
  left: number;
  top: number;
  width: number;
  height: number;
  side: "left" | "right";
}

/**
 * The box that draws the band between two points.
 *
 * The source is at the bottom centre and the target at the right centre (when the
 * target is to the right) or the left centre (when it is to the left). The box is
 * therefore twice the horizontal and vertical distance, positioned so those two
 * midpoints are the notes. The visible quarter of the ellipse runs from the
 * bottom centre to the side centre: horizontally away from the source, then
 * vertically into the target.
 *
 * A slide with no measured track, no horizontal change, or a target that is not
 * above its source returns a zero box; the caller draws nothing visible, and the
 * chart's own rules are what refuse such a link.
 */
export function slideRibbon(
  from: SlidePoint,
  to: SlidePoint,
  size: SlideSize,
): SlideRibbon {
  const fromX = (from.x / 100) * size.width;
  const fromY = (from.y / 100) * size.height;
  const toX = (to.x / 100) * size.width;
  const toY = (to.y / 100) * size.height;
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (!(size.width > 0) || !(size.height > 0) || dx === 0 || !(dy < 0)) {
    return { left: 0, top: 0, width: 0, height: 0, side: "right" };
  }
  const side: SlideRibbon["side"] = dx > 0 ? "right" : "left";
  const width = Math.abs(dx) * 2;
  const height = Math.abs(dy) * 2;
  return {
    // Right: the box's right edge is the target, its bottom edge the source.
    // Left: its left edge is the target, its bottom edge the source.
    left: side === "right" ? fromX - width / 2 : toX,
    top: toY - height / 2,
    width,
    height,
    side,
  };
}
