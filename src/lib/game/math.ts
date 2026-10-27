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
