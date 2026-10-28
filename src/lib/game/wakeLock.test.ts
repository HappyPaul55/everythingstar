import { describe, expect, test } from "bun:test";
import { SCREENS } from "./screens";
import { shouldHoldWakeLock, type WakeLockQuestion } from "./wakeLock";

/** A question with every condition at its most ordinary: the game wants a lock. */
const wanted: WakeLockQuestion = {
  enabled: true,
  screen: "playing",
  native: false,
  hidden: false,
};

describe("shouldHoldWakeLock", () => {
  test("a run and its entrance hold the screen, and nothing else does", () => {
    expect(shouldHoldWakeLock({ ...wanted, screen: "countdown" })).toBe(true);
    expect(shouldHoldWakeLock({ ...wanted, screen: "playing" })).toBe(true);
    // Every other screen is a page somebody reads, or a place to put the phone
    // down. This is the part of the table a new screen has to be added to.
    for (const screen of SCREENS) {
      if (screen === "countdown" || screen === "playing") continue;
      expect(shouldHoldWakeLock({ ...wanted, screen })).toBe(false);
    }
  });

  test("the pause and the results let the display sleep", () => {
    expect(shouldHoldWakeLock({ ...wanted, screen: "paused" })).toBe(false);
    expect(shouldHoldWakeLock({ ...wanted, screen: "results" })).toBe(false);
    expect(shouldHoldWakeLock({ ...wanted, screen: "welcome" })).toBe(false);
  });

  test("the setting off is off, even mid-run", () => {
    expect(shouldHoldWakeLock({ ...wanted, enabled: false })).toBe(false);
    expect(shouldHoldWakeLock({ ...wanted, enabled: false, screen: "countdown" })).toBe(
      false,
    );
  });

  test("a hidden document holds nothing", () => {
    expect(shouldHoldWakeLock({ ...wanted, hidden: true })).toBe(false);
    expect(shouldHoldWakeLock({ ...wanted, hidden: true, screen: "countdown" })).toBe(
      false,
    );
  });

  test("the native shell's boot already keeps the display awake", () => {
    expect(shouldHoldWakeLock({ ...wanted, native: true })).toBe(false);
    expect(shouldHoldWakeLock({ ...wanted, native: true, screen: "countdown" })).toBe(
      false,
    );
  });
});
