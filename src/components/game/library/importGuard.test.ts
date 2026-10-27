import { describe, expect, test } from "bun:test";
import {
  cancelImport,
  claimImport,
  NO_IMPORT,
  ownsImport,
  releaseImport,
  type ImportClaim,
} from "./importGuard";

/** An idle dialog's first claim, as every test below starts from one. */
function claim(): ImportClaim {
  const claimed = claimImport(NO_IMPORT);
  if (!claimed) throw new Error("an idle dialog must accept a claim");
  return claimed;
}

describe("a drop's claim on the dialog", () => {
  test("an idle dialog is claimed by the attempt that arrives", () => {
    const claimed = claim();
    expect(claimed).toEqual({ epoch: 1, busy: true });
    // That claim is what makes the dialog busy before a directory is walked.
    expect(ownsImport(claimed, claimed.epoch)).toBe(true);
  });

  test("a second drop cannot claim a dialog that is walking or copying", () => {
    // One import at a time: the second drop is ignored rather than walking a
    // second tree or replacing the first import's row and progress.
    expect(claimImport(claim())).toBeNull();
  });

  test("only the attempt that claimed the dialog owns it", () => {
    const live = claim();
    // A stale walker — an epoch the dialog has moved past — owns nothing.
    expect(ownsImport(live, live.epoch - 1)).toBe(false);
    // And a released claim is not an owner either, even with the same epoch.
    expect(ownsImport(releaseImport(live), live.epoch)).toBe(false);
  });

  test("releasing lets the next drop through", () => {
    const first = claim();
    const released = releaseImport(first);
    expect(released).toEqual({ epoch: 1, busy: false });
    expect(claimImport(released)).toEqual({ epoch: 2, busy: true });
  });

  test("a walk that resolves after the dialog went away starts no copy", () => {
    const live = claim();
    // The dialog unmounted: its epoch moves on and its busy flag is cleared.
    const cancelled = cancelImport(live);
    expect(cancelled.busy).toBe(false);
    expect(ownsImport(cancelled, live.epoch)).toBe(false);
    // And the attempt cannot walk back in: a fresh claim is a newer epoch.
    expect(claimImport(cancelled)).toEqual({ epoch: live.epoch + 2, busy: true });
  });
});
