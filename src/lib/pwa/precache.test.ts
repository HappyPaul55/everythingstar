import { describe, expect, test } from "bun:test";
import { assetRefs, precacheAudio, precacheUrls } from "./precache";

describe("assetRefs", () => {
  test("keeps the game's own directories and drops the query", () => {
    const html = [
      '<script type="module" src="/_astro/entry.abc123.js"></script>',
      '<link rel="stylesheet" href="/_astro/band.def456.css">',
      '<link rel="preload" href="/fonts/permanent-marker-latin.woff2" as="font">',
      '<link rel="icon" href="/icons/favicon.ico">',
      '<link rel="manifest" href="/manifest.webmanifest">',
    ].join("");
    expect(assetRefs(html)).toEqual([
      "/_astro/entry.abc123.js",
      "/_astro/band.def456.css",
      "/fonts/permanent-marker-latin.woff2",
      "/icons/favicon.ico",
    ]);
  });

  test("reads an island's chunk from its component and renderer attributes", () => {
    const html = [
      '<astro-island component-url="/_astro/GameApp.abc.js"',
      ' renderer-url="/_astro/client.def.js" props-url="/_astro/props.ghi.js"',
      ' client="load"></astro-island>',
    ].join("");
    expect(assetRefs(html)).toEqual([
      "/_astro/GameApp.abc.js",
      "/_astro/client.def.js",
      "/_astro/props.ghi.js",
    ]);
  });

  test("drops a foreign address, a protocol-relative one and the page itself", () => {
    const html = [
      '<a href="https://example.com/playlist.json">x</a>',
      '<a href="//cdn.example.com/x.js">y</a>',
      '<a href="/play">a page</a>',
      '<img src="/images/background_1-960.webp">',
    ].join("");
    expect(assetRefs(html)).toEqual(["/images/background_1-960.webp"]);
  });
});

describe("precacheAudio", () => {
  test("takes the cues and the opening bed, leaves the beds the manifest calls late", () => {
    expect(
      precacheAudio(
        ["background_1.ogg", "background_2.ogg", "background_3.ogg", "background_4.ogg", "click_1.ogg", "sounds.json"],
        ["background_2.ogg", "background_3.ogg", "background_4.ogg"],
      ),
    ).toEqual(["/audio/background_1.ogg", "/audio/click_1.ogg"]);
  });

  test("the late list is whatever the caller names, not a hard-coded three", () => {
    // The manifest decides, so a new bed is skipped and an old name that is not in
    // the bank is harmless to mention.
    expect(
      precacheAudio(
        ["background_1.ogg", "background_9.ogg", "click_1.ogg"],
        ["background_1.ogg", "background_3.ogg"],
      ),
    ).toEqual(["/audio/background_9.ogg", "/audio/click_1.ogg"]);
  });
});

describe("precacheUrls", () => {
  test("pages first, then their assets, the extras and the audio, each once", () => {
    const urls = precacheUrls({
      pages: {
        "app.html": '<script src="/_astro/app.js"></script><link href="/_astro/app.css">',
        "play.html": '<script src="/_astro/app.js"></script>',
      },
      audio: ["background_1.ogg", "click_1.ogg", "background_4.ogg"],
    });
    expect(urls).toEqual([
      "/app.html",
      "/_astro/app.js",
      "/_astro/app.css",
      "/play.html",
      "/manifest.webmanifest",
      "/audio/sounds.json",
      "/images/background_1-960.webp",
      "/images/background_1-1600.webp",
      "/images/background_1-2048.webp",
      "/audio/background_1.ogg",
      "/audio/background_4.ogg",
      "/audio/click_1.ogg",
    ]);
  });

  test("a manifest's late beds are passed through to the audio list", () => {
    const urls = precacheUrls({
      pages: { "app.html": "<html></html>" },
      audio: ["background_1.ogg", "background_2.ogg", "click_1.ogg"],
      late: ["background_2.ogg"],
    });
    expect(urls).toContain("/audio/background_1.ogg");
    expect(urls).toContain("/audio/click_1.ogg");
    expect(urls).not.toContain("/audio/background_2.ogg");
  });

  test("a missing page is simply not precached", () => {
    const urls = precacheUrls({ pages: { "app.html": "<html></html>" }, audio: [] });
    expect(urls).toContain("/app.html");
    expect(urls).not.toContain("/open.html");
  });

  test("every built chunk is kept, including the ones no page names", () => {
    const urls = precacheUrls({
      pages: { "app.html": "<html></html>" },
      audio: [],
      assets: ["/_astro/app.js", "/_astro/IntentDialog.lazy.js", "/_astro/app.js"],
    });
    expect(urls).toContain("/_astro/app.js");
    expect(urls).toContain("/_astro/IntentDialog.lazy.js");
    expect(urls.filter((url) => url === "/_astro/app.js")).toHaveLength(1);
  });

  test("never a foreign or protocol-relative URL", () => {
    const urls = precacheUrls({
      pages: {
        "app.html": '<img src="https://cdn.example.com/x.png"><img src="//cdn.example.com/y.png">',
      },
      audio: [],
    });
    expect(urls.every((url) => url.startsWith("/") && !url.startsWith("//"))).toBe(true);
  });
});
