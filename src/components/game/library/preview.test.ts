import { describe, expect, test } from "bun:test";
import type { Song } from "../../../lib/game/song";
import { resolvePreview, safeObjectUrl } from "./preview";

const SONG = { id: "one", doc: "https://host/songs/one.json" } as Song;

describe("resolvePreview", () => {
  test("a read that throws is no preview, not a rejected effect", async () => {
    const found = await resolvePreview(SONG, undefined, async () => {
      throw new Error("not a song document we can read");
    });
    expect(found).toBeNull();
  });

  test("a browser that refuses an object URL is no preview", async () => {
    const found = await resolvePreview(
      SONG,
      undefined,
      async () => ({ url: "folder://one/song.mp3", startMs: 0 }),
      async () => {
        throw new DOMException("refused", "NotSupportedError");
      },
    );
    expect(found).toBeNull();
  });

  test("a local file that cannot be read is no preview", async () => {
    const found = await resolvePreview(
      SONG,
      undefined,
      async () => ({ url: "folder://one/song.mp3", startMs: 0 }),
      async () => null,
    );
    expect(found).toBeNull();
  });

  test("a local clip is handed on as the object URL the element can use", async () => {
    const found = await resolvePreview(
      SONG,
      undefined,
      async () => ({ url: "folder://one/song.mp3", startMs: 1200 }),
      async () => "blob:new",
    );
    expect(found).toEqual({ url: "blob:new", startMs: 1200, object: true });
  });

  test("a preview already read out of a package is not read again", async () => {
    let asked = false;
    const read = { url: "blob:clip", startMs: 0, object: true };
    const found = await resolvePreview(SONG, undefined, async () => read, async () => {
      asked = true;
      return null;
    });
    expect(found).toBe(read);
    expect(asked).toBe(false);
  });

  test("a remote preview is its own answer", async () => {
    const read = { url: "https://host/one.mp3", startMs: 0 };
    const found = await resolvePreview(SONG, undefined, async () => read, async () => {
      throw new Error("a URL needs no object URL");
    });
    expect(found).toBe(read);
  });
});

describe("safeObjectUrl", () => {
  test("a refused creation is silence rather than a throw", () => {
    expect(
      safeObjectUrl(() => {
        throw new DOMException("refused", "NotSupportedError");
      }),
    ).toBeNull();
    expect(safeObjectUrl(() => "blob:ok")).toBe("blob:ok");
  });
});

describe("a remote song's document read", () => {
  test("carries the row's signal, so leaving the row aborts it", async () => {
    const realFetch = globalThis.fetch;
    const realIndexedDB = (globalThis as { indexedDB?: unknown }).indexedDB;
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
    let forwarded: AbortSignal | undefined;
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      forwarded = init?.signal ?? undefined;
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch;

    try {
      const controller = new AbortController();
      // Aborted before the read: a signal that reaches the request at all is a
      // signal `cachedJson` was given, which is what leaving the row does.
      controller.abort();
      await resolvePreview(SONG, controller.signal);
      expect(forwarded?.aborted).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
      if (realIndexedDB === undefined) {
        delete (globalThis as { indexedDB?: unknown }).indexedDB;
      } else {
        (globalThis as { indexedDB?: unknown }).indexedDB = realIndexedDB;
      }
    }
  });
});
