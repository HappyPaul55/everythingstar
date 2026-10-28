/**
 * Songs the player has saved for offline play.
 *
 * The game's library already keeps playlist, song and chart JSON in IndexedDB,
 * but the stems are streamed by HTMLAudioElement and never pass through that
 * cache. Downloading therefore fills **Cache Storage**, and the native shell's
 * service worker (`native/sw.ts` in the app repository) serves those entries
 * back to the media element, byte ranges included.
 *
 * A download is the whole song, not the band currently on screen: every chart
 * in the song document and every stem, plus the playlist, art and preview. That
 * way a different band, difficulty or singer still works on a plane. Charts are
 * small; the stems are the 20 MB the progress bar is really measuring.
 *
 * Nothing here is required for online play. A browser with no worker, a song
 * already on this device, or a YouTube-backed song simply has no download
 * action; an interrupted or over-quota download removes everything it wrote.
 *
 * A **playlist** is saved through the same code: `startPlaylistDownload` takes the
 * one job slot and runs `downloadSong` over its plan a song at a time, so a saved
 * playlist is a set of ordinary per-song records rather than a second kind of
 * download with its own manifest to keep in step.
 */

import {
  MAX_DOCUMENT_BYTES,
  MAX_PACKAGE_BYTES,
} from "../../../lib/game/fetchLimits";
import type { Song } from "../../../lib/game/song";
import type { SourceSongDoc } from "../../../lib/game/source";
import { fetchableUrl } from "../../../lib/game/url";
import { OFFLINE_CACHE } from "../../../lib/pwa/cache";
import { isSngUrl } from "./sngUrl";
import { fetchResponse, responseFailure } from "./store";

/**
 * The Cache Storage bucket the service worker reads.
 *
 * The same literal lives in the app repository's `native/sw.ts`, because the app
 * and the website are two separate builds of one contract; bump both together if
 * the cache format changes.
 */

/** One localStorage record for every downloaded song. Versioned with the cache. */
const STORAGE_KEY = "everythingstar.offline.v1";

const LOCAL_PREFIX = "folder://";

export type OfflineFailure =
  | "unsupported"
  | "local"
  | "youtube"
  | "quota"
  | "failed"
  | "cancelled";

/** A failure a screen can say in the player's own words. */
export class OfflineError extends Error {
  readonly reason: OfflineFailure;

  constructor(reason: OfflineFailure, message?: string) {
    super(message ?? reason);
    this.name = "OfflineError";
    this.reason = reason;
  }
}

export interface OfflineEntry {
  /** The playlist summary, so the Downloads dialog can draw the song offline. */
  song: Song;
  bytes: number;
  downloadedAt: number;
  /** Every URL written to Cache Storage, so a removal is exact. */
  urls: string[];
  /** The whole song was one `.sng` package rather than separate documents. */
  package: boolean;
}

export interface OfflineProgress {
  done: number;
  total: number;
  phase: "documents" | "audio" | "art";
}

export interface OfflineStorageInfo {
  usage: number;
  quota: number;
  persisted: boolean;
}

/** A failure a screen can say, tied to the song it belonged to. */
export interface OfflineFailureInfo {
  songId: string;
  reason: OfflineFailure;
}

/**
 * A whole playlist being saved, one song at a time.
 *
 * `done` counts the songs the queue has **begun**, including the one in flight, so
 * `Saving {done} of {total}…` says where it is rather than how much is behind it.
 * `total` is what the plan is attempting; a skipped song was never in it.
 */
export interface OfflineQueueState {
  /** The playlist being saved, so the row that started it can say so. */
  source: string;
  done: number;
  total: number;
  /** Songs that failed; each one left nothing behind, and the rest still ran. */
  failed: number;
  /** Songs the plan left alone, already offline or nothing a browser can keep. */
  skipped: number;
}

/**
 * The one job the downloader is running for the whole page.
 *
 * It lives outside the hook on purpose: the jukebox unmounts when the player walks
 * to the band, and an in-flight download must not become a second download when
 * they walk back. `busy` covers a removal or a clear as well, because both write
 * the same record a download is about to write.
 */
export interface OfflineJobState {
  busy: boolean;
  /** The song being saved, when a download is running. */
  busyId: string | null;
  progress: OfflineProgress | null;
  /** The playlist queue in flight, when a whole playlist is being saved. */
  queue: OfflineQueueState | null;
  error: OfflineFailureInfo | null;
}

type JobKind = "download" | "playlist" | "remove" | "clear";

interface Job {
  kind: JobKind;
  /** The song's id, "" for a clear and "" until the queue reaches its first song. */
  id: string;
  controller: AbortController | null;
  progress: OfflineProgress | null;
  queue: OfflineQueueState | null;
  promise: Promise<void> | null;
}

let job: Job | null = null;
let lastError: OfflineFailureInfo | null = null;
const jobListeners = new Set<() => void>();
const recordListeners = new Set<() => void>();

/**
 * The downloader's current job, as a snapshot a hook can hold in state.
 *
 * A plain getter rather than a store with its own reducer: the coordinator is the
 * state, and a reader that mounts late asks the same question a reader that was
 * here all along subscribed to.
 */
export function downloadState(): OfflineJobState {
  // A playlist queue is a song download that happens to know what comes next, so
  // its current song is the `busyId` the now-playing slot already watches.
  const saving =
    job?.kind === "download" || job?.kind === "playlist" ? job : null;
  return {
    busy: job !== null,
    busyId: saving && saving.id !== "" ? saving.id : null,
    progress: job?.progress ?? null,
    queue: job?.kind === "playlist" ? job.queue : null,
    error: lastError,
  };
}

/** Listen for a job starting, progressing or ending. */
export function subscribeDownloads(listener: () => void): () => void {
  jobListeners.add(listener);
  return () => {
    jobListeners.delete(listener);
  };
}

/**
 * Listen for the **record** changing: a download finished, or a song was removed.
 *
 * The library is a merge of records it did not write, so it asks again when one of
 * them moves. Progress is deliberately not on this channel: re-reading every
 * downloaded song's summary per chunk is work nobody sees.
 */
export function subscribeOffline(listener: () => void): () => void {
  recordListeners.add(listener);
  return () => {
    recordListeners.delete(listener);
  };
}

function announceJob(): void {
  for (const listener of Array.from(jobListeners)) {
    try {
      listener();
    } catch {
      // A reader that throws must not stop the download it is watching.
    }
  }
}

function announceRecords(): void {
  for (const listener of Array.from(recordListeners)) {
    try {
      listener();
    } catch {
      // One broken reader is not every reader.
    }
  }
}

/**
 * Record writes, one at a time.
 *
 * A download's `finish` and a removal write the same localStorage record, and a
 * removal that read the list before the download appended to it would put the old
 * list back. Chaining them is what makes the last writer the one that knows what
 * came before it.
 */
let recordWrites: Promise<unknown> = Promise.resolve();

function serialiseRecord<T>(task: () => T): Promise<T> {
  const run = recordWrites.then(task, task);
  recordWrites = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export interface OfflineUrls {
  /** The playlist, song document and every chart. */
  documents: string[];
  /** Stems and the jukebox preview. */
  audio: string[];
  /** Cover art and the artist/album fallbacks. All best-effort. */
  art: string[];
}

/** Is this a page the app's worker can serve from? */
export function offlineSupported(): boolean {
  return (
    typeof caches !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    navigator.serviceWorker.controller !== null
  );
}

function isLocalUrl(url: string): boolean {
  return url.startsWith(LOCAL_PREFIX);
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Storage can be denied by policy; downloads then simply cannot be listed.
    return null;
  }
}

function isEntry(value: unknown): value is OfflineEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<OfflineEntry>;
  return (
    typeof entry.song === "object" &&
    entry.song !== null &&
    typeof entry.song.id === "string" &&
    typeof entry.song.title === "string" &&
    typeof entry.bytes === "number" &&
    typeof entry.downloadedAt === "number" &&
    Array.isArray(entry.urls) &&
    entry.urls.every((url) => typeof url === "string")
  );
}

function readEntries(): OfflineEntry[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(isEntry);
  } catch {
    return [];
  }
}

function writeEntries(entries: readonly OfflineEntry[]): void {
  const store = storage();
  if (!store) throw new OfflineError("unsupported");
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    throw new OfflineError("quota");
  }
}

/** The downloaded songs, newest first. */
export function listOffline(): OfflineEntry[] {
  return readEntries().sort((a, b) => b.downloadedAt - a.downloadedAt);
}

function findOffline(id: string): OfflineEntry | null {
  return readEntries().find((entry) => entry.song.id === id) ?? null;
}

/** Format a byte count for the dialog without pulling in a locale library. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Usage, quota and whether Android has promised not to evict this origin. */
export async function offlineStorage(): Promise<OfflineStorageInfo> {
  let usage = 0;
  let quota = 0;
  let persisted = false;

  try {
    const estimate = await navigator.storage?.estimate?.();
    usage = estimate?.usage ?? 0;
    quota = estimate?.quota ?? 0;
  } catch {
    // An estimate is a courtesy; the download still works without one.
  }

  try {
    persisted = (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    persisted = false;
  }

  return { usage, quota, persisted };
}

/**
 * Why a song can or cannot be downloaded, before any network work.
 *
 * A YouTube-backed song is not known until its document is read — the playlist
 * summary carries a video backdrop, not the audio source — so that refusal
 * comes from `downloadSong` and is shown from its error.
 */
export function canDownload(
  song: Song,
): { ok: true } | { ok: false; reason: OfflineFailure } {
  if (!offlineSupported()) return { ok: false, reason: "unsupported" };
  if (isLocalUrl(song.doc)) return { ok: false, reason: "local" };
  return { ok: true };
}

/**
 * What saving a whole playlist would attempt, before anything is fetched.
 *
 * Pure and cheap enough for the Playlists dialog to run while it draws a row: the
 * button can say how many songs it would save, and how many it would leave alone,
 * without starting a job or asking any host for anything.
 *
 * A **YouTube-backed** song is attempted here rather than skipped. The playlist
 * summary cannot know where a song's audio comes from — that is in its document — so
 * the download itself refuses it, per song, and the queue counts it like any other
 * failure. A **local folder** song is skipped because it is already on this device,
 * and a browser with no worker skips every song. An **on-demand** playlist never
 * reaches this: its songs are answers to a search rather than a catalogue, so the
 * dialog offers it no button at all.
 */
export interface PlaylistPlan {
  /** The songs the queue will ask `downloadSong` for, in playlist order. */
  songs: Song[];
  /** The songs it will not attempt, and why. */
  skipped: Array<{ song: Song; reason: OfflineFailure }>;
}

export function planPlaylistDownload(songs: readonly Song[]): PlaylistPlan {
  const attempt: Song[] = [];
  const skipped: Array<{ song: Song; reason: OfflineFailure }> = [];
  for (const song of songs) {
    const allowed = canDownload(song);
    if (allowed.ok) attempt.push(song);
    else skipped.push({ song, reason: allowed.reason });
  }
  return { songs: attempt, skipped };
}

/**
 * Every URL a complete download needs, grouped by what it is.
 *
 * Pure: the test feeds it a song document and checks the manifest without a
 * network or a cache. `downloaded.ts` uses the groups for progress and the
 * service worker's cache; the art group is best-effort.
 */
export function collectSongUrls(song: Song, doc: SourceSongDoc): OfflineUrls {
  const documents = new Set<string>();
  const audio = new Set<string>();
  const art = new Set<string>();

  const add = (set: Set<string>, url: string | null | undefined) => {
    if (url && !isLocalUrl(url)) set.add(url);
  };

  add(documents, song.from);
  add(documents, song.doc);
  add(art, song.art);
  add(art, doc.art);
  add(art, doc.artist.art);
  add(art, doc.album?.art);

  add(audio, doc.audio.preview);
  if (doc.audio.source === "stems") {
    for (const stem of doc.audio.stems) add(audio, stem.url);
  }
  for (const part of doc.parts) {
    for (const chart of part.charts) add(documents, chart.url);
  }

  return {
    documents: [...documents],
    audio: [...audio],
    art: [...art],
  };
}

/**
 * The library with the downloaded songs last.
 *
 * A download is a **copy** of a song, not another source: if a playlist, a folder
 * or a link already lists that id, that row is the song and the download must not
 * put a second one in the jukebox. But an on-demand search result exists nowhere
 * else once the search results are gone — its summary lives only in the offline
 * record — so appending it is what makes a saved song visible after a reload.
 */
export function mergeOfflineSongs(
  songs: readonly Song[],
  offline: readonly Song[],
): Song[] {
  const seen = new Set(songs.map((song) => song.id));
  const extra = offline.filter((song) => {
    if (seen.has(song.id)) return false;
    seen.add(song.id);
    return true;
  });
  return [...songs, ...extra];
}

/** What a URL's body is, and therefore how large it is allowed to be. */
type DownloadKind = "document" | "audio" | "art" | "package";

function limitFor(kind: DownloadKind): number {
  // A document and an image are read into memory by somebody; a stem and a package
  // are streamed. The audio ceiling is the package's, because that is what a stem
  // of a long song with several parts actually weighs.
  return kind === "audio" || kind === "package"
    ? MAX_PACKAGE_BYTES
    : MAX_DOCUMENT_BYTES;
}

function whatFor(kind: DownloadKind): string {
  switch (kind) {
    case "document":
      return "This document";
    case "audio":
      return "This audio file";
    case "art":
      return "This image";
    case "package":
      return "This .sng package";
  }
}

/**
 * The refusal for an address a download would not fetch.
 *
 * The same policy as everywhere else (`fetchableUrl`), said as a download failure
 * rather than left to `fetch` to throw an opaque `TypeError` about the scheme.
 */
function offlineUrl(url: string): string {
  const named = fetchableUrl(url);
  if (!named) {
    throw new OfflineError(
      "failed",
      `${url}: only http:// and https:// addresses can be downloaded.`,
    );
  }
  return named;
}

export interface DownloadOptions {
  onProgress?: (progress: OfflineProgress) => void;
  signal?: AbortSignal;
  /** The idle deadline; the production value unless a test asks for less. */
  idleMs?: number;
}

/**
 * Fetch a song's entire document set into Cache Storage and record it.
 *
 * The playlist is required: without it the jukebox has no row to play from on
 * a cold offline start. Every chart and stem is required for the same reason —
 * a song that only half works offline is worse than one clearly not saved. Art
 * and the preview are optional; a missing cover must not fail a download.
 *
 * On any failure the URLs this attempt wrote are deleted, so a half-download is
 * never listed and never silently occupies the device.
 */
export async function downloadSong(
  song: Song,
  options: DownloadOptions = {},
): Promise<OfflineEntry> {
  const allowed = canDownload(song);
  if (!allowed.ok) throw new OfflineError(allowed.reason);

  const existing = findOffline(song.id);
  if (existing) return existing;

  let cache: Cache;
  try {
    cache = await caches.open(OFFLINE_CACHE);
  } catch {
    throw new OfflineError("unsupported");
  }

  // A download is a user's deliberate request to keep something, so ask the
  // platform to make the origin persistent now rather than at first paint.
  try {
    await navigator.storage?.persist?.();
  } catch {
    // A hint, not a promise.
  }

  const urls = new Set<string>();
  // Only what this attempt actually created. The playlist and album art can be
  // shared with another download, and a failed attempt must not take them away.
  const written = new Set<string>();
  let bytes = 0;
  let done = 0;
  // A pinned song's playlist *is* its document, so the first step is the whole
  // first phase rather than one half of it.
  const sameDocument = song.from === song.doc;
  let total = sameDocument ? 1 : 2;

  const progress = (phase: OfflineProgress["phase"] = "documents") => {
    options.onProgress?.({ done, total, phase });
  };
  progress();

  const cleanup = async () => {
    await Promise.all(
      [...written].map((url) => cache.delete(url).catch(() => false)),
    );
    written.clear();
    urls.clear();
  };

  /**
   * The honest reason a write failed.
   *
   * A body's cap or idle deadline fails while the cache is consuming it, and the
   * rejection `cache.put` reports can be a bare `TypeError`. The failure recorded
   * on the response by `fetchResponse` is the one that names what happened.
   */
  const failureOf = (error: unknown, response: Response | null): OfflineError => {
    if (response) {
      const bodyFailure = responseFailure(response);
      if (bodyFailure) return new OfflineError("failed", bodyFailure.message);
    }
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      return new OfflineError("quota");
    }
    return new OfflineError(
      "failed",
      error instanceof Error ? error.message : String(error),
    );
  };

  const put = async (
    url: string,
    kind: DownloadKind,
    required: boolean,
    phase: OfflineProgress["phase"],
  ): Promise<void> => {
    if (urls.has(url)) {
      done += 1;
      progress(phase);
      return;
    }

    let response: Response | null = null;
    try {
      // The policy every other read obeys: a document may name anything, and a
      // `javascript:` or `file:` stem is refused here rather than by `fetch`.
      offlineUrl(url);
      const alreadyCached = await cache.match(url, { ignoreVary: true });
      response = await fetchResponse(url, {
        fresh: true,
        signal: options.signal,
        limit: limitFor(kind),
        what: whatFor(kind),
        idleMs: options.idleMs,
      });

      const length = Number(response.headers.get("content-length") ?? 0);
      await cache.put(url, response);
      urls.add(url);
      if (!alreadyCached) written.add(url);
      if (Number.isFinite(length) && length > 0) bytes += length;
    } catch (error) {
      if (error instanceof OfflineError) throw error;
      if (options.signal?.aborted) throw new OfflineError("cancelled");
      // An optional cover or preview is allowed to be missing; everything else is
      // part of the song.
      if (!required) return;
      throw failureOf(error, response);
    } finally {
      done += 1;
      progress(phase);
    }
  };

  /**
   * Read the song document and keep it, in one request.
   *
   * The response is cloned before it is parsed: a body can be consumed only once,
   * and the cache needs the bytes while the parser needs the JSON.
   */
  const readDocument = async (url: string): Promise<unknown> => {
    let response: Response | null = null;
    try {
      offlineUrl(url);
      response = await fetchResponse(url, {
        fresh: true,
        signal: options.signal,
        limit: MAX_DOCUMENT_BYTES,
        what: whatFor("document"),
        idleMs: options.idleMs,
      });
      const cachedDoc = response.clone();
      const body: unknown = await response.json();
      const alreadyCached = await cache.match(url, { ignoreVary: true });
      const length = Number(response.headers.get("content-length") ?? 0);
      await cache.put(url, cachedDoc);
      urls.add(url);
      if (!alreadyCached) written.add(url);
      if (Number.isFinite(length) && length > 0) bytes += length;
      return body;
    } catch (error) {
      if (error instanceof OfflineError) throw error;
      if (options.signal?.aborted) throw new OfflineError("cancelled");
      throw failureOf(error, response);
    } finally {
      done += 1;
      progress("documents");
    }
  };

  /**
   * The song document a pinned song already put in the cache.
   *
   * `song.from === song.doc` for a song added from a link, so the first `put` wrote
   * exactly the document this step needs. Reading it back keeps the download at one
   * request and the cache at one entry.
   */
  const readCachedDocument = async (url: string): Promise<unknown> => {
    try {
      const stored = await cache.match(url, { ignoreVary: true });
      if (!stored) {
        throw new OfflineError(
          "failed",
          `${url}: the song document was not kept`,
        );
      }
      return await stored.json();
    } catch (error) {
      if (options.signal?.aborted) throw new OfflineError("cancelled");
      if (error instanceof OfflineError) throw error;
      throw new OfflineError(
        "failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  try {
    if (isSngUrl(song.doc)) {
      // A package carries the song's audio, so it is held to the package ceiling
      // even when the playlist and the document are the same address.
      await put(song.doc, "package", true, "documents");
      if (!sameDocument) await put(song.from, "document", true, "documents");
      return await finish({
        song,
        bytes,
        downloadedAt: Date.now(),
        urls: [...urls],
        package: true,
      });
    }

    await put(song.from, "document", true, "documents");
    const body: unknown = sameDocument
      ? await readCachedDocument(song.doc)
      : await readDocument(song.doc);

    const { readSongDoc } = await import("../../../lib/game/source");
    const read = readSongDoc(body, song.doc);
    if (!read.doc) {
      throw new OfflineError("failed", read.problems[0] ?? "unreadable song");
    }
    if (read.doc.audio.source === "youtube") {
      throw new OfflineError("youtube");
    }

    const groups = collectSongUrls(song, read.doc);
    const pendingDocuments = groups.documents.filter((url) => !urls.has(url));
    const pendingAudio = groups.audio.filter((url) => !urls.has(url));
    const pendingArt = groups.art.filter((url) => !urls.has(url));
    total = done + pendingDocuments.length + pendingAudio.length + pendingArt.length;
    progress("documents");

    for (const url of pendingDocuments) {
      await put(url, "document", true, "documents");
    }
    for (const url of pendingAudio) await put(url, "audio", true, "audio");
    for (const url of pendingArt) await put(url, "art", false, "art");

    return await finish({
      song,
      bytes,
      downloadedAt: Date.now(),
      urls: [...urls],
      package: false,
    });
  } catch (error) {
    await cleanup();
    if (error instanceof OfflineError) throw error;
    if (options.signal?.aborted) throw new OfflineError("cancelled");
    throw new OfflineError(
      "failed",
      error instanceof Error ? error.message : String(error),
    );
  }

  async function finish(entry: OfflineEntry): Promise<OfflineEntry> {
    try {
      await serialiseRecord(() => {
        const entries = readEntries().filter(
          (existing) => existing.song.id !== entry.song.id,
        );
        entries.push(entry);
        writeEntries(entries);
      });
    } catch (error) {
      throw error instanceof OfflineError ? error : new OfflineError("quota");
    }
    // The library is a merge that does not know it gained a song: tell it.
    announceRecords();
    return entry;
  }
}

/** Remove one song's files and its record, keeping anything another entry shares. */
async function removeOffline(id: string): Promise<void> {
  const entries = readEntries();
  const entry = entries.find((item) => item.song.id === id);
  if (!entry) return;

  const remaining = entries.filter((item) => item.song.id !== id);
  const stillUsed = new Set(remaining.flatMap((item) => item.urls));
  const deletable = entry.urls.filter((url) => !stillUsed.has(url));

  try {
    const cache = await caches.open(OFFLINE_CACHE);
    await Promise.all(deletable.map((url) => cache.delete(url).catch(() => false)));
  } catch {
    // The record still goes: a row pointing at a cache that is already gone is
    // worse than a cache file with no row.
  }

  await serialiseRecord(() => writeEntries(remaining));
  announceRecords();
}

/** Forget every download and the whole bucket. */
async function clearOffline(): Promise<void> {
  try {
    await caches.delete(OFFLINE_CACHE);
  } catch {
    // The metadata still goes; a later download recreates the bucket.
  }
  await serialiseRecord(() => {
    storage()?.removeItem(STORAGE_KEY);
  });
  announceRecords();
}

/* ------------------------------------------------------- the one job, page-wide */

/**
 * Start saving a song, unless something already is.
 *
 * `false` means the press was refused: one job at a time is what keeps two
 * attempts from sharing a record and deleting each other's URLs. The job outlives
 * the hook that asked, so the jukebox unmounting does not end it.
 */
export function startDownload(song: Song): boolean {
  if (job) return false;

  const controller = new AbortController();
  const next: Job = {
    kind: "download",
    id: song.id,
    controller,
    progress: { done: 0, total: 2, phase: "documents" },
    queue: null,
    promise: null,
  };
  job = next;
  lastError = null;
  announceJob();

  next.promise = (async () => {
    try {
      await downloadSong(song, {
        signal: controller.signal,
        onProgress: (progress) => {
          // A newer job cannot be running (this one holds the slot), but the check
          // keeps a late progress from a withdrawn attempt out of the display.
          if (job !== next) return;
          next.progress = progress;
          announceJob();
        },
      });
    } catch (reason) {
      const failure = reason instanceof OfflineError ? reason.reason : "failed";
      // A cancel is the player's choice, not a failure to report back to them.
      if (failure !== "cancelled") {
        lastError = { songId: song.id, reason: failure };
      }
    } finally {
      if (job === next) {
        job = null;
        announceJob();
      }
    }
  })();
  return true;
}

/**
 * Start saving a whole playlist, unless something already is.
 *
 * The queue is the **same** downloader as one song, run one at a time: each step
 * calls `downloadSong` for the next song and records it exactly as the now-playing
 * slot's button would. A saved playlist is therefore a set of ordinary per-song
 * records, not a second manifest — the Downloads dialog lists every song it keeps,
 * a cancelled queue leaves the finished ones behind, and a later removal of one song
 * takes only that song's files.
 *
 * Failures are counted, not fatal: the rest of the playlist still runs. A **quota**
 * failure is the exception, because a full device makes every later song fail too,
 * so the queue stops instead of walking the rest of a list that cannot land. Cancel
 * aborts the song in flight — `downloadSong` removes that attempt's partial files —
 * and keeps the songs already completed.
 */
export function startPlaylistDownload(
  songs: readonly Song[],
  source: string,
): boolean {
  if (job) return false;

  const plan = planPlaylistDownload(songs);
  // Nothing this browser may attempt is not a job: a row that offers no button
  // reaches this with an empty plan, and a press must not leave a job spinning.
  if (plan.songs.length === 0) return false;

  const controller = new AbortController();
  const queue: OfflineQueueState = {
    source,
    done: 0,
    total: plan.songs.length,
    failed: 0,
    skipped: plan.skipped.length,
  };
  const next: Job = {
    kind: "playlist",
    id: "",
    controller,
    progress: null,
    queue,
    promise: null,
  };
  job = next;
  lastError = null;
  announceJob();

  const update = (change: Partial<OfflineQueueState>) => {
    if (job !== next) return;
    Object.assign(queue, change);
    // A copy per step, so a reader that held the last one is not handed the next
    // step's numbers through the same object.
    next.queue = { ...queue };
    announceJob();
  };

  next.promise = (async () => {
    try {
      for (const song of plan.songs) {
        // A cancel between two songs has no request to abort, so it is read here.
        if (controller.signal.aborted) break;

        next.id = song.id;
        next.progress = { done: 0, total: 2, phase: "documents" };
        update({ done: queue.done + 1 });

        try {
          await downloadSong(song, {
            signal: controller.signal,
            onProgress: (progress) => {
              if (job !== next) return;
              next.progress = progress;
              announceJob();
            },
          });
        } catch (reason) {
          const failure = reason instanceof OfflineError ? reason.reason : "failed";
          // The press that cancels is a choice, not a song that failed: the song in
          // flight rolled its own partial files back and the finished ones stay.
          if (failure === "cancelled" || controller.signal.aborted) break;
          lastError = { songId: song.id, reason: failure };
          update({ failed: queue.failed + 1 });
          if (failure === "quota") break;
        }
      }
    } finally {
      if (job === next) {
        job = null;
        announceJob();
      }
    }
  })();
  return true;
}

/** Stop the download or the playlist queue in flight, if there is one. */
export function cancelDownload(): void {
  if (job?.kind !== "download" && job?.kind !== "playlist") return;
  job.controller?.abort();
}

/** Remove a downloaded song, unless a job is running. */
export function removeDownload(id: string): boolean {
  if (job) return false;
  const next: Job = {
    kind: "remove",
    id,
    controller: null,
    progress: null,
    queue: null,
    promise: null,
  };
  job = next;
  lastError = null;
  announceJob();

  next.promise = (async () => {
    try {
      await removeOffline(id);
    } catch {
      lastError = { songId: id, reason: "failed" };
    } finally {
      if (job === next) {
        job = null;
        announceJob();
      }
    }
  })();
  return true;
}

/** Forget every download, unless one is running. */
export function clearDownloads(): boolean {
  if (job) return false;
  const next: Job = {
    kind: "clear",
    id: "",
    controller: null,
    progress: null,
    queue: null,
    promise: null,
  };
  job = next;
  lastError = null;
  announceJob();

  next.promise = (async () => {
    try {
      await clearOffline();
    } catch {
      lastError = { songId: "", reason: "failed" };
    } finally {
      if (job === next) {
        job = null;
        announceJob();
      }
    }
  })();
  return true;
}
