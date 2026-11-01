/**
 * Opening a **folder** of charts from this machine.
 *
 * A playlist is a URL somebody serves; a folder is the charts a player already has
 * on their disk. Rather than insist on a converter first, the File System Access
 * API lets the game read one directly: the folder is walked, each chart is put
 * through the **same parsers** the importer uses, and the songs join the library
 * beside the playlists. Nothing is uploaded, nothing is copied, and the folder is
 * only ever read.
 *
 * A song read this way is addressed by a `folder://<source>/<path>` URL — the same
 * shape everything else resolves against, so the readers, the song document and the
 * band screen never learn where a track came from.
 *
 * **The folder is remembered between visits.** The handle is structured-cloneable, so
 * IndexedDB keeps it, and the songs that were read out of it go down with it — but the
 * browser's **permission** does not come back, so a restored folder is listed and
 * **locked** until somebody presses Reconnect. Only a gesture can ask, which is why
 * that is a button rather than something a reload does on its own.
 */

import { decodeText } from "../../../lib/game/sources/bytes";
import { MAX_PACKAGE_BYTES } from "../../../lib/game/fetchLimits";
import {
  ART_NAMES,
  AUDIO_NAMES,
  PREVIEW_NAMES,
  findChartName,
  findName,
  folderAttribution,
  INI_NAMES,
} from "../../../lib/game/sources/files";
import { readIni, type IniValues } from "../../../lib/game/sources/ini";
import type { SngHeader } from "../../../lib/game/sources/sng";
import {
  mimeForSng,
  sngEntryName,
  sngEntryUrl,
  sngFiles,
  type SngFiles,
} from "../../../lib/game/sources/sngNames";
import type { ParsedSource, StemRole } from "../../../lib/game/sources/types";
import { playlistEntry } from "../../../lib/game/sources/write";
import { readPlaylist } from "../../../lib/game/playlist";
import type { Song } from "../../../lib/game/song";
import { basename, slug } from "../../../lib/game/text";
import {
  IMPORT_CAP_BYTES,
  folderId,
  importBase,
  importBudget,
  prepareImport,
  splitImportPath,
} from "./localImport";
import { isSngUrl } from "./sngUrl";
import { sngBlob } from "./sngBlob";
import { loadFolders, saveFolders, type StoredFolder } from "./store";

/** The browser picker's shape, kept local because not every lib knows it yet. */
interface PickerWindow {
  showDirectoryPicker?(options?: {
    id?: string;
    mode?: "read" | "readwrite";
  }): Promise<FileSystemDirectoryHandle>;
}

/** What was found for one song, so reading it again needs no walking. */
export interface LocalSongFiles {
  /** The folder the chart sits in, as a `folder://` URL. */
  dirUrl: string;
  chart: string;
  ini: string | null;
  audio: Partial<Record<StemRole, string>>;
  art: string | null;
  /** A jukebox clip beside the chart, when the chart folder has one. Not a stem. */
  preview?: string | null;
  /** The chart and audio live inside one `.sng`, not beside it. */
  package?: boolean;
  /**
   * The folder has been listed for this song at least once. A record with no audio
   * and this set is a chart-only song, not a record that still needs repairing.
   */
  checked?: boolean;
}

/**
 * The scanner/parser generation behind a stored folder's song summaries.
 *
 * A folder is remembered as plain data, so a parser change would otherwise leave
 * old summaries on screen — a song that now has vocals still saying "no voice"
 * until somebody removes and re-adds the folder. Bump this whenever the reader
 * changes what a folder's songs *are*; a restored folder with an older value is
 * rescanned once.
 */
export const FOLDER_SCAN_VERSION = 2;

const folders = new Map<string, FileSystemDirectoryHandle>();
const songFiles = new Map<string, LocalSongFiles>();
/** Packages already opened, by URL: the header and the `File` its entries slice from. */
const sngFilesByUrl = new Map<string, Promise<LocalSng | null>>();
/** What reading each folder found, so a restored folder is a list and not a re-read. */
const scanned = new Map<string, Song[]>();
/** Folders whose stored summaries came from an older scanner. */
const staleFolders = new Set<string>();
/**
 * The scan version each remembered folder was stored with.
 *
 * A folder waiting to be rescanned keeps its old version when anything persists, so
 * repairing a *different* folder cannot quietly mark it current and stop the rescan
 * it still needs.
 */
const storedVersions = new Map<string, number | undefined>();
/**
 * Has the stored folder list been read into this session yet?
 *
 * A folder opened or imported before it has would otherwise `persist()` a list of
 * one, and that sparse list would erase every folder the player had last visit.
 * Until the restore lands a write is only **remembered**, and the restore writes
 * the whole list once afterwards.
 */
let foldersRestored = false;
/** A write asked for before the restore answered: one, after the map is whole. */
let folderWritePending = false;
/**
 * Folders this session imported into the Origin Private File System, by id.
 *
 * An OPFS handle needs no permission prompt: it is this origin's own storage, so
 * an import is readable after a reload and is never "locked". The map also keeps
 * the name to show, because the directory's own name is the id.
 */
const opfsFolders = new Map<string, string>();
/**
 * The preview clip a folder has, for this visit: a name, or `null` for none.
 *
 * A record from an older build names no clip, and asking the folder again is three
 * file handles on every selection. The answer is remembered per directory instead.
 * The trade is deliberate: a clip dropped into the folder later in the same visit is
 * not seen until the page is reloaded (or the folder is closed and reopened).
 */
const previewClipNames = new Map<string, string | null>();

interface LocalSng {
  file: File;
  header: SngHeader;
  problems: string[];
}

/** Whether the browser will let us read a folder again — it asks once per session. */
export type FolderAccess = "granted" | "prompt" | "denied" | "unknown";

export interface RestoredFolder {
  id: string;
  name: string;
  songs: Song[];
  access: FolderAccess;
  /** Imported into OPFS by this game rather than picked from this machine. */
  imported: boolean;
}

export interface FolderScan {
  id: string;
  name: string;
  songs: Song[];
}

/** Why an import was refused or failed. The dialog turns each into one sentence. */
export type ImportProblem = "unsupported" | "empty" | "too-large" | "no-space" | "failed";

export type ImportOutcome =
  | {
      ok: true;
      folder: FolderScan;
      /** Earlier imports of the same folder this one replaced, by id. */
      replaced: string[];
    }
  | { ok: false; problem: ImportProblem };

export interface ImportOptions {
  /** The import has passed validation and is about to be written. */
  onOpen?: (folder: { id: string; name: string; files: number }) => void;
  /** How many files have been copied, of how many, as the copy runs. */
  onCopy?: (copied: number, total: number) => void;
  /** The same song count the picker's scan reports. */
  onFound?: (count: number) => void;
}

/** Can this browser open a folder at all? */
export function supportsFolders(): boolean {
  if (typeof window === "undefined") return false;
  const picker = (window as unknown as PickerWindow).showDirectoryPicker;
  return typeof picker === "function";
}

/** Can this browser keep an imported copy in the Origin Private File System? */
export function supportsImports(): boolean {
  return typeof storageOf()?.getDirectory === "function";
}

interface ImportStorage {
  getDirectory?(): Promise<FileSystemDirectoryHandle>;
  estimate?(): Promise<{ quota?: number; usage?: number }>;
}

function storageOf(): ImportStorage | null {
  if (typeof navigator === "undefined") return null;
  return (navigator.storage as unknown as ImportStorage | undefined) ?? null;
}

/** How much room the origin has left, when the browser will estimate it. */
async function availableBytes(): Promise<number | null> {
  try {
    const estimate = await storageOf()?.estimate?.();
    const quota = estimate?.quota;
    const usage = estimate?.usage;
    if (typeof quota === "number" && typeof usage === "number" && quota > 0) {
      return Math.max(0, quota - usage);
    }
  } catch {
    // An estimate is an optimisation, not a requirement: the cap still applies.
  }
  return null;
}

/** Is a song read from a folder rather than fetched? */
export function isLocalUrl(url: string): boolean {
  return url.startsWith("folder://");
}

/**
 * Ask for a folder and read what is in it.
 *
 * Null when the player closed the picker — a choice, not a failure. `onOpen` names
 * the folder as soon as it is chosen and `onFound` counts songs as they are read,
 * so a folder of two thousand can be listed while it is still being read.
 */
export async function openFolder(options: {
  onOpen?: (folder: { id: string; name: string }) => void;
  onFound?: (count: number) => void;
} = {}): Promise<FolderScan | null> {
  const picker = (window as unknown as PickerWindow).showDirectoryPicker;
  if (!picker) return null;
  let root: FileSystemDirectoryHandle;
  try {
    root = await picker.call(window, { id: "everythingstar", mode: "read" });
  } catch {
    return null;
  }
  const id = folderId(root.name);
  folders.set(id, root);
  options.onOpen?.({ id, name: root.name });
  const songs = await readFolder(root, id, options).catch(() => null);
  if (!songs) {
    // A walk that failed or was cancelled is not a folder. Forget the handle with
    // everything read from it, or the next persist writes an empty ghost of it.
    forgetFolder(id);
    return null;
  }
  scanned.set(id, songs);
  staleFolders.delete(id);
  // Remembered across visits: the handle is structured-cloneable, so IndexedDB keeps
  // it and the browser asks for permission again when the page comes back.
  await persist();
  return { id, name: root.name, songs };
}

/**
 * Import local files into this browser's own storage, then read them as a folder.
 *
 * A browser with no File System Access picker still has an Origin Private File
 * System, so the files a player chooses (or drops) are **copied** to
 * `imports/<id>/` there and the **same** `readFolder` scans them. Nothing about a
 * song changes: it is addressed by `folder://<id>/…`, its chart goes through the
 * same parsers, and it joins the library beside the playlists and picked folders.
 *
 * The copy is capped at `IMPORT_CAP_BYTES`, and the browser's own estimate has to
 * leave `IMPORT_HEADROOM_BYTES` free. A half-written import is deleted before the
 * answer is returned, so a failure never leaves a folder on disk that no library
 * row can remove.
 */
export async function importFiles(
  files: FileList | readonly File[],
  options: ImportOptions = {},
): Promise<ImportOutcome> {
  if (!supportsImports()) return { ok: false, problem: "unsupported" };

  const list = Array.from(files as ArrayLike<File>);
  // One scan of the selection, whatever its size: the root, the paths and the
  // bytes all come from the same pass.
  const prepared = prepareImport(list);
  if (!prepared || prepared.entries.length === 0) return { ok: false, problem: "empty" };
  const { root, entries } = prepared;

  const budget = importBudget(prepared.size, {
    capBytes: IMPORT_CAP_BYTES,
    availableBytes: await availableBytes(),
  });
  if (!budget.ok) return { ok: false, problem: budget.reason };

  let imports: FileSystemDirectoryHandle;
  let dir: FileSystemDirectoryHandle;
  let id: string;
  try {
    const origin = await storageOf()?.getDirectory?.();
    if (!origin) return { ok: false, problem: "unsupported" };
    imports = await origin.getDirectoryHandle("imports", { create: true });
    // A re-import is a **new generation**, not an overwrite. The old copy stays
    // readable until this one has been copied and read, so a failed import cannot
    // trade a working folder for nothing.
    id = await uniqueImportId(imports, root.id);
    dir = await imports.getDirectoryHandle(id, { create: true });
  } catch {
    return { ok: false, problem: "failed" };
  }

  opfsFolders.set(id, root.name);
  options.onOpen?.({ id, name: root.name, files: entries.length });
  options.onCopy?.(0, entries.length);

  try {
    let copied = 0;
    for (const entry of entries) {
      const target = splitImportPath(entry.path);
      if (!target) throw new Error("unsafe import path");
      let parent = dir;
      for (const segment of target.directories) {
        parent = await parent.getDirectoryHandle(segment, { create: true });
      }
      const handle = await parent.getFileHandle(target.name, { create: true });
      const writable = await handle.createWritable();
      try {
        await writable.write(entry.file);
      } finally {
        await writable.close();
      }
      copied += 1;
      options.onCopy?.(copied, entries.length);
    }

    const songs = await readFolder(dir, id, { onFound: options.onFound });
    if (songs.length === 0) {
      // A folder of changelogs is not an import: do not keep a library row that
      // lists nothing, and do not keep its bytes either. Only this generation goes:
      // an older copy of the same folder is still whole and still listed.
      await dropFolder(id);
      return { ok: false, problem: "empty" };
    }
    scanned.set(id, songs);
    staleFolders.delete(id);
    opfsFolders.set(id, root.name);
    // The new copy is whole, so the generation it replaces can go — its directory
    // and its record together. The comparison is the **import key**, not the name:
    // every flat selection is called "Imported songs", so a name would make one
    // selection's files replace another's. A picked folder is not an import and is
    // never under `imports/`, so it is never touched.
    const replaced = await removeReplacedImports(imports, id, root.id);
    await persist();
    return { ok: true, folder: { id, name: root.name, songs }, replaced };
  } catch {
    // Only the attempt that failed is dropped; the old copy and its row stay.
    await dropFolder(id);
    return { ok: false, problem: "failed" };
  }
}

/**
 * A directory id this import can call its own: `base`, then `base-2`, `base-3`…
 *
 * The check is the OPFS directory itself, not a counter held in memory, because the
 * copy has to survive a reload: a generation that already exists on disk must never
 * be written over by a new one.
 */
async function uniqueImportId(
  imports: FileSystemDirectoryHandle,
  base: string,
): Promise<string> {
  for (let generation = 1; ; generation += 1) {
    const id = generation === 1 ? base : `${base}-${generation}`;
    // A picked folder of the same name is a source like any other: its id must not
    // be shadowed by a copy that happens to be called the same thing.
    if (!folders.has(id) && !(await importExists(imports, id))) return id;
  }
}

async function importExists(
  imports: FileSystemDirectoryHandle,
  id: string,
): Promise<boolean> {
  try {
    await imports.getDirectoryHandle(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Drop every earlier **generation of this import**, now that its replacement is whole.
 *
 * The generations are read from OPFS itself, not from `opfsFolders`: an import that
 * finishes while a restore is still reading finds an empty session map, and a map
 * that knows nothing would leave the copy it replaced on disk for the restore to
 * list beside the new one. `imports/` is the truth about what was copied here.
 *
 * Only the import key and a numeric generation suffix count. The display name never
 * does: two flat selections are both "Imported songs", and one replacing the other
 * would delete a song somebody still has.
 */
async function removeReplacedImports(
  imports: FileSystemDirectoryHandle,
  keep: string,
  base: string,
): Promise<string[]> {
  const replaced: string[] = [];
  for (const id of await importIds(imports)) {
    if (id === keep || importBase(id) !== base) continue;
    forgetFolder(id);
    await removeEntry(imports, id);
    replaced.push(id);
  }
  return replaced;
}

/**
 * The directories under `imports/`, falling back to the session's own copies when
 * the listing will not answer.
 */
async function importIds(imports: FileSystemDirectoryHandle): Promise<string[]> {
  const ids: string[] = [];
  try {
    for await (const entry of imports.values()) {
      if (entry.kind === "directory") ids.push(entry.name);
    }
  } catch {
    // A listing that fails leaves the map's own knowledge as the answer.
  }
  if (ids.length > 0) return ids;
  return [...opfsFolders.keys()];
}

/**
 * The folders this browser had open, for a page that has just loaded.
 *
 * The **songs** come back with them — they are plain data — so the library is on
 * screen at once instead of half a minute of walking a disk again. **What each song
 * was read with comes back too** (`songFiles`): without it a restored song knows its
 * URL but not which file was its chart, its `song.ini` or its stems, so it cannot be
 * read again at all — which is a library that lists songs nobody can play.
 *
 * Reading a chart still needs permission, which a reload takes away, so each folder
 * says which of the two it is: ready to play, or waiting for a press to be let back in.
 */
export async function restoreFolders(): Promise<RestoredFolder[]> {
  let restored: RestoredFolder[];
  try {
    restored = await applyFolders(await loadFolders());
  } finally {
    // Storage has answered, however it answered: from here a write is a write of the
    // whole list, not of whatever happened to be opened first.
    foldersRestored = true;
  }
  if (folderWritePending) {
    folderWritePending = false;
    await persist();
  }
  // A library written by a build that did not keep the file names — or one whose songs
  // have moved — lists songs nobody can play. The names are in the folder, so read them
  // again, without parsing a chart, while the listing is still being put together.
  // A folder from an older scanner is a different thing: its **song summaries** are
  // stale (a song that now has vocals may still say "no voice"), so it is read again
  // once and the list is replaced.
  for (const folder of restored) {
    if (folder.access !== "granted") continue;
    // One folder the browser will not walk — permission revoked between the check
    // and the read, a disk that has been removed — must not lose the whole restore:
    // its own summaries are still worth listing, and the others are still readable.
    try {
      if (folderNeedsRescan(folder.id)) folder.songs = await rescanFolder(folder.id);
      await repairFolderFiles(folder.id);
    } catch {
      // The folder keeps what it had; the rest of the library still comes back.
    }
  }
  return restored;
}

/** Did this folder's stored summaries come from an older scanner? */
export function folderNeedsRescan(id: string): boolean {
  return staleFolders.has(id);
}

/**
 * Read a remembered folder again with the current parser, and keep the result.
 *
 * This is the one deliberate re-walk: a parser generation changed, so the plain
 * `Song` summaries in storage are the wrong shape of truth. It is called by a
 * restore (permission already granted) or by Reconnect (the press just granted it).
 */
export async function rescanFolder(id: string): Promise<Song[]> {
  const root = folders.get(id);
  if (!root) return scanned.get(id) ?? [];
  let songs: Song[];
  try {
    songs = await readFolder(root, id);
  } catch {
    // A folder that cannot be walked keeps the summaries it had rather than taking
    // the restore down with it. It stays stale, so a later Reconnect tries again.
    return scanned.get(id) ?? [];
  }
  scanned.set(id, songs);
  staleFolders.delete(id);
  await persist();
  return songs;
}

/**
 * Read a folder's file names again, without parsing anything.
 *
 * The URL of each song says where its chart is; what it was called and what sat beside
 * it is **one listing away**. That is what makes a library from an older build playable
 * rather than merely present, and what Reconnect does besides asking for permission.
 * A song that already has its record is left alone, so this costs nothing on a library
 * that is already whole.
 */
export async function repairFolderFiles(id: string): Promise<number> {
  const root = folders.get(id);
  const songs = scanned.get(id);
  if (!root || !songs) return 0;
  let repaired = 0;
  for (const song of songs) {
    // A package is its own record: its chart, audio and art are members of one file,
    // not names beside it. A record for one is read from the package header, not by
    // listing the folder for loose stems.
    if (isSngUrl(song.doc)) continue;
    // A record that **names no audio** is a record a song cannot be played from,
    // however complete the rest of it is: a library written by a build that had not
    // yet looked for stems has the chart and nothing else, and it plays silence on
    // every song. The names are one listing away, so it is repaired like a record
    // that is missing entirely — but only once. A record that has already been
    // listed and still names no audio is a chart-only song: there is no stem to
    // find, and re-listing it on every restore can never change the answer.
    const files = localSongFiles(song.doc);
    if (namesAudio(files)) continue;
    if (files?.checked) continue;
    const chart = basename(decodePath(song.doc));
    const dir = await directoryFor(root, dirname(decodePath(song.doc)));
    if (!dir) continue;
    const names = await listNames(dir);
    // A listing that failed is not a folder that names no audio. A transient
    // permission or disk failure would otherwise be written down as "checked, no
    // stems" for ever, and the preview master and its clip would be lost to a
    // question that was never answered.
    if (!names) continue;
    songFiles.set(song.doc, {
      dirUrl: dirUrlOf(song.doc),
      chart,
      ini: findName(names, INI_NAMES),
      audio: audioNamesIn(names),
      art: findName(names, ART_NAMES),
      preview: findName(names, PREVIEW_NAMES),
      checked: true,
    });
    repaired += 1;
  }
  if (repaired > 0) await persist();
  return repaired;
}

/** Is this record one a song can be played from at all? */
function namesAudio(files: LocalSongFiles | null): boolean {
  return files !== null && Object.keys(files.audio).length > 0;
}

/**
 * Register what was written down.
 *
 * Split from the reading so a restore can be tested without a database in the way —
 * and so what a restore *means* (three maps filled from one record) is in one place.
 */
export async function applyFolders(stored: StoredFolder[]): Promise<RestoredFolder[]> {
  const restored: RestoredFolder[] = [];
  let pruned = false;
  for (const entry of stored) {
    // An OPFS import is reopened where this game wrote it, rather than carrying a
    // structured-cloned handle through IndexedDB. A picked folder's handle is the
    // only way back to it, so that is what it keeps.
    const handle = entry.opfs ? await importDirectory(entry.id) : entry.handle;
    if (!handle) {
      // An imported copy that is no longer in OPFS has been evicted by the browser
      // or deleted from under us. It is dropped rather than retried on every load:
      // there is nothing left to read, and a row that reappears for ever cannot be
      // forgotten. Only an import is pruned, and only on a browser that can open
      // OPFS at all — a browser that cannot look has not found the copy missing.
      if (entry.opfs && supportsImports()) pruned = true;
      continue;
    }
    // The imports this session has already claimed — possibly *while* this restore
    // was reading. Its generation is the live row, and a record for any generation
    // of the same import is the one that import replaced. It must not come back
    // beside the live row, however late that import finished.
    if (entry.opfs && claimedImport(entry.id)) continue;
    folders.set(entry.id, handle);
    if (entry.opfs) opfsFolders.set(entry.id, entry.name);
    const songs = Array.isArray(entry.songs) ? (entry.songs as Song[]) : [];
    scanned.set(entry.id, songs);
    storedVersions.set(entry.id, entry.version);
    if (entry.version === FOLDER_SCAN_VERSION) staleFolders.delete(entry.id);
    else staleFolders.add(entry.id);
    const recorded = isObject(entry.files);
    for (const url of Object.keys(recorded)) {
      const files = readLocalSongFiles(recorded[url]);
      if (files) songFiles.set(url, files);
    }
    restored.push({
      id: entry.id,
      name: entry.name,
      songs,
      // OPFS is this origin's own storage: there is no permission to lose, so an
      // import comes back readable rather than locked.
      access: entry.opfs ? "granted" : await folderAccess(handle),
      imported: entry.opfs === true,
    });
  }
  if (pruned) await persist();
  return restored;
}

/** Has this session already imported a generation of this record's import? */
function claimedImport(id: string): boolean {
  const base = importBase(id);
  for (const live of opfsFolders.keys()) {
    if (importBase(live) === base) return true;
  }
  return false;
}

/** What one song was read with, or null when nothing has read it. */
export function localSongFiles(url: string): LocalSongFiles | null {
  return songFiles.get(url) ?? null;
}

/**
 * What a jukebox can play for a local song, without parsing a chart again.
 *
 * The clip the chart folder ships wins; otherwise the **master** is used from the
 * song's own
 * preview cue. A folder of parts with no whole mix has nothing to preview — one
 * instrument is a preview of the wrong thing — and says so by returning null.
 */
export function localPreview(
  url: string,
  previewStartMs = 0,
): { url: string; startMs: number } | null {
  const files = localSongFiles(url);
  if (!files) return null;
  if (files.package || isSngUrl(url)) {
    if (files.preview) return { url: sngEntryUrl(url, files.preview), startMs: 0 };
    const first = files.audio.master ?? Object.values(files.audio)[0];
    return first
      ? { url: sngEntryUrl(url, first), startMs: Math.max(0, previewStartMs) }
      : null;
  }
  if (files.preview) {
    return { url: `${files.dirUrl}${encodeURIComponent(files.preview)}`, startMs: 0 };
  }
  const master = files.audio.master;
  if (!master) return null;
  return {
    url: `${files.dirUrl}${encodeURIComponent(master)}`,
    startMs: Math.max(0, previewStartMs),
  };
}

/**
 * The clip a folder record from an older build did not know about.
 *
 * A record names the files a song was read with, but one written before the jukebox
 * looked for a clip names none — and re-listing every song at restore is exactly the
 * walk the record exists to avoid. So the clip is asked of the folder directly, once,
 * when it is first wanted: one file handle per candidate name, on a click.
 */
export async function localPreviewClip(url: string): Promise<string | null> {
  const files = localSongFiles(url);
  if (!files || files.package || isSngUrl(url)) return null;
  const dir = files.dirUrl;
  const remembered = previewClipNames.get(dir);
  if (remembered !== undefined) {
    // A remembered clip is read again for this caller, because the object URL it
    // gets is its own to revoke. A remembered "none" costs no file handle at all.
    return remembered === null
      ? null
      : localObjectUrl(`${dir}${encodeURIComponent(remembered)}`);
  }
  for (const name of PREVIEW_NAMES) {
    const object = await localObjectUrl(`${dir}${encodeURIComponent(name)}`);
    if (object) {
      previewClipNames.set(dir, name);
      return object;
    }
  }
  previewClipNames.set(dir, null);
  return null;
}

/**
 * Ask to be let back in. A gesture has to ask, which is why this is a button on the
 * folder rather than something that happens on load.
 */
export async function requestFolderAccess(id: string): Promise<boolean> {
  // An import is this origin's own storage: there is no prompt to answer.
  if (opfsFolders.has(id)) return true;
  const handle = folders.get(id);
  if (!handle) return false;
  const target = handle as unknown as PermissionHandle;
  if (typeof target.requestPermission !== "function") return true;
  try {
    return (await target.requestPermission({ mode: "read" })) === "granted";
  } catch {
    return false;
  }
}

/** What reading this folder would take right now. */
export async function folderAccess(handle: FileSystemDirectoryHandle): Promise<FolderAccess> {
  const target = handle as unknown as PermissionHandle;
  if (typeof target.queryPermission !== "function") return "granted";
  try {
    return (await target.queryPermission({ mode: "read" })) as FolderAccess;
  } catch {
    return "unknown";
  }
}

/**
 * Is this folder waiting to be let back in?
 *
 * A reload takes permission away, so a restored folder lists every one of its songs
 * and can read none of them until somebody presses Reconnect. Saying **that** is worth
 * saying: "the browser needs permission again" is something a player can act on, and
 * "could not be read" is a puzzle with no next step.
 */
export async function isLocalFolderLocked(url: string): Promise<boolean> {
  const id = sourceOf(url);
  const root = folders.get(id);
  if (!root) return false;
  // An imported folder lives in this origin's OPFS, where a reload takes nothing.
  if (opfsFolders.has(id)) return false;
  return (await folderAccess(root)) !== "granted";
}

/** The permission members, which only some browsers and some type versions know. */
interface PermissionHandle {
  queryPermission?(descriptor: { mode: "read" }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: "read" }): Promise<PermissionState>;
}

/**
 * Write the open folders down: their handles, their songs, and their file names.
 *
 * It **never throws**: a browser with no IndexedDB, or a handle it will not clone, is
 * a folder that is not remembered rather than a folder that will not open. Being able
 * to add one matters more than keeping it.
 */
async function persist(): Promise<void> {
  // A write before the restore has answered is a write of a list that is not all
  // there is yet. It is queued instead, and the restore writes once when it lands.
  if (!foldersRestored) {
    folderWritePending = true;
    return;
  }
  try {
    await saveFolders(folderRecords());
  } catch {
    // Not remembered, and everything still works.
  }
}

/**
 * The records `persist` writes.
 *
 * A folder that is **still waiting to be rescanned** keeps the version it was stored
 * with, because nothing about a repair or a rescan of a *different* folder has made
 * its summaries current. Only a folder read again (or newly imported) is stamped with
 * the current generation.
 */
export function folderRecords(): StoredFolder[] {
  return [...folders.entries()].map(([id, handle]) => ({
    id,
    // An OPFS directory is named by the id; its folder name is the one the player
    // imported, kept here rather than read from the handle.
    name: opfsFolders.get(id) ?? handle.name,
    songs: scanned.get(id) ?? [],
    files: folderFiles(id),
    version: staleFolders.has(id) ? storedVersions.get(id) : FOLDER_SCAN_VERSION,
    ...(opfsFolders.has(id) ? { opfs: true } : { handle }),
  }));
}

/**
 * The file names one folder's songs were read with, as plain data.
 *
 * This is what makes a restored song **readable** rather than merely listed: the URL
 * says where the chart is, and this says what it was called and what sat beside it
 * (`song.ini`, the stems, the cover). Without it a reloaded library lists songs that
 * cannot be played, which is worse than one that forgets them.
 */
export function folderFiles(id: string): Record<string, LocalSongFiles> {
  const out: Record<string, LocalSongFiles> = {};
  for (const [url, found] of songFiles) {
    if (url.startsWith(`folder://${id}/`)) out[url] = found;
  }
  return out;
}

/** One of those back, if it is one — storage is not trusted, even our own. */
export function readLocalSongFiles(value: unknown): LocalSongFiles | null {
  if (typeof value !== "object" || value === null) return null;
  const files = value as Partial<LocalSongFiles>;
  if (typeof files.dirUrl !== "string" || typeof files.chart !== "string") return null;
  return {
    dirUrl: files.dirUrl,
    chart: files.chart,
    ini: typeof files.ini === "string" ? files.ini : null,
    audio:
      typeof files.audio === "object" && files.audio !== null
        ? (files.audio as Partial<Record<StemRole, string>>)
        : {},
    art: typeof files.art === "string" ? files.art : null,
    preview: typeof files.preview === "string" ? files.preview : null,
    package: files.package === true,
    checked: files.checked === true,
  };
}

function isObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** Forget a folder: its songs and its files go with it, and so does the memory of it. */
export function closeFolder(id: string): void {
  const imported = opfsFolders.has(id);
  forgetFolder(id);
  // An imported folder's bytes are ours to delete; a picked folder stays where it
  // was, because it was the player's file all along. The removal is written down
  // **after** the bytes are gone, so a failed delete cannot leave an import that no
  // row can remove. `removeImport` swallows its own errors.
  void (async () => {
    if (imported) await removeImport(id);
    await persist();
  })();
}

/** Drop an import that failed, including its stored row. */
async function dropFolder(id: string): Promise<void> {
  forgetFolder(id);
  await removeImport(id);
  await persist();
}

/** Empty one folder from this session's maps. Persisting is the caller's job. */
function forgetFolder(id: string): void {
  folders.delete(id);
  scanned.delete(id);
  staleFolders.delete(id);
  storedVersions.delete(id);
  opfsFolders.delete(id);
  for (const [url, files] of songFiles) {
    if (files.dirUrl.startsWith(`folder://${id}/`)) songFiles.delete(url);
  }
  for (const url of sngFilesByUrl.keys()) {
    if (url.startsWith(`folder://${id}/`)) sngFilesByUrl.delete(url);
  }
  for (const dir of previewClipNames.keys()) {
    if (dir.startsWith(`folder://${id}/`)) previewClipNames.delete(dir);
  }
}

/** The directory an import lives in, reopened on restore. */
async function importDirectory(id: string): Promise<FileSystemDirectoryHandle | null> {
  try {
    const origin = await storageOf()?.getDirectory?.();
    if (!origin) return null;
    const imports = await origin.getDirectoryHandle("imports");
    return await imports.getDirectoryHandle(id);
  } catch {
    return null;
  }
}

/** Delete one import's directory from OPFS. */
async function removeImport(id: string): Promise<void> {
  try {
    const origin = await storageOf()?.getDirectory?.();
    if (!origin) return;
    const imports = await origin.getDirectoryHandle("imports");
    await removeEntry(imports, id);
  } catch {
    // Nothing there to delete, or OPFS is unavailable: there is nothing to leak.
  }
}

async function removeEntry(
  directory: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  try {
    await directory.removeEntry(name, { recursive: true });
  } catch {
    // Already gone.
  }
}

/**
 * Walk a folder handle, parse every chart in it, and hand back the songs.
 *
 * Exported because the picker is not the only way to a handle — and because a
 * scanner that reads a folder full of somebody's charts deserves to be testable
 * without a browser in the loop.
 *
 * A folder holding a chart is a song **only if it is one**: a `.txt` beside a chart
 * is a changelog rather than a lyric sheet, and a folder that also holds sub-folders
 * is a collection, so the walk keeps going. Without that, the top of a Guitar Hero
 * chart folder — a `changelog.txt` next to forty song folders — reads as one nameless song
 * with no length, and the songs underneath it are never reached.
 */
export async function readFolder(
  root: FileSystemDirectoryHandle,
  id: string,
  options: { onFound?: (count: number) => void } = {},
): Promise<Song[]> {
  const songs: Song[] = [];
  // Registering here rather than in the picker is what makes the folder's files
  // readable afterwards — and what lets anything holding a handle read it, not only
  // the dialog that asked for one.
  folders.set(id, root);
  const visit = async (dir: FileSystemDirectoryHandle, path: string): Promise<void> => {
    const names: string[] = [];
    const children: FileSystemDirectoryHandle[] = [];
    for await (const entry of dir.values()) {
      if (entry.kind === "directory") children.push(entry as FileSystemDirectoryHandle);
      else names.push(entry.name);
    }
    // A `.sng` is a whole song in one file. A folder can hold several, and it is
    // still a collection with sub-folders; the changelog trap does not apply because
    // the package is read, not a stray `.txt` beside it.
    const packages = names.filter((name) => /\.sng$/i.test(name));
    for (const name of packages) {
      const song = await readSngSong(id, path, name);
      if (song) {
        songs.push(song);
        if (songs.length % 8 === 0) {
          options.onFound?.(songs.length);
          await breathe();
        }
      }
    }

    // A folder can hold a package **and** a loose song of its own. The package
    // branch used to return here, which made that song invisible; the chart test
    // below is the same one a folder with no package gets, so a folder of only
    // packages still has no chart name and is not read as a sheet.
    //
    // One order for every reader (`findChartName`): `notes.mid`, a `.chart`, a
    // `.sm`, then the text sheet. `song.txt` is the UltraStar chart even when a
    // `license.txt` and an `instrumental.txt` sit beside it, and a `.txt` beside a
    // real chart is not one.
    const chartName = findChartName(names);
    if (chartName && isSongFolder(names, children.length)) {
      const song = await readSong(id, dir, path, chartName, names);
      if (song) {
        songs.push(song);
        // A breath every so often, so a large folder does not lock the screen while
        // it is read.
        if (songs.length % 8 === 0) {
          options.onFound?.(songs.length);
          await breathe();
        }
      }
      return;
    }
    for (const child of children) await visit(child, `${path}${child.name}/`);
  };
  await visit(root, "");
  options.onFound?.(songs.length);
  return songs;
}

/** Is this folder one song, or a collection of them? */
function isSongFolder(names: readonly string[], childCount: number): boolean {
  // A folder with no sub-folders is a song whatever it holds. One with both a
  // `song.ini` and sub-folders is a song that happens to keep something beside it.
  return childCount === 0 || names.some((name) => /^song\.ini$/i.test(name));
}

/**
 * Let the page paint before a long walk carries on.
 *
 * A resolved promise is a microtask, which never yields to the event loop, so a
 * folder of two thousand songs still blocks the frame. A zero-delay timer is a real
 * turn of the loop.
 */
function breathe(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Does this source offer anything a band could actually play? */
function hasSomethingToPlay(source: ParsedSource): boolean {
  return source.lanes.length > 0 || source.melody !== null;
}

/** The audio files one folder listing names, by the role each plays. */
function audioNamesIn(names: readonly string[]): Partial<Record<StemRole, string>> {
  const audio: Partial<Record<StemRole, string>> = {};
  for (const [role, candidates] of AUDIO_NAMES) {
    const name = findName(names, candidates);
    if (name) audio[role] = name;
  }
  return audio;
}

/** Read one song folder into a `Song`, the same way a playlist entry reads. */
async function readSong(
  id: string,
  dir: FileSystemDirectoryHandle,
  path: string,
  chart: string,
  names: readonly string[],
): Promise<Song | null> {
  const bytes = await readFile(dir, chart);
  if (!bytes) return null;
  const iniName = findName(names, INI_NAMES);
  const ini = iniName ? readIni(decodeText((await readFile(dir, iniName)) ?? new Uint8Array())) : null;
  const artName = findName(names, ART_NAMES);
  const previewName = findName(names, PREVIEW_NAMES);
  const audio = audioNamesIn(names);

  const folderName = lastSegment(path);
  const dirUrl = dirUrlFor(id, path);
  const source = await parseLocal({
    bytes,
    chart,
    dirUrl,
    ini,
    audio,
    art: artName,
    preview: previewName,
    fallbackTitle: folderName,
  });
  if (!source) return null;
  // A `.txt` with no chart and no timed lines is a changelog or an empty sheet, not
  // a song: offering it would put a title on the jukebox that nobody can play.
  if (!hasSomethingToPlay(source)) return null;
  // A copy with no `song.ini` is named by the folder it sits in.
  attribute(source, folderName);

  const entry = playlistEntry(source, `${dirUrl}${encodeURIComponent(chart)}`);
  const song = readPlaylist({ schemaVersion: 1, songs: [entry] }, folderUrl(id)).songs[0];
  if (!song) return null;
  songFiles.set(song.doc, {
    dirUrl,
    chart,
    ini: iniName,
    audio,
    art: artName,
    preview: previewName,
    // The names came from this folder's own listing, so there is nothing left to
    // check later — including for a song that carries no audio at all.
    checked: true,
  });
  return song;
}

/**
 * The package reader, fetched the first time a package is really opened.
 *
 * `sources/sng.ts` carries the container's magic and its unmasking, and the budget's
 * lazy-parser guard keeps that out of `/play`'s first download: a folder is listed
 * with its name tables alone (`sngNames.ts`), and the bytes are read only when
 * somebody plays, draws or previews one of its songs. Every caller here is already
 * async, so the import is the whole of the cost.
 */
function sngReader() {
  return import("../../../lib/game/sources/sng");
}

/**
 * Read one `.sng` file into a `Song`.
 *
 * Only the header and the chart are read here. The audio and the cover are members
 * of the same file, and are sliced out when somebody actually plays or draws the
 * song — a folder of packages must not read a folder's worth of audio to list it.
 */
async function readSngSong(
  id: string,
  path: string,
  name: string,
): Promise<Song | null> {
  const dirUrl = dirUrlFor(id, path);
  const packageUrl = `${dirUrl}${encodeURIComponent(name)}`;
  const local = await localSng(packageUrl);
  if (!local) return null;

  const { parseSngSource, readSngEntryFromFile } = await sngReader();
  const files = sngFiles(local.header);
  if (!files.chart) return null;
  const chartBytes = await readSngEntryFromFile(local.file, local.header, files.chart);
  if (!chartBytes) return null;

  const folderName = lastSegment(path);
  const fallbackTitle = name.replace(/\.sng$/i, "");
  const source = await parseSngSource({
    header: local.header,
    chart: files.chart,
    chartBytes,
    urlFor: (entry) => sngEntryUrl(packageUrl, entry.name),
    id: slug(`${decodePath(dirUrl)}/${name}`),
    fallbackTitle,
    baseUrl: packageUrl,
    problems: local.problems,
  });
  if (!source) return null;
  // The same rule as a folder read: a package whose chart names nothing to play is
  // not a song on the jukebox.
  if (!hasSomethingToPlay(source)) return null;
  attribute(source, folderName || fallbackTitle);

  const entry = playlistEntry(source, packageUrl);
  const song = readPlaylist({ schemaVersion: 1, songs: [entry] }, folderUrl(id)).songs[0];
  if (!song) return null;
  songFiles.set(song.doc, {
    dirUrl,
    chart: files.chart.name,
    ini: null,
    audio: audioNames(files.audio),
    art: files.art?.name ?? null,
    preview: files.preview?.name ?? null,
    package: true,
  });
  return song;
}

/** The audio members of a package, by the role each plays. */
function audioNames(
  audio: SngFiles["audio"],
): Partial<Record<StemRole, string>> {
  const names: Partial<Record<StemRole, string>> = {};
  for (const [role, entry] of Object.entries(audio) as [StemRole, SngFiles["audio"][StemRole]][]) {
    if (entry) names[role] = entry.name;
  }
  return names;
}

/**
 * Fill in what a file left unsaid, from the folder's own `Artist - Title` name.
 *
 * Only ever a **fallback**: a song that names itself keeps its name, however the
 * folder is called.
 */
function attribute(source: ParsedSource, folderName: string): void {
  const from = folderAttribution(folderName);
  if (!from) return;
  if (!source.meta.artist) source.meta.artist = from.artist;
  if (source.meta.title === folderName || !source.meta.title) source.meta.title = from.title;
}

/** Parse a local song into the same parsed source the importer would produce. */
export async function readLocalSource(url: string): Promise<ParsedSource | null> {
  const files = localSongFiles(url);
  const root = folders.get(sourceOf(url));
  if (!files || !root) return null;
  if (files.package || isSngUrl(url)) return readLocalSngSource(url);
  const dir = await directoryFor(root, decodePath(files.dirUrl));
  if (!dir) return null;
  // The record may be from a build that picked the license as the chart (or knew
  // no `audio.mp3`). The folder is the truth: pick its chart and files again with
  // the same order the folder was listed with (`findChartName`), so a stale record
  // still opens the song it names rather than a license with no BPM — and a folder
  // holding a Guitar Hero chart and a `song.txt` plays the chart it was listed from.
  const names = (await listNames(dir)) ?? [];
  const chart = findChartName(names) ?? files.chart;
  const bytes = await readFile(dir, chart);
  if (!bytes) return null;
  const audio = namesAudio(files) ? { ...files.audio } : audioNamesIn(names);
  const iniName = files.ini ?? findName(names, INI_NAMES);
  const ini = iniName
    ? readIni(decodeText((await readFile(dir, iniName)) ?? new Uint8Array()))
    : null;
  const source = await parseLocal({
    bytes,
    chart,
    dirUrl: files.dirUrl,
    ini,
    audio,
    art: files.art ?? findName(names, ART_NAMES),
    preview: files.preview ?? findName(names, PREVIEW_NAMES),
    fallbackTitle: lastSegment(files.dirUrl),
  });
  if (!source || !hasSomethingToPlay(source)) return null;
  attribute(source, lastSegment(decodePath(files.dirUrl)));
  return source;
}

/** Read a local `.sng`, using only its header and chart until something needs more. */
async function readLocalSngSource(url: string): Promise<ParsedSource | null> {
  const local = await localSng(url);
  if (!local) return null;
  const { parseSngSource, readSngEntryFromFile } = await sngReader();
  const files = sngFiles(local.header);
  if (!files.chart) return null;
  const chartBytes = await readSngEntryFromFile(local.file, local.header, files.chart);
  if (!chartBytes) return null;

  const dirUrl = dirUrlOf(url);
  const source = await parseSngSource({
    header: local.header,
    chart: files.chart,
    chartBytes,
    urlFor: (entry) => sngEntryUrl(url, entry.name),
    id: slug(decodePath(url)),
    fallbackTitle: basename(decodePath(url)).replace(/\.sng$/i, ""),
    baseUrl: url,
    problems: local.problems,
  });
  if (!source || !hasSomethingToPlay(source)) return null;
  attribute(source, lastSegment(decodePath(dirUrl)));
  return source;
}

/**
 * A local package's header and file, read once per session.
 *
 * The cover, the preview and each stem all ask for a member of the same package.
 * Re-reading the header for each is a few hundred bytes of work, but it also means
 * re-reading the file handle; the cache makes a package one open, not five.
 */
async function localSng(url: string): Promise<LocalSng | null> {
  const key = (url.split("#")[0] ?? url).split("?")[0] ?? url;
  const cached = sngFilesByUrl.get(key);
  if (cached) return cached;

  const pending = (async (): Promise<LocalSng | null> => {
    const root = folders.get(sourceOf(key));
    if (!root) return null;
    const path = decodePath(key);
    const dir = await directoryFor(root, dirname(path));
    if (!dir) return null;
    try {
      const handle = await dir.getFileHandle(basename(path));
      const file = await handle.getFile();
      const { readSngHeaderFromFile } = await sngReader();
      const read = await readSngHeaderFromFile(file);
      return read.header ? { file, header: read.header, problems: read.problems } : null;
    } catch {
      return null;
    }
  })();
  sngFilesByUrl.set(key, pending);
  const resolved = await pending.catch(() => null);
  // A package that could not be read now is not a package that can never be read:
  // a file still being written, or a permission asked for later, gets another try.
  // Only a good answer is worth keeping for the rest of the visit.
  if (!resolved && sngFilesByUrl.get(key) === pending) sngFilesByUrl.delete(key);
  return resolved;
}

/**
 * Members already read out of a package, kept for the visit.
 *
 * A jukebox row asks for its cover on every pass, and a package member is read and
 * unmasked from the file each time: two copies of the member per request, for the
 * same bytes. The cache is bounded, because a package may hold stems tens of
 * megabytes long and holding all of them would be worse than reading one twice.
 */
const sngEntries = new Map<string, Uint8Array>();
let sngEntryTotal = 0;
const SNG_ENTRY_CACHE_BYTES = 32 * 1024 * 1024;

function rememberSngEntry(url: string, bytes: Uint8Array): Uint8Array {
  // A member larger than the whole budget is handed back uncached: caching it would
  // evict everything and still be over the line.
  if (bytes.length > SNG_ENTRY_CACHE_BYTES) return bytes;
  const previous = sngEntries.get(url);
  if (previous) sngEntryTotal -= previous.length;
  sngEntries.set(url, bytes);
  sngEntryTotal += bytes.length;
  // Insertion order is oldest first, so a full cache drops what was read longest ago.
  for (const [key, value] of sngEntries) {
    if (sngEntryTotal <= SNG_ENTRY_CACHE_BYTES) break;
    sngEntries.delete(key);
    sngEntryTotal -= value.length;
  }
  return bytes;
}

/**
 * A local file as a URL the browser can actually load.
 *
 * A `folder://` reference is meaningless to an `<img>` or an `<audio>`, so anything
 * displayed has to be handed an **object URL** for the real file. The caller owns it
 * and revokes it when it is done — there are two thousand covers in a collection,
 * and keeping them all alive would be two thousand images' worth of memory.
 */
export async function localObjectUrl(url: string): Promise<string | null> {
  const entryName = sngEntryName(url);
  if (isSngUrl(url) && entryName === null) return null;
  if (entryName !== null) {
    const local = await localSng(url);
    if (!local) return null;
    const entry = local.header.files.find((file) => file.name === entryName);
    if (!entry) return null;
    // The same ceiling as a package fetched from a provider. A local file has no
    // download to check, so this is the only place the member's size is bounded.
    if (entry.length > MAX_PACKAGE_BYTES) return null;
    const cached = sngEntries.get(url);
    if (cached) {
      return URL.createObjectURL(sngBlob(cached, mimeForSng(entry.name)));
    }
    const { readSngEntryFromFile } = await sngReader();
    const bytes = await readSngEntryFromFile(local.file, local.header, entry);
    if (!bytes) return null;
    rememberSngEntry(url, bytes);
    // The reader unmasks into a fresh array, so it is already exactly the member's
    // bytes; `sngBlob` hands the view straight to the Blob rather than slicing a
    // second copy of a stem that may be tens of megabytes.
    return URL.createObjectURL(sngBlob(bytes, mimeForSng(entry.name)));
  }
  const root = folders.get(sourceOf(url));
  if (!root) return null;
  const path = decodePath(url);
  const dir = await directoryFor(root, dirname(path));
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(basename(path));
    return URL.createObjectURL(await handle.getFile());
  } catch {
    return null;
  }
}

/** The one place a local song is turned into our own shape. */
async function parseLocal(input: {
  bytes: Uint8Array;
  chart: string;
  dirUrl: string;
  ini: IniValues | null;
  audio: Partial<Record<StemRole, string>>;
  art: string | null;
  /** A jukebox clip beside the chart, when the folder has one. */
  preview: string | null;
  fallbackTitle: string;
}): Promise<ParsedSource | null> {
  const stems: Partial<Record<StemRole, string>> = {};
  for (const [role, name] of Object.entries(input.audio) as [StemRole, string][]) {
    stems[role] = `${input.dirUrl}${encodeURIComponent(name)}`;
  }
  try {
    const { parseSource } = await import("../../../lib/game/sources/parse");
    return parseSource({
      bytes: input.bytes,
      name: input.chart,
      ini: input.ini,
      stems,
      preview: input.preview
        ? `${input.dirUrl}${encodeURIComponent(input.preview)}`
        : null,
      art: input.art ? `${input.dirUrl}${encodeURIComponent(input.art)}` : null,
      fallbackTitle: input.fallbackTitle || input.chart,
      // The path is URL-encoded, so it is decoded before it becomes an id: an id of
      // `alice-20in-20chains` is one nobody would recognise in a URL or a score.
      id: slug(`${decodePath(input.dirUrl)}/${input.chart}`),
      // A source may name a file the folder table did not know (`#MP3`): resolve it
      // against the folder, not the page.
      baseUrl: input.dirUrl,
    });
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- the files */

function folderUrl(id: string): string {
  return `folder://${id}/`;
}

/** A folder-relative path as its `folder://` directory URL, ending in `/`. */
function dirUrlFor(id: string, path: string): string {
  const segments = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `${folderUrl(id)}${segments}${path ? "/" : ""}`;
}

function sourceOf(url: string): string {
  const match = /^folder:\/\/([^/]+)\//.exec(url);
  return match ? match[1] : "";
}

async function directoryFor(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemDirectoryHandle | null> {
  let dir = root;
  for (const segment of path.split("/").filter(Boolean)) {
    try {
      dir = await dir.getDirectoryHandle(segment);
    } catch {
      return null;
    }
  }
  return dir;
}

async function readFile(dir: FileSystemDirectoryHandle, name: string): Promise<Uint8Array | null> {
  try {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * The file names in a folder. Nothing is opened, so a walk of names is cheap.
 *
 * **Null when the listing failed** — a permission revoked between the check and the
 * read, a disk that has gone — because "I could not look" is not "there is nothing
 * there", and a caller that writes the answer down must not record the second when
 * it only got the first.
 */
async function listNames(dir: FileSystemDirectoryHandle): Promise<string[] | null> {
  const names: string[] = [];
  try {
    for await (const entry of dir.values()) if (entry.kind === "file") names.push(entry.name);
  } catch {
    return null;
  }
  return names;
}

/** The folder a song's chart sits in, as a `folder://` URL — its own URL, less the file. */
function dirUrlOf(url: string): string {
  const at = url.lastIndexOf("/");
  return at < 0 ? url : url.slice(0, at + 1);
}

/* ----------------------------------------------------------------- helpers */

function lastSegment(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function dirname(path: string): string {
  const at = path.lastIndexOf("/");
  return at < 0 ? "" : path.slice(0, at);
}

/** A `folder://` URL's path back as plain segments. */
function decodePath(url: string): string {
  const clean = url.split("#")[0]?.split("?")[0] ?? url;
  return clean
    .replace(/^folder:\/\/[^/]+\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}
