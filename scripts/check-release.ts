/// <reference types="bun" />
/**
 * The release-asset gate, run after `bun run release:assets`.
 *
 * Three archives leave this repository, and each has one job:
 *
 * - **`game.zip` / `arcade.zip`** are the game alone — one entry page promoted to
 *   `index.html`, the game's own directories, a manifest rewired to `/`, and
 *   nothing of the website. A player who downloads one serves it at an origin's
 *   root and gets the game.
 * - **`website.zip`** is `dist/` exactly, the deploy.
 *
 * Both formats must hold the same files, and those files must be the plan
 * (`planBundle` in `src/lib/release/bundles.ts`) — but the check that matters is
 * the one a listing cannot answer alone: **the entry page may not name a file the
 * archive does not hold.** A missing `_astro` chunk draws a page that never
 * hydrates, and a manifest naming `/app` installs a shortcut to a 404. The pure
 * half is `bundleProblems`; this file is archives, temp directories and reports.
 *
 * It also refuses a size the build cannot justify: the archives are the build's own
 * bytes, so one that has quietly doubled is a video or a stem pack in `public/`,
 * and that belongs in the budget, not in a download.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MANIFEST_NAME,
  RELEASE_BUNDLES,
  bundleProblems,
  planBundle,
  type ReleaseBundle,
} from "../src/lib/release/bundles";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "release");
const MIB = 1024 * 1024;

/**
 * What one archive may weigh.
 *
 * The standalone folders are the audio (capped at 10 MiB), the hashed chunks, the
 * icons, the artwork and the fonts: 11.8 MiB is the most the budget allows, so 16
 * leaves room for ordinary growth and refuses a build that has become a download.
 * The website adds the pages and the worker to the same pile.
 */
const CAPS: Record<ReleaseBundle, number> = {
  game: 16 * MIB,
  arcade: 16 * MIB,
  website: 18 * MIB,
};

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures.push(detail ? `${label}: ${detail}` : label);
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

function format(bytes: number): string {
  return `${(bytes / MIB).toFixed(1)} MiB`;
}

/** A command's answer, without throwing on a failure the check wants to report. */
function run(command: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = Bun.spawnSync(command, { cwd: ROOT, env: { ...process.env, TZ: "UTC" } });
  return {
    ok: result.exitCode === 0,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

/** The entries a zip lists, with no directory entries and no `./`. */
function zipEntries(file: string): string[] {
  return run(["unzip", "-Z1", file])
    .stdout.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith("/"))
    .sort();
}

/** The entries a gzipped tar lists, which prefix each name with `./` or a dot. */
function tarEntries(file: string): string[] {
  return run(["tar", "-tzf", file])
    .stdout.split("\n")
    .map((line) => line.trim().replace(/^\.\//, ""))
    .filter((line) => line.length > 0 && !line.endsWith("/"))
    .sort();
}

function distinct(names: readonly string[]): boolean {
  return new Set(names).size === names.length;
}

/** Every file under `dir`, `dist/`-relative and `/`-separated, sorted. */
function walk(dir: string, prefix = ""): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...walk(join(dir, entry.name), path));
    else files.push(path);
  }
  return files.sort();
}

if (!existsSync(DIST)) {
  console.error("dist/ is missing. Run `bun run build` first.");
  process.exit(1);
}

const distFiles = walk(DIST);

const missing = RELEASE_BUNDLES.flatMap((bundle) =>
  ["zip", "tar.gz"].map((suffix) => join(OUT, `${bundle}.${suffix}`)),
).filter((file) => !existsSync(file));

if (missing.length > 0) {
  console.error("Release assets");
  for (const file of missing) {
    console.error(`  ✗ missing ${relative(ROOT, file)}`);
  }
  console.error("Build them with `bun run release:assets` (which needs `bun run build`).");
  process.exit(1);
}

console.log("Release assets");

for (const bundle of RELEASE_BUNDLES) {
  const plan = planBundle(bundle, distFiles);
  const zipPath = join(OUT, `${bundle}.zip`);
  const tarPath = join(OUT, `${bundle}.tar.gz`);

  console.log(`\n${bundle}`);
  check("the zip is intact", run(["unzip", "-tq", zipPath]).ok);
  check("the tar is intact", run(["gzip", "-t", tarPath]).ok);

  const zip = zipEntries(zipPath);
  const tar = tarEntries(tarPath);
  check("the zip lists no entry twice", distinct(zip));
  check("the tar lists no entry twice", distinct(tar));
  check(
    "both formats hold the same files",
    zip.join("\n") === tar.join("\n"),
    "the zip and the tar.gz disagree",
  );

  const dir = mkdtempSync(join(tmpdir(), `everythingstar-${bundle}-`));
  try {
    const extracted = run(["unzip", "-q", "-o", zipPath, "-d", dir]);
    check("the zip extracts", extracted.ok, extracted.stderr.trim());
    if (extracted.ok) {
      const html = plan.entry ? readFileSync(join(dir, plan.entry.to), "utf8") : null;
      const manifestFile = join(dir, MANIFEST_NAME);
      const manifest =
        plan.generated.includes(MANIFEST_NAME) && existsSync(manifestFile)
          ? readFileSync(manifestFile, "utf8")
          : null;
      const problems = bundleProblems({ plan, listing: zip, html, manifest });
      check(
        "it holds its plan, and its page names nothing it has not got",
        problems.length === 0,
        problems.join("; "),
      );
      for (const problem of problems) console.log(`      ${problem}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  for (const file of [zipPath, tarPath]) {
    const size = Bun.file(file).size;
    check(
      `${relative(OUT, file)} is ${format(size)} (cap ${format(CAPS[bundle])})`,
      size <= CAPS[bundle],
      `${format(size)} is over the cap`,
    );
  }
}

console.log("");
if (failures.length > 0) {
  console.error(`${failures.length} release-asset problem${failures.length === 1 ? "" : "s"}:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log("Every archive is complete, and both formats agree.");
