import { describe, expect, test } from "bun:test";
import {
  DRIFT_HOLD_MS,
  DRIFT_SEEK_MS,
  FRUITLESS_SEEK_LIMIT,
  RATE_RANGE,
  SEEK_COOLDOWN_MS,
  SEEK_LAND_TOLERANCE_MS,
  STILL_HOLD_MS,
  STILL_SEEK_COOLDOWN_MS,
  driftAction,
  seekHelped,
  seekLanded,
  seekRefused,
  stillAction,
  stemRate,
} from "./drift";

/** Long enough ago that a seek is allowed. */
const LONG_AGO = SEEK_COOLDOWN_MS * 10;

describe("driftAction", () => {
  test("a stem that is close enough is left alone", () => {
    expect(driftAction(0, LONG_AGO)).toEqual({ kind: "hold" });
    expect(driftAction(DRIFT_HOLD_MS, LONG_AGO)).toEqual({ kind: "hold" });
    expect(driftAction(-DRIFT_HOLD_MS, LONG_AGO)).toEqual({ kind: "hold" });
  });

  test("a stem a little out of line is carried by its rate, not moved", () => {
    const ahead = driftAction(DRIFT_SEEK_MS / 2, LONG_AGO);
    expect(ahead.kind).toBe("rate");
    // Ahead of the song means slowed; behind means hurried.
    if (ahead.kind === "rate") expect(ahead.playbackRate).toBeLessThan(1);

    const behind = driftAction(-DRIFT_SEEK_MS / 2, LONG_AGO);
    expect(behind.kind).toBe("rate");
    if (behind.kind === "rate") expect(behind.playbackRate).toBeGreaterThan(1);
  });

  test("a spread that used to be left alone is now corrected", () => {
    // The reported flam: stems 60 ms apart. The old hold called that close enough;
    // it is now past the seek threshold outright — the room hears it, so it is fixed
    // in one move rather than carried for seconds.
    expect(driftAction(60, LONG_AGO).kind).toBe("seek");
    expect(driftAction(-60, LONG_AGO).kind).toBe("seek");
  });

  test("the rate has real strength by the time a seek is due", () => {
    // A half-seek drift is nudged the full range, not a token fraction: a gentle
    // correction that would take a minute is another way of leaving a stem behind.
    const action = driftAction(DRIFT_SEEK_MS / 2, LONG_AGO);
    expect(action.kind).toBe("rate");
    if (action.kind === "rate") expect(Math.abs(action.playbackRate - 1)).toBeGreaterThanOrEqual(RATE_RANGE / 2);
  });

  test("the rate never moves more than the range, however far out the stem is", () => {
    for (const drift of [-5000, -1000, 1000, 5000]) {
      const action = driftAction(drift, 0);
      expect(action.kind).toBe("rate");
      if (action.kind === "rate") {
        expect(Math.abs(action.playbackRate - 1)).toBeLessThanOrEqual(RATE_RANGE + 1e-9);
      }
    }
  });

  test("a flam past the threshold is seeked — once, and not again in a hurry", () => {
    expect(driftAction(DRIFT_SEEK_MS, LONG_AGO)).toEqual({ kind: "seek" });
    expect(driftAction(-DRIFT_SEEK_MS, LONG_AGO)).toEqual({ kind: "seek" });
    // The seek has just happened: the drift is not fought with another one.
    expect(driftAction(DRIFT_SEEK_MS, 0).kind).toBe("rate");
    expect(driftAction(DRIFT_SEEK_MS, SEEK_COOLDOWN_MS / 2).kind).toBe("rate");
    expect(driftAction(DRIFT_SEEK_MS, SEEK_COOLDOWN_MS).kind).toBe("seek");
  });

  test("a stem that will not take a move is carried by its rate, at full strength", () => {
    // A seek on such a stem is a write that never lands — and a "seek" action's own
    // rate is exactly 1, so without this the stem would sit at its drift for ever
    // instead of being nudged back into the band.
    const action = driftAction(-500, LONG_AGO, false);
    expect(action.kind).toBe("rate");
    if (action.kind === "rate") expect(action.playbackRate).toBeGreaterThan(1);
    if (action.kind === "rate") {
      expect(Math.abs(action.playbackRate - 1)).toBeCloseTo(RATE_RANGE, 10);
    }
    // And the hold still holds: a drift inside it is nobody's business.
    expect(driftAction(DRIFT_HOLD_MS, LONG_AGO, false)).toEqual({ kind: "hold" });
  });

  test("the thresholds are ordered: hold, then rate, then seek", () => {
    expect(DRIFT_HOLD_MS).toBeLessThan(DRIFT_SEEK_MS);
    // A hold wider than a frame, or a seek wider than the ~40 ms flam the room
    // hears, is how a resume's stagger stayed in the mix unseen: measured in the
    // browser, a nudge-only recovery sat at 20–40 ms apart for the rest of the run.
    expect(DRIFT_HOLD_MS).toBeLessThanOrEqual(20);
    expect(DRIFT_SEEK_MS).toBeLessThanOrEqual(40);
    expect(RATE_RANGE).toBeGreaterThan(0);
    expect(RATE_RANGE).toBeLessThan(0.1);
  });
});

describe("stillAction", () => {
  test("a stem in a pause is left alone when it is in phase", () => {
    expect(stillAction(0, 0)).toEqual({ kind: "hold" });
    expect(stillAction(STILL_HOLD_MS, 0)).toEqual({ kind: "hold" });
    expect(stillAction(-STILL_HOLD_MS, 0)).toEqual({ kind: "hold" });
    expect(stillAction(Number.NaN, LONG_AGO)).toEqual({ kind: "hold" });
  });

  test("a correction in a pause is moved, never nudged", () => {
    // A rate exists to hide a correction from the room. A pause has no room to
    // hear one, so anything past the hold is a move — no half measures and no
    // waiting.
    expect(stillAction(STILL_HOLD_MS + 1, LONG_AGO)).toEqual({ kind: "seek" });
    expect(stillAction(-200, LONG_AGO)).toEqual({ kind: "seek" });
  });

  test("the hold is tighter than the moving one, so a start is in phase", () => {
    expect(STILL_HOLD_MS).toBeLessThan(DRIFT_HOLD_MS);
    // 60 ms is a spread the moving rule nudges; a stem lined up in a pause may not
    // be that far out when the song starts.
    expect(stillAction(60, LONG_AGO)).toEqual({ kind: "seek" });
  });

  test("a seek buys a shorter peace, and is not fought while it settles", () => {
    expect(STILL_SEEK_COOLDOWN_MS).toBeLessThan(SEEK_COOLDOWN_MS);
    expect(stillAction(200, 0)).toEqual({ kind: "hold" });
    expect(stillAction(200, STILL_SEEK_COOLDOWN_MS / 2)).toEqual({ kind: "hold" });
    expect(stillAction(200, STILL_SEEK_COOLDOWN_MS)).toEqual({ kind: "seek" });
  });
});

describe("stemRate", () => {
  test("an ordinary run writes the nudge as it always did", () => {
    expect(stemRate(1, { kind: "hold" })).toBe(1);
    expect(stemRate(1, { kind: "seek" })).toBe(1);
    expect(stemRate(1, { kind: "rate", playbackRate: 1.02 })).toBeCloseTo(1.02, 10);
  });

  test("a practice speed is the base a nudge is applied to, never replaced", () => {
    // A stem behind the playhead is hurried *relative to the slowed song*: the
    // bare 1.02 would be a jump back to full speed.
    const nudge = { kind: "rate", playbackRate: 1.02 } as const;
    expect(stemRate(0.8, nudge)).toBeCloseTo(0.816, 10);
    expect(stemRate(0.5, nudge)).toBeCloseTo(0.51, 10);
    // A hold or a seek returns the song's own rate, not 1.
    expect(stemRate(0.8, { kind: "hold" })).toBe(0.8);
    expect(stemRate(0.8, { kind: "seek" })).toBe(0.8);
  });

  test("a broken base falls back to the record", () => {
    expect(stemRate(Number.NaN, { kind: "hold" })).toBe(1);
    expect(stemRate(0, { kind: "rate", playbackRate: 0.99 })).toBeCloseTo(0.99, 10);
  });
});

describe("seekLanded", () => {
  test("a write the element took is the write that counts", () => {
    // The element reports its new position straight away, even while the seek is
    // still in flight — that is the signal, not the flight being over.
    expect(seekLanded(9.28, 9.28)).toBe(true);
    expect(seekLanded(9.28 + 0.001, 9.28)).toBe(true);
  });

  test("a resource that cannot be seeked ignores the write, and is caught by it", () => {
    // A live stream, or a host that will not answer a range: the position is simply
    // still where it was. This is the stem that must never be written to again —
    // the correction rules would re-issue the write for the rest of the run.
    expect(seekLanded(1.0, 9.28)).toBe(false);
    // Drift carries the old position on in the meantime; that is not the write
    // landing either.
    expect(seekLanded(1.004, 9.28)).toBe(false);
  });

  test("a position that cannot be read is not a landed seek", () => {
    expect(seekLanded(Number.NaN, 9.28)).toBe(false);
    expect(seekLanded(9.28, Number.POSITIVE_INFINITY)).toBe(false);
  });

  test("the tolerance is float dust, not a distance the room could hear", () => {
    expect(SEEK_LAND_TOLERANCE_MS).toBeLessThan(5);
  });
});

describe("seekRefused", () => {
  test("a stem with current data that stays put has refused the move", () => {
    // The live stream / no-range host: it has data, it is not seeking, and the
    // position simply did not move. This is the one that must not be written again.
    expect(seekRefused(1.0, 9.28, 2, false)).toBe(true);
    expect(seekRefused(1.004, 9.28, 4, false)).toBe(true);
  });

  test("a stem still loading its data has not refused anything", () => {
    // A phone reports metadata — a duration, a position of zero — long before it
    // has bytes to move in. Marking it here would leave it carried by a 2% rate
    // for the rest of the run, seconds behind and never able to catch up.
    expect(seekRefused(0, 9.28, 0, false)).toBe(false);
    expect(seekRefused(0, 9.28, 1, false)).toBe(false);
  });

  test("a seek still in flight reads its old position, and is not a refusal", () => {
    expect(seekRefused(1.0, 9.28, 4, true)).toBe(false);
  });

  test("a write that landed is never a refusal", () => {
    expect(seekRefused(9.28, 9.28, 4, false)).toBe(false);
    expect(seekRefused(9.281, 9.28, 2, false)).toBe(false);
  });
});

describe("seekHelped", () => {
  test("a seek that landed on the playhead halves the gap at least", () => {
    // The gap was108ms; a second later it is 20 — the seek cost nothing worth
    // counting, and the stem may well be seeked again for a fresh problem.
    expect(seekHelped(108, 20)).toBe(true);
    expect(seekHelped(40, 5)).toBe(true);
    expect(seekHelped(-108, -20)).toBe(true);
  });

  test("a seek that bought nothing is the correction loop's signature", () => {
    // Measured in a loaded browser: 108ms out, seek, a second later 100ms out —
    // the seek discarded the stem's forward buffer and cost more than it cured.
    expect(seekHelped(108, 100)).toBe(false);
    expect(seekHelped(40, 30)).toBe(false);
    expect(seekHelped(-40, -30)).toBe(false);
  });

  test("a reading that cannot be judged is not held against the stem", () => {
    expect(seekHelped(Number.NaN, 20)).toBe(true);
    expect(seekHelped(40, Number.POSITIVE_INFINITY)).toBe(true);
  });

  test("the stem is given two of them, and then only the rate", () => {
    // Two is the balance the measurements ask for: one wasted seek could be a
    // coincidence, three is two more seconds of a flam that is not closing.
    expect(FRUITLESS_SEEK_LIMIT).toBe(2);
    expect(DRIFT_SEEK_MS).toBeGreaterThan(DRIFT_HOLD_MS);
  });
});
