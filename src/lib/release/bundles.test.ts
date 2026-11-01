import { describe, expect, test } from "bun:test";
import {
  BUILD_NOTE_NAME,
  ENTRY_NAME,
  MANIFEST_NAME,
  archiveFiles,
  buildNote,
  bundleProblems,
  manifestIcons,
  planBundle,
  rootRefs,
  standaloneManifest,
} from "./bundles";

/** A build the way `dist/` really looks, small enough to read. */
const DIST_FILES = [
  "404.html",
  "_astro/GameApp.abc.js",
  "_astro/client.def.js",
  "_astro/BandControls.ghi.js",
  "_headers",
  "_redirects",
  ".well-known/assetlinks.json",
  "app.html",
  "arcade.html",
  "audio/click_1.ogg",
  "audio/sounds.json",
  "cursors/cursor-hand.svg",
  "embed.html",
  "fonts/space-mono-latin-400.woff2",
  "icons/android-chrome-192x192.png",
  "icons/favicon.ico",
  "images/background_1-960.webp",
  "images/background_1-1600.webp",
  "images/background_1-2048.webp",
  "index.html",
  "manifest.webmanifest",
  "og-image.png",
  "open.html",
  "play.html",
  "privacy.html",
  "robots.txt",
  "sitemap-index.xml",
  "sw.js",
];

const MANIFEST = JSON.stringify({
  id: "/app",
  name: "EverythingStar",
  start_url: "/app",
  scope: "/",
  icons: [{ src: "/icons/android-chrome-192x192.png", sizes: "192x192" }],
  shortcuts: [{ name: "Play", url: "/app", icons: [{ src: "/icons/favicon.ico" }] }],
  handle_links: "preferred",
});

describe("planBundle", () => {
  test("a standalone archive carries the game's directories and one page", () => {
    const plan = planBundle("game", DIST_FILES);
    expect(plan.entry).toEqual({ from: "embed.html", to: ENTRY_NAME });
    expect(plan.generated).toEqual([MANIFEST_NAME, BUILD_NOTE_NAME]);
    expect(plan.files).toEqual([
      "_astro/BandControls.ghi.js",
      "_astro/GameApp.abc.js",
      "_astro/client.def.js",
      "audio/click_1.ogg",
      "audio/sounds.json",
      "cursors/cursor-hand.svg",
      "fonts/space-mono-latin-400.woff2",
      "icons/android-chrome-192x192.png",
      "icons/favicon.ico",
      "images/background_1-1600.webp",
      "images/background_1-2048.webp",
      "images/background_1-960.webp",
    ]);
  });

  test("the arcade archive differs only in its entry page", () => {
    const game = planBundle("game", DIST_FILES);
    const arcade = planBundle("arcade", DIST_FILES);
    expect(arcade.entry).toEqual({ from: "arcade.html", to: ENTRY_NAME });
    expect(arcade.files).toEqual(game.files);
    expect(arcade.generated).toEqual(game.generated);
  });

  test("a standalone archive names exactly its files, its entry and its manifest", () => {
    const files = archiveFiles(planBundle("game", DIST_FILES));
    expect(files).toContain(ENTRY_NAME);
    expect(files).toContain(MANIFEST_NAME);
    expect(files).toContain(BUILD_NOTE_NAME);
    expect(files).toContain("_astro/GameApp.abc.js");
    for (const notOurs of [
      "play.html",
      "app.html",
      "open.html",
      "privacy.html",
      "404.html",
      "embed.html",
      "sw.js",
      "robots.txt",
      "og-image.png",
      "_headers",
      "_redirects",
      "sitemap-index.xml",
      ".well-known/assetlinks.json",
    ]) {
      expect(files).not.toContain(notOurs);
    }
  });

  test("the website archive is the build, whole and unrenamed", () => {
    const plan = planBundle("website", DIST_FILES);
    expect(plan.entry).toBeNull();
    expect(plan.generated).toEqual([]);
    expect(archiveFiles(plan)).toEqual([...DIST_FILES].sort());
  });
});

describe("standaloneManifest", () => {
  test("starts at the folder's root, and keeps everything else", () => {
    const manifest = JSON.parse(standaloneManifest(MANIFEST)) as Record<string, unknown>;
    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.name).toBe("EverythingStar");
    expect(manifest.handle_links).toBe("preferred");
    expect(manifest.shortcuts).toEqual([
      { name: "Play", url: "/", icons: [{ src: "/icons/favicon.ico" }] },
    ]);
    expect(standaloneManifest(MANIFEST).endsWith("}\n")).toBe(true);
  });
});

describe("rootRefs", () => {
  test("reads attributes, an island's chunk and an inlined CSS url", () => {
    const html = [
      '<link rel="icon" href="/icons/favicon.ico">',
      '<link rel="manifest" href="/manifest.webmanifest?v=2">',
      '<astro-island component-url="/_astro/GameApp.abc.js"',
      ' renderer-url="/_astro/client.def.js"></astro-island>',
      "<style>@font-face{src:url(/fonts/permanent-marker-latin.woff2)}",
      '.band{cursor:url("/cursors/cursor-hand.svg") 4 4, pointer}</style>',
    ].join("");
    expect(rootRefs(html).sort()).toEqual([
      "/_astro/GameApp.abc.js",
      "/_astro/client.def.js",
      "/cursors/cursor-hand.svg",
      "/fonts/permanent-marker-latin.woff2",
      "/icons/favicon.ico",
      "/manifest.webmanifest",
    ]);
  });

  test("leaves a foreign URL, a protocol-relative one and the page itself alone", () => {
    const html = [
      '<a href="https://example.com/x.js">x</a>',
      '<script src="//cdn.example.com/x.js"></script>',
      '<a href="/">the game</a>',
      '<a href="#main">skip</a>',
    ].join("");
    expect(rootRefs(html)).toEqual([]);
  });
});

describe("manifestIcons", () => {
  test("reads the icons and the shortcuts' icons", () => {
    expect(manifestIcons(MANIFEST)).toEqual([
      "/icons/android-chrome-192x192.png",
      "/icons/favicon.ico",
    ]);
  });

  test("a manifest that is not JSON has no icons", () => {
    expect(manifestIcons("<html>")).toEqual([]);
  });
});

describe("bundleProblems", () => {
  const plan = planBundle("game", DIST_FILES);
  const html = [
    '<link rel="icon" href="/icons/favicon.ico">',
    '<link rel="manifest" href="/manifest.webmanifest">',
    '<script type="module" src="/_astro/GameApp.abc.js"></script>',
    '<img src="/images/background_1-960.webp">',
  ].join("");

  const good = {
    plan,
    listing: archiveFiles(plan),
    html,
    manifest: standaloneManifest(MANIFEST),
  };

  test("a complete archive has nothing wrong with it", () => {
    expect(bundleProblems(good)).toEqual([]);
  });

  test("names a chunk the page asks for and the archive lost", () => {
    const problems = bundleProblems({
      ...good,
      listing: good.listing.filter((file) => file !== "_astro/GameApp.abc.js"),
    });
    expect(problems).toContain("missing _astro/GameApp.abc.js");
    expect(problems).toContain(
      "/_astro/GameApp.abc.js is named by the page but is not in the archive",
    );
  });

  test("names a runtime file no page's markup mentions", () => {
    expect(
      bundleProblems({
        ...good,
        listing: good.listing.filter((file) => file !== "audio/sounds.json"),
      }),
    ).toContain("audio/sounds.json is fetched by the game but is not in the archive");
  });

  test("refuses a page that does not belong in a standalone folder", () => {
    expect(bundleProblems({ ...good, listing: [...good.listing, "play.html"] })).toContain(
      "unexpected play.html",
    );
  });

  test("refuses a manifest that still starts at /app, or an icon that is not there", () => {
    expect(bundleProblems({ ...good, manifest: MANIFEST })).toContain(
      'the manifest\'s start_url is /app, not "/"',
    );
    expect(
      bundleProblems({
        ...good,
        listing: good.listing.filter((file) => file !== "icons/favicon.ico"),
        manifest: standaloneManifest(MANIFEST),
      }),
    ).toContain("the manifest's icon /icons/favicon.ico is not in the archive");
  });
});

describe("buildNote", () => {
  test("names the version and says how to serve the folder", () => {
    const note = buildNote("v1.0.0+abc1234");
    expect(note).toContain("EverythingStar v1.0.0+abc1234");
    expect(note).toContain("ROOT of an origin");
    expect(note).toContain("AGPL-3.0-only");
  });
});
