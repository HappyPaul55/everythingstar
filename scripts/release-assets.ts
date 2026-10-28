/// <reference types="bun" />
/**
 * Build the release archives: `game`, `arcade` and `website`, as a zip and a tar.
 *
 * Run after `bun run build` (`bun run release:assets`), which is what writes
 * `dist/`; the archives are that build rearranged and nothing else. `game` and
 * `arcade` promote one of the built game-only pages to `index.html` and carry the
 * assets it needs; `website` is `dist/` untouched. What each one holds is
 * `planBundle` in `src/lib/release/bundles.ts` — the same plan the checker reads —
 * so this file is only copying, compressing and reporting.
 *
 * **The archive step is deterministic**: entries are written in sorted order, every
 * file's timestamp is the source commit's (or `SOURCE_DATE_EPOCH`), the zip keeps
 * no extra attributes (`-X`) and the gzip header carries no name or time (`-n`'s
 * effect, by compressing the tar ourselves). Two runs over the same `dist/` are the
 * same bytes, which is what lets a size or a checksum mean something.
 *
 * The **build** is not byte-reproducible, and this is worth knowing before a checksum
 * is compared across machines: Astro stamps per-build ids into the pages and the
 * worker names the moment it was built, so a rebuild of the same commit has the same
 * file names and byte-identical chunks, but not the same page bytes.
 *
 * Both archivers are the system's (`zip`, `tar`): they are on every runner and on
 * the developer machines this repo is built on, and a hand-written zip writer is a
 * format to maintain rather than a tool to use.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  BUILD_NOTE_NAME,
  MANIFEST_NAME,
  RELEASE_BUNDLES,
  archiveFiles,
  buildNote,
  planBundle,
  standaloneManifest,
  type BundlePlan,
  type ReleaseBundle,
} from "../src/lib/release/bundles";
import { readVersion } from "./version";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");

/** The earliest timestamp a zip can store: 1980-01-01T00:00:00Z. */
const FALLBACK_EPOCH = 315_532_800;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

function format(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  return mib >= 1 ? `${mib.toFixed(1)} MiB` : `${(bytes / 1024).toFixed(0)} KiB`;
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

/**
 * The timestamp every archive entry gets.
 *
 * The commit's own time, so a rebuild of the same commit is the same archive; a
 * checkout with no history (a bare export) says `SOURCE_DATE_EPOCH`, and a machine
 * with neither falls back to the earliest date a zip can hold.
 */
function sourceEpoch(): number {
  const fromEnv = process.env.SOURCE_DATE_EPOCH;
  if (fromEnv && /^\d+$/.test(fromEnv)) return Number(fromEnv);
  try {
    const seconds = Number(
      execFileSync("git", ["log", "-1", "--format=%ct"], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
    return Number.isFinite(seconds) && seconds > FALLBACK_EPOCH ? seconds : FALLBACK_EPOCH;
  } catch {
    return FALLBACK_EPOCH;
  }
}

/** Copy one bundle's files into its staging directory, renamed and supplemented. */
function stage(plan: BundlePlan, version: string): string {
  const dir = join(outDir, ".stage", plan.bundle);
  rmSync(dir, { recursive: true, force: true });

  for (const file of plan.files) {
    const from = join(DIST, file);
    if (!existsSync(from)) fail(`dist/${file} is missing; run \`bun run build\` first.`);
    const to = join(dir, file);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }

  if (plan.entry) {
    const from = join(DIST, plan.entry.from);
    if (!existsSync(from)) {
      fail(`dist/${plan.entry.from} is missing: ${plan.bundle} has no entry page.`);
    }
    cpSync(from, join(dir, plan.entry.to));
  }

  for (const file of plan.generated) {
    const text =
      file === MANIFEST_NAME
        ? standaloneManifest(readFileSync(join(DIST, MANIFEST_NAME), "utf8"))
        : file === BUILD_NOTE_NAME
          ? buildNote(version)
          : fail(`${plan.bundle}: no builder for the generated file ${file}.`);
    writeFileSync(join(dir, file), text);
  }

  // The archives list exactly what the plan says; the staging directory is the
  // plan written down, so nothing can be copied that the checker does not expect.
  const wanted = archiveFiles(plan);
  const staged = walk(dir);
  if (staged.join("\n") !== wanted.join("\n")) {
    fail(
      `${plan.bundle}: the staged files are not the plan's.\n` +
        `  plan: ${wanted.join(", ")}\n  staged: ${staged.join(", ")}`,
    );
  }
  return dir;
}

/** Stamp every staged file with the source time, so the same `dist/` zips the same way. */
function stamp(dir: string, epoch: number): void {
  for (const file of walk(dir)) {
    utimesSync(join(dir, file), epoch, epoch);
  }
}

/** A zip with sorted entries, no extra attributes and no platform metadata. */
function zip(dir: string, target: string, names: readonly string[]): void {
  rmSync(target, { force: true });
  const result = Bun.spawnSync(["zip", "-X", "-q", "-9", target, "-@"], {
    cwd: dir,
    stdin: Buffer.from(`${names.join("\n")}\n`),
    env: { ...process.env, TZ: "UTC" },
  });
  if (result.exitCode !== 0) {
    fail(`zip failed for ${relative(ROOT, target)}:\n${result.stderr.toString()}`);
  }
}

/** A gzipped tar of the same files, compressed by us so the header stays bare. */
function tarball(dir: string, target: string, names: readonly string[], epoch: number): void {
  const result = Bun.spawnSync(
    [
      "tar",
      "--sort=name",
      `--mtime=@${epoch}`,
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "--format=gnu",
      "-cf",
      "-",
      ...names,
    ],
    { cwd: dir, env: { ...process.env, TZ: "UTC" } },
  );
  if (result.exitCode !== 0) {
    fail(`tar failed for ${relative(ROOT, target)}:\n${result.stderr.toString()}`);
  }
  writeFileSync(target, gzipSync(result.stdout, { level: 9 }));
}

if (!existsSync(DIST)) fail("dist/ is missing; run `bun run build` (Astro first).");

const outDir = resolve(ROOT, flag("--out") ?? "release");
const requested = flag("--only");
const wanted: ReleaseBundle[] = requested
  ? (requested.split(",").map((name) => name.trim()) as ReleaseBundle[])
  : [...RELEASE_BUNDLES];
for (const bundle of wanted) {
  if (!RELEASE_BUNDLES.includes(bundle)) {
    fail(`Unknown bundle "${bundle}": expected one of ${RELEASE_BUNDLES.join(", ")}.`);
  }
}

const distFiles = walk(DIST);
const epoch = sourceEpoch();
const version = readVersion();

mkdirSync(outDir, { recursive: true });

console.log(`Release assets ${version}`);
const rows: { bundle: ReleaseBundle; files: number; zip: number; tar: number }[] = [];

for (const bundle of wanted) {
  const plan = planBundle(bundle, distFiles);
  const dir = stage(plan, version);
  stamp(dir, epoch);
  const names = archiveFiles(plan);
  const zipPath = join(outDir, `${bundle}.zip`);
  const tarPath = join(outDir, `${bundle}.tar.gz`);
  zip(dir, zipPath, names);
  tarball(dir, tarPath, names, epoch);
  rows.push({
    bundle,
    files: names.length,
    zip: Bun.file(zipPath).size,
    tar: Bun.file(tarPath).size,
  });
}

rmSync(join(outDir, ".stage"), { recursive: true, force: true });

for (const row of rows) {
  console.log(
    `  ${row.bundle.padEnd(8)} ${String(row.files).padStart(4)} files` +
      `  ${format(row.zip).padStart(9)} zip` +
      `  ${format(row.tar).padStart(9)} tar.gz`,
  );
}
console.log(`  in ${relative(ROOT, outDir) || "."}/`);
