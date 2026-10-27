import { describe, expect, test } from "bun:test";
import { STILL_HOLD_MS, STILL_SEEK_COOLDOWN_MS } from "./drift";
import {
  SOURCE_PREFERENCE_MS,
  START_SEAT_DEADLINE_MS,
  STEM_ALIGN_TOLERANCE_MS,
  pausedAction,
  sourceStem,
  startSeatAction,
  stemAlignmentsTo,
  stemSpreadMs,
  type SoundingStem,
  type StemTiming,
} from "./stemSync";

/** A stem with a timeline, unless the test says otherwise. */
function stem(timeMs: number, extra: Partial<StemTiming> = {}): StemTiming {
  return { timeMs, readyState: 4, ...extra };
}

/** A stem as the clock-source rule sees it. */
function playing(timeMs: number, sounding = true): SoundingStem {
  return { timeMs, sounding };
}

describe("sourceStem", () => {
  test("the stem closest to the playhead is the one read", () => {
    expect(sourceStem([playing(1040), playing(1000), playing(980)], 1000)).toBe(1);
  });

  test("a stem that started or resumed late is never the source", () => {
    // The pause bug: the first file comes back 400 ms behind while the rest are
    // already playing. Reading it stalls the playhead — a monotonic read cannot go
    // back to meet it — and holds the highway still until drift has carried it.
    expect(sourceStem([playing(600), playing(1000), playing(1010)], 1000)).toBe(1);
    expect(sourceStem([playing(1000), playing(600)], 1000)).toBe(0);
  });

  test("a stem that has run ahead does not jump the song forward", () => {
    expect(sourceStem([playing(1150), playing(1060), playing(990)], 1000)).toBe(2);
  });

  test("the source is kept while it is in phase, so it cannot flicker", () => {
    // Two stems within a frame of each other: prefer the one already being read.
    const stems = [playing(1000), playing(1004)];
    expect(sourceStem(stems, 1000, 0)).toBe(0);
    expect(sourceStem(stems, 1000, 1)).toBe(1);
    // Beyond the preference window the genuinely closer stem wins.
    const apart = [playing(1000), playing(1000 + SOURCE_PREFERENCE_MS + 1)];
    expect(sourceStem(apart, 1000, 1)).toBe(0);
  });

  test("a stem without a live timeline is not a candidate", () => {
    expect(sourceStem([playing(1000, false), playing(500, false)], 1000)).toBe(-1);
    expect(sourceStem([], 1000)).toBe(-1);
    expect(sourceStem([playing(Number.NaN)], 1000)).toBe(-1);
  });

  test("a stale preference is passed over for anything that is sounding", () => {
    expect(sourceStem([playing(1000)], 1000, 8)).toBe(0);
    expect(sourceStem([playing(1000)], 1000, 0)).toBe(0);
  });

  test("an ended stem is never a source, however close its end looks", () => {
    // A chart folder may cut a part short: its frozen end position is not the song.
    expect(sourceStem([playing(200_000, false), playing(1000)], 1000)).toBe(1);
  });
});

describe("stemAlignmentsTo", () => {
  test("every stem is moved onto the song's playhead, including the one read", () => {
    // The pause rule: the playhead is the truth, so a stem the clock happened to be
    // reading is moved too when it is the one that fell behind.
    expect(stemAlignmentsTo([stem(900), stem(1000), stem(1040)], 1000)).toEqual([
      { index: 0, timeMs: 1000 },
      { index: 2, timeMs: 1000 },
    ]);
  });

  test("stems already in phase are left alone, on either side", () => {
    const at = STEM_ALIGN_TOLERANCE_MS;
    expect(
      stemAlignmentsTo([stem(1000), stem(1000 + at), stem(1000 - at)], 1000),
    ).toEqual([]);
  });

  test("a stem without a timeline, an error, an end or a seek in flight is left to drift", () => {
    expect(
      stemAlignmentsTo(
        [
          stem(1000),
          stem(900, { readyState: 0 }),
          stem(900, { failed: true }),
          stem(900, { ended: true }),
          stem(900, { seeking: true }),
        ],
        1000,
      ),
    ).toEqual([]);
  });

  test("a playhead with no number aligns nothing", () => {
    expect(stemAlignmentsTo([stem(900), stem(1000)], Number.NaN)).toEqual([]);
  });

  test("a negative target is clamped to the start of the song", () => {
    expect(stemAlignmentsTo([stem(900)], -50)).toEqual([{ index: 0, timeMs: 0 }]);
  });

  test("moving the stems leaves them on one clock", () => {
    const stems = [stem(1000), stem(962), stem(1038), stem(1010), stem(870)];
    const moves = stemAlignmentsTo(stems, 1000);
    const after = stems.map((item, index) => {
      const move = moves.find((candidate) => candidate.index === index);
      return move ? { ...item, timeMs: move.timeMs } : item;
    });
    expect(stemSpreadMs(after)).toBe(0);
  });
});

describe("startSeatAction", () => {
  test("a start waits while any stem has yet to move", () => {
    // The browser starts each element a moment of its own later; seating before the
    // last one is moving would chase a gap that has not finished forming.
    expect(startSeatAction([true, false, false], 100)).toBe("wait");
    expect(startSeatAction([true, true, false], 500)).toBe("wait");
  });

  test("the moment every stem has moved, they are seated — once", () => {
    expect(startSeatAction([true, true, true], 120)).toBe("seat");
    expect(startSeatAction([true], 0)).toBe("seat");
    // Nothing to wait for at all is nothing to wait on.
    expect(startSeatAction([], 0)).toBe("seat");
  });

  test("a stem that never moves is not waited for for ever", () => {
    // A refused start, or a file that will not advance: seat what there is and let
    // the retry and drift rules take the dead one from here.
    expect(startSeatAction([true, false], START_SEAT_DEADLINE_MS - 1)).toBe("wait");
    expect(startSeatAction([true, false], START_SEAT_DEADLINE_MS)).toBe("seat");
    expect(startSeatAction([false], START_SEAT_DEADLINE_MS * 10)).toBe("seat");
  });

  test("the deadline is generous enough for a streamed start, and finite", () => {
    // A streamed element's pipeline takes tens to a few hundred milliseconds to
    // begin advancing. A deadline under that would seat the stems before the wait
    // had done its work; one measured in tens of seconds would hold the drift rules
    // off for the rest of the song.
    expect(START_SEAT_DEADLINE_MS).toBeGreaterThanOrEqual(500);
    expect(START_SEAT_DEADLINE_MS).toBeLessThanOrEqual(2000);
  });
});

describe("pausedAction", () => {
  test("a stem in phase keeps the song's own rate and is left where it is", () => {
    expect(pausedAction(1, 0, 0)).toEqual({ playbackRate: 1, seek: false });
    expect(pausedAction(1, STILL_HOLD_MS, 0)).toEqual({ playbackRate: 1, seek: false });
    expect(pausedAction(1, -STILL_HOLD_MS, 0)).toEqual({ playbackRate: 1, seek: false });
  });

  test("a paused stem is never nudged: the rate is the song's, whatever the drift", () => {
    // A rate closes a gap over seconds of moving song, and there are none here. It
    // also must not forget a practice speed, which is still the song's rate.
    expect(pausedAction(1, 60, 0).playbackRate).toBe(1);
    expect(pausedAction(0.8, 60, 0).playbackRate).toBe(0.8);
    expect(pausedAction(0.5, -500, 0).playbackRate).toBe(0.5);
  });

  test("a stem out of line is moved once, and not again while the seek settles", () => {
    // The pause bug: the frame loop writes this every frame whether or not the song
    // is moving, so an unrestrained seek was re-issued sixty times a second.
    const out = STILL_HOLD_MS + 40;
    expect(pausedAction(1, out, STILL_SEEK_COOLDOWN_MS).seek).toBe(true);
    expect(pausedAction(1, out, 0).seek).toBe(false);
    expect(pausedAction(1, out, STILL_SEEK_COOLDOWN_MS / 2).seek).toBe(false);
    // Behind the playhead is as ordinary here as ahead of it.
    expect(pausedAction(1, -out, 0).seek).toBe(false);
    expect(pausedAction(1, -out, STILL_SEEK_COOLDOWN_MS).seek).toBe(true);
  });

  test("a stem with no position to speak of is left alone", () => {
    expect(pausedAction(1, Number.NaN, Number.POSITIVE_INFINITY).seek).toBe(false);
  });
});

describe("stemSpreadMs", () => {
  test("is the distance from the earliest stem to the latest", () => {
    expect(stemSpreadMs([stem(1040), stem(1000), stem(981)])).toBe(59);
    expect(stemSpreadMs([stem(1000), stem(1000)])).toBe(0);
  });

  test("a stem with no timeline is not evidence of a spread", () => {
    expect(stemSpreadMs([stem(1000), stem(960), stem(0, { readyState: 0 })])).toBe(40);
    expect(stemSpreadMs([stem(1000), stem(0, { failed: true })])).toBeNull();
    expect(stemSpreadMs([stem(1000), stem(950, { ended: true })])).toBeNull();
  });

  test("fewer than two stems have no spread at all", () => {
    expect(stemSpreadMs([])).toBeNull();
    expect(stemSpreadMs([stem(1000)])).toBeNull();
  });
});
