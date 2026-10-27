import { describe, expect, test } from "bun:test";
import {
  EMPTY_ONBOARDING,
  hasSeenHints,
  markHintsSeen,
  parseOnboarding,
} from "./onboarding";

describe("first-run hints, per seat", () => {
  test("a fresh store has taught nobody", () => {
    expect(parseOnboarding(null)).toEqual(EMPTY_ONBOARDING);
    expect(hasSeenHints(EMPTY_ONBOARDING, 0)).toBe(false);
  });

  test("one seat is remembered without teaching the others", () => {
    const after = markHintsSeen(EMPTY_ONBOARDING, 0);
    expect(hasSeenHints(after, 0)).toBe(true);
    expect(hasSeenHints(after, 1)).toBe(false);
    // The example in the product: Players 1 and 2 have played, Player 3 has not.
    const two = markHintsSeen(after, 1);
    expect(hasSeenHints(two, 0)).toBe(true);
    expect(hasSeenHints(two, 1)).toBe(true);
    expect(hasSeenHints(two, 2)).toBe(false);
  });

  test("marking a seat twice is the same state", () => {
    const once = markHintsSeen(EMPTY_ONBOARDING, 2);
    expect(markHintsSeen(once, 2)).toBe(once);
  });

  test("a stored record is read back, cleaned and in seat order", () => {
    expect(parseOnboarding(JSON.stringify({ seats: [3, 1, 3] }))).toEqual({
      seats: [1, 3],
    });
    expect(parseOnboarding(JSON.stringify({ seats: [1, -1, 2.5, "3", 4] }))).toEqual({
      seats: [1, 4],
    });
  });

  test("a broken record teaches again rather than never", () => {
    expect(parseOnboarding("{")).toEqual(EMPTY_ONBOARDING);
    expect(parseOnboarding(JSON.stringify({ seats: "0" }))).toEqual(EMPTY_ONBOARDING);
    expect(parseOnboarding(JSON.stringify({}))).toEqual(EMPTY_ONBOARDING);
  });

  test("an impossible seat is not written down", () => {
    expect(markHintsSeen(EMPTY_ONBOARDING, -1)).toBe(EMPTY_ONBOARDING);
    expect(markHintsSeen(EMPTY_ONBOARDING, 1.5)).toBe(EMPTY_ONBOARDING);
    expect(markHintsSeen(EMPTY_ONBOARDING, Number.NaN)).toBe(EMPTY_ONBOARDING);
  });
});
