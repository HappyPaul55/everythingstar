import { afterEach, describe, expect, test } from "bun:test";
import { loadYouTubeApi, type YouTubeApi } from "./youtube";

/**
 * The loader's edges, without a browser: a fake window and document are enough.
 *
 * The API itself is somebody else's script, and the two ways it can fail are a
 * script error and a tag that never calls back. Both must forget the memoised
 * attempt, or every later call returns the same rejected promise.
 */
interface FakeScript {
  src: string;
  async: boolean;
  isConnected: boolean;
  listeners: Map<string, Array<() => void>>;
  addEventListener(type: string, listener: () => void): void;
  remove(): void;
  fire(type: string): void;
}

interface FakeWindow {
  YT?: YouTubeApi;
  onYouTubeIframeAPIReady?: () => void;
}

interface FakeDocument {
  querySelector(selector: string): FakeScript | null;
  createElement(tag: string): FakeScript;
  head: { appendChild(script: FakeScript): void };
}

interface FakeDom {
  window: FakeWindow;
  document: FakeDocument;
  scripts: FakeScript[];
}

function makeScript(src: string, scripts: FakeScript[]): FakeScript {
  const script: FakeScript = {
    src,
    async: false,
    isConnected: false,
    listeners: new Map(),
    addEventListener(type, listener) {
      const list = script.listeners.get(type) ?? [];
      list.push(listener);
      script.listeners.set(type, list);
    },
    remove() {
      script.isConnected = false;
      const at = scripts.indexOf(script);
      if (at >= 0) scripts.splice(at, 1);
    },
    fire(type) {
      for (const listener of script.listeners.get(type) ?? []) listener();
    },
  };
  return script;
}

function install(options: { api?: YouTubeApi; existing?: boolean } = {}): FakeDom {
  const scripts: FakeScript[] = [];
  const window: FakeWindow = { YT: options.api };
  const document: FakeDocument = {
    querySelector(selector) {
      if (!selector.includes("youtube.com/iframe_api")) return null;
      return scripts.find((script) => script.isConnected) ?? null;
    },
    createElement: () => makeScript("", scripts),
    head: {
      appendChild(script) {
        script.isConnected = true;
        scripts.push(script);
      },
    },
  };
  if (options.existing) {
    const existing = makeScript("https://www.youtube.com/iframe_api", scripts);
    existing.isConnected = true;
    scripts.push(existing);
  }
  Object.defineProperty(globalThis, "window", {
    value: window,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: document,
    configurable: true,
    writable: true,
  });
  return { window, document, scripts };
}

const api = { Player: class {} } as unknown as YouTubeApi;

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

afterEach(() => {
  for (const [key, descriptor] of [
    ["window", originalWindow],
    ["document", originalDocument],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

describe("loadYouTubeApi", () => {
  test("resolves at once when the API is already on the page", async () => {
    const dom = install({ api });

    await expect(loadYouTubeApi()).resolves.toBe(api);
    expect(dom.scripts).toHaveLength(0);
  });

  test("a script error clears the attempt, so a second call retries", async () => {
    const dom = install();
    const first = loadYouTubeApi();
    // Concurrent callers share the one attempt rather than adding a second script.
    expect(loadYouTubeApi()).toBe(first);
    expect(dom.scripts).toHaveLength(1);
    const failed = dom.scripts[0];

    failed.fire("error");
    await expect(first).rejects.toThrow("could not be loaded");

    // The dead tag is gone, so the retry can add a fresh one.
    const second = loadYouTubeApi();
    expect(second).not.toBe(first);
    expect(dom.scripts).toHaveLength(1);
    expect(dom.scripts[0]).not.toBe(failed);

    dom.window.YT = api;
    dom.window.onYouTubeIframeAPIReady?.();
    await expect(second).resolves.toBe(api);
  });

  test("an existing script tag resolves through the API's callback", async () => {
    const dom = install({ existing: true });
    const pending = loadYouTubeApi();

    // The loader waits on the tag that is already there instead of adding another
    // or handing back a promise that can never settle.
    expect(dom.scripts).toHaveLength(1);
    dom.window.YT = api;
    dom.window.onYouTubeIframeAPIReady?.();

    await expect(pending).resolves.toBe(api);
    expect(dom.scripts).toHaveLength(1);
  });
});
