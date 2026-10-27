import { describe, expect, test } from "bun:test";
import {
  PRELOAD_GRACE_MS,
  PRELOAD_READY_STATE,
  preloadProgress,
  stemSettled,
} from "./preload";

describe("stemSettled", () => {
  test("enough data is the browser saying it can keep going", () => {
    expect(PRELOAD_READY_STATE).toBe(4);
    expect(stemSettled({ readyState: 4 })).toBe(true);
    // More than enough is still enough.
    expect(stemSettled({ readyState: 5 })).toBe(true);
  });

  test("can start is not the same promise as can play through", () => {
    // 3 is HAVE_FUTURE_DATA: the element can begin. The loader waits for 4, so a
    // stem cannot join for one second and then stall on its first bar.
    expect(stemSettled({ readyState: 3 })).toBe(false);
    expect(stemSettled({ readyState: 2 })).toBe(false);
    expect(stemSettled({ readyState: 1 })).toBe(false);
    expect(stemSettled({ readyState: 0 })).toBe(false);
  });

  test("a stem that will never arrive or has ended has nothing left to wait for", () => {
    expect(stemSettled({ readyState: 0, failed: true })).toBe(true);
    expect(stemSettled({ readyState: 4, ended: true })).toBe(true);
  });
});

describe("preloadProgress", () => {
  test("a song with no stems has nothing to wait for", () => {
    expect(preloadProgress([], 0)).toEqual({ done: 0, total: 0, ready: true });
  });

  test("every stem at enough data is ready", () => {
    expect(
      preloadProgress([{ readyState: 4 }, { readyState: 4 }, { readyState: 4 }], 3),
    ).toEqual({ done: 3, total: 3, ready: true });
  });

  test("one stem still loading holds the whole run", () => {
    // The drum stems are the ones this exists for: a run with the guitar and the
    // vocals but no drums is not a run to start.
    expect(
      preloadProgress([{ readyState: 4 }, { readyState: 1 }, { readyState: 4 }], 3),
    ).toEqual({ done: 2, total: 3, ready: false });
  });

  test("a failed stem is counted, not waited for forever", () => {
    expect(
      preloadProgress([{ readyState: 4 }, { readyState: 0, failed: true }], 2),
    ).toEqual({ done: 2, total: 2, ready: true });
  });

  test("files that could not be read are settled without an element", () => {
    // A local folder whose permission has gone: the stems that did resolve can
    // play; the missing one must not trap the band screen forever.
    expect(preloadProgress([{ readyState: 4 }], 2, 1)).toEqual({
      done: 2,
      total: 2,
      ready: true,
    });
    expect(preloadProgress([{ readyState: 1 }], 2, 1)).toEqual({
      done: 1,
      total: 2,
      ready: false,
    });
  });

  test("the count never runs past the total, however many states arrive", () => {
    // The element map can briefly hold more stems than the new expectation while
    // a song changes; the read-out must not say “4 of 3”.
    expect(preloadProgress([{ readyState: 4 }, { readyState: 4 }], 1)).toEqual({
      done: 1,
      total: 1,
      ready: true,
    });
    expect(preloadProgress([], 3, 5)).toEqual({ done: 3, total: 3, ready: true });
  });

  test("a broken expected count is no wait at all", () => {
    expect(preloadProgress([], Number.NaN)).toEqual({ done: 0, total: 0, ready: true });
    expect(preloadProgress([], -2)).toEqual({ done: 0, total: 0, ready: true });
  });

  test("the escape hatch is long enough to be patient, short enough to be an exit", () => {
    expect(PRELOAD_GRACE_MS).toBeGreaterThanOrEqual(30_000);
    expect(PRELOAD_GRACE_MS).toBeLessThanOrEqual(60_000);
  });
});
