/**
 * The two Cache Storage buckets the game uses, and how a shell generation is named.
 *
 * The **shell** is the game's own files — the pages, their hashed JavaScript, the
 * fonts, the artwork and the sounds — and is versioned per build so a deploy can
 * replace it without touching a song somebody saved.
 *
 * The **offline** bucket is the songs a player downloaded. Its name is deliberately
 * the same literal as `CACHE_NAME` in the app repository's `native/sw.ts`: the app
 * and the website are two separate builds of the same contract, so both sides bump
 * it together rather than importing a shared module neither can resolve.
 */

/** Songs saved for offline play. Written by `library/downloads.ts`, read by both workers. */
export const OFFLINE_CACHE = "everythingstar-offline-v1";

/** Every shell cache starts with this; only the newest one (or two) are kept. */
export const SHELL_CACHE_PREFIX = "everythingstar-shell-";

/**
 * A shell cache name, `everythingstar-shell-<built>-<version>`.
 *
 * The build timestamp leads so names sort chronologically: an activate can keep
 * the newest generation and the one an open page might still be using, and drop
 * everything older without having to parse a version string.
 */
export function shellCacheName(version: string, builtAt: string): string {
  const stamp = builtAt.replace(/[^0-9A-Za-z]+/g, "").slice(0, 20) || "0";
  const named = version.trim().replace(/[^0-9A-Za-z._-]+/g, "-").slice(0, 60) || "dev";
  return `${SHELL_CACHE_PREFIX}${stamp}-${named}`;
}

/**
 * How many shell generations to keep.
 *
 * `skipWaiting` means a new worker can take over while a page is open. Two
 * generations keep the chunks that page may still lazily import, so an update
 * cannot turn a click into a 404; the third-oldest is dropped on the next deploy.
 */
export const SHELL_KEEP = 2;
