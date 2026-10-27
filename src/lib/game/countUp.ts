/**
 * The results screen's **score count-up**, as arithmetic.
 *
 * A band's total landing all at once is a number; counting to it is the moment.
 * The drawing does the frames, but how long it takes and what each step shows are
 * a pure function of the final value, so the animation and its ticks cannot drift
 * apart from what is on screen.
 *
 * A tick is a step, not a frame: the display lands on the next value a handful of
 * times a second, which is what makes the `tick` cue read as a count rather than a
 * buzz. A very small total counts in fewer steps than it has points, so it does not
 * tick over the same figure twenty times.
 */

/** How long the count-up runs, in ms. */
export const COUNT_UP_MS = 1000;

/** The most steps a count-up takes — and so the most ticks it plays. */
export const COUNT_UP_STEPS = 20;

/** How many steps a total is worth: one per point, up to `COUNT_UP_STEPS`. */
export function countUpSteps(total: number): number {
  if (!(total > 0)) return 0;
  return Math.min(COUNT_UP_STEPS, Math.max(1, Math.floor(total)));
}

/**
 * What the count-up shows at `step` of `steps`: the total, reached in equal parts
 * and rounded, and exactly the total at the last step. A step past the end is the
 * end, and nothing below zero is a step.
 */
export function countUpValue(
  total: number,
  step: number,
  steps = COUNT_UP_STEPS,
): number {
  if (!(total > 0) || !(steps > 0)) return 0;
  const reached = Math.max(0, Math.min(steps, Math.floor(step)));
  return Math.round((total * reached) / steps);
}
