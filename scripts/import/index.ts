/**
 * Import a folder of somebody else's charts into the three documents the game
 * reads.
 *
 * ```bash
 * bun run import --from "C:/…/Chart Library" --to public/library --audio-base ../audio
 * ```
 *
 * It walks the tree, treats a folder with a `notes.mid` or a `.chart` as a song
 * (and a folder with a `.txt`, `.lrc` or `.srt` and no chart as one too), reads
 * each with the **same pure parsers** the game would use at runtime, and writes a
 * `playlist.json`, a song document per song and a chart document per chart. It
 * copies **no audio**: the stems are referenced **relative to the song document**,
 * with `--audio-base` as the override (its default is `../audio`, the manifest's own
 * root-relative layout), and a sidecar
 * `audio-manifest.json` says exactly which files each song needs — in that same
 * layout — so a host can be prepared separately.
 *
 * Nothing here is game code — it is a converter, and it is allowed to be slow.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { decodeText } from "../../src/lib/game/sources/bytes";
import {
  ART_NAMES,
  AUDIO_NAMES,
  PREVIEW_NAMES,
  findName,
  folderAttribution,
  INI_NAMES,
} from "../../src/lib/game/sources/files";
import { readIni } from "../../src/lib/game/sources/ini";
import { parseSource } from "../../src/lib/game/sources/parse";
import type { ParsedSource, StemRole } from "../../src/lib/game/sources/types";
import { writeSource } from "../../src/lib/game/sources/write";
import { findSongs, type SongFolder } from "./find";
import {
  USAGE,
  exitCodeFor,
  parseArgs,
  reportOf,
  rootRelative,
  songIds,
  stemUrl,
  usableCharts,
  type ImportProblem,
} from "./options";

/** The audio this folder has, as absolute paths by role. */
function findAudio(dir: string): Partial<Record<StemRole, string>> {
  const out: Partial<Record<StemRole, string>> = {};
  for (const [role, names] of AUDIO_NAMES) {
    const file = findFile(dir, names);
    if (file) out[role] = file;
  }
  return out;
}

/** A file in a folder, by any of the names it might go by. */
function findFile(dir: string, candidates: readonly string[]): string | null {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const name = findName(entries, candidates);
  return name ? join(dir, name) : null;
}

/** Fill in what a file left unsaid, from the folder's own `Artist - Title` name. */
function attribute(source: ParsedSource, folderName: string): void {
  const from = folderAttribution(folderName);
  if (!from) return;
  if (!source.meta.artist) source.meta.artist = from.artist;
  if (source.meta.title === folderName || !source.meta.title) source.meta.title = from.title;
}

function readSource(folder: SongFolder, root: string, audioBase: string, id: string): ParsedSource {
  const bytes = new Uint8Array(readFileSync(folder.chart));
  const dir = folder.dir;

  const iniFile = findFile(dir, INI_NAMES);
  const ini = iniFile ? readIni(decodeText(new Uint8Array(readFileSync(iniFile)))) : null;
  const artFile = findFile(dir, ART_NAMES);
  const art = artFile ? stemUrl(artFile, root, audioBase) : null;
  const audio = findAudio(dir);
  const stems: Partial<Record<StemRole, string>> = {};
  for (const [role, file] of Object.entries(audio) as [StemRole, string][]) {
    stems[role] = stemUrl(file, root, audioBase);
  }

  const fallbackTitle = basename(dir);
  // A jukebox clip is not a stem: it is named in the song document so the jukebox can
  // play it, and nothing mixes it into a run.
  const previewFile = findFile(dir, PREVIEW_NAMES);
  // One door, exactly as the game has: the importer used to keep its own switch and
  // send every format it did not name to the lyric reader, which is the "three-second
  // song with no words" bug the door was introduced to fix.
  const source = parseSource({
    bytes,
    name: basename(folder.chart),
    ini,
    stems,
    art,
    fallbackTitle,
    id,
    preview: previewFile ? stemUrl(previewFile, root, audioBase) : null,
  });
  attribute(source, fallbackTitle);
  return source;
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.error);
    console.error(USAGE);
    process.exit(1);
  }
  const options = parsed.options;
  const root = resolve(options.from);
  const out = resolve(options.to);
  const folders = findSongs(root);
  // The id is a property of the folder's place in the collection, not of its title,
  // and it is settled over **every** folder found — before `--only` and `--limit`
  // select any — so choosing a subset cannot change what a song is called. Two copies
  // of one title in two albums are two songs rather than one document overwritten.
  const ids = songIds(
    folders.map((folder) => {
      const path = relative(root, folder.dir);
      return path ? path.split(sep).join("/") : basename(root);
    }),
  );
  const chosen = folders
    .map((folder, index) => ({ folder, id: ids[index] }))
    .filter(
      ({ folder }) =>
        !options.only || folder.dir.toLowerCase().includes(options.only.toLowerCase()),
    );

  const entries: unknown[] = [];
  const manifest: Record<string, string[]> = {};
  const problems: ImportProblem[] = [];
  let attempted = 0;
  let charts = 0;
  let notes = 0;
  let failed = 0;
  let written = 0;

  for (const { folder, id } of chosen) {
    if (attempted >= options.limit) break;
    attempted += 1;
    let source: ParsedSource;
    try {
      source = readSource(folder, root, options.audioBase, id);
    } catch (error) {
      failed += 1;
      problems.push({ song: folder.dir, problem: `could not be read: ${String(error)}` });
      continue;
    }

    // A file with no chart and no timed lyrics is not a song. Writing it would put
    // an unplayable entry in the playlist with a title and no game mode.
    if (source.lanes.length === 0 && !source.melody) {
      problems.push({ song: source.meta.id, problem: "no chart or timed lyrics found" });
      continue;
    }

    // The validator a source parser is held to. A chart that fails would be refused
    // by the stage anyway, so it is dropped here, named in the report, and never
    // written: otherwise the playlist offers an instrument the band cannot play.
    const gate = usableCharts(source);
    source.lanes = gate.lanes;
    charts += gate.charts;
    notes += gate.notes;
    problems.push(...gate.problems);

    // Every chart this source had was unfit. A melody alone is still a song; with no
    // melody either there is nothing to write, so the entry is skipped rather than
    // left empty.
    if (source.lanes.length === 0 && !source.melody) {
      problems.push({ song: source.meta.id, problem: "no usable chart or timed lyrics found" });
      continue;
    }
    for (const problem of source.problems) problems.push({ song: source.meta.id, problem });

    const result = writeSource(source);
    entries.push(result.entry);
    const audioFiles = Object.values(findAudio(folder.dir)) as string[];
    const previewFile = findFile(folder.dir, PREVIEW_NAMES);
    if (previewFile) audioFiles.push(previewFile);
    manifest[source.meta.id] = audioFiles.map((file) => rootRelative(file, root));

    if (!options.dryRun) {
      for (const file of result.files) {
        const target = join(out, file.path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file.body);
        written += 1;
      }
    }
  }

  if (!options.dryRun) {
    mkdirSync(out, { recursive: true });
    writeFileSync(
      join(out, "playlist.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          name: basename(root),
          description: "Imported from a chart collection.",
          songs: entries,
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(join(out, "audio-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  const report = reportOf({ entries, attempted, charts, notes, failed, files: written, problems });
  if (options.report) writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `${options.dryRun ? "scanned" : "wrote"} ${report.songs} songs` +
      ` (${report.attempted} attempted), ${charts} charts, ${notes} notes` +
      `${options.dryRun ? "" : `, ${written} files`}` +
      `, ${failed} unreadable, ${problems.length} problems`,
  );
  if (options.report) console.log(`report: ${options.report}`);
  for (const problem of problems.slice(0, 10)) console.log(`  ${problem.song}: ${problem.problem}`);
  process.exitCode = exitCodeFor(failed);
}

if (import.meta.main) main();
