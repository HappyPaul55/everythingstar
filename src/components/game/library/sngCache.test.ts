import { describe, expect, test } from "bun:test";
import {
  SngCache,
  SNG_CACHE_LIMITS,
  type SngCacheLimits,
  type SngCacheLoad,
  type SngCacheSlot,
} from "./sngCache";

/**
 * The one-visit package cache, without a network in the loop.
 *
 * Every test injects its own loader, so a "hit" is proven by the loader not being
 * called rather than by watching `fetch`. The index is the cache's own read-out:
 * least recently used first.
 */

const SMALL: SngCacheLimits = { entries: 2, bytes: 64 };

function slot(url: string, size = 1, at = 0): SngCacheSlot {
  return { url, size, at };
}

/** A loader promise whose answer the test chooses. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** A loader that answers instantly and counts its calls. */
function countingLoader(calls: string[], size = 4) {
  return async (url: string): Promise<SngCacheLoad<string>> => {
    calls.push(url);
    return { value: `${url}:bytes`, size };
  };
}

describe("SngCache bookkeeping", () => {
  test("touch moves a slot to the recent end, or adds it there", () => {
    const index = [slot("a"), slot("b"), slot("c")];
    expect(SngCache.touch(index, slot("b", 1, 9)).map((entry) => entry.url)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(SngCache.touch(index, slot("d")).map((entry) => entry.url)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    // The input is not mutated: the caller owns the old index.
    expect(index.map((entry) => entry.url)).toEqual(["a", "b", "c"]);
  });

  test("the entry cap drops the oldest first", () => {
    const fit = SngCache.evict([slot("a"), slot("b"), slot("c")], {
      entries: 2,
      bytes: 100,
    });
    expect(fit.kept.map((entry) => entry.url)).toEqual(["b", "c"]);
    expect(fit.dropped).toEqual(["a"]);
  });

  test("the byte cap drops the oldest first", () => {
    const fit = SngCache.evict(
      [slot("a", 6), slot("b", 6), slot("c", 4)],
      { entries: 10, bytes: 8 },
    );
    expect(fit.kept.map((entry) => entry.url)).toEqual(["c"]);
    expect(fit.dropped).toEqual(["a", "b"]);
  });

  test("a package larger than the whole byte budget is not admitted", () => {
    const fit = SngCache.put([slot("a", 4)], slot("huge", 20), {
      entries: 2,
      bytes: 10,
    });
    expect(fit.kept.map((entry) => entry.url)).toEqual(["a"]);
    expect(fit.dropped).toEqual(["huge"]);
  });

  test("the shipped limits are a small, bounded visit", () => {
    expect(SNG_CACHE_LIMITS.entries).toBe(2);
    expect(SNG_CACHE_LIMITS.bytes).toBe(64 * 1024 * 1024);
  });
});

describe("SngCache", () => {
  test("a hit does not call the loader again", async () => {
    const calls: string[] = [];
    const cache = new SngCache(countingLoader(calls), SMALL);

    expect(await cache.load("song.sng")).toBe("song.sng:bytes");
    expect(await cache.load("song.sng")).toBe("song.sng:bytes");

    expect(calls).toEqual(["song.sng"]);
    expect(cache.index.map((entry) => entry.url)).toEqual(["song.sng"]);
  });

  test("a miss loads and stores, and a hit marks it as used", async () => {
    const calls: string[] = [];
    const cache = new SngCache(countingLoader(calls), SMALL);
    await cache.load("a.sng");
    await cache.load("b.sng");
    expect(cache.index.map((entry) => entry.url)).toEqual(["a.sng", "b.sng"]);

    cache.get("a.sng", 100);
    expect(cache.index.map((entry) => entry.url)).toEqual(["b.sng", "a.sng"]);

    // The next package makes the least recently used one leave: b, not a.
    await cache.load("c.sng");
    expect(cache.index.map((entry) => entry.url)).toEqual(["a.sng", "c.sng"]);
    expect(cache.get("b.sng")).toBeUndefined();
  });

  test("the entry cap evicts the oldest package", async () => {
    const cache = new SngCache(countingLoader([]), { entries: 2, bytes: 100 });
    await cache.load("a.sng");
    await cache.load("b.sng");
    await cache.load("c.sng");

    expect(cache.index.map((entry) => entry.url)).toEqual(["b.sng", "c.sng"]);
    expect(cache.get("a.sng")).toBeUndefined();
  });

  test("the byte cap evicts the oldest package", async () => {
    const cache = new SngCache(countingLoader([], 6), { entries: 10, bytes: 10 });
    await cache.load("a.sng");
    await cache.load("b.sng");

    expect(cache.index.map((entry) => entry.url)).toEqual(["b.sng"]);
    expect(cache.get("a.sng")).toBeUndefined();
  });

  test("a rejected load is not stored", async () => {
    let calls = 0;
    const cache = new SngCache<string>(async () => {
      calls += 1;
      throw new Error("the host said no");
    }, SMALL);

    expect(await cache.load("a.sng")).toBeNull();
    expect(cache.index).toEqual([]);

    // Nothing was kept, so the next read asks again.
    expect(await cache.load("a.sng")).toBeNull();
    expect(calls).toBe(2);
  });

  test("concurrent requests share one load", async () => {
    const gate = deferred<SngCacheLoad<string>>();
    let calls = 0;
    const cache = new SngCache<string>(() => {
      calls += 1;
      return gate.promise;
    }, SMALL);

    const first = cache.load("a.sng");
    const second = cache.load("a.sng");
    expect(calls).toBe(1);

    gate.resolve({ value: "package", size: 3 });
    expect(await first).toBe("package");
    expect(await second).toBe("package");
    expect(calls).toBe(1);
  });

  test("a package larger than the byte cap is returned but not retained", async () => {
    let calls = 0;
    const cache = new SngCache<string>(async () => {
      calls += 1;
      return { value: "huge package", size: 100 };
    }, { entries: 2, bytes: 10 });

    expect(await cache.load("huge.sng")).toBe("huge package");
    expect(cache.index).toEqual([]);
    expect(cache.get("huge.sng")).toBeUndefined();

    // It was not kept, so reading it again loads it again rather than pretending.
    expect(await cache.load("huge.sng")).toBe("huge package");
    expect(calls).toBe(2);
  });

  test("one caller's abort does not cancel the shared load for another", async () => {
    const gate = deferred<SngCacheLoad<string>>();
    let seen: AbortSignal | undefined;
    const cache = new SngCache<string>((_url, signal) => {
      seen = signal;
      return gate.promise;
    }, SMALL);

    const leaving = new AbortController();
    const staying = new AbortController();
    const first = cache.load("a.sng", leaving.signal);
    const second = cache.load("a.sng", staying.signal);

    leaving.abort();
    expect(await first).toBeNull();
    expect(seen?.aborted).toBe(false);

    gate.resolve({ value: "package", size: 3 });
    expect(await second).toBe("package");
    expect(cache.index.map((entry) => entry.url)).toEqual(["a.sng"]);
  });

  test("the last waiter leaving aborts the fetch and caches nothing", async () => {
    let seen: AbortSignal | undefined;
    const cache = new SngCache<string>(
      (_url, signal) =>
        new Promise<SngCacheLoad<string>>((_resolve, reject) => {
          seen = signal;
          signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
      SMALL,
    );

    const controller = new AbortController();
    const pending = cache.load("a.sng", controller.signal);
    controller.abort();

    expect(await pending).toBeNull();
    expect(seen?.aborted).toBe(true);
    expect(cache.index).toEqual([]);
  });

  test("a caller arriving after the last one left starts a fresh load", async () => {
    let calls = 0;
    const cache = new SngCache<string>((_url, signal) => {
      calls += 1;
      if (calls === 1) {
        return new Promise<SngCacheLoad<string>>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        });
      }
      return Promise.resolve({ value: "second", size: 3 });
    }, SMALL);

    const leaving = new AbortController();
    const abandoned = cache.load("a.sng", leaving.signal);
    leaving.abort();
    expect(await abandoned).toBeNull();

    // The cancelled load is not the one the band is handed.
    expect(await cache.load("a.sng")).toBe("second");
    expect(calls).toBe(2);
    expect(cache.index.map((entry) => entry.url)).toEqual(["a.sng"]);
  });
});
