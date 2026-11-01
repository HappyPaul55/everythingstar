import { describe, expect, test } from "bun:test";
import { OFFLINE_CACHE, SHELL_CACHE_PREFIX } from "./cache";
import {
  createWorker,
  fromCache,
  pageKey,
  type CacheKey,
  type FetchContext,
  type ShellCache,
  type ShellCaches,
} from "./worker";

const ORIGIN = "https://everythingstar.test";
const SHELL = `${SHELL_CACHE_PREFIX}20261026T120000000Z-v2`;
const OLDER = `${SHELL_CACHE_PREFIX}20261025T120000000Z-v1`;
const OLDEST = `${SHELL_CACHE_PREFIX}20261024T120000000Z-v0`;

/* ------------------------------------------------------------------ fakes */

function keyOf(key: CacheKey): string {
  if (typeof key === "string") return new URL(key, ORIGIN).href;
  if (key instanceof URL) return key.href;
  return key.url;
}

/** A Cache whose whole body is a map, and whose writes can be made to fail. */
class FakeCache implements ShellCache {
  readonly entries = new Map<string, Response>();
  putFails = false;
  putCount = 0;

  async match(key: CacheKey): Promise<Response | undefined> {
    return this.entries.get(keyOf(key))?.clone();
  }

  async put(key: CacheKey, response: Response): Promise<void> {
    this.putCount += 1;
    if (this.putFails) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    this.entries.set(keyOf(key), response.clone());
  }

  has(key: CacheKey): boolean {
    return this.entries.has(keyOf(key));
  }
}

class FakeCaches implements ShellCaches {
  readonly buckets = new Map<string, FakeCache>();

  async open(name: string): Promise<FakeCache> {
    let bucket = this.buckets.get(name);
    if (!bucket) {
      bucket = new FakeCache();
      this.buckets.set(name, bucket);
    }
    return bucket;
  }

  async keys(): Promise<string[]> {
    return [...this.buckets.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.buckets.delete(name);
  }
}

interface Network {
  fetch(request: Request): Promise<Response>;
  /** Every URL the worker asked the network for, in order. */
  calls: string[];
}

function network(answer: (request: Request) => Response | Promise<Response>): Network {
  const calls: string[] = [];
  return {
    calls,
    async fetch(request) {
      calls.push(request.url);
      return answer(request);
    },
  };
}

function offline(): Network {
  return network(() => {
    throw new TypeError("Failed to fetch");
  });
}

/** A response as `fetch` would hand it over: with the URL it landed on. */
function responseAt(
  url: string,
  body: string,
  init: ResponseInit & { redirected?: boolean } = {},
): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, "url", { value: url, configurable: true });
  Object.defineProperty(response, "redirected", {
    value: init.redirected ?? false,
    configurable: true,
  });
  return response;
}

function build(
  options: {
    caches?: FakeCaches;
    net?: Network;
    shell?: string;
    urls?: readonly string[];
  } = {},
) {
  const caches = options.caches ?? new FakeCaches();
  const net = options.net ?? offline();
  const worker = createWorker({
    origin: ORIGIN,
    shellCache: options.shell ?? SHELL,
    precacheUrls: options.urls ?? [],
    caches,
    fetch: (request) => net.fetch(request),
  });
  return { worker, caches, net };
}

function fetchContext(url: string, init?: RequestInit) {
  const work: Promise<unknown>[] = [];
  const context: FetchContext = {
    request: new Request(url, init),
    waitUntil: (promise) => {
      work.push(promise);
    },
  };
  return { context, work };
}

async function read(cache: ShellCache, key: CacheKey): Promise<string> {
  const found = await cache.match(key);
  return found ? found.text() : "";
}

/* -------------------------------------------------------------- navigation */

describe("navigated", () => {
  test("serves a current-generation page, then refreshes it in the background", async () => {
    const caches = new FakeCaches();
    const current = await caches.open(SHELL);
    await current.put("/play.html", responseAt(`${ORIGIN}/play.html`, "cached page"));

    const net = offline();
    const { worker } = build({ caches, net });
    const { context, work } = fetchContext(`${ORIGIN}/play`);

    const response = await worker.navigated(context);
    expect(await response.text()).toBe("cached page");
    // Stale-while-revalidate: the refresh is asked for even though the cache won.
    expect(net.calls).toEqual([`${ORIGIN}/play`]);
    await Promise.all(work);
  });

  test("promotes a page from a kept generation into the current one", async () => {
    const caches = new FakeCaches();
    const oldest = await caches.open(OLDEST);
    await oldest.put("/play.html", responseAt(`${ORIGIN}/play.html`, "oldest kept"));
    const older = await caches.open(OLDER);
    await older.put("/play.html", responseAt(`${ORIGIN}/play.html`, "newest kept"));

    const { worker } = build({ caches });
    const { context, work } = fetchContext(`${ORIGIN}/play`);

    const response = await worker.navigated(context);
    // Newest generation first: the page asks for a chunk of the build it was served.
    expect(await response.text()).toBe("newest kept");

    const current = await caches.open(SHELL);
    expect(await read(current, "/play.html")).toBe("newest kept");
    // The older generations are still there for other chunks.
    expect(oldest.has("/play.html")).toBe(true);
    await Promise.all(work);
  });

  test("a page from a kept generation still answers when the promotion cannot be stored", async () => {
    const caches = new FakeCaches();
    const older = await caches.open(OLDER);
    await older.put("/play.html", responseAt(`${ORIGIN}/play.html`, "kept page"));
    const current = await caches.open(SHELL);
    current.putFails = true;

    const { worker } = build({ caches });
    const { context, work } = fetchContext(`${ORIGIN}/play`);

    const response = await worker.navigated(context);
    expect(await response.text()).toBe("kept page");
    await Promise.all(work);
  });

  test("a failed cache write still returns the fetched page", async () => {
    const caches = new FakeCaches();
    const current = await caches.open(SHELL);
    current.putFails = true;

    const net = network((request) => responseAt(request.url, "fresh page"));
    const { worker } = build({ caches, net });
    const { context } = fetchContext(`${ORIGIN}/play`);

    const response = await worker.navigated(context);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("fresh page");
    expect(current.entries.size).toBe(0);
  });

  test("a fresh page is cached under the file key its route maps to", async () => {
    const caches = new FakeCaches();
    const current = await caches.open(SHELL);

    const net = network(() => responseAt(`${ORIGIN}/play`, "fresh page"));
    const { worker } = build({ caches, net });
    const { context, work } = fetchContext(`${ORIGIN}/play`);

    const response = await worker.navigated(context);
    expect(await response.text()).toBe("fresh page");
    expect(await read(current, "/play.html")).toBe("fresh page");
    await Promise.all(work);
  });

  test("a navigation from another origin is never stored as one of our pages", async () => {
    const caches = new FakeCaches();
    const current = await caches.open(SHELL);

    const net = network(() => responseAt("https://elsewhere.test/index.html", "another site"));
    const { worker } = build({ caches, net });
    const { context } = fetchContext("https://elsewhere.test/index.html");

    const response = await worker.navigated(context);
    expect(await response.text()).toBe("another site");
    expect(current.has("/index.html")).toBe(false);
    expect(current.entries.size).toBe(0);
  });

  test("a redirect to another origin is not stored under the game's front page", async () => {
    const caches = new FakeCaches();
    const current = await caches.open(SHELL);

    const net = network(() =>
      responseAt("https://elsewhere.test/index.html", "captive portal", {
        redirected: true,
      }),
    );
    const { worker } = build({ caches, net });
    const { context, work } = fetchContext(`${ORIGIN}/play`);

    const response = await worker.navigated(context);
    expect(await response.text()).toBe("captive portal");
    expect(current.has("/index.html")).toBe(false);
    expect(current.has("/play.html")).toBe(false);
    expect(current.entries.size).toBe(0);
    await Promise.all(work);
  });

  test("a redirect that stays inside is stored under the page it landed on", async () => {
    const caches = new FakeCaches();
    const current = await caches.open(SHELL);

    const net = network(() =>
      responseAt(`${ORIGIN}/app.html`, "the installed game", { redirected: true }),
    );
    const { worker } = build({ caches, net });
    const { context, work } = fetchContext(`${ORIGIN}/play`);

    const response = await worker.navigated(context);
    await response.text();
    expect(await read(current, "/app.html")).toBe("the installed game");
    expect(current.has("/play.html")).toBe(false);
    await Promise.all(work);
  });

  test("an unknown path is answered by the network, never by the game page", async () => {
    const caches = new FakeCaches();
    const current = await caches.open(SHELL);
    await current.put("/app.html", responseAt(`${ORIGIN}/app.html`, "the game"));

    const net = network(() => responseAt(`${ORIGIN}/plya`, "no such page", { status: 404 }));
    const { worker } = build({ caches, net });
    const { context, work } = fetchContext(`${ORIGIN}/plya`);

    const response = await worker.navigated(context);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("no such page");
    expect(net.calls).toEqual([`${ORIGIN}/plya`]);
    await Promise.all(work);
  });

  test("an unknown path offline is a plain 404, not the game page", async () => {
    const caches = new FakeCaches();
    const current = await caches.open(SHELL);
    await current.put("/app.html", responseAt(`${ORIGIN}/app.html`, "the game"));

    const { worker } = build({ caches });
    const { context, work } = fetchContext(`${ORIGIN}/plya`);

    const response = await worker.navigated(context);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found.");
    await Promise.all(work);
  });

  test("/robots.txt reaches the network", async () => {
    const caches = new FakeCaches();
    const current = await caches.open(SHELL);
    await current.put("/app.html", responseAt(`${ORIGIN}/app.html`, "the game"));

    const net = network(() =>
      responseAt(`${ORIGIN}/robots.txt`, "User-agent: *", {
        headers: { "content-type": "text/plain" },
      }),
    );
    const { worker } = build({ caches, net });
    const { context } = fetchContext(`${ORIGIN}/robots.txt`);

    const response = await worker.navigated(context);
    expect(await response.text()).toBe("User-agent: *");
    expect(net.calls).toEqual([`${ORIGIN}/robots.txt`]);
  });

  test("a known page offline falls back to its own cached copy", async () => {
    const caches = new FakeCaches();
    const current = await caches.open(SHELL);
    await current.put("/privacy.html", responseAt(`${ORIGIN}/privacy.html`, "the privacy page"));

    const { worker } = build({ caches });
    const { context, work } = fetchContext(`${ORIGIN}/privacy`);

    const response = await worker.navigated(context);
    expect(await response.text()).toBe("the privacy page");
    await Promise.all(work);
  });

  test("a known page with no copy of its own offline falls back to the shell", async () => {
    const caches = new FakeCaches();
    const current = await caches.open(SHELL);
    await current.put("/app.html", responseAt(`${ORIGIN}/app.html`, "the installed game"));

    const { worker } = build({ caches });
    const { context, work } = fetchContext(`${ORIGIN}/privacy`);

    const response = await worker.navigated(context);
    expect(await response.text()).toBe("the installed game");
    await Promise.all(work);
  });

  test("a known page with nothing installed says so rather than serving a 404", async () => {
    const { worker } = build();
    const { context } = fetchContext(`${ORIGIN}/privacy`);

    const response = await worker.navigated(context);
    expect(response.status).toBe(503);
  });
});

/* ------------------------------------------------------------- shell files */

describe("shell", () => {
  test("serves an asset from the current generation without the network", async () => {
    const caches = new FakeCaches();
    const current = await caches.open(SHELL);
    const url = `${ORIGIN}/_astro/app.js`;
    await current.put(url, responseAt(url, "console.log(1)"));

    const net = offline();
    const { worker } = build({ caches, net });

    const response = await worker.shell(new Request(url));
    expect(await response.text()).toBe("console.log(1)");
    expect(net.calls).toEqual([]);
  });

  test("promotes an asset from a kept generation", async () => {
    const caches = new FakeCaches();
    const older = await caches.open(OLDER);
    const url = `${ORIGIN}/_astro/old-chunk.js`;
    await older.put(url, responseAt(url, "old chunk"));

    const { worker } = build({ caches });
    const response = await worker.shell(new Request(url));
    expect(await response.text()).toBe("old chunk");

    const current = await caches.open(SHELL);
    expect(await read(current, url)).toBe("old chunk");
  });

  test("a failed cache write still returns the fetched asset", async () => {
    const caches = new FakeCaches();
    const current = await caches.open(SHELL);
    current.putFails = true;

    const url = `${ORIGIN}/_astro/app.js`;
    const net = network((request) => responseAt(request.url, "console.log(2)"));
    const { worker } = build({ caches, net });

    const response = await worker.shell(new Request(url));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("console.log(2)");
    expect(current.entries.size).toBe(0);
  });

  test("a byte range is fetched but never stored", async () => {
    const caches = new FakeCaches();
    const current = await caches.open(SHELL);
    const url = `${ORIGIN}/audio/click.ogg`;
    const net = network(() => responseAt(url, "half", { status: 206 }));

    const { worker } = build({ caches, net });
    const request = new Request(url, { headers: { range: "bytes=0-3" } });
    const response = await worker.shell(request);

    expect(response.status).toBe(206);
    expect(await response.text()).toBe("half");
    expect(current.entries.size).toBe(0);
  });
});

/* ---------------------------------------------------------- downloaded songs */

describe("saved", () => {
  const url = `${ORIGIN}/songs/song.json`;

  test("JSON is network-first and the cache follows the network", async () => {
    const caches = new FakeCaches();
    const bucket = await caches.open(OFFLINE_CACHE);
    await bucket.put(url, new Response('{"revision":1}'));

    const net = network(() => new Response('{"revision":2}'));
    const { worker } = build({ caches, net });

    const response = await worker.saved(new Request(url));
    expect(await response.json()).toEqual({ revision: 2 });
    expect(await read(bucket, url)).toBe('{"revision":2}');
  });

  test("a refreshed JSON is still the answer when the bucket is full", async () => {
    const caches = new FakeCaches();
    const bucket = await caches.open(OFFLINE_CACHE);
    await bucket.put(url, new Response('{"revision":1}'));
    bucket.putFails = true;

    const net = network(() => new Response('{"revision":2}'));
    const { worker } = build({ caches, net });

    const response = await worker.saved(new Request(url));
    expect(response.status).toBe(200);
    // The fresh body is what the page asked for; the failed write is only a
    // missed refresh, never a network error for a 200.
    expect(await response.json()).toEqual({ revision: 2 });
    expect(bucket.putCount).toBeGreaterThan(0);
    expect(await read(bucket, url)).toBe('{"revision":1}');
  });

  test("JSON falls back to the cached copy offline", async () => {
    const caches = new FakeCaches();
    const bucket = await caches.open(OFFLINE_CACHE);
    await bucket.put(
      url,
      new Response('{"revision":1}', { headers: { "content-type": "application/json" } }),
    );

    const { worker } = build({ caches });
    const response = await worker.saved(new Request(url));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision: 1 });
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  test("a URL that is not in the bucket is simply the network's", async () => {
    const net = network((request) => responseAt(request.url, "streamed", { status: 200 }));
    const { worker } = build({ net });

    const response = await worker.saved(new Request(`${ORIGIN}/audio/stem.ogg`));
    expect(await response.text()).toBe("streamed");
    expect(net.calls).toEqual([`${ORIGIN}/audio/stem.ogg`]);
  });

  test("a captive portal's page does not replace the saved document", async () => {
    const caches = new FakeCaches();
    const bucket = await caches.open(OFFLINE_CACHE);
    await bucket.put(
      url,
      new Response('{"revision":1}', { headers: { "content-type": "application/json" } }),
    );

    const net = network(
      () =>
        new Response("<!DOCTYPE html><title>Sign in</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );
    const { worker } = build({ caches, net });

    const response = await worker.saved(new Request(url));
    expect(await response.json()).toEqual({ revision: 1 });
    expect(await read(bucket, url)).toBe('{"revision":1}');
  });

  test("a provider's error keeps the copy the player already has", async () => {
    const caches = new FakeCaches();
    const bucket = await caches.open(OFFLINE_CACHE);
    await bucket.put(
      url,
      new Response('{"revision":1}', { headers: { "content-type": "application/json" } }),
    );

    const net = network(
      () =>
        new Response('{"error":"down"}', {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
    );
    const { worker } = build({ caches, net });

    const response = await worker.saved(new Request(url));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision: 1 });
    expect(await read(bucket, url)).toBe('{"revision":1}');
  });

  test("a saved JSON document is refreshed even from a path with no .json", async () => {
    const path = `${ORIGIN}/songs/abc`;
    const caches = new FakeCaches();
    const bucket = await caches.open(OFFLINE_CACHE);
    await bucket.put(
      path,
      new Response('{"revision":1}', { headers: { "content-type": "application/json" } }),
    );

    const net = network(
      () =>
        new Response('{"revision":2}', {
          headers: { "content-type": "application/json" },
        }),
    );
    const { worker } = build({ caches, net });

    const response = await worker.saved(new Request(path));
    expect(await response.json()).toEqual({ revision: 2 });
    expect(await read(bucket, path)).toBe('{"revision":2}');
  });

  test("a text/plain document is refreshed, because that is how GitHub raw serves one", async () => {
    // The seeded FOSS playlist and its documents come from raw.githubusercontent.com,
    // which answers every `.json` as `text/plain; charset=utf-8`.
    const caches = new FakeCaches();
    const bucket = await caches.open(OFFLINE_CACHE);
    await bucket.put(
      url,
      new Response('{"revision":1}', {
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
    );

    const net = network(
      () =>
        new Response('{"revision":2}', {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
    );
    const { worker } = build({ caches, net });

    const response = await worker.saved(new Request(url));
    expect(await response.json()).toEqual({ revision: 2 });
    expect(await read(bucket, url)).toBe('{"revision":2}');
  });

  test("a text/plain body that is not JSON keeps the saved copy", async () => {
    const caches = new FakeCaches();
    const bucket = await caches.open(OFFLINE_CACHE);
    await bucket.put(
      url,
      new Response('{"revision":1}', { headers: { "content-type": "application/json" } }),
    );

    const net = network(
      () =>
        new Response("<!DOCTYPE html><title>Sign in</title>", {
          headers: { "content-type": "text/plain" },
        }),
    );
    const { worker } = build({ caches, net });

    const response = await worker.saved(new Request(url));
    expect(await response.json()).toEqual({ revision: 1 });
    expect(await read(bucket, url)).toBe('{"revision":1}');
  });
});

/* -------------------------------------------------------------- fromCache */

describe("fromCache", () => {
  const url = `${ORIGIN}/audio/stem.ogg`;

  function cached(): Response {
    return new Response("0123456789", {
      status: 200,
      headers: {
        "content-type": "audio/ogg",
        "access-control-allow-origin": "https://cdn.test",
        "access-control-expose-headers": "Content-Range",
      },
    });
  }

  test("a plain GET is the whole body with its CORS headers", async () => {
    const response = await fromCache(new Request(url), cached());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://cdn.test");
    expect(response.headers.get("access-control-expose-headers")).toBe("Content-Range");
    expect(await response.text()).toBe("0123456789");
  });

  test("a byte range is a 206 that still carries the CORS headers", async () => {
    const request = new Request(url, { headers: { range: "bytes=2-5" } });
    const response = await fromCache(request, cached());

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://cdn.test");
    expect(await response.text()).toBe("2345");
  });

  test("a range past the end is a 416 with the file's size", async () => {
    const request = new Request(url, { headers: { range: "bytes=50-60" } });
    const response = await fromCache(request, cached());

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */10");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://cdn.test");
  });

  test("HEAD is the headers with no body", async () => {
    const response = await fromCache(new Request(url, { method: "HEAD" }), cached());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("10");
    expect(await response.text()).toBe("");
  });

  test("a cached body with no CORS header gets a permissive one", async () => {
    const response = await fromCache(new Request(url), new Response("ab"));
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});

/* ------------------------------------------------------------------ routes */

describe("respond", () => {
  test("leaves a non-GET request to the browser", () => {
    const { worker } = build();
    const response = worker.respond({
      request: new Request(`${ORIGIN}/play`, { method: "POST" }),
      waitUntil: () => {},
    });
    expect(response).toBeNull();
  });

  test("answers a navigation and falls to a 503 with nothing installed", async () => {
    const { worker } = build();
    const request = new Request(`${ORIGIN}/play`);
    Object.defineProperty(request, "mode", { value: "navigate" });

    const response = await worker.respond({ request, waitUntil: () => {} });
    expect(response?.status).toBe(503);
  });
});

describe("pageKey", () => {
  test("knows the game's own routes", () => {
    expect(pageKey("/")).toBe("/index.html");
    expect(pageKey("/play")).toBe("/play.html");
    expect(pageKey("/play/")).toBe("/play.html");
    expect(pageKey("/app")).toBe("/app.html");
    expect(pageKey("/embed")).toBe("/embed.html");
    expect(pageKey("/open")).toBe("/open.html");
    expect(pageKey("/privacy")).toBe("/privacy.html");
  });

  test("does not claim a typo or a machine-readable file is a page", () => {
    for (const path of [
      "/plya",
      "/plya.html",
      "/robots.txt",
      "/sitemap.xml",
      "/manifest.webmanifest",
      "/sitemap-0.xml",
    ]) {
      expect(pageKey(path)).toBeNull();
    }
  });
});

/* ----------------------------------------------------------------- install */

describe("pruneShells", () => {
  test("keeps the current generation and one older, and never the songs", async () => {
    const caches = new FakeCaches();
    for (const name of [SHELL, OLDER, OLDEST]) await caches.open(name);
    await caches.open(OFFLINE_CACHE);

    const { worker } = build({ caches });
    await worker.pruneShells();

    const names = await caches.keys();
    expect(names).toContain(SHELL);
    expect(names).toContain(OLDER);
    expect(names).not.toContain(OLDEST);
    expect(names).toContain(OFFLINE_CACHE);
  });
});

describe("a new build", () => {
  const NEWER = `${SHELL_CACHE_PREFIX}20261027T120000000Z-v2`;
  const NEWEST = `${SHELL_CACHE_PREFIX}20261028T120000000Z-v2`;
  const urls = ["/app.html", "/open.html", "/_astro/chunk.js"] as const;

  /** A network that stamps the build's name into every body. */
  const stamp = (buildName: string): Network =>
    network((request) => responseAt(request.url, `${buildName}:${new URL(request.url).pathname}`));

  test("installing a build fills its own shell, and the next one takes over", async () => {
    const caches = new FakeCaches();

    const first = build({ caches, shell: SHELL, urls, net: stamp("one") });
    await first.worker.precache();
    await first.worker.pruneShells();

    const second = build({ caches, shell: NEWER, urls, net: stamp("two") });
    await second.worker.precache();
    await second.worker.pruneShells();

    const installed = await caches.open(NEWER);
    expect(await (await installed.match(`${ORIGIN}/app.html`))!.text()).toBe("two:/app.html");
    // The page still running from the previous build can lazily import its chunks.
    expect(await caches.open(SHELL).then((cache) => cache.match(`${ORIGIN}/_astro/chunk.js`))).toBeTruthy();
    // And a navigation is the new build's page.
    const request = new Request(`${ORIGIN}/app`);
    Object.defineProperty(request, "mode", { value: "navigate" });
    const response = await second.worker.respond({ request, waitUntil: () => {} });
    expect(await response?.text()).toBe("two:/app.html");
  });

  test("a third build lets the oldest generation go, and never the songs", async () => {
    const caches = new FakeCaches();
    await caches.open(OFFLINE_CACHE);
    for (const [name, buildName] of [
      [SHELL, "one"],
      [NEWER, "two"],
      [NEWEST, "three"],
    ] as const) {
      const worker = build({ caches, shell: name, urls, net: stamp(buildName) });
      await worker.worker.precache();
      await worker.worker.pruneShells();
    }
    const names = await caches.keys();
    expect(names).toContain(NEWEST);
    expect(names).toContain(NEWER);
    expect(names).not.toContain(SHELL);
    expect(names).toContain(OFFLINE_CACHE);
  });
});
