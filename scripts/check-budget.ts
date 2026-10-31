/**
 * Bundle budget: the guard against a build that quietly gets heavier.
 *
 * It reads `dist/` (building it first if it is not there) and fails when any of
 * five numbers grows past its limit:
 *
 * - **`dist/_astro` JavaScript** — every chunk the build produced, lazy ones
 *   included. It is the whole JS payload rather than the first download, so it is
 *   the slower deploy and the bigger install, not what a player waits for.
 * - **initial `/play` JavaScript, raw and gzipped** — the island's own graph:
 *   what the browser really must download and parse before the game can start.
 *   This is the number users feel, and it catches a dialog moved out of a lazy
 *   chunk even while the `_astro` total still has room.
 * - **`dist/` as a whole** — the static upload: every page, image, icon and the
 *   game's own JS. A regression here is a slower deploy and a slower first visit.
 * - **`public/audio`** — the sound files. The four menu beds are Ogg/Opus now (64 kbps),
 *   which took them from 22.5 MiB to 8.2 MiB; they are still most of a much smaller
 *   upload, and the part most likely to arrive in megabytes at a time.
 *
 * The numbers were measured on 2026-10-31, after the documentation's captures
 * grew to cover the loop, the players and the charter:
 * `dist/_astro` JS 688 KiB, `dist/` 17.6 MiB, `public/audio` 8.8 MiB and the
 * **initial `/play` graph** 564 KiB raw / 182 KiB gzipped across 21 files; the parser
 * chunk, the brag card, the profile module, the queue's own UI and the whole charter
 * island are not part of it. The charter is a separate root, so its code is lazy
 * from `/play`'s point of view and is why the whole-payload cap moved by 37 KiB.
 * Each limit leaves room for normal work without leaving room for a new feature to
 * arrive unnoticed: about 1% on the JS and the initial raw graph, 4% on its gzip,
 * and 10–12% on the whole build and the audio (enough for a replaced sting, not
 * another four-minute bed). The whole-payload number counts the lazy chunks,
 * which is why it moved when two features were added behind a press; the initial
 * graph moved by the rows themselves, and is the number to watch.
 *
 * The whole-build cap was raised to 16 MiB when the documentation landed: ~40
 * prose pages, each carrying the inlined site CSS, plus the screenshots the guide
 * reuses. It moved to 18 MiB with the note-types page, and to 20 MiB when the
 * captures grew to cover the loop, the players and the charter — every shot on
 * desktop and mobile, as a phone is where a layout fails. That is
 * content rather than code — it does not touch the initial graph or the audio —
 * but it is still upload and first-visit weight, so the cap is a limit rather
 * than a target.
 * Every documentation page is plain HTML with no island, and `check-docs.ts`
 * proves it.
 *
 * The script will not measure a build it cannot find: `dist/_astro`, `dist/`,
 * `public/audio` and `play.html` are each required before any number is read, and
 * a `play.html` with no initial JS is a failure rather than a zero.
 *
 * A small non-numeric guard sits below the size checks: it walks the island's initial
 * `component-url`/`renderer-url` graph in `play.html`, and fails if a translator's
 * marker has leaked into it. That is what keeps the lazy parser chunk lazy.
 *
 * Run with `bun run budget`; `bun run verify` runs it after the build.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const KIB = 1024;
const MIB = 1024 * KIB;

interface Check {
  label: string;
  actual: number;
  limit: number;
}

/**
 * Every regular file under `path`, filtered by the file's own name.
 *
 * The caller checks the inputs exist first, so a missing path here is a bug in
 * the gate rather than an empty directory: `statSync` throws and the script is
 * red instead of silently measuring nothing.
 */
function sizeOf(path: string, wanted: (file: string) => boolean = () => true): number {
  const stat = statSync(path);
  if (!stat.isDirectory()) return wanted(path) ? stat.size : 0;
  return readdirSync(path).reduce(
    (total, entry) => total + sizeOf(join(path, entry), wanted),
    0,
  );
}

function format(bytes: number): string {
  return bytes >= MIB
    ? `${(bytes / MIB).toFixed(1)} MiB`
    : `${(bytes / KIB).toFixed(0)} KiB`;
}

/**
 * Every JavaScript file `/play` fetches before the island can mount.
 *
 * Astro writes an island as `component-url` + `renderer-url`, so those are the
 * entries beside the ordinary `<script type="module">` and `modulepreload` tags;
 * following the **static** imports from each one gives the first download. A
 * dynamic `import()` is deliberately not followed: it is the thing being kept out.
 */
function initialPlayFiles(): string[] {
  const htmlPath = join(DIST, "play.html");
  const html = readFileSync(htmlPath, "utf8");
  const entries = new Set<string>();
  const take = (url: string) => {
    if (url.startsWith("/_astro/")) entries.add(join(DIST, url.slice(1)));
  };
  for (const match of html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) {
    take(match[1] ?? "");
  }
  for (const match of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) {
    take(match[1] ?? "");
  }
  for (const match of html.matchAll(/(?:component-url|renderer-url)="([^"]+)"/g)) {
    take(match[1] ?? "");
  }

  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    const body = readFileSync(file, "utf8");
    for (const match of body.matchAll(/\bfrom\s*"([^"]+)"/g)) {
      const specifier = match[1] ?? "";
      if (specifier.startsWith(".")) visit(join(dirname(file), specifier));
    }
  };
  for (const file of entries) visit(file);
  return [...seen].sort();
}

/**
 * Strings that only the source translators carry. `MThd` is the MIDI header,
 * `[SyncTrack]` is Clone Hero's `.chart` section, `#TITLE` is UltraStar's first
 * header, `#BPMS` is StepMania's tempo map, `SNGPKG` is the `.sng` package's own
 * magic and `WEBVTT` is the timed-lyrics reader; if any appears in the first
 * download, `parse.ts` has been pulled in eagerly again.
 */
const PARSER_MARKERS = ["MThd", "[SyncTrack]", "#TITLE", "#BPMS", "SNGPKG", "WEBVTT"];

if (!existsSync(DIST)) {
  console.log("dist/ is missing; building it first…");
  execFileSync("bun", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
}

/**
 * Every input this gate measures. A renamed page or a missing build directory is
 * a failure, never a zero: `ok` for a path nobody could read is worse than no
 * gate at all.
 */
const inputs = [
  { label: "dist/_astro JS", path: join(DIST, "_astro") },
  { label: "dist/ total", path: DIST },
  { label: "public/audio", path: join(ROOT, "public", "audio") },
  { label: "initial /play", path: join(DIST, "play.html") },
];
const missingInputs = inputs.filter(({ path }) => !existsSync(path));
if (missingInputs.length > 0) {
  console.error("Bundle budget");
  for (const { label, path } of missingInputs) {
    console.error(`  ${label.padEnd(18)} FAIL: ${relative(ROOT, path)} is missing`);
  }
  console.error("A build that cannot find its own inputs cannot be measured.");
  process.exit(1);
}

// The initial graph is the head of the same walk the lazy guard uses below.
const initial = initialPlayFiles();
if (initial.length === 0) {
  console.error(
    `  ${"initial /play".padEnd(18)} FAIL: play.html names no initial JS files — the graph cannot be measured`,
  );
  process.exit(1);
}
const initialBodies = initial.map((file) => readFileSync(file));
const initialRaw = initialBodies.reduce((total, body) => total + body.byteLength, 0);
const initialGzip = initialBodies.reduce(
  (total, body) => total + gzipSync(body).byteLength,
  0,
);

const checks: Check[] = [
  {
    label: "dist/_astro JS",
    actual: sizeOf(join(DIST, "_astro"), (file) => file.endsWith(".js")),
    limit: 700 * KIB,
  },
  { label: "initial /play raw", actual: initialRaw, limit: 566 * KIB },
  { label: "initial /play gzip", actual: initialGzip, limit: 190 * KIB },
  { label: "dist/ total", actual: sizeOf(DIST), limit: 20 * MIB },
  { label: "public/audio", actual: sizeOf(join(ROOT, "public", "audio")), limit: 10 * MIB },
];

console.log("Bundle budget");
let over = false;
for (const { label, actual, limit } of checks) {
  const percent = Math.round((actual / limit) * 100);
  const verdict = actual > limit ? `OVER by ${format(actual - limit)}` : "ok";
  console.log(
    `  ${label.padEnd(18)} ${format(actual).padStart(9)} / ${format(limit).padStart(9)}  (${String(percent).padStart(3)}%)  ${verdict}`,
  );
  if (actual > limit) over = true;
}

// The lazy-parser guard: none of the translators may be in `/play`'s first
// download, and at least one chunk outside it must still carry them.
const initialText = initialBodies.map((body) => body.toString("utf8"));
const leaked = initial.filter((_, index) =>
  PARSER_MARKERS.some((marker) => initialText[index]?.includes(marker)),
);
const astroDir = join(DIST, "_astro");
const allChunks = existsSync(astroDir)
  ? readdirSync(astroDir)
      .filter((file) => file.endsWith(".js"))
      .map((file) => join(astroDir, file))
  : [];
const parserChunks = allChunks
  .filter((file) => !initial.includes(file))
  .filter((file) =>
    PARSER_MARKERS.some((marker) => readFileSync(file, "utf8").includes(marker)),
  );
if (leaked.length > 0) {
  console.error(
    `  ${"lazy parsers".padEnd(18)} FAIL: ${leaked.map((file) => file.slice(DIST.length + 1)).join(", ")} is in /play's first download`,
  );
  over = true;
} else if (parserChunks.length === 0) {
  console.error(`  ${"lazy parsers".padEnd(18)} FAIL: no parser chunk outside /play's first download`);
  over = true;
} else {
  console.log(
    `  ${"lazy parsers".padEnd(18)} ${parserChunks.length} chunk(s) outside /play's first download (${initial.length} initial JS files)`,
  );
}

if (over) {
  console.error("Bundle budget exceeded — see scripts/check-budget.ts for the rationale.");
  process.exitCode = 1;
}
