/**
 * The website's service worker, built by `scripts/build-sw.ts` into `dist/sw.js`.
 *
 * This file is only the wiring: `self`, the injected build globals and the four
 * listeners. The handlers are `src/lib/pwa/worker.ts` — a normal module, so they
 * are driven by tests with fake buckets and a fake network, and bundled in here
 * by the build. That module does two jobs, and nothing else:
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
 * They are two builds of one contract, so `OFFLINE_CACHE` is the same literal.
 */

import { shellCacheName } from "../src/lib/pwa/cache";
import { createWorker } from "../src/lib/pwa/worker";

/** Injected by the build: every URL an install keeps, and this build's identity. */
declare const __PRECACHE__: string[];
declare const __VERSION__: string;
declare const __BUILT__: string;

interface FetchEventLike extends Event {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
  waitUntil(work: Promise<unknown>): void;
}

interface ExtendableEventLike extends Event {
  waitUntil(work: Promise<unknown>): void;
}

interface ServiceWorkerLike {
  addEventListener(type: "install", listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: "activate", listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEventLike) => void): void;
  addEventListener(type: "message", listener: (event: Event) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  location: Location;
}

const worker = self as unknown as ServiceWorkerLike;

const handlers = createWorker({
  origin: worker.location.origin,
  shellCache: shellCacheName(__VERSION__, __BUILT__),
  precacheUrls: __PRECACHE__,
  caches,
  fetch: (request) => fetch(request),
});

worker.addEventListener("install", (event) => {
  event.waitUntil(handlers.precache());
  // Take over as soon as a new build is installed: the offline bucket is
  // independent of the worker's script, so there is nothing to wait for.
  void worker.skipWaiting();
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await handlers.pruneShells();
      await worker.clients.claim();
    })(),
  );
});

/**
 * Android WebView does not always put a fresh document under an active worker.
 * The website does not need the app's handshake, but answering it is harmless and
 * keeps one worker contract; the app's boot sends `claim` after every load.
 */
worker.addEventListener("message", (event) => {
  if ((event as MessageEvent<unknown>).data === "claim") {
    void worker.clients.claim();
  }
});

worker.addEventListener("fetch", (event) => {
  const response = handlers.respond({
    request: event.request,
    waitUntil: (work) => event.waitUntil(work),
  });
  // Null is a request that is not this worker's: the browser answers it.
  if (response) event.respondWith(response);
});
