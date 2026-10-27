/**
 * The importer's decisions, without the disk.
 *
 * What a run is asked for (`parseArgs`), what each folder is called (`songIds`),
 * where its audio lives (`stemUrl`), which of its charts are fit to write
 * (`usableCharts`) and how the run is counted (`reportOf`) are all arithmetic. They
 * live here, pure, so `bun test` can hold the importer to its own rules without
 * walking a chart collection.
 *
 * The two path inputs are **relative to the import root**, stated as `/`-separated
 * text. `main` does the one `relative()` that knows which operating system it is on;
 * everything here sees the same shape on every machine.
 */

import { relative, sep } from "node:path";
import type { ParsedSource } from "../../src/lib/game/sources/types";
import { chartProblems, type LaneChart } from "../../src/lib/game/track";
import { slug } from "../../src/lib/game/text";

/** Where a song document's audio is, as seen from `songs/<id>.json`. */
export const DEFAULT_AUDIO_BASE = "../audio";

export const USAGE =
  "usage: bun run import --from <dir> [--to <dir>] [--audio-base <url>] [--report <file>] [--limit n] [--only text] [--dry-run]";

export interface Options {
  from: string;
  to: string;
  audioBase: string;
  report: string | null;
  /** How many folders may be attempted. `0` attempts none. */
  limit: number;
  only: string | null;
  dryRun: boolean;
}

export type ParseArgsResult =
  | { ok: true; options: Options }
  | { ok: false; error: string };

/**
 * Read the command line.
 *
 * A flag this importer does not know is ignored rather than refused, because the
 * script is often run through `bun run` with arguments of its own. A flag it does
 * know is answered exactly: `--limit` is a non-negative whole number, and an empty
 * `--from` is a missing one.
 */
export function parseArgs(argv: readonly string[]): ParseArgsResult {
  const options: Options = {
    from: "",
    to: "library",
    audioBase: DEFAULT_AUDIO_BASE,
    report: null,
    limit: Infinity,
    only: null,
    dryRun: false,
  };
  for (let at = 0; at < argv.length; at += 1) {
    const flag = argv[at];
    const value = argv[at + 1];
    switch (flag) {
      case "--from":
        options.from = value ?? "";
        at += 1;
        break;
      case "--to":
        options.to = value ?? options.to;
        at += 1;
        break;
      case "--audio-base":
        options.audioBase = value ?? options.audioBase;
        at += 1;
        break;
      case "--report":
        options.report = value ?? null;
        at += 1;
        break;
      case "--limit": {
        const limit = limitOf(value);
        if (limit === null) {
          return { ok: false, error: "--limit needs a non-negative whole number" };
        }
        options.limit = limit;
        at += 1;
        break;
      }
      case "--only":
        options.only = value ?? null;
        at += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      default:
        break;
    }
  }
  if (!options.from) return { ok: false, error: "missing --from" };
  return { ok: true, options };
}

/** A count of folders, or null when the text is not one. */
function limitOf(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  return Number(value);
}

/**
 * One id per folder path, in the order given.
 *
 * The id comes from the **path**, not the title, because two copies of "The Middle"
 * in two albums are two songs: a title-only id made them one document, and the
 * playlist kept whichever entry was written first. A path that slugs to the same
 * text as another gets a short, deterministic suffix from the whole path, so the
 * two stay apart even when their punctuation did not survive the slug. Every
 * colliding path is suffixed (never "the first one wins"), which keeps an id a
 * property of its folder rather than of the walk's order.
 */
export function songIds(paths: readonly string[]): string[] {
  const keys = paths.map((path) => path.split(/[\\/]+/).filter(Boolean).join("/"));
  const bases = keys.map((path) => slug(path) || "song");
  const counts = new Map<string, number>();
  for (const base of bases) counts.set(base, (counts.get(base) ?? 0) + 1);
  return bases.map((base, index) =>
    (counts.get(base) ?? 0) > 1 ? `${base}-${shortHash(keys[index])}` : base,
  );
}

/** A short, stable suffix for a path that slugs the same as another. */
function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let at = 0; at < value.length; at += 1) {
    hash ^= value.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** A file under the import root, as the `/`-separated path a manifest records. */
export function rootRelative(file: string, root: string): string {
  return relative(root, file).split(sep).join("/");
}

/**
 * A stem URL: its place under the audio base, which is where the manifest's own
 * paths live too.
 *
 * The default base is `../audio` rather than a bare file name. A song document is
 * written under `songs/`, so a bare `song.ogg` would resolve to `songs/song.ogg` —
 * beside the document rather than beside every other song's audio. With the default
 * base, `../audio/<manifest path>` and the manifest's `<manifest path>` name the
 * same file from the two documents that mention it.
 */
export function stemUrl(file: string, root: string, audioBase: string): string {
  const path = rootRelative(file, root);
  const base = audioBase.replace(/\/+$/, "");
  return base ? `${base}/${path}` : path;
}

export interface ImportProblem {
  song: string;
  problem: string;
}

export interface ChartGate {
  /** The charts the stage would accept, in their original order. */
  lanes: LaneChart[];
  charts: number;
  notes: number;
  problems: ImportProblem[];
}

/**
 * The charts of a source that pass the validator the stage holds every chart to.
 *
 * A chart that fails would be dropped at load, leaving the playlist advertising an
 * instrument the band then says it cannot play ("No chart for this instrument").
 * Dropping it here keeps the offer honest; the problem is still named in the
 * report, so the fault is visible rather than silent.
 */
export function usableCharts(source: ParsedSource): ChartGate {
  const lanes: LaneChart[] = [];
  const problems: ImportProblem[] = [];
  let notes = 0;
  for (const chart of source.lanes) {
    const found = chartProblems(chart);
    if (found.length > 0) {
      for (const problem of found) {
        problems.push({
          song: source.meta.id,
          problem: `${chart.instrument}/${chart.difficulty}: ${problem}`,
        });
      }
      continue;
    }
    lanes.push(chart);
    notes += chart.notes.length;
  }
  return { lanes, charts: lanes.length, notes, problems };
}

export interface ImportReport {
  /** Songs with an entry: scanned in a dry run, written otherwise. */
  songs: number;
  /** Folders the run tried to read, whether they worked or not. */
  attempted: number;
  charts: number;
  notes: number;
  failed: number;
  files: number;
  problems: ImportProblem[];
}

/**
 * The report a run leaves behind.
 *
 * `songs` is the number of entries, not the number of folders attempted: the
 * folders that failed are already named, and adding them to the total made the
 * summary overcount by exactly the failures it reported.
 */
export function reportOf(input: {
  entries: readonly unknown[];
  attempted: number;
  charts: number;
  notes: number;
  failed: number;
  files: number;
  problems: ImportProblem[];
}): ImportReport {
  return {
    songs: input.entries.length,
    attempted: input.attempted,
    charts: input.charts,
    notes: input.notes,
    failed: input.failed,
    files: input.files,
    problems: input.problems,
  };
}

/** A run that could not read every folder it tried says so in its exit code. */
export function exitCodeFor(failed: number): number {
  return failed > 0 ? 1 : 0;
}
