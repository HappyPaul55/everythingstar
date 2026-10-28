import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cacheKey } from "../../../lib/game/cache";
import {
  IDLE_TIMEOUT_MS,
  MAX_DOCUMENT_BYTES,
  MAX_PACKAGE_BYTES,
} from "../../../lib/game/fetchLimits";
import {
  cachedJson,
  coalesce,
  fetchBounded,
  fetchBytes,
  fetchJson,
  loadSources,
  readCache,
  writeCache,
} from "./store";

/**
 * The fetch boundary, without a browser in the loop.
 *
 * Every test stubs `fetch` with a `Response` whose body really is a stream, so the
 * cap is exercised the way a hostile host would exercise it — chunk by chunk —
 * rather than by an `arrayBuffer()` that has already buffered everything.
 */

const encoder = new TextEncoder();
const realFetch = globalThis.fetch;
const realIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;

interface Call {
  url: string;
  init: RequestInit | undefined;
}

let calls: Call[] = [];

function stub(reply: () => Response | Promise<Response>): void {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(reply());
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realIndexedDB === undefined) {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  } else {
    (globalThis as { indexedDB?: unknown }).indexedDB = realIndexedDB;
  }
});

/** A body that arrives in chunks, of exactly `bytes` length. */
function streamOf(
  bytes: Uint8Array,
  chunk = 64 * 1024,
  onCancel?: () => void,
): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(at + chunk, bytes.byteLength);
      controller.enqueue(bytes.subarray(at, end));
      at = end;
    },
    cancel() {
      onCancel?.();
    },
  });
}

/** Valid JSON of exactly `size` bytes: the document, then trailing whitespace. */
function jsonBody(size: number): Uint8Array {
  const bytes = new Uint8Array(size).fill(0x20);
  bytes.set(encoder.encode('{"ok":true}'));
  return bytes;
}

function responseOf(bytes: Uint8Array, init: ResponseInit = {}): Response {
  return new Response(streamOf(bytes), init);
}

describe("fetchJson", () => {
  test("reads a body under the cap", async () => {
    stub(() => responseOf(jsonBody(1024)));
    await expect(fetchJson("https://example.com/playlist.json")).resolves.toEqual({
      ok: true,
    });
    expect(calls[0]?.url).toBe("https://example.com/playlist.json");
  });

  test("a body exactly at the cap is read", async () => {
    stub(() => responseOf(jsonBody(MAX_DOCUMENT_BYTES)));
    await expect(fetchJson("https://example.com/big.json")).resolves.toEqual({ ok: true });
  });

  test("a stream one byte over the cap is dropped, not buffered", async () => {
    let cancelled = false;
    // The body never ends: the cap is the only thing that can stop it.
    stub(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              controller.enqueue(new Uint8Array(64 * 1024).fill(0x20));
            },
            cancel() {
              cancelled = true;
            },
          }),
        ),
    );
    await expect(fetchJson("https://example.com/huge.json")).rejects.toThrow(/8 MB/);
    // The connection is dropped rather than left to finish downloading.
    expect(cancelled).toBe(true);
    expect((calls[0]?.init?.signal as AbortSignal | undefined)?.aborted).toBe(true);
  });

  test("a declared length that is honest or larger than the body still reads it", async () => {
    stub(() => responseOf(jsonBody(64), { headers: { "content-length": "64" } }));
    await expect(fetchJson("https://example.com/known.json")).resolves.toEqual({ ok: true });
    // A length is a hint for the allocation, not the answer: trailing room is dropped.
    stub(() => responseOf(jsonBody(64), { headers: { "content-length": "512" } }));
    await expect(fetchJson("https://example.com/roomy.json")).resolves.toEqual({ ok: true });
  });

  test("a lying Content-Length does not get a body past the cap", async () => {
    stub(
      () =>
        responseOf(jsonBody(MAX_DOCUMENT_BYTES + 1), {
          headers: { "content-length": "11" },
        }),
    );
    await expect(fetchJson("https://example.com/lying.json")).rejects.toThrow(/8 MB/);
  });

  test("a declared length over the cap is refused before the body is read", async () => {
    let cancelled = false;
    stub(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              controller.enqueue(encoder.encode("{}"));
              controller.close();
            },
            cancel() {
              cancelled = true;
            },
          }),
          { headers: { "content-length": String(MAX_DOCUMENT_BYTES + 1) } },
        ),
    );
    await expect(fetchJson("https://example.com/declared.json")).rejects.toThrow(/8 MB/);
    expect(cancelled).toBe(true);
  });

  test("a redirect to a scheme we would not fetch is refused", async () => {
    let cancelled = false;
    stub(() => {
      const response = new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.enqueue(encoder.encode("{}"));
            controller.close();
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
      Object.defineProperty(response, "url", { value: "javascript:alert(1)" });
      return response;
    });
    await expect(fetchJson("https://example.com/redirect.json")).rejects.toThrow(
      /redirected/,
    );
    expect(cancelled).toBe(true);
  });

  test("a non-http address never reaches fetch", async () => {
    stub(() => responseOf(jsonBody(2)));
    for (const url of [
      "javascript:alert(1)",
      "data:application/json,{}",
      "file:///tmp/playlist.json",
      "blob:https://example.com/2f8c",
      "/playlist.json",
    ]) {
      await expect(fetchJson(url)).rejects.toThrow(/http:\/\/ and https:\/\//);
    }
    expect(calls).toEqual([]);
  });

  test("a bad status is an ordinary Error with the code in it", async () => {
    stub(() => new Response("nope", { status: 404, statusText: "Not Found" }));
    await expect(fetchJson("https://example.com/gone.json")).rejects.toThrow(
      "404 Not Found",
    );
  });

  test("a caller already aborted is handled without an unhandled fetch", async () => {
    stub(
      () =>
        new Promise<Response>((_, reject) => {
          setTimeout(() => reject(new DOMException("aborted", "AbortError")), 0);
        }),
    );
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchBounded("https://example.com/song.json", {
        fresh: false,
        signal: controller.signal,
        limit: MAX_DOCUMENT_BYTES,
        what: "This document",
      }),
    ).rejects.toBeDefined();
  });

  test("the caller's signal aborts the request", async () => {
    let signal: AbortSignal | undefined;
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;

    const controller = new AbortController();
    const pending = fetchJson("https://example.com/slow.json", false, controller.signal);
    controller.abort();
    expect(signal?.aborted).toBe(true);
    pending.catch(() => undefined);
  });
});

describe("the idle deadline", () => {
  test("the production deadline is thirty seconds", () => {
    expect(IDLE_TIMEOUT_MS).toBe(30_000);
  });

  test("a body that stops arriving is dropped as a timeout", async () => {
    let cancelled = false;
    stub(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            // Accepts the connection, then says nothing at all.
            start() {},
            cancel() {
              cancelled = true;
            },
          }),
        ),
    );
    await expect(
      fetchBounded("https://example.com/stall.json", {
        fresh: false,
        limit: MAX_DOCUMENT_BYTES,
        what: "This document",
        idleMs: 20,
      }),
    ).rejects.toThrow("This document timed out, so it was not read.");
    // The connection is dropped, not merely ignored.
    expect(cancelled).toBe(true);
    expect((calls[0]?.init?.signal as AbortSignal | undefined)?.aborted).toBe(true);
  });

  test("a request whose headers never arrive is dropped too", async () => {
    globalThis.fetch = (() =>
      new Promise<Response>(() => undefined)) as unknown as typeof fetch;
    await expect(
      fetchBounded("https://example.com/silent.json", {
        fresh: false,
        limit: MAX_DOCUMENT_BYTES,
        what: "This .sng package",
        idleMs: 20,
      }),
    ).rejects.toThrow("This .sng package timed out, so it was not read.");
  });

  test("a live body still reads with the deadline on", async () => {
    stub(() => responseOf(jsonBody(64)));
    const bytes = await fetchBounded("https://example.com/live.json", {
      fresh: false,
      limit: MAX_DOCUMENT_BYTES,
      what: "This document",
      idleMs: 1000,
    });
    expect(new TextDecoder().decode(bytes)).toBe(new TextDecoder().decode(jsonBody(64)));
  });

  test("a caller's abort is not reported as a timeout", async () => {
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted.", "AbortError")),
          { once: true },
        );
      });
    }) as typeof fetch;

    const controller = new AbortController();
    const pending = fetchBounded("https://example.com/slow.json", {
      fresh: false,
      limit: MAX_DOCUMENT_BYTES,
      what: "This document",
      idleMs: 1000,
      signal: controller.signal,
    });
    controller.abort();
    const error = (await pending.catch((reason: unknown) => reason)) as Error;
    expect(error.name).toBe("AbortError");
    expect(error.message).not.toMatch(/timed out/);
  });
});

describe("fetchBytes", () => {
  test("reads a package and hands back its bytes once", async () => {
    const bytes = encoder.encode("SNGPKG a tiny package");
    stub(() => responseOf(bytes));
    const read = await fetchBytes("https://example.com/song.sng");
    expect([...read]).toEqual([...bytes]);
  });

  test("refuses a package whose declared length is over its cap", async () => {
    stub(() =>
      responseOf(encoder.encode("SNGPKG"), {
        headers: { "content-length": String(MAX_PACKAGE_BYTES + 1) },
      }),
    );
    await expect(fetchBytes("https://example.com/song.sng")).rejects.toThrow(/128 MB/);
  });

  test("applies the same URL policy as a document", async () => {
    stub(() => responseOf(encoder.encode("SNGPKG")));
    await expect(fetchBytes("javascript:alert(1)")).rejects.toThrow(
      /http:\/\/ and https:\/\//,
    );
    expect(calls).toEqual([]);
  });

  test("refuses a package address that carries credentials", async () => {
    stub(() => responseOf(encoder.encode("SNGPKG")));
    await expect(
      fetchBytes("https://user:pass@example.com/song.sng"),
    ).rejects.toThrow(/http:\/\/ and https:\/\//);
    expect(calls).toEqual([]);
  });
});

describe("coalesce", () => {
  test("a burst of requests shares one run, and a request during a run adds one more", async () => {
    let runs = 0;
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const run = coalesce(() => {
      runs++;
      active++;
      peak = Math.max(peak, active);
      return new Promise<void>((resolve) => {
        releases.push(() => {
          active--;
          resolve();
        });
      });
    });

    const first = run();
    const second = run();
    const third = run();
    expect(runs).toBe(1);

    // Both requests that arrived during the pass ask for one more, not one each.
    releases[0]?.();
    await Promise.resolve();
    expect(runs).toBe(2);
    expect(peak).toBe(1);

    releases[1]?.();
    await Promise.all([first, second, third]);
    expect(runs).toBe(2);
    expect(peak).toBe(1);

    // An idle helper starts a fresh pass when asked again.
    const fourth = run();
    expect(runs).toBe(3);
    releases[2]?.();
    await fourth;
  });
});

/**
 * The smallest IndexedDB that answers what `store.ts` asks: an open that can be
 * blocked once, and stores whose `get`/`getAllKeys` answer from a map.
 *
 * A real second tab cannot be opened in a unit test, and the memoised open is the
 * thing under test — so this fake is the blocked tab, in as little code as the
 * store's own calls need.
 */
interface FakeRequest {
  result?: unknown;
  onsuccess?: () => void;
  onerror?: () => void;
  onblocked?: () => void;
  onupgradeneeded?: () => void;
}

/**
 * The smallest database the store's calls need: stores whose `get`, `getAll`,
 * `getAllKeys`, `put`, `delete` and `clear` answer from a map.
 *
 * Every answer settles in a microtask and completes its transaction, so the store's
 * `oncomplete` handlers run exactly as they would after a real commit.
 */
function fakeDatabase(
  records: Map<string, unknown>,
  onClose?: () => void,
): IDBDatabase {
  const database = {
    onversionchange: null as (() => void) | null,
    close() {
      onClose?.();
    },
    transaction() {
      const transaction = {
        objectStore(name: string) {
          const keyOf = (key: string) => `${name}:${key}`;
          const settle = (fill: (request: FakeRequest) => void) => {
            const request: FakeRequest = {};
            queueMicrotask(() => {
              fill(request);
              request.onsuccess?.();
              transaction.oncomplete?.();
            });
            return request;
          };
          return {
            get(key: string) {
              return settle((request) => {
                request.result = records.get(keyOf(key));
              });
            },
            getAll() {
              return settle((request) => {
                const prefix = `${name}:`;
                request.result = [...records.entries()]
                  .filter(([key]) => key.startsWith(prefix))
                  .map(([, value]) => value);
              });
            },
            getAllKeys() {
              return settle((request) => {
                const prefix = `${name}:`;
                request.result = [...records.keys()]
                  .filter((key) => key.startsWith(prefix))
                  .map((key) => key.slice(prefix.length));
              });
            },
            put(value: unknown, key: string) {
              return settle((request) => {
                records.set(keyOf(key), value);
                request.result = key;
              });
            },
            delete(key: string) {
              return settle(() => {
                records.delete(keyOf(key));
              });
            },
            clear() {
              return settle(() => {
                const prefix = `${name}:`;
                for (const key of records.keys()) {
                  if (key.startsWith(prefix)) records.delete(key);
                }
              });
            },
          };
        },
        oncomplete: undefined as (() => void) | undefined,
        onerror: undefined as (() => void) | undefined,
        onabort: undefined as (() => void) | undefined,
      };
      return transaction;
    },
  };
  return database as unknown as IDBDatabase;
}

describe("the cache's storage", () => {
  const records = new Map<string, unknown>();
  const opened: Array<{ onversionchange: (() => void) | null; close: () => void }> = [];
  let closed = 0;
  let blockFirstOpen = false;
  let openCalls = 0;

  beforeEach(() => {
    openCalls = 0;
    blockFirstOpen = false;
    closed = 0;
    (globalThis as { indexedDB?: unknown }).indexedDB = {
      open() {
        openCalls++;
        const request: FakeRequest = {};
        const blocked = blockFirstOpen && openCalls === 1;
        queueMicrotask(() => {
          if (blocked) {
            request.onblocked?.();
            return;
          }
          const database = fakeDatabase(records, () => {
            closed++;
          });
          opened.push(database as unknown as (typeof opened)[number]);
          request.result = database;
          request.onsuccess?.();
        });
        return request;
      },
    };
  });

  test("a blocked open that succeeds late is closed rather than leaked", async () => {
    let late: FakeRequest | null = null;
    (globalThis as { indexedDB?: unknown }).indexedDB = {
      open() {
        openCalls++;
        const request: FakeRequest = {};
        late = request;
        queueMicrotask(() => request.onblocked?.());
        return request;
      },
    };

    await expect(loadSources()).resolves.toBeNull();
    // The blocking tab closed a moment later, and the browser handed the connection
    // over after all: nobody is waiting for it, so it is closed.
    late!.result = fakeDatabase(records, () => {
      closed++;
    });
    late!.onsuccess?.();
    expect(closed).toBe(1);
  });

  test("a blocked open is retried once the blocker goes", async () => {
    records.set("sources:playlists", { urls: ["https://example.com/list.json"] });
    blockFirstOpen = true;

    // The first open is blocked: no cache, and no failure either.
    await expect(loadSources()).resolves.toBeNull();
    expect(openCalls).toBe(1);

    // The blocking tab has gone, so the next call may open the database after all.
    await expect(loadSources()).resolves.toEqual(["https://example.com/list.json"]);
    expect(openCalls).toBe(2);
  });

  test("a version change closes the connection and the next call opens again", async () => {
    // The connection the tests above opened is the memoised one.
    const open = opened.at(-1);
    expect(open).toBeDefined();

    // Another tab is bumping the schema: this connection cannot be used any more,
    // and the memo must not hand it out again.
    open!.onversionchange?.();
    expect(closed).toBe(1);

    await loadSources();
    expect(openCalls).toBe(1);
  });

  test("a malformed body is not served", async () => {
    // The open above is memoised by now; this only needs the stores to answer.
    const url = "https://example.com/malformed.json";
    const key = cacheKey(url);
    // A record that looks like an entry but has no body: the weaker inline check
    // this replaces would have handed it back.
    records.set(`cache:${key}`, { url, kind: "song", at: 1, size: 3 });
    // A matching metadata record, so the one-time index rebuild is not what answers.
    records.set(`cache-meta:${key}`, { key, url, kind: "song", at: 1, size: 3 });

    await expect(readCache(url)).resolves.toBeNull();
  });

  test("a pinned song's revision is written beside its body, so the next read hits", async () => {
    const url = "https://example.com/songs/pinned.json";
    const doc = { id: "pinned", title: "Pinned" };
    stub(() => responseOf(encoder.encode(JSON.stringify(doc))));

    // `usePinned` reads the document with no revision (it does not know one yet)…
    await expect(cachedJson(url, "song", false)).resolves.toEqual(doc);
    // …then writes the content hash beside it, exactly as the hook now does.
    await writeCache(url, "song", doc, "content-hash");
    expect(calls).toHaveLength(1);

    // The band's load and the jukebox's preview read it with that revision: a hit,
    // not a refetch, which is what makes a pinned song playable offline.
    await expect(cachedJson(url, "song", false, "content-hash")).resolves.toEqual(doc);
    expect(calls).toHaveLength(1);
  });

  test("a null document is never written, and is never served as a copy", async () => {
    const url = "https://example.com/no-song.json";
    stub(() => responseOf(encoder.encode("null")));

    await expect(cachedJson(url, "song")).resolves.toBeNull();
    expect(calls).toHaveLength(1);
    // Nothing landed: no body to serve, and no metadata either.
    await expect(readCache(url)).resolves.toBeNull();
    expect(records.has(`cache-meta:${cacheKey(url)}`)).toBe(false);

    // The next read asks the network again rather than showing the null for ever.
    await expect(cachedJson(url, "song")).resolves.toBeNull();
    expect(calls).toHaveLength(2);
  });
});
