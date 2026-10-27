import { describe, expect, test } from "bun:test";
import {
  CACHE_CAP_BYTES,
  CACHE_VERSION,
  STALE_MS,
  cacheEntry,
  cacheKey,
  evictions,
  isCacheKey,
  isStale,
  metaOf,
  rebuildIndex,
  sizeOf,
  stillEvictable,
  type CacheEntry,
  type CacheKind,
  type CacheMeta,
} from "./cache";

const entry = (
  url: string,
  kind: CacheKind,
  size: number,
  at = 0,
): CacheEntry => ({ url, kind, at, size, body: null });

describe("cacheKey", () => {
  test("carries the shape the body was written by", () => {
    expect(cacheKey("https://x/audio/sounds.json")).toBe(
      `v${CACHE_VERSION}|https://x/audio/sounds.json`,
    );
  });

  test("a key this build did not write is not a body it reads", () => {
    // An older build's key, or one from a shape this build has moved past.
    expect(isCacheKey("https://x/audio/sounds.json")).toBe(false);
    expect(isCacheKey(`v${CACHE_VERSION - 1}|https://x/audio/sounds.json`)).toBe(false);
    expect(isCacheKey(cacheKey("https://x/audio/sounds.json"))).toBe(true);
  });
});

describe("sizeOf", () => {
  test("measures a body by the bytes it costs to write down", () => {
    const body = { a: 1 };
    expect(sizeOf(body)).toBe(new TextEncoder().encode(JSON.stringify(body)).byteLength);
  });

  test("a non-ASCII body counts its UTF-8 bytes, not its code units", () => {
    const body = { title: "Zürich" };
    const json = JSON.stringify(body);
    expect(sizeOf(body)).toBe(new TextEncoder().encode(json).byteLength);
    expect(sizeOf(body)).toBeGreaterThan(json.length);
  });

  test("a body that cannot be written down costs nothing", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(sizeOf(circular)).toBe(0);
  });
});

describe("cacheEntry", () => {
  test("carries the URL it came from, what it is, and what it costs", () => {
    const stored = cacheEntry("https://x/a.json", "song", { id: "a" }, 500);
    expect(stored.url).toBe("https://x/a.json");
    expect(stored.kind).toBe("song");
    expect(stored.at).toBe(500);
    expect(stored.size).toBeGreaterThan(0);
  });

  test("can carry the playlist revision it was fetched for", () => {
    expect(cacheEntry("https://x/a.json", "song", { id: "a" }, 500, "abc").revision).toBe(
      "abc",
    );
    expect(cacheEntry("https://x/a.json", "song", { id: "a" }, 500).revision).toBeUndefined();
  });
});

describe("metaOf", () => {
  test("drops the body and keeps what eviction needs", () => {
    const stored = cacheEntry("https://x/a.json", "chart", { notes: [1, 2, 3] }, 500, "rev");
    const meta = metaOf(stored);
    expect(meta).toEqual({
      key: cacheKey("https://x/a.json"),
      url: "https://x/a.json",
      kind: "chart",
      at: 500,
      size: stored.size,
    });
    expect("body" in meta).toBe(false);
    expect("revision" in meta).toBe(false);
  });

  test("an entry from an older build carries its key in `url`", () => {
    // Before the index, `writeCache` stored the versioned key in the entry's
    // `url`. The rebuild must not prefix the key a second time.
    const key = cacheKey("https://x/a.json");
    const legacy: CacheEntry = { url: key, kind: "song", at: 1, size: 2, body: null };
    expect(metaOf(legacy)).toEqual({
      key,
      url: "https://x/a.json",
      kind: "song",
      at: 1,
      size: 2,
    });
  });

  test("sizes are the entry's own, not measured again", () => {
    const stored = cacheEntry("https://x/a.json", "chart", { dense: true }, 500);
    expect(metaOf(stored).size).toBe(stored.size);
  });
});

describe("rebuildIndex", () => {
  test("indexes this build's bodies and drops anything else", () => {
    const key = cacheKey("https://x/a.json");
    const entry = cacheEntry("https://x/a.json", "chart", { a: 1 }, 10);
    const { metas, drop } = rebuildIndex([
      { key, entry },
      // A body from another shape: sweep would remove it, so it is not indexed.
      { key: `v${CACHE_VERSION - 1}|https://x/old.json`, entry: null },
      // A record that is not a cache entry at all.
      { key: cacheKey("https://x/bad.json"), entry: null },
    ]);
    expect(metas).toEqual([
      { key, url: "https://x/a.json", kind: "chart", at: 10, size: entry.size },
    ]);
    expect(drop).toEqual([
      `v${CACHE_VERSION - 1}|https://x/old.json`,
      cacheKey("https://x/bad.json"),
    ]);
  });

  test("a body without metadata cannot become immortal", () => {
    const key = cacheKey("https://x/a.json");
    const { metas } = rebuildIndex([
      { key, entry: cacheEntry("https://x/a.json", "song", { a: 1 }, 10) },
    ]);
    expect(metas.map((meta) => meta.key)).toEqual([key]);
  });
});

describe("isStale", () => {
  test("a fresh copy is not stale, and a week-old one is", () => {
    const at = 1_000_000;
    expect(isStale({ at }, at + 1000)).toBe(false);
    expect(isStale({ at }, at + STALE_MS)).toBe(false);
    expect(isStale({ at }, at + STALE_MS + 1)).toBe(true);
  });
});

describe("evictions", () => {
  test("nothing to drop while the cache fits", () => {
    const entries = [entry("a", "chart", 100), entry("b", "playlist", 100)];
    expect(evictions(entries, 1000)).toEqual([]);
  });

  test("drops the oldest first, until it fits", () => {
    const entries = [
      entry("new", "chart", 400, 300),
      entry("old", "chart", 400, 100),
      entry("middle", "song", 400, 200),
    ];
    // 1200 of 1000: 400 has to go, and the oldest is the one.
    expect(evictions(entries, 1000)).toEqual(["old"]);
    // 1200 of 600: the rest follows, still oldest first.
    expect(evictions(entries, 600)).toEqual(["old", "middle"]);
  });

  test("a playlist is the last thing worth losing", () => {
    const entries = [
      entry("playlist", "playlist", 800, 0),
      entry("chart", "chart", 800, 1),
    ];
    // Over the cap either way, but the list every other entry is reached through
    // is kept while anything else can go.
    expect(evictions(entries, 1000)).toEqual(["chart"]);
  });

  test("the cap is the browser's, by default", () => {
    expect(CACHE_CAP_BYTES).toBeGreaterThan(1024 * 1024);
  });

  test("metadata and entries with the same facts drop the same URLs", () => {
    const facts = [
      { url: "new", kind: "chart" as const, size: 400, at: 300 },
      { url: "old", kind: "chart" as const, size: 400, at: 100 },
      { url: "middle", kind: "song" as const, size: 400, at: 200 },
    ];
    const entries: CacheEntry[] = facts.map((fact) => ({ ...fact, body: null }));
    const metas: CacheMeta[] = facts.map((fact) => ({ ...fact, key: cacheKey(fact.url) }));
    expect(evictions(metas, 1000)).toEqual(evictions(entries, 1000));
    expect(evictions(metas, 600)).toEqual(evictions(entries, 600));
    expect(evictions(metas, 600)).toEqual(["old", "middle"]);
  });

  test("a playlist is last over metadata too", () => {
    const metas: CacheMeta[] = [
      { key: cacheKey("playlist"), url: "playlist", kind: "playlist", at: 0, size: 800 },
      { key: cacheKey("chart"), url: "chart", kind: "chart", at: 1, size: 800 },
    ];
    expect(evictions(metas, 1000)).toEqual(["chart"]);
  });
});

describe("stillEvictable", () => {
  test("a record written after the trim's snapshot is not the one it judged", () => {
    const snapshot = { at: 100 };
    expect(stillEvictable(snapshot, 100)).toBe(true);
    // A chart written while the eviction was being decided: its `at` moved on, so
    // deleting it would throw away a body the index now calls fresh.
    expect(stillEvictable({ at: 200 }, 100)).toBe(false);
  });

  test("an orphan body has no record to disagree, so it can always go", () => {
    expect(stillEvictable(null, 100)).toBe(true);
    expect(stillEvictable(undefined, 100)).toBe(true);
  });
});
