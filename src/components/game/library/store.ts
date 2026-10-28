/**
 * What the browser remembers of the library: the playlists somebody asked for, and
 * a copy of everything fetched under the URL it came from.
 *
 * The decisions — what "stale" means, what is dropped when the cache is over its cap
 * — are in `cache.ts`, pure and tested. This is the storage itself: the one module
 * that touches IndexedDB, and the one place that fetches anything. Everything it is
 * asked for can **fail without failing the game**: blocked storage, a playlist that
 * 404s, a host with no CORS headers are all ordinary, and the answer is a copy we
 * already had, or nothing.
 */

import {
  CACHE_CAP_BYTES,
  cacheEntry,
  cacheKey,
  evictions,
  isCacheKey,
  metaOf,
  rebuildIndex,
  stillEvictable,
  type CacheEntry,
  type CacheKind,
  type CacheMeta,
  type FoundBody,
} from "../../../lib/game/cache";
import {
  IDLE_TIMEOUT_MS,
  MAX_DOCUMENT_BYTES,
  MAX_PACKAGE_BYTES,
} from "../../../lib/game/fetchLimits";
import { fetchableUrl } from "../../../lib/game/url";

const DB_NAME = "everythingstar";
const DB_VERSION = 3;
const SOURCES_STORE = "sources";
const CACHE_STORE = "cache";
/**
 * One small record per cached body: `key`, `url`, `kind`, `at` and `size`.
 *
 * Eviction reads this and never the cache store, so a write near the 48 MB cap
 * costs the index's kilobytes rather than tens of megabytes of charts. Bodies live
 * only in `cache`; this store never carries one.
 */
const CACHE_META_STORE = "cache-meta";
/** The folders opened off this machine: their handles, and what reading them found. */
const FOLDERS_STORE = "folders";
/**
 * Every store the database is opened with, in creation order. The privacy
 * notice names each of them, and `privacy.test.ts` holds the two in step.
 */
export const STORE_NAMES = [
  SOURCES_STORE,
  CACHE_STORE,
  CACHE_META_STORE,
  FOLDERS_STORE,
] as const;
/** One record under this key: the playlist URLs this browser has. */
const SOURCES_KEY = "playlists";
/** The playlist URLs that are kept but switched off. */
const DISABLED_KEY = "disabled";
/** The song-document URLs added from a link, and kept beside the playlists. */
const PINNED_KEY = "pinned";
/** One record under this key: the folders this browser has open. */
const FOLDERS_KEY = "open";

/** The playlists somebody has asked for, or null when they have never said. */
export async function loadSources(): Promise<string[] | null> {
  const record = await read<{ urls?: unknown }>(SOURCES_STORE, SOURCES_KEY);
  if (!record || !Array.isArray(record.urls)) return null;
  return record.urls.filter((url): url is string => typeof url === "string");
}

export async function saveSources(urls: readonly string[]): Promise<void> {
  await write(SOURCES_STORE, SOURCES_KEY, { urls: [...urls] });
}

/** Playlists whose row is kept but whose songs are not part of the library. */
export async function loadDisabledSources(): Promise<string[]> {
  const record = await read<{ urls?: unknown }>(SOURCES_STORE, DISABLED_KEY);
  if (!record || !Array.isArray(record.urls)) return [];
  return record.urls.filter((url): url is string => typeof url === "string");
}

export async function saveDisabledSources(urls: readonly string[]): Promise<void> {
  await write(SOURCES_STORE, DISABLED_KEY, { urls: [...urls] });
}

/**
 * The songs added from a link, by document URL.
 *
 * A pinned song is a source of its own — there was no playlist around it — but it
 * is the same kind of local choice as a playlist, so it lives in the same store.
 * Records written before the key existed simply have none.
 */
export async function loadPinnedSongs(): Promise<string[]> {
  const record = await read<{ urls?: unknown }>(SOURCES_STORE, PINNED_KEY);
  if (!record || !Array.isArray(record.urls)) return [];
  return record.urls.filter((url): url is string => typeof url === "string");
}

export async function savePinnedSongs(urls: readonly string[]): Promise<void> {
  await write(SOURCES_STORE, PINNED_KEY, { urls: [...urls] });
}

/**
 * A folder as the browser keeps it.
 *
 * `handle` is a `FileSystemDirectoryHandle`, which is **structured-cloneable** and so
 * survives in IndexedDB — that is the whole reason a folder can be remembered at all.
 * `songs` is plain data, straight out of `Song`, so the list is on screen the moment
 * the page opens rather than half a minute of re-reading later.
 */
export interface StoredFolder {
  id: string;
  name: string;
  /**
   * A folder the player picked, which is structured-cloneable and so survives in
   * IndexedDB. An OPFS import has **no handle stored**: its directory is reopened
   * from `imports/<id>/` on restore, because a cloneable handle is not the thing
   * that gives OPFS its persistence.
   */
  handle?: FileSystemDirectoryHandle;
  songs: unknown;
  /** What each of its songs was read with, keyed by the song's own URL. */
  files?: unknown;
  /**
   * The scanner/parser generation that produced `songs`. An older build has no
   * version, which is what makes a folder remembered before a parser fix readable:
   * it is rescanned once instead of keeping summaries that say "no voice".
   */
  version?: number;
  /**
   * The files live in this origin's Origin Private File System (`imports/<id>/`)
   * rather than in a folder the player picked. An OPFS handle keeps its access
   * across reloads, so a restored import is readable rather than locked.
   */
  opfs?: boolean;
}

/** The folders this browser has open, in the order they were opened. */
export async function loadFolders(): Promise<StoredFolder[]> {
  const record = await read<{ folders?: unknown }>(FOLDERS_STORE, FOLDERS_KEY);
  if (!record || !Array.isArray(record.folders)) return [];
  return record.folders.filter(isStoredFolder);
}

export async function saveFolders(folders: readonly StoredFolder[]): Promise<void> {
  await write(FOLDERS_STORE, FOLDERS_KEY, { folders: [...folders] });
}

function isStoredFolder(value: unknown): value is StoredFolder {
  const entry = value as Partial<StoredFolder> | null;
  return (
    !!entry &&
    typeof entry.id === "string" &&
    typeof entry.name === "string" &&
    // A picked folder carries its handle; an OPFS import carries the marker and is
    // reopened from the directory it names.
    ((typeof entry.handle === "object" && entry.handle !== null) || entry.opfs === true)
  );
}

/** A stored document for a URL, if we have one **of this shape**. */
export async function readCache(url: string): Promise<CacheEntry | null> {
  await ensureIndex();
  const record = await read<CacheEntry>(CACHE_STORE, cacheKey(url));
  // One shape check, the same one the index rebuild uses: a record that is not an
  // entry — or one whose body never landed — is not a document this build can read.
  if (!isEntry(record) || record.body === undefined) return null;
  return record;
}

/** Store a document, and let the oldest go if the cache is over its cap. */
export async function writeCache(
  url: string,
  kind: CacheKind,
  body: unknown,
  revision?: string,
): Promise<void> {
  // A body that is not there is not a document: JSON `null` is how a resolver says
  // "no such song" and how an incident page answers, and storing it would leave an
  // entry that reads as usable for ever. Nothing is written, so the next read asks
  // the network again.
  if (body === null || body === undefined) return;
  await ensureIndex();
  const key = cacheKey(url);
  // The key carries the shape it was written by, which is what makes a body from an
  // older build unreachable rather than wrong.
  const entry = cacheEntry(url, kind, body, Date.now(), revision);
  await writeEntry(key, entry, metaOf(entry));
  // The write is finished when its own transaction commits. The trim settles the
  // cache behind it — shared with every other write in the batch — rather than
  // making this caller wait on a full metadata read per chart.
  void trim().catch(() => undefined);
}

/**
 * One trim at a time, shared by every write that asks while it runs.
 *
 * A five-seat load writes five charts in parallel. Without this, each write would
 * read the whole metadata index to answer a question the write before it already
 * asked. `again` is what keeps the guarantee: a write that lands while a trim is
 * reading marks the pass stale, and **one** more pass — never one per write —
 * settles the cache after the batch.
 */
export function coalesce(task: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;
  return () => {
    again = true;
    running ??= (async () => {
      try {
        while (again) {
          again = false;
          await task();
        }
      } finally {
        running = null;
      }
    })();
    return running;
  };
}

const trim = coalesce(trimCache);

/**
 * Write a body and its metadata together, in one readwrite transaction.
 *
 * Two stores in one transaction is the whole point: a body can never outlive its
 * index record, and a record can never name a body that was never written.
 */
async function writeEntry(key: string, entry: CacheEntry, meta: CacheMeta): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction([CACHE_STORE, CACHE_META_STORE], "readwrite");
    } catch {
      resolve();
      return;
    }
    try {
      transaction.objectStore(CACHE_STORE).put(entry, key);
      transaction.objectStore(CACHE_META_STORE).put(meta, meta.key);
    } catch {
      // A body that cannot be cloned must not be written without its record.
      try {
        transaction.abort();
      } catch {
        // The transaction is already finished.
      }
      resolve();
      return;
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

/**
 * Keep the cache under its cap: the oldest charts and songs go first.
 *
 * This reads the **metadata** only — kilobytes — and the body store's keys, which
 * are small. It never deserialises a chart to decide what to drop. A record whose
 * body has gone is stale metadata, and it goes too.
 */
async function trimCache(): Promise<void> {
  const metas = (await readAll<CacheMeta>(CACHE_META_STORE)).filter(isMeta);
  if (metas.length === 0) return;
  const bodies = new Set(await keysIn(CACHE_STORE));
  const live = metas.filter((meta) => bodies.has(meta.key));
  const byUrl = new Map(live.map((meta) => [meta.url, meta]));
  // Each key to drop, with the `at` the snapshot judged it by: the delete re-reads
  // the record and only carries out the choice it was made for.
  const drop = new Map<string, number>();
  for (const url of evictions(live, CACHE_CAP_BYTES)) {
    const meta = byUrl.get(url);
    if (meta) drop.set(meta.key, meta.at);
  }
  for (const meta of metas) {
    if (!bodies.has(meta.key)) drop.set(meta.key, meta.at);
  }
  if (drop.size > 0) await removeUnchanged(drop);
}

/**
 * Delete the entries a trim chose, unless they were written again meanwhile.
 *
 * The snapshot the eviction was decided from is a moment, not a promise: a chart
 * written while the decision was being made has a later `at`, and deleting it would
 * throw away a body the index now calls fresh. So each record is read again **inside**
 * the transaction and the pair goes only when it is still the one that was judged; a
 * body with no record is an orphan and goes regardless. A record read that fails is
 * left alone rather than guessed at.
 */
async function removeUnchanged(seen: ReadonlyMap<string, number>): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction([CACHE_STORE, CACHE_META_STORE], "readwrite");
    } catch {
      resolve();
      return;
    }
    try {
      const bodies = transaction.objectStore(CACHE_STORE);
      const metas = transaction.objectStore(CACHE_META_STORE);
      for (const [key, at] of seen) {
        const request = metas.get(key) as IDBRequest<unknown>;
        request.onsuccess = () => {
          const current = request.result;
          // A record that moved on names a newer body: its eviction is not ours.
          if (isMeta(current) && !stillEvictable(current, at)) return;
          bodies.delete(key);
          metas.delete(key);
        };
      }
    } catch {
      try {
        transaction.abort();
      } catch {
        // The transaction is already finished.
      }
      resolve();
      return;
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

/**
 * Let go of anything written by another shape.
 *
 * A body from an older build is not a body this one can read — it would be served to
 * a reader expecting fields it does not have, and the game would report a document
 * nobody can play. Its metadata goes with it. Once, per page load.
 */
let swept = false;
async function sweepCache(): Promise<void> {
  if (swept) return;
  swept = true;
  await ensureIndex();
  const stale = (await keysIn(CACHE_STORE)).filter((key) => !isCacheKey(key));
  if (stale.length > 0) await removeEntries(stale);
}

/**
 * Build the metadata index from the bodies, once, for a browser that predates it.
 *
 * A database upgraded to this schema has bodies but no index. The first cache use
 * compares the two stores' **keys** — a few hundred tiny strings — and, only when
 * they disagree, reads the cache store once for the bodies and writes the whole
 * index. The module keeps the promise, so the check itself happens once per page
 * load and the full read happens once for that browser, not once per use.
 *
 * Bodies from another shape (whose keys the sweep would remove anyway) are dropped
 * here rather than indexed, so none of them can become immortal; a body that has
 * gone leaves its metadata to the trim, which removes it.
 */
let index: Promise<void> | null = null;

function ensureIndex(): Promise<void> {
  index ??= indexOnce();
  return index;
}

async function indexOnce(): Promise<void> {
  const bodies = await keysIn(CACHE_STORE);
  const metas = await keysIn(CACHE_META_STORE);
  const current = bodies.filter(isCacheKey);
  const currentSet = new Set(current);
  const same =
    bodies.length === current.length &&
    metas.length === current.length &&
    metas.every((key) => currentSet.has(key));
  if (same) return;

  const found = await readBodies();
  // A read that failed is not a cache to empty: leave both stores as they are.
  if (found === null) return;
  const rebuilt = rebuildIndex(found);
  const stale = bodies.filter((key) => !isCacheKey(key));
  await replaceIndex(rebuilt.metas, [...new Set([...stale, ...rebuilt.drop])]);
}

function isEntry(value: unknown): value is CacheEntry {
  const entry = value as Partial<CacheEntry> | null;
  return (
    !!entry &&
    typeof entry.url === "string" &&
    typeof entry.at === "number" &&
    typeof entry.size === "number"
  );
}

function isMeta(value: unknown): value is CacheMeta {
  const meta = value as Partial<CacheMeta> | null;
  return (
    !!meta &&
    typeof meta.key === "string" &&
    typeof meta.url === "string" &&
    typeof meta.kind === "string" &&
    typeof meta.at === "number" &&
    typeof meta.size === "number"
  );
}

/**
 * Fetch a document, as JSON.
 *
 * `fresh` is what the Refresh button means: ask again rather than let the browser's
 * own HTTP cache answer. Cross-origin is expected to work — a host that serves a
 * playlist is expected to serve its headers too. The body is **bounded**: past
 * `MAX_DOCUMENT_BYTES` the request is dropped rather than buffered, so a link to
 * something enormous fails as a message instead of exhausting the tab.
 */
export async function fetchJson(
  url: string,
  fresh = false,
  signal?: AbortSignal,
): Promise<unknown> {
  const bytes = await fetchBounded(url, {
    fresh,
    signal,
    limit: MAX_DOCUMENT_BYTES,
    what: "This document",
  });
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

/**
 * Fetch a **package** — a `.sng` — as bytes.
 *
 * It is not put in the document cache: an `.sng` carries the song's audio, and
 * megabytes of stems would eat the room the charts need. The browser's own HTTP
 * cache is the only copy we keep. The same URL policy and streaming cap apply,
 * with `MAX_PACKAGE_BYTES` as the ceiling; the chunks are assembled into one
 * buffer at the end rather than the response being copied twice.
 */
export async function fetchBytes(
  url: string,
  fresh = false,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return fetchBounded(url, {
    fresh,
    signal,
    limit: MAX_PACKAGE_BYTES,
    what: "This .sng package",
  });
}

export interface BoundedFetch {
  fresh: boolean;
  signal?: AbortSignal;
  limit: number;
  /** How the failure names the thing: "This document", "This .sng package". */
  what: string;
  /** The idle deadline; the production value unless a test asks for less. */
  idleMs?: number;
}

/**
 * One bounded request: the URL policy, the redirect's own address, the declared
 * length and the streamed body all have to pass.
 *
 * The caller's `signal` is forwarded to an internal controller rather than passed
 * straight through, because this function also needs to abort — a body that keeps
 * coming past the limit is cancelled and the connection dropped, not merely
 * ignored, and a body that stops arriving is dropped by the idle deadline.
 */
export async function fetchBounded(
  url: string,
  request: BoundedFetch,
): Promise<Uint8Array> {
  const target = fetchableUrl(url);
  if (!target) throw new Error("Only http:// and https:// addresses can be read.");

  const controller = new AbortController();
  const forward = () => controller.abort();
  const caller = request.signal;
  if (caller) {
    if (caller.aborted) controller.abort();
    else caller.addEventListener("abort", forward, { once: true });
  }
  const idleMs = request.idleMs ?? IDLE_TIMEOUT_MS;
  const timeout = () => new Error(`${request.what} timed out, so it was not read.`);

  try {
    const response = await withIdle(
      fetch(target, {
        cache: request.fresh ? "reload" : "default",
        credentials: "omit",
        signal: controller.signal,
      }),
      idleMs,
      controller.signal,
      () => controller.abort(),
      timeout,
    );
    // A redirect is followed by the browser, so the address that answered is the
    // one to judge — a link must not land on a scheme we would not have fetched.
    if (response.url && !fetchableUrl(response.url)) {
      await discard(response);
      throw new Error(
        `${request.what} redirected to an address that is not http:// or https://, so it was not read.`,
      );
    }
    if (!response.ok) {
      await discard(response);
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const declared = declaredLength(response);
    if (declared !== null && declared > request.limit) {
      await discard(response);
      throw tooLarge(request.what, request.limit);
    }
    return await readAtMost(
      response,
      request.limit,
      declared,
      request.what,
      controller.signal,
      () => controller.abort(),
      idleMs,
    );
  } finally {
    caller?.removeEventListener("abort", forward);
  }
}

/**
 * The failure a bounded response's body hit while it was being read, if it did.
 *
 * `fetchResponse` hands a **body** to its caller — the downloader's `cache.put` —
 * so the cap and the idle deadline fail after this module has already answered.
 * The reason is kept beside the response rather than re-derived from whatever
 * rejection the consumer reports, which some browsers turn into a bare `TypeError`.
 */
const bodyFailures = new WeakMap<Response, () => Error | null>();

export function responseFailure(response: Response): Error | null {
  return bodyFailures.get(response)?.() ?? null;
}

/**
 * A bounded request whose **body** is handed back as a `Response`.
 *
 * `fetchBounded` answers with bytes, which is right for a document and wrong for a
 * stem: a 40 MB audio file buffered only to be cached is 40 MB held twice. This is
 * the same URL policy, redirect check, declared-length check and idle deadline,
 * with the body wrapped in a stream that enforces the cap a chunk at a time as the
 * consumer reads it. `Response` is what `Cache.put` takes, so a download never has
 * to buffer a stem to save it.
 */
export async function fetchResponse(
  url: string,
  request: BoundedFetch,
): Promise<Response> {
  const target = fetchableUrl(url);
  if (!target) throw new Error("Only http:// and https:// addresses can be read.");

  const controller = new AbortController();
  const forward = () => controller.abort();
  const caller = request.signal;
  if (caller) {
    if (caller.aborted) controller.abort();
    else caller.addEventListener("abort", forward, { once: true });
  }
  // The caller's listener stays until the body is finished: a download is aborted
  // by leaving the screen, and that must reach a transfer already under way.
  const release = () => caller?.removeEventListener("abort", forward);
  const idleMs = request.idleMs ?? IDLE_TIMEOUT_MS;
  const timeout = () => new Error(`${request.what} timed out, so it was not read.`);

  try {
    const response = await withIdle(
      fetch(target, {
        cache: request.fresh ? "reload" : "default",
        credentials: "omit",
        signal: controller.signal,
      }),
      idleMs,
      controller.signal,
      () => controller.abort(),
      timeout,
    );
    if (response.url && !fetchableUrl(response.url)) {
      await discard(response);
      throw new Error(
        `${request.what} redirected to an address that is not http:// or https://, so it was not read.`,
      );
    }
    if (!response.ok) {
      await discard(response);
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const declared = declaredLength(response);
    if (declared !== null && declared > request.limit) {
      await discard(response);
      throw tooLarge(request.what, request.limit);
    }
    if (!response.body) {
      release();
      return response;
    }

    let failure: Error | null = null;
    const body = boundedBody(
      response.body,
      request.limit,
      request.what,
      controller.signal,
      () => controller.abort(),
      release,
      (error) => {
        failure ??= error;
      },
      idleMs,
    );
    const answer = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    bodyFailures.set(answer, () => failure);
    return answer;
  } catch (error) {
    release();
    throw error;
  }
}

/**
 * A body that holds its own cap and idle deadline while the consumer reads it.
 *
 * `cache.put` is the consumer, and it writes as it reads: a stem that crosses the
 * limit errors its stream and the put fails rather than filling the tab, and one
 * that goes quiet errors after `idleMs`. Cancelling the stream (a consumer that
 * gave up) drops the connection, so a refused write does not leave a download
 * running behind it.
 */
function boundedBody(
  source: ReadableStream<Uint8Array>,
  limit: number,
  what: string,
  signal: AbortSignal,
  drop: () => void,
  release: () => void,
  failed: (error: Error) => void,
  idleMs: number,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const timeout = () => new Error(`${what} timed out, so it was not read.`);
  let total = 0;
  let finished = false;
  const finish = (error?: Error) => {
    if (finished) return;
    finished = true;
    release();
    if (error) {
      failed(error);
      drop();
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await withIdle(
          reader.read(),
          idleMs,
          signal,
          () => {
            void reader.cancel().catch(() => undefined);
            drop();
          },
          timeout,
        );
        if (done) {
          finish();
          controller.close();
          return;
        }
        if (!value || value.byteLength === 0) return;
        total += value.byteLength;
        if (total > limit) {
          await reader.cancel().catch(() => undefined);
          const error = tooLarge(what, limit);
          finish(error);
          controller.error(error);
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        finish(failure);
        controller.error(failure);
      }
    },
    cancel(reason) {
      void reader.cancel(reason).catch(() => undefined);
      finish();
      drop();
    },
  });
}

/**
 * Await one step of a request, giving up when nothing has happened for `idleMs`.
 *
 * The timer is **per step**, which is what makes it idle rather than total: one
 * runs before the request, the headers end it, and every chunk read starts
 * another. A slow but live transfer keeps resetting it; only silence runs it out.
 * When it does, `onIdle` drops the connection and the rejection is an ordinary
 * `Error`, so the caller reads "timed out" rather than an opaque `AbortError`.
 *
 * The abort listener is the other half: a caller's own abort settles the step at
 * once (and clears the timer), and because it is not the idle path it is never
 * reported as a timeout. Rejecting **before** `onIdle` matters — aborting
 * dispatches synchronously, and the listener would otherwise win the race.
 */
function withIdle<T>(
  work: Promise<T>,
  idleMs: number,
  signal: AbortSignal,
  onIdle: () => void,
  timeout: () => Error,
): Promise<T> {
  if (!Number.isFinite(idleMs) || idleMs <= 0) return work;
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const onAbort = () => finish(() => reject(signal.reason));
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      settle();
    };
    if (signal.aborted) {
      // The work was handed in already; a fetch against an aborted controller
      // rejects, and without a handler here that is an unhandled rejection in the
      // page even though this call is about to reject in the ordinary way.
      work.catch(() => undefined);
      finish(() => reject(signal.reason));
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      finish(() => reject(timeout()));
      onIdle();
    }, idleMs);
    work.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

/**
 * Read a body in chunks, stopping the moment it passes the cap.
 *
 * A `Content-Length` is a claim, not a promise, so the stream is the real check:
 * the declared length is an early exit for the honest case, and this is what holds
 * a response that lies about it. When the cap is passed the reader is cancelled
 * **and** the request aborted, so the connection stops rather than continuing to
 * fill a buffer nobody will read. Each chunk read is also one idle step: a body
 * that goes quiet mid-transfer is dropped rather than waited on for ever.
 *
 * The chunks go into **one** buffer. A usable declared length is allocated up front
 * (a static host usually knows its own size), and a hidden or understated one grows
 * geometrically; either way the bytes are written once and the answer is a view of
 * that buffer rather than a second copy of the response.
 */
async function readAtMost(
  response: Response,
  limit: number,
  declared: number | null,
  what: string,
  signal: AbortSignal,
  drop: () => void,
  idleMs: number,
): Promise<Uint8Array> {
  const timeout = () => new Error(`${what} timed out, so it was not read.`);
  const body = response.body;
  if (!body) {
    const bytes = new Uint8Array(
      await withIdle(response.arrayBuffer(), idleMs, signal, drop, timeout),
    );
    if (bytes.byteLength > limit) {
      drop();
      throw tooLarge(what, limit);
    }
    return bytes;
  }

  const reader = body.getReader();
  const stop = () => {
    void reader.cancel().catch(() => undefined);
    drop();
  };
  let bytes =
    declared !== null && declared > 0 && declared <= limit
      ? new Uint8Array(declared)
      : new Uint8Array(0);
  let total = 0;
  for (;;) {
    const { done, value } = await withIdle(reader.read(), idleMs, signal, stop, timeout);
    if (done) break;
    if (!value || value.byteLength === 0) continue;
    const end = total + value.byteLength;
    if (end > limit) {
      await reader.cancel().catch(() => undefined);
      drop();
      throw tooLarge(what, limit);
    }
    if (end > bytes.byteLength) {
      const grown = new Uint8Array(
        Math.min(limit, Math.max(end, bytes.byteLength === 0 ? 64 * 1024 : bytes.byteLength * 2)),
      );
      if (total > 0) grown.set(bytes.subarray(0, total));
      bytes = grown;
    }
    bytes.set(value, total);
    total = end;
  }

  // A view, not a copy: the bytes written above are the bytes handed back.
  return bytes.subarray(0, total);
}

/** The length a response declares, when it declares a usable one. */
function declaredLength(response: Response): number | null {
  const raw = response.headers.get("content-length");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Drop a body we are not going to read, so the connection is not left open. */
async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The body is already gone, or the browser has no stream to cancel.
  }
}

function tooLarge(what: string, limit: number): Error {
  const mb = Math.round(limit / (1024 * 1024));
  return new Error(`${what} is over the ${mb} MB limit, so it was not downloaded.`);
}

/**
 * A URL as the browser would resolve it, or null when it is not one at all.
 *
 * Everything fetched is resolved through this: a playlist's own files are relative
 * to it, and a relative URL has nothing to resolve them against.
 */
export function absoluteUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, window.location.href).href;
  } catch {
    return null;
  }
}

/**
 * A document, from the cache when we have it and the network when we do not.
 *
 * `fresh` skips the cache read — that is what Refresh means — and a fetch that fails
 * still answers with the copy we had, so a host that has gone away is not a library
 * that has gone away. Nothing to show at all comes back null.
 */
export async function cachedJson(
  url: string,
  kind: CacheKind,
  fresh = false,
  revision?: string,
  signal?: AbortSignal,
): Promise<unknown> {
  // The sweep runs first, so a body the current shape cannot read is never the one
  // that answers — it is deleted, and the network answers instead.
  await sweepCache();
  const entry = await readCache(url);
  const usable =
    entry &&
    entry.kind === kind &&
    // A body that is not there is not a copy we can show, even if an older build
    // wrote one: the entry is as good as missing, so the network is asked again.
    entry.body !== null &&
    entry.body !== undefined &&
    (revision === undefined || entry.revision === revision)
      ? entry
      : null;
  if (!fresh && usable) return usable.body;
  try {
    // A cache miss is also a reason to bypass the browser's HTTP cache: the copy we
    // need is the one at the URL now, not the stale response that may still be
    // inside its max-age. The caller's signal is forwarded so leaving the screen
    // drops the request rather than only its answer; a cache read needs none.
    const body = await fetchJson(url, fresh || !usable, signal);
    await writeCache(url, kind, body, revision);
    return body;
  } catch {
    return usable?.body ?? null;
  }
}

/* ------------------------------------------------------- IndexedDB, quietly */

let database: Promise<IDBDatabase | null> | null = null;

/**
 * The one database, opened once — until it is not.
 *
 * A memoised **failure** would be worse than no memo at all: a second tab holding
 * the database open blocks this one, and once that tab closes the next open would
 * succeed, but a `null` kept for the session would leave the cache off for ever.
 * So a failed or blocked open clears the memo and the next caller tries again;
 * success is what is kept. Nothing here throws — a storage that will not open is
 * still just a library with no cache.
 */
function open(): Promise<IDBDatabase | null> {
  database ??= openOnce();
  return database;
}

async function openOnce(): Promise<IDBDatabase | null> {
  const db = await new Promise<IDBDatabase | null>((resolve) => {
    // No IndexedDB at all — a private window, an old browser — is not an error to
    // report: there is simply nowhere to remember anything, and the network stands.
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    // The open is given up on at most once. A blocked open can still **succeed
    // later** — the blocking tab closes, and the browser hands us the connection
    // after all — so a late success is closed rather than leaked into a promise
    // nobody is waiting for any more.
    let settled = false;
    const settle = (value: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORE_NAMES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    };
    request.onsuccess = () => {
      const opened = request.result;
      // Another tab is bumping the schema: this build cannot read what it is about
      // to write, so the connection is closed and the memo cleared. The next caller
      // opens the new version instead of using a database that is about to change
      // under it.
      opened.onversionchange = () => {
        try {
          opened.close();
        } catch {
          // The connection is already gone.
        }
        database = null;
      };
      if (settled) {
        try {
          opened.close();
        } catch {
          // The connection is already gone.
        }
        return;
      }
      settle(opened);
    };
    request.onerror = () => settle(null);
    request.onblocked = () => settle(null);
  });
  // Only a working database is remembered: a later call is a fresh attempt.
  if (!db) database = null;
  return db;
}

/**
 * One request in one store, resolved when its transaction commits.
 *
 * Nothing here throws: a storage that refuses — blocked, corrupt, gone — answers
 * `null` and the caller carries on with what it can fetch.
 */
async function inStore<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(store, mode);
    } catch {
      resolve(null);
      return;
    }
    let result: T | null = null;
    try {
      const request_ = run(transaction.objectStore(store));
      request_.onsuccess = () => {
        result = request_.result;
      };
      request_.onerror = () => resolve(null);
    } catch {
      resolve(null);
      return;
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => resolve(null);
    transaction.onabort = () => resolve(null);
  });
}

function read<T>(store: string, key: string): Promise<T | null> {
  return inStore<T>(store, "readonly", (objectStore) => objectStore.get(key) as IDBRequest<T>);
}

async function readAll<T>(store: string): Promise<T[]> {
  const all = await inStore<T[]>(store, "readonly", (objectStore) =>
    objectStore.getAll() as IDBRequest<T[]>,
  );
  return all ?? [];
}

/** A store's keys — never its values. Used to compare the index with the cache. */
async function keysIn(store: string): Promise<string[]> {
  const keys = await inStore<IDBValidKey[]>(store, "readonly", (objectStore) =>
    objectStore.getAllKeys() as IDBRequest<IDBValidKey[]>,
  );
  return (keys ?? []).filter((key): key is string => typeof key === "string");
}

/**
 * Every body and its key, read once for the index rebuild.
 *
 * A cursor rather than `getAll`, because the key is half of what the rebuild
 * needs. `null` says the read did not happen, so the caller leaves the stores
 * alone instead of concluding the cache is empty.
 */
async function readBodies(): Promise<FoundBody[] | null> {
  const db = await open();
  if (!db) return null;
  return new Promise<FoundBody[] | null>((resolve) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(CACHE_STORE, "readonly");
    } catch {
      resolve(null);
      return;
    }
    const found: FoundBody[] = [];
    try {
      const request = transaction.objectStore(CACHE_STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        found.push({
          key: String(cursor.key),
          entry: isEntry(cursor.value) ? cursor.value : null,
        });
        cursor.continue();
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
      return;
    }
    transaction.oncomplete = () => resolve(found);
    transaction.onerror = () => resolve(null);
    transaction.onabort = () => resolve(null);
  });
}

/** Replace the whole index and drop the bodies that have no place in it. */
async function replaceIndex(
  metas: readonly CacheMeta[],
  drop: readonly string[],
): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction([CACHE_STORE, CACHE_META_STORE], "readwrite");
    } catch {
      resolve();
      return;
    }
    try {
      const index = transaction.objectStore(CACHE_META_STORE);
      index.clear();
      for (const meta of metas) index.put(meta, meta.key);
      const bodies = transaction.objectStore(CACHE_STORE);
      for (const key of drop) bodies.delete(key);
    } catch {
      try {
        transaction.abort();
      } catch {
        // The transaction is already finished.
      }
      resolve();
      return;
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

/** Remove bodies and their metadata together, so the two cannot disagree. */
async function removeEntries(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction([CACHE_STORE, CACHE_META_STORE], "readwrite");
    } catch {
      resolve();
      return;
    }
    try {
      const bodies = transaction.objectStore(CACHE_STORE);
      const metas = transaction.objectStore(CACHE_META_STORE);
      for (const key of keys) {
        bodies.delete(key);
        metas.delete(key);
      }
    } catch {
      try {
        transaction.abort();
      } catch {
        // The transaction is already finished.
      }
      resolve();
      return;
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

async function write(store: string, key: string, value: unknown): Promise<void> {
  await inStore(store, "readwrite", (objectStore) => objectStore.put(value, key));
}
