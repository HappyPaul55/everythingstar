/**
 * What the browser keeps of the library, and when it lets go of it.
 *
 * Everything fetched — a playlist, a song document, a chart — is stored under its
 * own URL, so one policy covers all three and the loader never wonders where it is.
 * The rules that matter are here rather than in the storage call: what "stale" is,
 * what a body costs, and what is dropped first when the cache is over its cap.
 */

export type CacheKind = "playlist" | "song" | "chart" | "sounds";

/** One stored document, under the URL it came from. */
export interface CacheEntry {
  url: string;
  kind: CacheKind;
  /** When it was fetched, ms since the epoch. */
  at: number;
  /** What it costs, in characters of JSON. */
  size: number;
  /**
   * The playlist-entry fingerprint the body was fetched for. Song and chart
   * entries carry it so a changed summary does not leave an old document behind;
   * playlists and the sound manifest have no entry to fingerprint.
   */
  revision?: string;
  body: unknown;
}

/**
 * The small record kept beside a body, in its own object store.
 *
 * Eviction needs only these four facts — what it is, when it arrived, what it
 * costs, and the address to name it by. The body is deliberately absent: summing
 * the cache and choosing what to drop must never deserialise a chart to do it.
 * `key` is the body's own (shape-versioned) store key; `url` is the address it
 * came from, which the key carries but does not spell out for a reader.
 */
export interface CacheMeta {
  key: string;
  url: string;
  kind: CacheKind;
  at: number;
  size: number;
}

/** What the eviction rule needs: a cache entry, or the metadata standing in for it. */
export interface Evictable {
  url: string;
  kind: CacheKind;
  at: number;
  size: number;
}

/** The URL a shape-versioned cache key was written for. */
function urlOfKey(key: string): string {
  const prefix = `v${CACHE_VERSION}|`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

/** The metadata for an entry: everything eviction needs, and no body. */
export function metaOf(entry: CacheEntry): CacheMeta {
  const key = isCacheKey(entry.url) ? entry.url : cacheKey(entry.url);
  return metaFrom(key, entry);
}

/**
 * The metadata for a body found under `key`, as the one-time rebuild sees it.
 *
 * The store key is passed separately because a body written by an older build
 * carries its key in `url`, and the key — not the record — is what the database
 * is actually keyed by.
 */
function metaFrom(key: string, entry: CacheEntry): CacheMeta {
  return {
    key,
    url: urlOfKey(key),
    kind: entry.kind,
    at: entry.at,
    size: entry.size,
  };
}

/** A body read back for the one-time rebuild, with the key it was stored under. */
export interface FoundBody {
  key: string;
  entry: CacheEntry | null;
}

/**
 * Bodies read once, turned into the index they should have had.
 *
 * A body from another shape, or one that is not an entry at all, is dropped
 * rather than indexed: it is not something this build can read, so leaving it in
 * the cache would only make it immortal under a cap it no longer contributes to.
 */
export function rebuildIndex(found: readonly FoundBody[]): {
  metas: CacheMeta[];
  drop: string[];
} {
  const metas: CacheMeta[] = [];
  const drop: string[] = [];
  for (const { key, entry } of found) {
    if (!entry || !isCacheKey(key)) drop.push(key);
    else metas.push(metaFrom(key, entry));
  }
  return { metas, drop };
}

/** How long a copy is worth showing without asking for a fresh one. */
export const STALE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The shape of the documents this build writes.
 *
 * A stored body is only ever read back by code that understands it, so the version a
 * body was **written by** is part of its key — and a body from another shape is simply
 * never found. That is what stops a cached playlist from an older build being served
 * to a reader that has since changed: without it, the reader meets fields that are not
 * there and reports a document nobody can play.
 *
 * Change this when a document's shape changes. A song whose **content** changes in
 * place is handled by `revision`, not by this version: see `CacheEntry`.
 */
export const CACHE_VERSION = 2;

/** The key a URL's body is stored under, at this shape's version. */
export function cacheKey(url: string): string {
  return `v${CACHE_VERSION}|${url}`;
}

/** Is this a key this build wrote? Anything else is a body from another shape. */
export function isCacheKey(key: string): boolean {
  return key.startsWith(`v${CACHE_VERSION}|`);
}

/**
 * How much the cache may hold. Generous on purpose: chart notes are fetched per run
 * and a browser's quota is far larger, but a cache that grows without a roof is a
 * cache that eventually fills the origin.
 */
export const CACHE_CAP_BYTES = 48 * 1024 * 1024;

/** A stored document, ready to be written. */
export function cacheEntry(
  url: string,
  kind: CacheKind,
  body: unknown,
  at: number,
  revision?: string,
): CacheEntry {
  return {
    url,
    kind,
    at,
    size: sizeOf(body),
    ...(revision === undefined ? {} : { revision }),
    body,
  };
}

/** What a body costs. Rough — it is a size guard, not an accounting exercise. */
export function sizeOf(body: unknown): number {
  try {
    const json = JSON.stringify(body);
    // Bytes, not UTF-16 code units: the cap is documented in bytes, and a body
    // with any non-ASCII in it would otherwise be under-counted.
    return json === undefined ? 0 : new TextEncoder().encode(json).byteLength;
  } catch {
    return 0;
  }
}

/** Is this copy old enough to be worth refetching? */
export function isStale(
  entry: Pick<CacheEntry, "at">,
  now: number,
  maxAgeMs = STALE_MS,
): boolean {
  return now - entry.at > maxAgeMs;
}

/**
 * What to drop so the cache fits: the **oldest first**, and never a playlist.
 *
 * A playlist is kilobytes and the thing every other entry is reached through, so it
 * is the last thing worth losing; charts are the bulk of the cache and the cheapest
 * to fetch again, which is exactly the wrong way round if you are the one who has to
 * download them — but a cache is not a library, and the songs are still there.
 */
export function evictions(
  entries: readonly Evictable[],
  capBytes = CACHE_CAP_BYTES,
): string[] {
  let total = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (total <= capBytes) return [];
  const droppable = entries
    .filter((entry) => entry.kind !== "playlist")
    .sort((a, b) => a.at - b.at);
  const dropped: string[] = [];
  for (const entry of droppable) {
    if (total <= capBytes) break;
    dropped.push(entry.url);
    total -= entry.size;
  }
  return dropped;
}

/**
 * Is a record still the one an eviction judged?
 *
 * A trim decides from one snapshot of the index and deletes in a later transaction,
 * and a write can land in between. A body written after the snapshot carries a later
 * `at`, so the choice was about an older copy of it and must not be carried out. A
 * record that has gone is an **orphan body**, and there is nothing to compare — it
 * can always go.
 */
export function stillEvictable(
  meta: Pick<CacheMeta, "at"> | null | undefined,
  at: number,
): boolean {
  return !meta || meta.at === at;
}
