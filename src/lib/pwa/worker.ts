/**
 * The website's service worker handlers, as a module the tests can drive.
 *
 * `scripts/sw.ts` is only the wiring — `self`, the injected build globals and the
 * three listeners — because a worker script cannot be imported: its top-level
 * listeners run once per module and its globals are injected by
 * `scripts/build-sw.ts`. Everything below is a function of the buckets and the
 * network handed to it, so a test drives the same code with fake `CacheStorage`,
 * `Cache` and `fetch`, and production is the browser's own.
 *
 * It does two jobs, and nothing else:
 *
 * 1. **The shell** — the pages, hashed JavaScript, fonts, icons, artwork and
 *    sounds — is precached so the installed game starts with no network. A
 *    navigation serves the cache immediately and refreshes it in the background;
 *    the next launch gets a deploy, and this one never waits for GitHub.
 *
 * 2. **Downloaded songs** — `everythingstar-offline-v1` is filled by the game's
 *    own Download action and served here, byte ranges included. The worker never
 *    fills that bucket itself: browsing is not a download, and a song nobody asked
 *    to keep must not quietly cost 20 MB.
 *
 * The app repository's `native/sw.ts` is the same second job for the native shell.
 */

import {
  OFFLINE_CACHE,
  SHELL_KEEP,
  SHELL_CACHE_PREFIX,
} from "./cache";
import { contentRange, parseRange, rangeLength } from "./range";

/** The keys Cache Storage accepts: a request, a URL, or the path a navigation has. */
export type CacheKey = Request | URL | string;

/** The slice of `Cache` this worker uses, so a test can supply its own. */
export interface ShellCache {
  match(key: CacheKey, options?: { ignoreVary?: boolean }): Promise<Response | undefined>;
  put(key: CacheKey, response: Response): Promise<void>;
}

/** The slice of `CacheStorage` this worker uses. */
export interface ShellCaches {
  open(name: string): Promise<ShellCache>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

export interface WorkerOptions {
  /** Where this worker is installed. Only its pages are the shell. */
  origin: string;
  /** This build's shell cache name, from `shellCacheName`. */
  shellCache: string;
  /** Every URL an install keeps, injected by the build. */
  precacheUrls: readonly string[];
  caches: ShellCaches;
  fetch: (request: Request) => Promise<Response>;
}

/**
 * A fetch event's request and its one way to keep working after the response:
 * the background refresh is waited on, never the page.
 */
export interface FetchContext {
  request: Request;
  waitUntil(work: Promise<unknown>): void;
}

export interface Worker {
  precache(): Promise<void>;
  pruneShells(): Promise<void>;
  /** The response this worker owes a request, or null when it is not ours to answer. */
  respond(context: FetchContext): Promise<Response> | null;
  navigated(context: FetchContext): Promise<Response>;
  shell(request: Request): Promise<Response>;
  saved(request: Request): Promise<Response>;
}

/** Directories that make up the shell; their files are cached as they are used. */
const SHELL_DIRECTORIES = ["/_astro/", "/fonts/", "/icons/", "/images/", "/audio/"];
const SHELL_FILES = new Set(["/manifest.webmanifest", "/favicon.ico"]);

export function createWorker(options: WorkerOptions): Worker {
  const { origin, shellCache, precacheUrls, caches, fetch } = options;

  /* ---------------------------------------------------------------- install */

  /**
   * Fill this build's shell cache.
   *
   * One asset that cannot be fetched must not fail the whole install: a flaky
   * connection is still better with the pages it got, and the next launch's
   * navigation refreshes the rest. The build check is what guarantees the shell
   * exists in `dist/`; this is the network being ordinary.
   */
  async function precache(): Promise<void> {
    const cache = await caches.open(shellCache);
    await Promise.all(
      precacheUrls.map(async (url) => {
        try {
          const response = await fetch(new Request(new URL(url, origin), { cache: "reload" }));
          if (response.ok) await cache.put(url, response);
        } catch {
          // A later navigation caches it; a silent game is not a broken install.
        }
      }),
    );
  }

  /**
   * Drop shell generations older than the newest `SHELL_KEEP`.
   *
   * `skipWaiting` can hand the page a new worker while it is still running; the
   * previous generation's hashed chunks are what a lazy import in that page asks
   * for. Keeping one older generation is the difference between an update and a
   * 404. The downloaded-songs bucket is never touched.
   */
  async function pruneShells(): Promise<void> {
    const names = (await caches.keys())
      .filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== shellCache)
      .sort();
    const drop = names.slice(0, Math.max(0, names.length - (SHELL_KEEP - 1)));
    await Promise.all(drop.map((name) => caches.delete(name)));
  }

  /* ----------------------------------------------------------- shell lookup */

  function currentShell(): Promise<ShellCache> {
    return caches.open(shellCache);
  }

  /**
   * Every shell generation except this one, newest first.
   *
   * Names lead with the build timestamp (`cache.ts`), so sorting the names is
   * sorting the builds. A running page can still lazily import a chunk by its
   * hashed name from the build it was served, so the newest generation that has
   * it is the right one to ask.
   */
  async function olderShells(): Promise<string[]> {
    const names = await caches.keys();
    return names
      .filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== shellCache)
      .sort()
      .reverse();
  }

  /**
   * A shell entry from this generation, or from a kept one, or null.
   *
   * A hit in an older generation is copied into the current one, so the next
   * lookup is local again and a lazily imported chunk cannot cost a network
   * round trip on every screen. A cache that refuses the copy still answers this
   * request: the body is in hand, and a full bucket is one fewer saved copy
   * rather than a failed page.
   */
  async function lookup(key: CacheKey): Promise<Response | null> {
    const current = await currentShell();
    const hit = await current.match(key, { ignoreVary: true });
    if (hit) return hit;

    for (const name of await olderShells()) {
      let older: ShellCache;
      try {
        older = await caches.open(name);
      } catch {
        continue;
      }
      const found = await older.match(key, { ignoreVary: true });
      if (!found) continue;
      await putBestEffort(current, key, found);
      return found;
    }
    return null;
  }

  /**
   * Store a body without turning a full bucket into a failed request.
   *
   * `QuotaExceededError` (or a browser refusing the write) must not escape: the
   * response has already been fetched, and the page asked for a page, not for a
   * durable copy of it.
   */
  async function putBestEffort(cache: ShellCache, key: CacheKey, response: Response): Promise<void> {
    try {
      await cache.put(key, response.clone());
    } catch {
      // Best effort: the fetched response is still the answer.
    }
  }

  /* -------------------------------------------------------------- navigation */

  /**
   * A page load: serve the cache now, refresh it in the background.
   *
   * Offline, the installed game starts instantly. Online, the player never waits
   * for the network to answer a page that is already on the device, and the next
   * launch is the deploy.
   *
   * A path that is **not** one of the game's pages is the network's, not the
   * shell's: answering `/robots.txt`, the sitemap, the manifest, or a typo with
   * the game page is a 200 where a file or a 404 belongs, and it hides a bad
   * link. Offline those are simply absent, which is a plain 404.
   */
  async function navigated(context: FetchContext): Promise<Response> {
    const { request } = context;
    const url = new URL(request.url);
    // Only this origin's pages are the shell's; a request from anywhere else is
    // the network's, even if its path happens to be one of ours.
    const own = url.origin === origin ? pageKey(url.pathname) : null;

    if (!own) {
      try {
        return await fetch(request);
      } catch {
        return notFound();
      }
    }

    const cached = await lookup(own);

    const fresh = fetch(request)
      .then(async (response) => {
        if (response.ok) {
          const key = navigationTarget(request, response, origin);
          if (key) await putBestEffort(await currentShell(), key, response);
        }
        return response;
      })
      .catch(() => null);

    if (cached) {
      context.waitUntil(fresh);
      return cached;
    }

    const response = await fresh;
    if (response) return response;

    // A known page whose own copy is missing is still part of the installed
    // game: every page is a screen in one island. The shell is the fallback for
    // the game's own routes, never for an unknown path.
    const shell = await lookup("/app.html");
    return shell ?? notInstalled();
  }

  /* -------------------------------------------------------------- shell files */

  /**
   * A same-origin asset: cache first, then the kept generations, then the
   * network, then keep it.
   *
   * The hashed chunks are immutable; the sounds and artwork change with a deploy
   * and a new shell generation, so cache-first is correct for both. A range
   * request is never cached: a 206 is half a file, and the bucket for whole
   * bodies is the offline one.
   */
  async function shell(request: Request): Promise<Response> {
    const cached = await lookup(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && !request.headers.has("range")) {
      await putBestEffort(await currentShell(), request, response);
    }
    return response;
  }

  /* --------------------------------------------------------- downloaded songs */

  /**
   * A request that may belong to a downloaded song.
   *
   * Only URLs already in the bucket are handled: everything else is the
   * network's, exactly as it was before. JSON is network-first when there is a
   * network so a refreshed playlist is not pinned to the copy that came with the
   * download; the stems and art are cache-first because a saved song should not
   * wait for GitHub.
   */
  async function saved(request: Request): Promise<Response> {
    let cache: ShellCache;
    try {
      cache = await caches.open(OFFLINE_CACHE);
    } catch {
      return fetch(request);
    }

    const cached = await cache.match(request, { ignoreVary: true });
    if (!cached) return fetch(request);

    if (request.method === "GET" && isJson(request)) {
      try {
        const fresh = await fetch(request);
        // A refreshed document is still the answer when the bucket is full: this
        // is a cache write, not part of the request succeeding.
        if (fresh.ok) await putBestEffort(cache, request, fresh);
        return fresh;
      } catch {
        return fromCache(request, cached);
      }
    }
    return fromCache(request, cached);
  }

  /* ---------------------------------------------------------------- routing */

  function respond(context: FetchContext): Promise<Response> | null {
    const { request } = context;
    if (request.method !== "GET" && request.method !== "HEAD") return null;

    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return null;
    }
    // A blob or data request is this page's own memory, not a network resource.
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    if (request.mode === "navigate") return navigated(context);
    if (url.origin === origin && isShellPath(url.pathname)) return shell(request);
    return saved(request);
  }

  return { precache, pruneShells, respond, navigated, shell, saved };
}

/* ---------------------------------------------------------------- helpers */

function isShellPath(pathname: string): boolean {
  return (
    SHELL_FILES.has(pathname) ||
    SHELL_DIRECTORIES.some((directory) => pathname.startsWith(directory))
  );
}

function isJson(request: Request): boolean {
  try {
    return new URL(request.url).pathname.toLowerCase().endsWith(".json");
  } catch {
    return false;
  }
}

/** The pages the site actually has, by the path a navigation asks for. */
const PAGES: ReadonlyMap<string, string> = new Map([
  ["/", "/index.html"],
  ["/index.html", "/index.html"],
  ["/app", "/app.html"],
  ["/app.html", "/app.html"],
  ["/embed", "/embed.html"],
  ["/embed.html", "/embed.html"],
  ["/play", "/play.html"],
  ["/play.html", "/play.html"],
  ["/open", "/open.html"],
  ["/open.html", "/open.html"],
  ["/privacy", "/privacy.html"],
  ["/privacy.html", "/privacy.html"],
]);

/** The cached file for a page path, or null when the path is not a known page. */
export function pageKey(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  return PAGES.get(path) ?? null;
}

/**
 * Where a navigation's response belongs, or null when it must not be stored.
 *
 * The landed URL is the page that was actually served, but a redirect can leave
 * the site: an open redirect or a captive portal whose path happens to be
 * `/index.html` would otherwise become the game's front page. Only a response
 * from this origin is the shell's, and a redirect that lands on nothing we know
 * is not a page to keep. A non-redirected response is the request's own page.
 */
function navigationTarget(
  request: Request,
  response: Response,
  origin: string,
): string | null {
  const own = pageKey(new URL(request.url).pathname);
  if (!sameOrigin(response.url, origin)) return null;

  const landed = pageKey(new URL(response.url).pathname);
  if (landed) return landed;
  return response.redirected ? null : own;
}

function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function notFound(): Response {
  return new Response("Not found.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function notInstalled(): Response {
  return new Response("EverythingStar has not been installed for offline play yet.", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * Turn a cached full response into the response the request asked for.
 *
 * A media element asks for `Range: bytes=…`, and a cached 200 is not that. The
 * body is sliced with `Blob.slice`, so a seek into a 4 MB stem does not copy the
 * whole file into a new buffer. CORS headers are preserved because the cached
 * response came from a cross-origin host, and a synthetic 206 must carry them too
 * or the page's media request is blocked.
 */
export async function fromCache(request: Request, cached: Response): Promise<Response> {
  const blob = await cached.blob();
  const total = blob.size;
  const headers = new Headers();

  for (const name of [
    "content-type",
    "cache-control",
    "etag",
    "last-modified",
    "content-language",
    "access-control-allow-origin",
    "access-control-expose-headers",
  ]) {
    const value = cached.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("accept-ranges", "bytes");
  // A host may not have sent `*`; a cache match is still same-URL content.
  if (!headers.has("access-control-allow-origin")) {
    headers.set("access-control-allow-origin", "*");
  }

  if (request.method === "HEAD") {
    headers.set("content-length", String(total));
    return new Response(null, { status: 200, headers });
  }

  const range = parseRange(request.headers.get("range"), total);
  if (range === "unsatisfiable") {
    headers.set("content-range", contentRange(null, total));
    return new Response(null, { status: 416, headers });
  }

  if (!range) {
    headers.set("content-length", String(total));
    return new Response(blob, { status: 200, headers });
  }

  const slice = blob.slice(range.start, range.end + 1);
  headers.set("content-range", contentRange(range, total));
  headers.set("content-length", String(rangeLength(range)));
  return new Response(slice, {
    status: 206,
    statusText: "Partial Content",
    headers,
  });
}
