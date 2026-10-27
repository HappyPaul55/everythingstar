/**
 * The room's lights: a few flares that drift over the backdrop.
 *
 * A photograph of a stage with lights that never move reads as a picture, and a menu is
 * not a poster. So the backdrop gets a handful of soft glows, **randomly placed** — some
 * of them deliberately hanging off the edge, the way a real light does — each wandering
 * slowly and out of step with the others.
 *
 * The **planning** is pure, so where a flare sits, how large it is and how long its
 * wander takes is a function of a random source rather than something buried in
 * keyframes. The component only places what this hands it, and a test can pin the dice.
 */

export interface Flare {
  /** Centre, in percent of the backdrop. Outside 0–100 is deliberate. */
  x: number;
  y: number;
  /** Diameter, in vmax: these are broad, soft lights, not dots. */
  size: number;
  /** How long one wander takes, in seconds. */
  durationS: number;
  /** When it starts. **Negative**, so they are already in motion when the page opens. */
  delayS: number;
  /** How far it wanders, in vmax. */
  drift: number;
  /** How bright it is. Low: this is light falling on a room, not a lamp. */
  opacity: number;
}

/** How many flares a room has, unless it says otherwise. */
export const FLARE_COUNT = 6;

/** How far outside the backdrop a flare may sit, in percent of it. */
const OVERSHOOT = 14;

interface Shape {
  size: [number, number];
  durationS: [number, number];
  drift: [number, number];
  opacity: [number, number];
}

/**
 * Big, slow and faint. A flare that is small, quick or bright reads as an effect; these
 * have to read as the lighting of a room somebody is standing in.
 *
 * The brightness looks high for "faint", and that is the page scrim: the lights are
 * **behind** the menu rather than painted on it, so a glow of 0.5 arrives at the eye as
 * a fifth of that. Dim enough to be tasteful *and* visible is a narrow band, and it took
 * a look at a screenshot to find it.
 */
const SHAPE: Shape = {
  size: [30, 78],
  /* A full wander in 12–26s: slow enough to be a room, quick enough that somebody
     watching for a few seconds can see it is alive. With the drift below, that is never
     less than about a third of a vmax a second — the floor at which a move is noticed. */
  durationS: [12, 26],
  drift: [10, 24],
  opacity: [0.4, 0.85],
};

export function flarePlan(random: () => number = Math.random, count = FLARE_COUNT): Flare[] {
  const total = Math.max(0, Math.trunc(count));
  return Array.from({ length: total }, () => {
    // A delay of −(0..duration) starts each flare somewhere in the middle of its own
    // wander, so the room is already lit rather than lighting up a flare at a time.
    const durationS = between(SHAPE.durationS, random);
    return {
      x: round(between([-OVERSHOOT, 100 + OVERSHOOT], random)),
      y: round(between([-OVERSHOOT, 100 + OVERSHOOT], random)),
      size: round(between(SHAPE.size, random)),
      durationS: round(durationS),
      delayS: round(-durationS * random()),
      drift: round(between(SHAPE.drift, random)),
      opacity: round(between(SHAPE.opacity, random), 2),
    };
  });
}

/** A value in a range, from a random source. */
function between([from, to]: [number, number], random: () => number): number {
  return from + (to - from) * random();
}

function round(value: number, places = 1): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}
