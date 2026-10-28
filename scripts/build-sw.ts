/// <reference types="bun" />
/**
 * Build `dist/sw.js` after Astro has written the site.
 *
 * The worker has to know the **hashed** names of the build it belongs to, so it
 * cannot be a file in `public/`: this step reads the built pages, collects exactly
 * what the shell needs (`src/lib/pwa/precache.ts`, pure), and bundles
 * `scripts/sw.ts` with the list and this build's identity as compile-time values.
 *
 * Run by `bun run build`; `bun run check:pwa` then checks what this wrote.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readSounds, soundsToWarm } from "../src/lib/game/audio/sounds";
import { PAGE_FILES, precacheUrls } from "../src/lib/pwa/precache";
import { basename } from "../src/lib/game/text";
import { readVersion } from "./version";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const SW = join(DIST, "sw.js");

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

if (!existsSync(DIST)) {
  console.error("dist/ is missing; run `bun run build` (Astro first).");
  process.exit(1);
}

const pages: Record<string, string> = {};
for (const name of PAGE_FILES) {
  const file = join(DIST, name);
  if (existsSync(file)) pages[name] = readFileSync(file, "utf8");
}
if (pages["app.html"] === undefined) {
  console.error("dist/app.html is missing: the installed game needs it.");
  process.exit(1);
}

const audio = existsSync(join(DIST, "audio"))
  ? readdirSync(join(DIST, "audio"))
  : [];

/**
 * The beds an install does not keep, read from the **built manifest**: the track
 * bank minus the one file `soundsToWarm` opens on, which is the same choice the
 * engine makes on the welcome. A new bed is a line in `sounds.json`, not a fixture
 * in this script. An unreadable manifest precaches every audio file instead, which
 * is safe if wasteful.
 */
function lateBeds(): string[] {
  const file = join(DIST, "audio", "sounds.json");
  if (!existsSync(file)) return [];
  try {
    const read = readSounds(
      JSON.parse(readFileSync(file, "utf8")),
      "https://audio.invalid/sounds.json",
    );
    const warm = new Set(soundsToWarm(read.sounds).map((sound) => basename(sound.url)));
    return read.sounds
      .filter((sound) => sound.kind === "track" && !warm.has(basename(sound.url)))
      .map((sound) => basename(sound.url));
  } catch {
    return [];
  }
}

// Every built chunk, not just the ones a page's markup names: an island imports
// its own chunks, and a lazy dialog is named by nothing until it is opened.
const astro = existsSync(join(DIST, "_astro"))
  ? readdirSync(join(DIST, "_astro"), { recursive: true, encoding: "utf8" })
      .filter((file) => /\.(?:js|css)$/.test(file))
      .map((file) => `/_astro/${String(file).replaceAll("\\", "/")}`)
  : [];
const precache = precacheUrls({ pages, audio, late: lateBeds(), assets: astro });

const version = readVersion();
const builtAt = new Date().toISOString();

const result = await Bun.build({
  entrypoints: [join(ROOT, "scripts", "sw.ts")],
  outdir: DIST,
  target: "browser",
  format: "iife",
  minify: true,
  sourcemap: "none",
  define: {
    __PRECACHE__: JSON.stringify(precache),
    __VERSION__: JSON.stringify(version),
    __BUILT__: JSON.stringify(builtAt),
  },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  console.error("The service worker build failed.");
  process.exit(1);
}

const size = Bun.file(SW).size;
console.log(
  `service worker: dist/sw.js (${formatBytes(size)}, ${precache.length} precached files, ${version})`,
);
