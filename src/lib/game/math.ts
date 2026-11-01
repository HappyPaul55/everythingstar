/**
 * The arithmetic shared by more than one rule.
 *
 * These are the only clamp rules in the game. A domain that needs a different
 * one — "a non-finite value is the minimum", "an unknown length has no end" —
 * says so at its own call site rather than growing a second clamp that looks the
 * same and behaves differently.
 */

/** `value` held between `min` and `max`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** `value` held to the unit interval. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * The smallest and largest number in a list, in one pass.
 *
 * `Math.min(...values)` spreads every value into a single call, and a karaoke
 * chart may carry tens of thousands of notes: past the engine's argument limit
 * that is a `RangeError`, and the whole song disappears rather than being drawn.
 * Non-finite entries are ignored, and a list with none is `null` — the answer a
 * caller already has to handle for an empty one.
 */
export function minMax(values: readonly number[]): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}
