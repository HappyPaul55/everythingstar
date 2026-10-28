import { describe, expect, test } from "bun:test";
import {
  HAPTIC_GAP_MS,
  MISS_CUE,
  STAR_CUE,
  hapticAllowed,
  type HapticCue,
} from "./haptics";

/** A pattern's total length, which is what a player feels. */
function total(cue: HapticCue): number {
  return cue.buzz.reduce((sum, ms) => sum + ms, 0);
}

describe("the haptic cues", () => {
  test("every pattern is a real vibration, in whole milliseconds", () => {
    for (const cue of [MISS_CUE, STAR_CUE]) {
      expect(cue.buzz.length).toBeGreaterThan(0);
      for (const ms of cue.buzz) {
        expect(Number.isInteger(ms)).toBe(true);
        expect(ms).toBeGreaterThan(0);
      }
    }
  });

  test("star power is the longer, stronger moment", () => {
    expect(total(STAR_CUE)).toBeGreaterThan(total(MISS_CUE));
    expect(STAR_CUE.rumble.duration).toBeGreaterThan(MISS_CUE.rumble.duration);
    expect(STAR_CUE.rumble.strongMagnitude).toBeGreaterThan(
      MISS_CUE.rumble.strongMagnitude,
    );
    expect(STAR_CUE.rumble.weakMagnitude).toBeGreaterThan(
      MISS_CUE.rumble.weakMagnitude,
    );
    // Both stay inside what an actuator and a buzzer accept.
    for (const cue of [MISS_CUE, STAR_CUE]) {
      expect(cue.rumble.strongMagnitude).toBeGreaterThanOrEqual(0);
      expect(cue.rumble.strongMagnitude).toBeLessThanOrEqual(1);
      expect(cue.rumble.weakMagnitude).toBeGreaterThanOrEqual(0);
      expect(cue.rumble.weakMagnitude).toBeLessThanOrEqual(1);
    }
  });
});

describe("hapticAllowed", () => {
  test("the first buzz of a session is always allowed", () => {
    expect(hapticAllowed(null, 0)).toBe(true);
    expect(hapticAllowed(null, 12_000)).toBe(true);
  });

  test("a second buzz waits out the gap", () => {
    const last = 1_000;
    expect(hapticAllowed(last, last + HAPTIC_GAP_MS - 1)).toBe(false);
    expect(hapticAllowed(last, last + HAPTIC_GAP_MS)).toBe(true);
    expect(hapticAllowed(last, last + HAPTIC_GAP_MS + 250)).toBe(true);
  });

  test("the gap is a floor rather than the only rule", () => {
    expect(hapticAllowed(500, 500, 0)).toBe(true);
    expect(hapticAllowed(500, 500, 200)).toBe(false);
    // A negative gap cannot make a buzz wait for longer than none.
    expect(hapticAllowed(500, 500, -100)).toBe(true);
  });

  test("a timestamp that went backwards is a fresh start", () => {
    // No real device moves its clock back, but a restored or clamped value must
    // not silence the next minute of play.
    expect(hapticAllowed(5_000, 10)).toBe(true);
    expect(hapticAllowed(Number.NaN, 10)).toBe(true);
    expect(hapticAllowed(10, Number.POSITIVE_INFINITY)).toBe(true);
  });
});
