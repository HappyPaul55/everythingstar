import { describe, expect, test } from "bun:test";
import {
  advanceYouTubeClock,
  startYouTubeClock,
  YOUTUBE_LEAD_MS,
  YOUTUBE_SNAP_MS,
} from "./youtubeClock";

describe("the YouTube clock", () => {
  test("starts at the reported time", () => {
    expect(startYouTubeClock(1234, 100).outputMs).toBe(1234);
  });

  test("runs on the frame loop between reports", () => {
    let state = startYouTubeClock(1000, 0);
    state = advanceYouTubeClock(state, 1000, 100);
    expect(state.outputMs).toBe(1100);
    state = advanceYouTubeClock(state, 1000, 200);
    expect(state.outputMs).toBe(1200);
  });

  test("does not run more than a lead past the last report", () => {
    let state = startYouTubeClock(1000, 0);
    state = advanceYouTubeClock(state, 1000, YOUTUBE_LEAD_MS + 100);
    expect(state.outputMs).toBe(1000 + YOUTUBE_LEAD_MS);
  });

  test("a small disagreement is corrected without a jump", () => {
    let state = startYouTubeClock(1000, 0);
    state = advanceYouTubeClock(state, 1050, 100);
    // The prediction was 1100; it moves toward 1050 by a fraction, not all the way.
    expect(state.outputMs).toBeGreaterThan(1050);
    expect(state.outputMs).toBeLessThan(1100);
  });

  test("a large disagreement snaps, which is how a seek or a stall is handled", () => {
    let state = startYouTubeClock(1000, 0);
    state = advanceYouTubeClock(state, 1000 + YOUTUBE_SNAP_MS + 1, 0);
    expect(state.outputMs).toBe(1000 + YOUTUBE_SNAP_MS + 1);
  });

  test("a report behind the prediction pulls it back, gradually", () => {
    let state = startYouTubeClock(1300, 0);
    // The player now says 1000: 300 ms behind, so it is a correction, not a snap.
    state = advanceYouTubeClock(state, 1000, 0);
    expect(state.outputMs).toBeLessThan(1300);
    expect(state.outputMs).toBeGreaterThan(1000);
  });

  test("a seek starts the clock again from the new position", () => {
    const state = advanceYouTubeClock(startYouTubeClock(1000, 0), 30000, 100);
    expect(state.outputMs).toBe(30000);
  });
});
