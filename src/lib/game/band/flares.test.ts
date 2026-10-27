import { describe, expect, test } from "bun:test";
import { FLARE_COUNT, flarePlan } from "./flares";

/** A random source with no randomness in it, so a plan can be pinned. */
function pinned(values: number[]): () => number {
  let at = 0;
  return () => values[at++ % values.length];
}

describe("flarePlan", () => {
  test("plans as many flares as the room has lights", () => {
    expect(flarePlan(() => 0.5)).toHaveLength(FLARE_COUNT);
    expect(flarePlan(() => 0.5, 2)).toHaveLength(2);
    expect(flarePlan(() => 0.5, 0)).toHaveLength(0);
    expect(flarePlan(() => 0.5, -3)).toHaveLength(0);
  });

  test("is the same plan for the same dice", () => {
    expect(flarePlan(pinned([0.1, 0.6, 0.3, 0.9, 0.4, 0.2, 0.8]))).toEqual(
      flarePlan(pinned([0.1, 0.6, 0.3, 0.9, 0.4, 0.2, 0.8])),
    );
  });

  test("lets a flare sit outside the backdrop, but not far outside", () => {
    const outside = flarePlan(pinned([0, 1, 0]), 8);
    for (const flare of outside) {
      expect(flare.x).toBeGreaterThanOrEqual(-15);
      expect(flare.x).toBeLessThanOrEqual(115);
      expect(flare.y).toBeGreaterThanOrEqual(-15);
      expect(flare.y).toBeLessThanOrEqual(115);
    }
    // With the dice at the ends, some of them are off the edge rather than all inside.
    expect(outside.some((flare) => flare.x < 0 || flare.x > 100 || flare.y < 0 || flare.y > 100)).toBe(
      true,
    );
  });

  test("is big, slow and faint: a room's lighting, not an effect", () => {
    for (const flare of flarePlan(pinned([0, 0.25, 0.5, 0.75, 1]), 12)) {
      expect(flare.size).toBeGreaterThanOrEqual(30);
      expect(flare.size).toBeLessThanOrEqual(78);
      expect(flare.durationS).toBeGreaterThanOrEqual(12);
      expect(flare.durationS).toBeLessThanOrEqual(28);
      expect(flare.drift).toBeGreaterThan(0);
      // Behind a page scrim, so the numbers here are the *source* brightness: a glow has
      // to be strong to arrive faint.
      expect(flare.opacity).toBeGreaterThanOrEqual(0.4);
      expect(flare.opacity).toBeLessThanOrEqual(0.85);
    }
  });

  test("moves enough to be noticed, without racing", () => {
    // vmax of travel per second, which is what "the room is alive" actually means: too
    // little and it reads as a still, too much and it reads as an effect.
    for (const flare of flarePlan(pinned([0, 0.5, 1]), 9)) {
      const speed = flare.drift / flare.durationS;
      expect(speed).toBeGreaterThanOrEqual(0.35);
      // The fastest a light is allowed to drift: 2vmax a second is already brisk.
      expect(speed).toBeLessThanOrEqual(2);
    }
  });

  test("starts every flare mid-wander, so the room is already lit", () => {
    for (const flare of flarePlan(pinned([0.5, 0.9, 0.2]), 8)) {
      expect(flare.delayS).toBeLessThanOrEqual(0);
      expect(flare.delayS).toBeGreaterThanOrEqual(-flare.durationS);
    }
  });

  test("uses the whole range, so a room does not look arranged", () => {
    // A walking random, so the plan is not one value repeated: the point is that the
    // sizes and places vary, not what any particular one is.
    let step = 0;
    const walking = () => {
      step += 0.137;
      return step % 1;
    };
    const flares = flarePlan(walking, 20);
    expect(Math.min(...flares.map((flare) => flare.size))).toBeLessThan(45);
    expect(Math.max(...flares.map((flare) => flare.size))).toBeGreaterThan(62);
    expect(new Set(flares.map((flare) => flare.x)).size).toBeGreaterThan(10);
  });
});
