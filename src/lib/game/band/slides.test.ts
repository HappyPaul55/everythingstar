import { describe, expect, test } from "bun:test";
import { slideRibbon, type SlidePoint, type SlideRibbon } from "./slides";

/** The two points the visible quarter of the ellipse joins. */
function endpoints(ribbon: SlideRibbon): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const from = { x: ribbon.left + ribbon.width / 2, y: ribbon.top + ribbon.height };
  const to =
    ribbon.side === "right"
      ? { x: ribbon.left + ribbon.width, y: ribbon.top + ribbon.height / 2 }
      : { x: ribbon.left, y: ribbon.top + ribbon.height / 2 };
  return { from, to };
}

function points(from: SlidePoint, to: SlidePoint, width = 400, height = 400) {
  return {
    from: { x: (from.x / 100) * width, y: (from.y / 100) * height },
    to: { x: (to.x / 100) * width, y: (to.y / 100) * height },
  };
}

describe("slideRibbon", () => {
  test("its bottom centre is the source and its side centre the target", () => {
    const size = { width: 400, height: 400 };
    const ribbon = slideRibbon({ x: 20, y: 70 }, { x: 60, y: 30 }, size);
    expect(ribbon.side).toBe("right");
    const ends = endpoints(ribbon);
    const wanted = points({ x: 20, y: 70 }, { x: 60, y: 30 });
    expect(ends.from.x).toBeCloseTo(wanted.from.x);
    expect(ends.from.y).toBeCloseTo(wanted.from.y);
    expect(ends.to.x).toBeCloseTo(wanted.to.x);
    expect(ends.to.y).toBeCloseTo(wanted.to.y);
  });

  test("the band leaves horizontally and arrives vertically, whichever side", () => {
    const size = { width: 400, height: 400 };
    const right = slideRibbon({ x: 20, y: 70 }, { x: 60, y: 30 }, size);
    const left = slideRibbon({ x: 80, y: 70 }, { x: 20, y: 30 }, size);
    expect(right.side).toBe("right");
    expect(left.side).toBe("left");
    // The source is at the bottom edge, so the tangent there is horizontal; the
    // target is at a side edge, so its tangent is vertical. The box is exactly
    // twice the distance, which is what puts those midpoints on the notes.
    expect(right.width).toBeCloseTo(2 * Math.abs(60 - 20) * 4);
    expect(right.height).toBeCloseTo(2 * Math.abs(70 - 30) * 4);
    expect(left.width).toBeCloseTo(2 * Math.abs(80 - 20) * 4);
    expect(left.height).toBeCloseTo(2 * Math.abs(70 - 30) * 4);
    const ends = endpoints(left);
    const wanted = points({ x: 80, y: 70 }, { x: 20, y: 30 });
    expect(ends.from.x).toBeCloseTo(wanted.from.x);
    expect(ends.from.y).toBeCloseTo(wanted.from.y);
    expect(ends.to.x).toBeCloseTo(wanted.to.x);
    expect(ends.to.y).toBeCloseTo(wanted.to.y);
  });

  test("a short gap still bends across before it goes up", () => {
    const ribbon = slideRibbon({ x: 20, y: 50 }, { x: 80, y: 48 }, { width: 400, height: 400 });
    expect(ribbon.side).toBe("right");
    // Twice a 240px horizontal and a 8px vertical distance: a wide, shallow arc
    // that turns up only at the very end.
    expect(ribbon.width).toBeCloseTo(480);
    expect(ribbon.height).toBeCloseTo(16);
  });

  test("a track with no size, no horizontal change, or a target below draws nothing", () => {
    const zero = { left: 0, top: 0, width: 0, height: 0, side: "right" as const };
    expect(slideRibbon({ x: 10, y: 10 }, { x: 90, y: 90 }, { width: 0, height: 0 })).toEqual(zero);
    expect(slideRibbon({ x: 40, y: 20 }, { x: 40, y: 80 }, { width: 400, height: 400 })).toEqual(zero);
    expect(slideRibbon({ x: 40, y: 80 }, { x: 60, y: 20 }, { width: 400, height: 400 })).not.toEqual(zero);
    expect(slideRibbon({ x: 40, y: 20 }, { x: 60, y: 80 }, { width: 400, height: 400 })).toEqual(zero);
  });
});
