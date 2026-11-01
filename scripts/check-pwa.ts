/**
 * The installability and offline gate, run after `bun run build`.
 *
 * Four things must be true of a static upload for the game to be installable and
 * to start offline:
 *
 * - the manifest is complete (a name, an id, a game start page, a display that is
 *   more than a browser tab, a 192/512 pair of ordinary and maskable icons, and
 *   the deeplink fields the native shell depends on: a `/app` shortcut,
 *   `navigate-existing` launches and `preferred` link handling);
 * - `dist/sw.js` exists and carries the app shell, every built JS chunk and the
 *   sound manifest, because a worker that did not get its precache list is a
 *   worker that does nothing;
 * - the game-only pages (`/app`, `/arcade`, `/embed`, `/open`) really link the
 *   manifest and the worker, so any of them can be installed from even when it
 *   is the first page somebody lands on;
 * - `dist/_headers` keeps the security and caching rules that are load-bearing:
 *   YouTube in `script-src` and `frame-src`, same-origin framing for the
 *   homepage's live window, `https:` for the documents, art and audio a playlist
 *   can point at, and `no-cache` on the worker and the manifest.
 *
 * The file is otherwise the build's own output; nothing here is fetched.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { docHref } from "../src/lib/docs/paths";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const failures: string[] = [];

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures.push(detail ? `${label}: ${detail}` : label);
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

function read(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * `_headers` as written by Cloudflare: a path pattern on its own line, then the
 * indented `Name: value` lines that apply to it. Comments and blank lines are
 * ignored, so the file can stay readable.
 */
interface HeaderBlock {
  pattern: string;
  headers: Map<string, string>;
}

function parseHeaders(text: string): HeaderBlock[] {
  const blocks: HeaderBlock[] = [];
  let current: HeaderBlock | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: new Map() };
      blocks.push(current);
      continue;
    }
    const colon = line.indexOf(":");
    if (!current || colon === -1) continue;
    current.headers.set(
      line.slice(0, colon).trim().toLowerCase(),
      line.slice(colon + 1).trim(),
    );
  }
  return blocks;
}

/** A Content-Security-Policy as its directives, each with its source list. */
function policy(csp: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), values);
  }
  return directives;
}

interface ManifestIcon {
  src?: unknown;
  sizes?: unknown;
  purpose?: unknown;
}

interface ManifestShortcut {
  url?: unknown;
}

interface Manifest {
  id?: unknown;
  name?: unknown;
  short_name?: unknown;
  start_url?: unknown;
  scope?: unknown;
  display?: unknown;
  display_override?: unknown;
  icons?: unknown;
  shortcuts?: unknown;
  launch_handler?: { client_mode?: unknown };
  handle_links?: unknown;
}

console.log("PWA checks");

if (!existsSync(DIST)) {
  console.error("dist/ is missing. Run `bun run build` first.");
  process.exit(1);
}

const manifestText = read(join(DIST, "manifest.webmanifest"));
let manifest: Manifest | null = null;
try {
  manifest = manifestText ? (JSON.parse(manifestText) as Manifest) : null;
} catch {
  manifest = null;
}
check("dist/manifest.webmanifest is readable JSON", manifest !== null);

if (manifest) {
  check("manifest names the game", typeof manifest.name === "string" && manifest.name === "EverythingStar");
  check("manifest has a short name", typeof manifest.short_name === "string" && manifest.short_name.length > 0);
  check("manifest has a stable id", manifest.id === "/app");
  check("manifest starts at the game page", manifest.start_url === "/app");
  check("manifest covers the site", manifest.scope === "/");
  check(
    "manifest opens as a game",
    manifest.display === "standalone" &&
      Array.isArray(manifest.display_override) &&
      manifest.display_override.includes("fullscreen"),
  );

  const icons = Array.isArray(manifest.icons) ? (manifest.icons as ManifestIcon[]) : [];
  const has = (size: string, purpose: string) =>
    icons.some((icon) => icon.sizes === size && String(icon.purpose ?? "any") === purpose);
  check("manifest has 192 and 512 icons", has("192x192", "any") && has("512x512", "any"));
  check(
    "manifest has maskable icons",
    has("192x192", "maskable") && has("512x512", "maskable"),
  );
  for (const icon of icons) {
    if (typeof icon.src !== "string" || !icon.src.startsWith("/")) continue;
    check(
      `icon exists: ${icon.src}`,
      existsSync(join(DIST, icon.src.replace(/^\//, ""))),
    );
  }

  const shortcuts = Array.isArray(manifest.shortcuts)
    ? (manifest.shortcuts as ManifestShortcut[])
    : [];
  check(
    "manifest has a /app shortcut",
    shortcuts.some(
      (shortcut) => typeof shortcut.url === "string" && shortcut.url.startsWith("/app"),
    ),
  );
  check(
    "manifest keeps a launch in the installed window",
    manifest.launch_handler?.client_mode === "navigate-existing",
  );
  check("manifest prefers links over the browser", manifest.handle_links === "preferred");
}

const headersText = read(join(DIST, "_headers"));
check("dist/_headers exists", headersText !== null);
if (headersText) {
  const blocks = parseHeaders(headersText);
  const cacheFor = (path: string) =>
    blocks.find((block) => block.pattern === path)?.headers.get("cache-control") ?? "";

  check("_headers never caches the worker", cacheFor("/sw.js").includes("no-cache"));
  check(
    "_headers lets the room be remembered for a week",
    cacheFor("/images/*").includes("max-age=604800"),
  );
  check(
    "_headers lets the sound library be remembered for a week",
    cacheFor("/audio/*").includes("max-age=604800"),
  );
  check(
    "_headers never caches the manifest",
    cacheFor("/manifest.webmanifest").includes("no-cache"),
  );

  const cspText =
    blocks.find((block) => block.pattern === "/*")?.headers.get("content-security-policy") ??
    "";
  const csp = policy(cspText);
  const allows = (directive: string, source: string) =>
    (csp.get(directive) ?? []).includes(source);

  check("_headers allows YouTube scripts", allows("script-src", "https://www.youtube.com"));
  check(
    "_headers allows the YouTube player frame",
    allows("frame-src", "https://www.youtube.com"),
  );
  check("_headers allows https: documents", allows("connect-src", "https:"));
  check("_headers allows https: artwork", allows("img-src", "https:"));
  check("_headers allows https: audio", allows("media-src", "https:"));
  check(
    "_headers allows the homepage's live window",
    allows("frame-src", "'self'") && allows("frame-ancestors", "'self'"),
  );
  check(
    "_headers does not forbid same-origin framing",
    !allows("frame-ancestors", "'none'"),
  );
}

const sw = read(join(DIST, "sw.js"));
check("dist/sw.js exists", sw !== null && sw.length > 0);
if (sw) {
  check("the worker was built with a precache list", !sw.includes("__PRECACHE__"));
  check("the shell includes the app page", sw.includes("/app.html"));
  check("the shell includes the link entry", sw.includes("/open.html"));
  check("the shell includes the sound manifest", sw.includes("/audio/sounds.json"));
  const listedChunks = new Set(sw.match(/\/_astro\/[A-Za-z0-9_./-]+\.js/g) ?? []);
  const astroDir = join(DIST, "_astro");
  // Recursive: `build-sw.ts` walks subdirectories, so a non-recursive read here
  // would quietly stop comparing them and could never notice a missing nested
  // chunk.
  const builtChunks = existsSync(astroDir)
    ? readdirSync(astroDir, { recursive: true, encoding: "utf8" })
        .filter((file) => file.endsWith(".js"))
        .map((file) => `/_astro/${file.replace(/\\/g, "/")}`)
    : [];
  const absent = builtChunks.filter((chunk) => !listedChunks.has(chunk));
  let shellProblem = "";
  if (builtChunks.length === 0) shellProblem = "no JS chunks in dist/_astro";
  else if (absent.length > 0) shellProblem = `missing ${absent.join(", ")}`;
  check(
    "the shell includes every built JS chunk",
    builtChunks.length > 0 && absent.length === 0,
    shellProblem,
  );
  check("the worker serves the offline bucket", sw.includes("everythingstar-offline-v1"));

  // The front-load budget the game is allowed: up to 20 MiB installed. It is
  // deliberately generous — a startup load is normal — but it must be a number the
  // build owns, not an accident of a new asset.
  const listed = sw.match(/precacheUrls:\[(.*?)\]/s)?.[1] ?? "";
  const urls = [...listed.matchAll(/"([^"]+)"/g)].map((entry) => entry[1] ?? "");
  let bytes = 0;
  const missing: string[] = [];
  for (const url of urls) {
    const file = join(DIST, url);
    if (!existsSync(file)) {
      missing.push(url);
      continue;
    }
    bytes += statSync(file).size;
  }
  const mib = bytes / (1024 * 1024);
  check(
    "the install payload is under 20 MiB",
    urls.length > 0 && bytes <= 20 * 1024 * 1024,
    `${mib.toFixed(1)} MiB`,
  );
  check("every precached file exists", missing.length === 0, missing.join(", "));
  console.log(`  install payload: ${mib.toFixed(1)} MiB / 20 MiB (${urls.length} files)`);
}

for (const page of ["app.html", "arcade.html", "embed.html", "open.html"]) {
  const html = read(join(DIST, page));
  check(`dist/${page} exists`, html !== null);
  if (!html) continue;
  check(
    `dist/${page} links the manifest`,
    /<link[^>]+rel="manifest"[^>]+href="\/manifest.webmanifest"/.test(html),
  );
  check(
    `dist/${page} registers the worker`,
    /<script[^>]+type="module"/.test(html) &&
      html.includes("serviceWorker") &&
      html.includes("/sw.js"),
  );
  check(
    `dist/${page} is not indexable`,
    /<meta[^>]+name="robots"[^>]+content="noindex, nofollow"/.test(html),
  );
  // An action entry is not a page to find: no canonical, and no social card to
  // share. The website shell (`/play`) is where those belong.
  check(`dist/${page} has no canonical`, !/<link[^>]+rel="canonical"/.test(html));
  check(`dist/${page} has no og:url`, !/property="og:url"/.test(html));
  check(`dist/${page} has no og:image`, !/property="og:image"/.test(html));
}

/*
 * Which game page is a page of the site, and which is only an entry. `/play` is
 * the public game page, so the marketing header and footer frame the stage — a
 * regression once dropped them and nothing failed. The action entries have no
 * shell: there is no website chrome to hide on a phone or in a WebView.
 */
function shellOf(html: string): { header: boolean; footer: boolean } {
  return {
    header: /<header\b[^>]*\bid="site-header"/.test(html),
    // The site footer is the one after the page's own `</main>`.
    footer: /<\/main>[\s\S]*?<footer\b/.test(html),
  };
}

const playHtml = read(join(DIST, "play.html"));
check("dist/play.html exists", playHtml !== null);
if (playHtml) {
  const shell = shellOf(playHtml);
  check("the public game page keeps the site header", shell.header);
  check("the public game page keeps the site footer", shell.footer);
}

for (const page of ["app.html", "arcade.html", "embed.html", "open.html"]) {
  const html = read(join(DIST, page));
  if (!html) continue;
  const shell = shellOf(html);
  check(`dist/${page} has no site header`, !shell.header);
  check(`dist/${page} has no site footer`, !shell.footer);
}

/*
 * The sitemap is the other half of the indexability decision: a page whose head
 * says `noindex` must not be offered to a crawler, and an indexable page must be.
 */
const sitemap = read(join(DIST, "sitemap-0.xml"));
check("dist/sitemap-0.xml exists", sitemap !== null);
if (sitemap) {
  const paths = Array.from(
    sitemap.matchAll(/<loc>([^<]+)<\/loc>/g),
    (match) => new URL(match[1]!).pathname,
  ).sort();
  // The paper pages plus one URL per documentation file. The docs are read from
  // the collection's own folder so a new page is not a checker edit, and the
  // notices (`other/…`) resolve to their site-root URLs.
  const docs = readdirSync(join(ROOT, "docs"), { recursive: true, encoding: "utf8" })
    .map((file) => file.replace(/\\/g, "/"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => docHref(file.slice(0, -".md".length)));
  const expected = [...new Set(["/", "/play", ...docs])].sort();
  check(
    "the sitemap lists exactly the indexable pages",
    paths.join(",") === expected.join(","),
    paths.join(", "),
  );
}

/*
 * App Links verification. The file is what makes an `https://…/open` link open the
 * app instead of the browser, so it is checked as carefully as the manifest: the
 * path must be served, the package must be the app's, and the fingerprint must be a
 * real SHA-256 in the colon-separated form Android expects. A file that is merely
 * present but malformed fails verification silently on a phone, which is the worst
 * kind of broken.
 */
const links = read(join(DIST, ".well-known", "assetlinks.json"));
check("dist/.well-known/assetlinks.json exists", links !== null);

interface AssetLink {
  relation?: unknown;
  target?: {
    namespace?: unknown;
    package_name?: unknown;
    sha256_cert_fingerprints?: unknown;
  };
}

let statements: AssetLink[] | null = null;
try {
  const parsed: unknown = links ? JSON.parse(links) : null;
  statements = Array.isArray(parsed) ? (parsed as AssetLink[]) : null;
} catch {
  statements = null;
}
check("assetlinks.json is a JSON array", statements !== null);

const handleAll = statements?.find(
  (statement) => statement.target?.package_name === "com.happypaul55.everythingstar",
);
check("assetlinks targets the Android app", handleAll !== undefined);
check(
  "assetlinks handles all URLs",
  Array.isArray(handleAll?.relation) &&
    handleAll.relation.includes("delegate_permission/common.handle_all_urls"),
);
check(
  "assetlinks has an android_app target",
  handleAll?.target?.namespace === "android_app",
);

const fingerprints = handleAll?.target?.sha256_cert_fingerprints;
const SHA256 = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;
check(
  "assetlinks carries at least one valid SHA-256 fingerprint",
  Array.isArray(fingerprints) &&
    fingerprints.some((value) => typeof value === "string" && SHA256.test(value)),
);

if (failures.length > 0) {
  console.error(`\n${failures.length} PWA check(s) failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("PWA checks passed.");
