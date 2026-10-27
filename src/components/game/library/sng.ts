/**
 * A `.sng` package, fetched and handed to the stage.
 *
 * The pure reader in `sources/sng.ts` has the bytes; this is the browser's part:
 * fetch the package, pick the files out of its index, and turn each one into an
 * object URL an `<audio>` or `<img>` can actually use. A package is a container, so
 * the URL of the package is not the URL of its cover or its stems.
 *
 * A package fetched here is kept for the **rest of the visit** in a small in-memory
 * cache (`sngCache.ts`), because two readers want it — the jukebox's preview and the
 * band's load. Nothing is written to IndexedDB or localStorage: the package carries
 * the song's audio, and this is the second read in one visit, not a library.
 *
 * **This module is fetched, never imported at the top of the library.** It carries
 * the reader, so every caller reaches it through `await import(...)` at the moment a
 * package is actually opened — a player who only browses the JSON library downloads
 * none of it.
 */

import {
  readSngEntry,
  readSngHeader,
  type SngEntry,
  type SngHeader,
} from "../../../lib/game/sources/sng";
import { mimeForSng, sngFiles } from "../../../lib/game/sources/sngNames";
import { sngBlob } from "./sngBlob";
import { SngCache, type SngCacheLoad } from "./sngCache";
import { fetchBytes } from "./store";

export interface RemoteSng {
  bytes: Uint8Array;
  header: SngHeader;
  /** Anything the header had to say, kept for the load's problem list. */
  problems: string[];
}

/** Fetch a package and read its index. Null when it is not one we can read. */
async function fetchPackage(
  url: string,
  signal?: AbortSignal,
): Promise<SngCacheLoad<RemoteSng> | null> {
  try {
    const bytes = await fetchBytes(url, false, signal);
    const read = readSngHeader(bytes);
    if (!read.header) return null;
    return {
      value: { bytes, header: read.header, problems: read.problems },
      size: bytes.byteLength,
    };
  } catch {
    return null;
  }
}

/**
 * The package cache both readers share: the jukebox's preview and the band's load
 * ask for the same URL, and the second one gets the first one's bytes.
 *
 * The limits and the LRU bookkeeping are in `sngCache.ts`; this is only the loader.
 * A failed or aborted fetch is never cached.
 */
const packages = new SngCache<RemoteSng>(fetchPackage);

/**
 * A package by URL, from this visit's cache or the network.
 *
 * Concurrent requests for one URL share a single download, and one caller's abort
 * does not cancel the other's. A caller whose own signal has aborted gets null even
 * when the shared download carries on for somebody else.
 */
export function loadSng(url: string, signal?: AbortSignal): Promise<RemoteSng | null> {
  return packages.load(url, signal);
}

/** One member of a fetched package, as an object URL. */
export function sngObjectUrl(
  packageBytes: Uint8Array,
  header: SngHeader,
  entry: SngEntry,
): string | null {
  // `readSngEntry` unmasks into a fresh array, so the package another reader is
  // holding in the cache is never mutated or detached by making an object URL.
  const bytes = readSngEntry(header, packageBytes, entry);
  if (!bytes) return null;
  return URL.createObjectURL(sngBlob(bytes, mimeForSng(entry.name)));
}

/**
 * What a package can preview, in the order a jukebox wants it.
 *
 * The chart folder's own `preview.*` is a clip and starts at zero. Otherwise the master is
 * the song, from the package's `preview_start_time`. A package with only parts has
 * no owner of the whole mix — but it *is* the only sound the package has, so the
 * first part is better than a silent row; this is the one place a package differs
 * from a folder of loose stems.
 */
export function sngPreviewEntry(
  header: SngHeader,
): { entry: SngEntry; startMs: number; clip: boolean } | null {
  const files = sngFiles(header);
  const startMs = Math.max(0, Number(header.metadata.preview_start_time ?? 0) || 0);
  if (files.preview) return { entry: files.preview, startMs: 0, clip: true };
  if (files.audio.master) return { entry: files.audio.master, startMs, clip: false };
  const first = Object.values(files.audio)[0];
  return first ? { entry: first, startMs, clip: false } : null;
}

/** The package's own cover, when it has one. */
export function sngArtEntry(header: SngHeader): SngEntry | null {
  return sngFiles(header).art;
}
