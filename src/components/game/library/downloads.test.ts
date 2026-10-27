import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Song } from "../../../lib/game/song";
import type { SourceSongDoc } from "../../../lib/game/source";
import {
  OfflineError,
  cancelDownload,
  clearDownloads,
  collectSongUrls,
  downloadSong,
  downloadState,
  formatBytes,
  listOffline,
  mergeOfflineSongs,
  removeDownload,
  startDownload,
  subscribeDownloads,
} from "./downloads";

const DOC = "https://songs.example/song.json";
const FROM = "https://songs.example/playlist.json";

function song(overrides: Partial<Song> = {}): Song {
  return {
    id: "test-song",
    title: "Test Song",
    artist: {
      id: "artist",
      name: "Test Artist",
      art: "https://songs.example/artist.jpg",
    },
    album: {
      id: "album",
      name: "Test Album",
      year: 2020,
      art: "https://songs.example/album.jpg",
    },
    art: "https://songs.example/cover.jpg",
    accent: null,
    durationMs: 190_000,
    previewStartMs: 23_000,
    offer: { instruments: [], voice: null },
    video: null,
    doc: DOC,
    from: FROM,
    revision: "r1",
    seed: 1,
    ...overrides,
  };
}

function doc(overrides: Partial<SourceSongDoc> = {}): SourceSongDoc {
  return {
    id: "test-song",
    title: "Test Song",
    artist: {
      id: "artist",
      name: "Test Artist",
      art: "https://songs.example/artist.jpg",
    },
    album: {
      id: "album",
      name: "Test Album",
      year: 2020,
      art: "https://songs.example/album.jpg",
    },
    art: "https://songs.example/cover.jpg",
    durationMs: 190_000,
    previewStartMs: 23_000,
    video: null,
    audio: {
      source: "stems",
      stems: [
        {
          id: "guitar",
          name: "Guitar",
          url: "https://songs.example/guitar.ogg",
          instrument: "guitar",
          defaultGainDb: 0,
          offsetMs: 0,
        },
        {
          id: "drums",
          name: "Drums",
          url: "https://songs.example/drums.ogg",
          instrument: "drums",
          defaultGainDb: 0,
          offsetMs: 0,
        },
      ],
      mixPresets: [],
      preview: "https://songs.example/preview.ogg",
    },
    parts: [
      {
        id: "guitar",
        role: "guitar",
        label: null,
        controllerTypes: [],
        audioControl: null,
        charts: [
          {
            id: "guitar-expert",
            chartType: "lanes",
            role: "lead",
            difficulty: "expert",
            url: "https://songs.example/guitar-expert.json",
            columns: 5,
            bpm: 120,
            offsetMs: 0,
          },
          {
            id: "guitar-easy",
            chartType: "lanes",
            role: "lead",
            difficulty: "easy",
            url: "https://songs.example/guitar-easy.json",
            columns: 5,
            bpm: 120,
            offsetMs: 0,
          },
        ],
      },
      {
        id: "vocals",
        role: "vocals",
        label: null,
        controllerTypes: [],
        audioControl: null,
        charts: [
          {
            id: "vocals-expert",
            chartType: "vocals",
            difficulty: null,
            url: "https://songs.example/vocals.json",
            columns: null,
            bpm: null,
            offsetMs: 0,
          },
        ],
      },
    ],
    sections: [],
    ...overrides,
  };
}

describe("collectSongUrls", () => {
  test("a complete song carries the playlist, every chart, every stem, the preview and every art fallback", () => {
    const urls = collectSongUrls(song(), doc());

    expect(urls.documents).toEqual([
      FROM,
      DOC,
      "https://songs.example/guitar-expert.json",
      "https://songs.example/guitar-easy.json",
      "https://songs.example/vocals.json",
    ]);
    expect(urls.audio).toEqual([
      "https://songs.example/preview.ogg",
      "https://songs.example/guitar.ogg",
      "https://songs.example/drums.ogg",
    ]);
    expect(urls.art).toEqual([
      "https://songs.example/cover.jpg",
      "https://songs.example/artist.jpg",
      "https://songs.example/album.jpg",
    ]);
  });

  test("the same URL in two groups is listed once", () => {
    const shared = "https://songs.example/shared.ogg";
    const urls = collectSongUrls(
      song({ art: shared }),
      doc({
        art: shared,
        audio: {
          source: "stems",
          stems: [
            {
              id: "guitar",
              name: "Guitar",
              url: shared,
              instrument: "guitar",
              defaultGainDb: 0,
              offsetMs: 0,
            },
          ],
          mixPresets: [],
          preview: shared,
        },
      }),
    );

    expect(urls.art.filter((url) => url === shared)).toHaveLength(1);
    expect(urls.audio.filter((url) => url === shared)).toHaveLength(1);
  });

  test("a folder URL is never sent to the downloader", () => {
    const urls = collectSongUrls(
      song({ art: "folder://local/cover.jpg" }),
      doc({
        art: "folder://local/cover.jpg",
        audio: {
          source: "stems",
          stems: [
            {
              id: "guitar",
              name: "Guitar",
              url: "folder://local/guitar.ogg",
              instrument: "guitar",
              defaultGainDb: 0,
              offsetMs: 0,
            },
          ],
          mixPresets: [],
          preview: null,
        },
      }),
    );

    expect(urls.art).toEqual([
      "https://songs.example/artist.jpg",
      "https://songs.example/album.jpg",
    ]);
    expect(urls.audio).toEqual([]);
  });

  test("a YouTube-backed song has no stems to cache", () => {
    const urls = collectSongUrls(
      song(),
      doc({
        audio: {
          source: "youtube",
          stems: [],
          mixPresets: [],
          preview: null,
        },
      }),
    );

    expect(urls.audio).toEqual([]);
    expect(urls.documents).toContain(DOC);
    expect(urls.documents).toContain(FROM);
  });
});

describe("formatBytes", () => {
  test("uses whole kilobytes below a megabyte and a readable megabyte count above", () => {
    expect(formatBytes(0)).toBe("0 MB");
    expect(formatBytes(512)).toBe("1 KB");
    expect(formatBytes(3.4 * 1024 * 1024)).toBe("3.4 MB");
    expect(formatBytes(23.6 * 1024 * 1024)).toBe("24 MB");
  });
});

/* ------------------------------------------------------------- the downloader */

interface Stored {
  body: Uint8Array;
  headers: Headers;
  status: number;
  statusText: string;
}

/**
 * The smallest Cache Storage that answers what `downloadSong` asks.
 *
 * `put` really reads the response's stream, so the download's own cap and idle
 * deadline are exercised rather than bypassed by an `arrayBuffer()` that was
 * already in memory — which is the same reason `store.test.ts` streams its bodies.
 */
class FakeCache {
  readonly entries = new Map<string, Stored>();
  beforePut: ((url: string, response: Response) => void) | null = null;

  async match(url: string): Promise<Response | undefined> {
    const stored = this.entries.get(url);
    if (!stored) return undefined;
    return new Response(stored.body.slice(), {
      status: stored.status,
      statusText: stored.statusText,
      headers: stored.headers,
    });
  }

  async put(url: string, response: Response): Promise<void> {
    this.beforePut?.(url, response);
    const body = new Uint8Array(await response.arrayBuffer());
    this.entries.set(url, {
      body,
      headers: new Headers(response.headers),
      status: response.status,
      statusText: response.statusText,
    });
  }

  async delete(url: string): Promise<boolean> {
    return this.entries.delete(url);
  }
}

interface Environment {
  cache: FakeCache;
  stored: Map<string, string>;
}

const realFetch = globalThis.fetch;
const realCaches = (globalThis as { caches?: unknown }).caches;
const realNavigator = globalThis.navigator;
const realLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

let calls: Array<{ url: string; init?: RequestInit }> = [];

function installEnvironment(): Environment {
  const cache = new FakeCache();
  const stored = new Map<string, string>();
  const localStorage = {
    get length() {
      return stored.size;
    },
    clear: () => stored.clear(),
    getItem: (key: string) => stored.get(key) ?? null,
    key: (index: number) => [...stored.keys()][index] ?? null,
    removeItem: (key: string) => {
      stored.delete(key);
    },
    setItem: (key: string, value: string) => {
      stored.set(key, String(value));
    },
  };

  (globalThis as { caches?: unknown }).caches = {
    open: async () => cache,
    delete: async () => {
      cache.entries.clear();
      return true;
    },
    has: async () => true,
  };
  (globalThis as { localStorage?: unknown }).localStorage = localStorage;
  (globalThis as { navigator: unknown }).navigator = {
    userAgent: "test",
    serviceWorker: {
      controller: {},
      addEventListener() {},
      removeEventListener() {},
    },
    storage: {
      persist: async () => true,
      persisted: async () => true,
      estimate: async () => ({ usage: 0, quota: 0 }),
    },
  };
  calls = [];
  return { cache, stored };
}

function stubFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): void {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  }) as typeof fetch;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

function audioResponse(): Response {
  return new Response("audio", { headers: { "content-length": "5" } });
}

/** What a healthy host answers for the fixture song. */
function happyHost(
  options: {
    failing?: (url: string) => boolean;
    art?: (url: string) => boolean;
  } = {},
): (url: string) => Response {
  // The fixture is our parsed shape; a document on the wire names a chart's
  // `laneCount`, which is the one field the reader needs and the fixture does not.
  const parsed = doc();
  const documentBody = {
    ...parsed,
    schemaVersion: 1,
    parts: parsed.parts.map((part) => ({
      ...part,
      charts: part.charts.map((chart) => ({ ...chart, laneCount: chart.columns })),
    })),
  };
  return (url) => {
    if (options.failing?.(url)) return new Response("nope", { status: 500 });
    if (url === DOC) return jsonResponse(documentBody);
    if (url === FROM || url.startsWith("https://songs.example/api/search")) {
      return jsonResponse({ schemaVersion: 1, songs: [] });
    }
    if (url.endsWith(".ogg")) return audioResponse();
    if (url.endsWith(".json")) return jsonResponse({});
    if (options.art?.(url)) return new Response("nope", { status: 500 });
    if (url.endsWith(".jpg") || url.endsWith(".png")) return new Response("art");
    return new Response("", { status: 404 });
  };
}

/** Wait for the coordinator's one job to finish, or fail the test. */
async function settle(): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (!downloadState().busy) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("the download job did not finish");
}

/** Poll until `check` is true, so a test does not race the download's steps. */
async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("the expected state never arrived");
}

beforeEach(() => {
  installEnvironment();
});

afterEach(async () => {
  cancelDownload();
  await settle();
  globalThis.fetch = realFetch;
  if (realCaches === undefined) {
    delete (globalThis as { caches?: unknown }).caches;
  } else {
    (globalThis as { caches?: unknown }).caches = realCaches;
  }
  if (realLocalStorage === undefined) {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  } else {
    (globalThis as { localStorage?: unknown }).localStorage = realLocalStorage;
  }
  (globalThis as { navigator: unknown }).navigator = realNavigator;
});

describe("mergeOfflineSongs", () => {
  test("a downloaded song is listed when no source lists it", () => {
    const downloaded = song({ id: "searched", title: "Searched Song" });
    expect(mergeOfflineSongs([], [downloaded])).toEqual([downloaded]);
  });

  test("it is appended last, so the playlist's own row is the one kept", () => {
    const playlist = song({ id: "in-playlist", title: "From the Playlist" });
    const downloaded = song({ id: "in-playlist", title: "From the Download" });
    const extra = song({ id: "only-downloaded", title: "Only Downloaded" });

    const merged = mergeOfflineSongs([playlist], [downloaded, extra]);

    expect(merged.map((entry) => entry.id)).toEqual(["in-playlist", "only-downloaded"]);
    expect(merged[0]).toBe(playlist);
  });
});

describe("downloadSong", () => {
  test("writes every URL and the record", async () => {
    const { cache } = installEnvironment();
    stubFetch(happyHost());

    const entry = await downloadSong(song());

    const expected = collectSongUrls(song(), doc());
    for (const url of [
      ...expected.documents,
      ...expected.audio,
      ...expected.art,
    ]) {
      expect(cache.entries.has(url)).toBe(true);
    }
    expect(entry.package).toBe(false);
    expect(entry.bytes).toBeGreaterThan(0);
    expect(entry.urls).toContain(FROM);
    expect(entry.urls).toContain(DOC);

    const listed = listOffline();
    expect(listed).toHaveLength(1);
    expect(listed[0].song.id).toBe("test-song");
    // A fresh read of the record is what a reload sees.
    expect(listOffline()[0].song.id).toBe("test-song");
  });

  test("a downloaded on-demand song comes back into a fresh library read", async () => {
    installEnvironment();
    stubFetch(happyHost());
    // A search result: its `from` is the capability URL that answered the query,
    // and no playlist will list it again once the results are gone.
    const searched = song({
      id: "search-hit",
      from: "https://songs.example/api/search?q=monkey",
    });

    await downloadSong(searched);

    // A reload reads the record from storage again, then the library merge adds
    // what nothing else lists.
    const reloaded = mergeOfflineSongs(
      [],
      listOffline().map((entry) => entry.song),
    );
    expect(reloaded.map((entry) => entry.id)).toEqual(["search-hit"]);
  });

  test("a mid-flight failure deletes everything the attempt wrote", async () => {
    const { cache } = installEnvironment();
    stubFetch(
      happyHost({ failing: (url) => url === "https://songs.example/guitar-expert.json" }),
    );

    const error = (await downloadSong(song()).catch((reason: unknown) => reason)) as Error;

    expect(error).toBeInstanceOf(OfflineError);
    expect((error as OfflineError).reason).toBe("failed");
    // The playlist and song document had already been written; the rollback takes
    // them with the chart that failed.
    expect(cache.entries.size).toBe(0);
    expect(listOffline()).toEqual([]);
  });

  test("QuotaExceededError maps to quota and rolls back", async () => {
    const { cache } = installEnvironment();
    let writes = 0;
    cache.beforePut = () => {
      writes += 1;
      if (writes === 2) {
        throw new DOMException("full", "QuotaExceededError");
      }
    };
    stubFetch(happyHost());

    const error = (await downloadSong(song()).catch((reason: unknown) => reason)) as Error;

    expect((error as OfflineError).reason).toBe("quota");
    // The first write (the playlist) is undone with the failed one.
    expect(cache.entries.size).toBe(0);
    expect(listOffline()).toEqual([]);
  });

  test("an existing download short-circuits with no fetch", async () => {
    installEnvironment();
    stubFetch(happyHost());
    await downloadSong(song());

    calls = [];
    const again = await downloadSong(song());

    expect(again.song.id).toBe("test-song");
    expect(calls).toEqual([]);
  });

  test("an optional art failure does not fail the song", async () => {
    const { cache } = installEnvironment();
    stubFetch(happyHost({ art: (url) => url.endsWith(".jpg") }));

    const entry = await downloadSong(song());

    expect(entry.song.id).toBe("test-song");
    expect(cache.entries.has("https://songs.example/guitar.ogg")).toBe(true);
    expect(cache.entries.has("https://songs.example/cover.jpg")).toBe(false);
    expect(entry.urls).not.toContain("https://songs.example/cover.jpg");
    expect(listOffline()).toHaveLength(1);
  });

  test("a cancelled signal maps to cancelled and rolls back", async () => {
    const { cache } = installEnvironment();
    stubFetch(happyHost());
    const controller = new AbortController();
    controller.abort();

    const error = (
      await downloadSong(song(), { signal: controller.signal }).catch(
        (reason: unknown) => reason,
      )
    ) as Error;

    expect((error as OfflineError).reason).toBe("cancelled");
    expect(cache.entries.size).toBe(0);
    expect(listOffline()).toEqual([]);
  });

  test("a javascript: or file: address is refused before any fetch", async () => {
    installEnvironment();
    stubFetch(happyHost());

    for (const url of ["javascript:alert(1)", "file:///tmp/song.json"]) {
      const error = (
        await downloadSong(song({ from: url, doc: url })).catch(
          (reason: unknown) => reason,
        )
      ) as Error;
      expect((error as OfflineError).reason).toBe("failed");
      expect(error.message).toMatch(/http:\/\/ and https:\/\//);
    }
    expect(calls).toEqual([]);
  });

  test("a document over the cap is refused and its partial writes are removed", async () => {
    const { cache } = installEnvironment();
    stubFetch((url) => {
      if (url === FROM) return jsonResponse({ schemaVersion: 1, songs: [] });
      // Never ends: only the cap can stop it, exactly as a hostile host would be.
      if (url === DOC) {
        return new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              controller.enqueue(new Uint8Array(64 * 1024).fill(0x20));
            },
          }),
        );
      }
      return new Response("", { status: 404 });
    });

    const error = (
      await downloadSong(song(), { idleMs: 1_000 }).catch(
        (reason: unknown) => reason,
      )
    ) as Error;

    expect((error as OfflineError).reason).toBe("failed");
    expect(error.message).toMatch(/8 MB/);
    expect(cache.entries.size).toBe(0);
    expect(listOffline()).toEqual([]);
  });

  test("a stalled body times out and rolls back", async () => {
    const { cache } = installEnvironment();
    stubFetch(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            // Accepts the connection and says nothing, forever.
            start() {},
          }),
        ),
    );

    const error = (
      await downloadSong(song(), { idleMs: 20 }).catch(
        (reason: unknown) => reason,
      )
    ) as Error;

    expect((error as OfflineError).reason).toBe("failed");
    expect(error.message).toMatch(/timed out/);
    expect(cache.entries.size).toBe(0);
    expect(listOffline()).toEqual([]);
  });

  test("a pinned song fetches its document once", async () => {
    installEnvironment();
    // A song from a link: the document URL is also the "playlist" it came from.
    const pinned = song({ from: DOC });
    stubFetch(happyHost());

    await downloadSong(pinned);

    const documentCalls = calls.filter((call) => call.url === DOC);
    expect(documentCalls).toHaveLength(1);
    expect(listOffline()).toHaveLength(1);
  });
});

describe("the one download, page-wide", () => {
  test("a second start while one is active is refused", async () => {
    installEnvironment();
    stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    expect(startDownload(song())).toBe(true);
    expect(startDownload(song({ id: "another" }))).toBe(false);

    // The job is already running for a reader that was not here when it started.
    expect(downloadState()).toMatchObject({ busy: true, busyId: "test-song" });

    cancelDownload();
    await settle();
    expect(downloadState().busy).toBe(false);
  });

  test("a reader that mounts late sees the active download", async () => {
    installEnvironment();
    stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    expect(startDownload(song())).toBe(true);
    let seen = 0;
    const unsubscribe = subscribeDownloads(() => {
      seen += 1;
    });
    expect(downloadState().busyId).toBe("test-song");

    // A progress tick reaches the new reader as well.
    await until(() => seen > 0 || downloadState().progress !== null);
    unsubscribe();
    cancelDownload();
    await settle();
  });

  test("remove and clear are refused while a download is running", async () => {
    installEnvironment();
    stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    expect(startDownload(song())).toBe(true);
    expect(removeDownload("test-song")).toBe(false);
    expect(clearDownloads()).toBe(false);

    cancelDownload();
    await settle();
  });

  test("cancel aborts the request and cleans up what was written", async () => {
    const { cache } = installEnvironment();
    stubFetch((url, init) => {
      if (url === FROM) return jsonResponse({ schemaVersion: 1, songs: [] });
      // Everything after the playlist hangs until the signal ends it.
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      });
    });

    expect(startDownload(song())).toBe(true);
    // The playlist has landed and the document is the request in flight.
    await until(() => calls.some((call) => call.url === DOC));

    cancelDownload();
    await settle();

    expect(downloadState().busy).toBe(false);
    expect(cache.entries.size).toBe(0);
    expect(listOffline()).toEqual([]);
  });
});
