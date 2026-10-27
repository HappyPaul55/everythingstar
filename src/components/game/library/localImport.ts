/**
 * The arithmetic behind importing local files.
 *
 * Browsers without the File System Access picker can still take a folder through
 * an `<input type="file" webkitdirectory>` or a drop, but those hand back a flat
 * list of `File`s whose only idea of a tree is `webkitRelativePath`. This module
 * turns that list into the thing the folder scanner expects: a root name, a stable
 * id, and paths relative to that root. The writing, copying and scanning live in
 * `folder.ts`; everything here is pure, so the decisions can be tested without a
 * browser or a disk.
 *
 * The **id is the name plus what the selection holds** — `slug(name)-hash(name)`
 * and a digest of its relative paths — because two flat selections are both called
 * "Imported songs": a name alone would make the second one the first one, and
 * copying files for song B would delete the copy for song A. The only difference
 * from a picked folder is where the files live: `imports/<id>/` in the Origin
 * Private File System rather than wherever the player keeps them.
 */

import { slug } from "../../../lib/game/text";

/** The most one import may copy: half a gigabyte. */
export const IMPORT_CAP_BYTES = 512 * 1024 * 1024;

/**
 * Room left alone when asking the browser how much space there is.
 *
 * `StorageManager.estimate()` is an estimate, and the origin needs room for the
 * library's own records and cache. An import that exactly fills the quota would
 * make the next chart write fail, so this much is kept back.
 */
export const IMPORT_HEADROOM_BYTES = 16 * 1024 * 1024;

/** A folder of loose files with no common name of its own. */
const IMPORT_FALLBACK_NAME = "Imported songs";

/**
 * What a `.sng`, a chart folder, a lyric sheet or a chart folder can contain.
 *
 * `accept` is a hint and a dropped folder ignores it entirely, so this is also
 * the list the import validates against — a selection with no file from it has
 * nothing the folder scanner can read.
 */
const IMPORT_EXTENSIONS = [
  ".sng",
  ".mid",
  ".chart",
  ".sm",
  ".txt",
  ".lrc",
  ".srt",
  ".vtt",
  ".ini",
  ".ogg",
  ".opus",
  ".mp3",
  ".wav",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
] as const;

/** The comma-separated list an `<input type="file" accept>` takes. */
export const IMPORT_ACCEPT = IMPORT_EXTENSIONS.join(",");

/** The parts of a `File` this module reads. Structural, so it stays testable. */
export interface ImportFileLike {
  name: string;
  size: number;
  /** The path a directory input or a drop gives a file. */
  webkitRelativePath?: string;
}

/** One file, at the path it will be written to under the import's root. */
export interface ImportedPath<T extends ImportFileLike = ImportFileLike> {
  path: string;
  file: T;
}

export interface ImportRoot {
  name: string;
  /**
   * The import's base key: the name it is listed under and a digest of its relative
   * paths. Generations are added to it (`-2`, `-3`), so this is also what a
   * replacement compares. `folderId(name)` stays the picker's id, for a folder
   * chosen with a handle rather than copied here.
   */
  id: string;
}

export type ImportBudgetReason = "too-large" | "no-space";

export type ImportBudget =
  | { ok: true }
  | { ok: false; reason: ImportBudgetReason };

interface ResolvedPath<T extends ImportFileLike> {
  segments: string[];
  file: T;
}

/**
 * A path as safe segments, or null when it is not one.
 *
 * A dropped or selected path can contain `.` and empty segments; it must not
 * contain `..`, because `imports/<id>/../../something` is not inside the import.
 */
function segmentsOf(path: string): string[] | null {
  const parts = path.replace(/\\/g, "/").split("/").filter((part) => part !== "" && part !== ".");
  if (parts.length === 0 || parts.some((part) => part === "..")) return null;
  return parts;
}

/** Does this file's name say the scanner can read it? */
export function isImportable(name: string): boolean {
  const lower = name.toLowerCase();
  return IMPORT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Every file that can be imported, with the path it keeps.
 *
 * The common first segment of a directory selection (`My Songs/…`) is **the
 * root**, not part of the path: `imports/<id>/` stands where the chosen folder
 * stood, exactly as the picker's handle is the chosen folder rather than its
 * parent. A flat selection keeps its file names.
 */
function resolve<T extends ImportFileLike>(files: readonly T[]): ResolvedPath<T>[] {
  const resolved: ResolvedPath<T>[] = [];
  for (const file of files) {
    const raw = file.webkitRelativePath || file.name;
    const segments = segmentsOf(raw);
    if (!segments) continue;
    if (!isImportable(segments[segments.length - 1] as string)) continue;
    resolved.push({ segments, file });
  }
  return resolved;
}

/** The one top-level folder every path shares, or null for a flat selection. */
function commonRoot<T extends ImportFileLike>(resolved: readonly ResolvedPath<T>[]): string | null {
  const withDirectory = resolved.filter((entry) => entry.segments.length > 1);
  if (withDirectory.length === 0) return null;
  const first = withDirectory[0] as ResolvedPath<T>;
  const root = first.segments[0] as string;
  return withDirectory.every(
    (entry) => entry.segments.length > 1 && entry.segments[0] === root,
  )
    ? root
    : null;
}

function nameOfFile(fileName: string): string {
  return fileName.replace(/\.sng$/i, "");
}

/** What to call a resolved selection, and the id the rest of the game knows it by. */
function rootOf<T extends ImportFileLike>(
  resolved: readonly ResolvedPath<T>[],
  entries: readonly ImportedPath[],
): ImportRoot {
  const root = commonRoot(resolved);
  const name =
    root ??
    (resolved.length === 1
      ? nameOfFile((resolved[0] as ResolvedPath<T>).segments[0] as string)
      : IMPORT_FALLBACK_NAME);
  return { name, id: `${folderId(name)}-${digestOf(entries)}` };
}

/**
 * What a selection holds, as one short key.
 *
 * The **relative paths only** — sorted, and never the bytes — so the same
 * selection always answers the same thing without reading a file twice, while a
 * different tree that happens to share a display name does not. The digest ends
 * in a letter on purpose: a generation is a `-2` appended to the id, and
 * `importBase` must be able to tell its own tail from one.
 */
function digestOf(entries: readonly ImportedPath[]): string {
  return `${hash(entries.map((entry) => entry.path).sort().join("\n"))}z`;
}

/** The files to write, with their paths relative to the import's root. */
function pathsOf<T extends ImportFileLike>(
  resolved: readonly ResolvedPath<T>[],
): ImportedPath<T>[] {
  const root = commonRoot(resolved);
  const entries: ImportedPath<T>[] = [];
  for (const entry of resolved) {
    const segments = root ? entry.segments.slice(1) : entry.segments;
    if (segments.length === 0) continue;
    entries.push({ path: segments.join("/"), file: entry.file });
  }
  return entries;
}

/**
 * What to call an import, and the id the rest of the game will know it by.
 *
 * A directory selection is called after the directory; a single `.sng` after its
 * own file name; a flat selection of several files has no name of its own, so it
 * gets a plain one — and every one of them carries the digest of its paths, so a
 * copy is never mistaken for another with the same name. Null when nothing can be
 * imported.
 */
export function importRoot(files: readonly ImportFileLike[]): ImportRoot | null {
  const resolved = resolve(files);
  if (resolved.length === 0) return null;
  return rootOf(resolved, pathsOf(resolved));
}

/**
 * The files to write, with their paths relative to the import's root.
 *
 * The root segment is removed (it is the directory `imports/<id>/` stands for),
 * and the result is in selection order.
 */
export function importPaths<T extends ImportFileLike>(
  files: readonly T[],
): ImportedPath<T>[] {
  return pathsOf(resolve(files));
}

/** A selection resolved once: what it is called, what to copy, and how big it is. */
export interface PreparedImport<T extends ImportFileLike = ImportFileLike> {
  root: ImportRoot;
  entries: ImportedPath<T>[];
  size: number;
}

/**
 * Read a selection once for everything an import needs.
 *
 * `importRoot` and `importPaths` each scan the list, and a copy asks for both
 * before it writes anything — a two-thousand-file selection filtered and walked
 * three times for one answer. This resolves the list once and hands back the
 * root, the paths and their total, so the copy does the work once.
 *
 * Null when nothing in the selection can be imported; the id, the paths, the cap
 * and their order are the same as the separate functions'.
 */
export function prepareImport<T extends ImportFileLike>(
  files: readonly T[],
): PreparedImport<T> | null {
  const resolved = resolve(files);
  if (resolved.length === 0) return null;
  const entries = pathsOf(resolved);
  return {
    root: rootOf(resolved, entries),
    entries,
    size: importSize(entries),
  };
}

/** What an import will copy, in bytes. */
export function importSize(entries: readonly ImportedPath[]): number {
  return entries.reduce((total, entry) => {
    const size = entry.file.size;
    return total + (Number.isFinite(size) && size > 0 ? size : 0);
  }, 0);
}

/**
 * Is this batch small enough, and is there room for it?
 *
 * `availableBytes` is `quota - usage` from `navigator.storage.estimate()` when
 * the browser can say; null/undefined means it could not, and then only the cap
 * applies. The headroom is kept back so an import cannot fill the origin and
 * leave the game unable to write its own records.
 */
export function importBudget(
  totalBytes: number,
  options: {
    capBytes?: number;
    availableBytes?: number | null;
  } = {},
): ImportBudget {
  const cap = options.capBytes ?? IMPORT_CAP_BYTES;
  if (totalBytes > cap) return { ok: false, reason: "too-large" };
  const available = options.availableBytes;
  if (typeof available === "number" && Number.isFinite(available)) {
    if (totalBytes + IMPORT_HEADROOM_BYTES > Math.max(0, available)) {
      return { ok: false, reason: "no-space" };
    }
  }
  return { ok: true };
}

/**
 * A relative path as the directories to create and the file to write.
 *
 * Null for a path that is not one — empty, absolute-only or trying to climb out.
 */
export function splitImportPath(
  path: string,
): { directories: string[]; name: string } | null {
  if (/[\\/]$/.test(path)) return null;
  const segments = segmentsOf(path);
  if (!segments) return null;
  const name = segments.pop();
  if (!name) return null;
  return { directories: segments, name };
}

/* ------------------------------------------------------------------ ids */

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let at = 0; at < value.length; at += 1) {
    result ^= value.charCodeAt(at);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36);
}

/** The stable id a folder name gets, shared with the picker's `openFolder`. */
export function folderId(name: string): string {
  return `${slug(name) || "folder"}-${hash(name)}`;
}

/**
 * The import key a generation belongs to.
 *
 * A re-import is a **new generation** of one import (`base-2`, `base-3` …), so
 * replacing only ever touches copies of *this* selection. The name alone is not
 * the key — every flat selection is called the same thing — and the generation
 * is only ever a plain number after the digest's closing letter.
 */
export function importBase(id: string): string {
  // Every import key ends in the digest's closing letter, so a legacy name-derived
  // id — or a slug that happens to end in digits — is its own base, never a
  // generation of somebody else's import.
  const match = /^(.*z)-(\d+)$/.exec(id);
  if (!match) return id;
  const [whole, base, generation] = match;
  return Number(generation) >= 2 ? base : whole;
}
