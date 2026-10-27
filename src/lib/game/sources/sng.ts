/**
 * `.sng`: the package a Guitar Hero / Clone Hero / YARG song can arrive in.
 *
 * An `.sng` is **not a chart format**. It is a little binary container — a header, a
 * metadata table, a file index and the files themselves — holding the same pieces a
 * song folder would: `notes.mid` or `notes.chart`, the audio stems, `album.jpg`, and
 * sometimes a preview clip. The metadata table is the `song.ini` (the format reserves
 * `song.ini` as a file name for exactly that reason), so a package names itself, its
 * artist, its length and its preview cue without a separate text file.
 *
 * Reading it is deliberately in two steps, because a browser folder and a playlist
 * reach a package differently:
 *
 * - `readSngHeader` parses only the index. It is enough to list a local song, and it
 *   never touches the megabytes of audio after it.
 * - `readSngEntry` (or `readSngEntryFromFile`) unmasks one file when somebody actually
 *   wants it — the chart to offer the song, the cover to draw it, a stem to play it.
 *
 * The masking is the one detail that looks like it could be either way: the key is
 * `xorMask[i % 16] ^ (i & 0xFF)`, where `i` is the byte's position **inside that
 * file**, not inside the container. Treating it as a container offset produces a
 * valid-looking file that starts with the wrong bytes.
 *
 * The format is documented at
 * https://github.com/mdsitton/SngFileFormat; the streaming implementation that
 * confirmed the offsets is https://github.com/Geomitron/parse-sng.
 */

import { iniNumber, type IniValues } from "./ini";
import { entryIndex, sngFiles } from "./sngNames";
import { basename } from "../text";
import type { ParsedSource, StemRole } from "./types";

const MAGIC = "SNGPKG";
const MAGIC_BYTES = new TextEncoder().encode(MAGIC);
const MASK_LENGTH = 16;
const HEADER_START = 26;
const METADATA_COUNT_AT = 34;
/** A header larger than this is not a song index; it is a file we should not chase. */
const MAX_HEADER_BYTES = 16 * 1024 * 1024;
const MAX_METADATA = 16_384;
const MAX_FILES = 16_384;

/** One file in the package, as the index names it. */
export interface SngEntry {
  /** Its path inside the package, as written (`notes.mid`, `art/album.jpg`). */
  name: string;
  /** Its unmasked length in bytes. */
  length: number;
  /** Where its masked bytes start, from the beginning of the package. */
  index: number;
}

/** The package's index, and the metadata a `song.ini` would carry. */
export interface SngHeader {
  version: number;
  /** The metadata table, with its keys as written. */
  metadata: Record<string, string>;
  files: SngEntry[];
  /** The 16-byte mask, for reading a file later. */
  xorMask: Uint8Array;
  /** Where the first file's bytes start. */
  dataStart: number;
  /** How many bytes the file data section claims. */
  dataLength: number;
}

export interface SngRead {
  header: SngHeader | null;
  problems: string[];
}

/** Parse the header and index of a package, without unmasking any file. */
export function readSngHeader(bytes: Uint8Array, totalSize = bytes.length): SngRead {
  const problems: string[] = [];
  const fail = (problem: string): SngRead => ({ header: null, problems: [...problems, problem] });

  if (!startsWith(bytes, MAGIC_BYTES)) return fail("not an .sng package");
  if (bytes.length < HEADER_START) return fail("the .sng header is truncated");

  const view = viewOf(bytes);
  const version = view.getUint32(6, true);
  if (version !== 1) problems.push(`.sng version ${version}; this reader knows version 1`);
  const xorMask = bytes.slice(10, 10 + MASK_LENGTH);

  const metadataLen = readU64(view, HEADER_START, totalSize);
  if (metadataLen === null || metadataLen < 8) {
    return fail("the .sng metadata section is truncated");
  }
  const metadataEnd = METADATA_COUNT_AT + metadataLen;
  if (metadataEnd > totalSize || metadataEnd > MAX_HEADER_BYTES) {
    return fail("the .sng metadata section is longer than the file");
  }

  const metadataCount = readU64(view, METADATA_COUNT_AT, metadataEnd);
  if (metadataCount === null || metadataCount > MAX_METADATA) {
    return fail("the .sng metadata count is not readable");
  }

  const decoder = new TextDecoder("utf-8");
  const metadata: Record<string, string> = Object.create(null) as Record<string, string>;
  let at = METADATA_COUNT_AT + 8;
  for (let index = 0; index < metadataCount; index += 1) {
    const keyLen = readI32(view, at, metadataEnd);
    if (keyLen === null || keyLen < 0) return fail("a .sng metadata key is truncated");
    at += 4;
    if (at + keyLen > metadataEnd) return fail("a .sng metadata key runs past its section");
    const key = decoder.decode(bytes.subarray(at, at + keyLen));
    at += keyLen;

    const valueLen = readI32(view, at, metadataEnd);
    if (valueLen === null || valueLen < 0) return fail("a .sng metadata value is truncated");
    at += 4;
    if (at + valueLen > metadataEnd) return fail("a .sng metadata value runs past its section");
    const value = decoder.decode(bytes.subarray(at, at + valueLen));
    at += valueLen;
    metadata[key] = value;
  }
  if (at !== metadataEnd) problems.push("the .sng metadata has padding this reader ignored");

  const fileMetaLen = readU64(view, metadataEnd, totalSize);
  if (fileMetaLen === null || fileMetaLen < 8) {
    return fail("the .sng file index is truncated");
  }
  const fileMetaEnd = metadataEnd + 8 + fileMetaLen;
  if (fileMetaEnd > totalSize || fileMetaEnd > MAX_HEADER_BYTES) {
    return fail("the .sng file index is longer than the file");
  }

  const fileCount = readU64(view, metadataEnd + 8, fileMetaEnd);
  if (fileCount === null || fileCount > MAX_FILES) {
    return fail("the .sng file count is not readable");
  }

  const files: SngEntry[] = [];
  at = metadataEnd + 16;
  for (let index = 0; index < fileCount; index += 1) {
    if (at + 1 > fileMetaEnd) return fail("a .sng file entry is truncated");
    const nameLen = bytes[at] ?? 0;
    at += 1;
    if (at + nameLen + 16 > fileMetaEnd) return fail("a .sng file entry runs past its section");
    const name = decoder.decode(bytes.subarray(at, at + nameLen));
    at += nameLen;
    const length = readU64(view, at, fileMetaEnd);
    const contentsIndex = readU64(view, at + 8, fileMetaEnd);
    at += 16;
    if (length === null || contentsIndex === null) return fail("a .sng file entry has no offset");
    if (name) files.push({ name, length, index: contentsIndex });
  }
  if (at !== fileMetaEnd) problems.push("the .sng file index has padding this reader ignored");

  const dataLength = readU64(view, fileMetaEnd, totalSize);
  if (dataLength === null) return fail("the .sng file data length is missing");
  const dataStart = fileMetaEnd + 8;
  if (dataStart + dataLength > totalSize) {
    return fail("the .sng file data is longer than the file");
  }

  // A file outside the data section is not one this reader can unmask safely.
  const safeFiles = files.filter((entry) => {
    const inside =
      entry.index >= dataStart &&
      entry.index + entry.length <= dataStart + dataLength &&
      entry.index + entry.length <= totalSize;
    if (!inside) problems.push(`${entry.name}: its bytes are outside the package`);
    return inside;
  });

  return {
    header: {
      version,
      metadata,
      files: safeFiles,
      xorMask,
      dataStart,
      dataLength,
    },
    problems,
  };
}

/**
 * Parse a package's header from a `File` or `Blob`, reading only the bytes the
 * index needs. A folder of a thousand packages should not read a thousand songs'
 * audio to list them.
 */
export async function readSngHeaderFromFile(file: Blob): Promise<SngRead> {
  const size = file.size;
  if (size < METADATA_COUNT_AT) {
    return { header: null, problems: ["the .sng header is truncated"] };
  }
  try {
    const head = await readSlice(file, 0, METADATA_COUNT_AT);
    const view = viewOf(head);
    const metadataLen = readU64(view, HEADER_START, size);
    if (metadataLen === null || metadataLen < 8) {
      return { header: null, problems: ["the .sng metadata section is truncated"] };
    }
    const metadataEnd = METADATA_COUNT_AT + metadataLen;
    if (metadataEnd > size || metadataEnd > MAX_HEADER_BYTES) {
      return { header: null, problems: ["the .sng metadata section is longer than the file"] };
    }

    const fileMetaHead = await readSlice(file, 0, metadataEnd + 8);
    const fileMetaLen = readU64(viewOf(fileMetaHead), metadataEnd, size);
    if (fileMetaLen === null || fileMetaLen < 8) {
      return { header: null, problems: ["the .sng file index is truncated"] };
    }
    const headerEnd = metadataEnd + 8 + fileMetaLen + 8;
    if (headerEnd > size || headerEnd > MAX_HEADER_BYTES) {
      return { header: null, problems: ["the .sng file index is longer than the file"] };
    }

    return readSngHeader(await readSlice(file, 0, headerEnd), size);
  } catch {
    return { header: null, problems: ["the .sng header could not be read"] };
  }
}

/** Unmask one file from a package already in memory. */
export function readSngEntry(
  header: SngHeader,
  bytes: Uint8Array,
  entry: SngEntry,
): Uint8Array | null {
  if (
    entry.length < 0 ||
    entry.index < 0 ||
    entry.index + entry.length > bytes.length
  ) {
    return null;
  }
  return unmask(bytes.subarray(entry.index, entry.index + entry.length), header.xorMask);
}

/** Unmask one file from a local `File`/`Blob`, reading only that file's bytes. */
export async function readSngEntryFromFile(
  file: Blob,
  header: SngHeader,
  entry: SngEntry,
): Promise<Uint8Array | null> {
  if (
    entry.length < 0 ||
    entry.index < 0 ||
    entry.index + entry.length > file.size
  ) {
    return null;
  }
  try {
    return unmask(await readSlice(file, entry.index, entry.index + entry.length), header.xorMask);
  } catch {
    return null;
  }
}

/**
 * The name helpers — the chart, audio, cover and preview a package carries, and how
 * one member is addressed — live in `sngNames.ts`, so the library can list and draw a
 * package without downloading this reader. They are re-exported here because a
 * package's names and its bytes are one subject, read together.
 */
export { findEntry, sngEntryName, sngEntryUrl, sngFiles } from "./sngNames";

/** What a package source needs beyond its own bytes. */
export interface SngSourceInput {
  header: SngHeader;
  chart: SngEntry;
  chartBytes: Uint8Array;
  /** How a member becomes something a browser can fetch. */
  urlFor: (entry: SngEntry) => string | null;
  id?: string;
  fallbackTitle?: string;
  baseUrl?: string | null;
  /** Problems gathered while reading the package, reported with the source. */
  problems?: readonly string[];
}

/**
 * A package, read into the same `ParsedSource` a folder or a chart file produces.
 *
 * The chart itself goes through `parseSource`, so the package's format is the chart's
 * format: a MIDI with every part, or a `.chart` with every section. The metadata table
 * becomes the `song.ini` the chart readers already know, and the audio, art and
 * preview are handed to them as URLs.
 *
 * **The translators are fetched on demand.** This is an `async` function because
 * `parse.ts` pulls in every format reader, and a player who only opens the JSON
 * library should not download them; the import is dynamic so the parsers stay in
 * their own chunk until a package is actually read.
 */
export async function parseSngSource(input: SngSourceInput): Promise<ParsedSource | null> {
  const files = sngFiles(input.header);
  if (!files.chart) return null;

  const ini = sngIni(input.header.metadata);
  const stems: Partial<Record<StemRole, string>> = {};
  for (const [role, entry] of Object.entries(files.audio) as [StemRole, SngEntry][]) {
    const url = input.urlFor(entry);
    if (url) stems[role] = url;
  }
  const art = files.art ? input.urlFor(files.art) : null;
  const preview = files.preview ? input.urlFor(files.preview) : null;

  let source: ParsedSource;
  try {
    const { parseSource } = await import("./parse");
    source = parseSource({
      bytes: input.chartBytes,
      name: input.chart.name,
      ini,
      stems,
      preview,
      art,
      fallbackTitle: input.fallbackTitle,
      id: input.id,
      baseUrl: input.baseUrl ?? null,
    });
  } catch {
    return null;
  }

  source.problems.unshift(...(input.problems ?? []));
  const previewMs = iniNumber(ini, "preview_start_time", 0);
  if (previewMs > 0) source.meta.previewStartMs = Math.max(0, Math.trunc(previewMs));

  // A `.chart` names its music in `MusicStream`; the table usually finds it, but a
  // package may call the file anything. Now that the package index is in hand, a
  // bare name can become the entry it actually is.
  const byName = entryIndex(input.header.files);
  for (const stem of source.audio.stems) {
    const found =
      byName.get(stem.url.toLowerCase()) ?? byName.get(basename(stem.url).toLowerCase());
    if (!found) continue;
    const url = input.urlFor(found);
    if (url) stem.url = url;
  }

  if (source.audio.stems.length === 0) {
    source.problems.push("the package has no audio");
  }
  return source;
}

/** The metadata table as the lower-cased settings a `song.ini` reader expects. */
function sngIni(metadata: Record<string, string>): IniValues {
  const ini: IniValues = new Map();
  for (const [key, value] of Object.entries(metadata)) ini.set(key.toLowerCase(), value);
  return ini;
}

/* ------------------------------------------------------------------ bytes */

async function readSlice(file: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readU64(view: DataView, at: number, limit: number): number | null {
  if (at < 0 || at + 8 > limit || at + 8 > view.byteLength) return null;
  const value = view.getBigUint64(at, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
}

function readI32(view: DataView, at: number, limit: number): number | null {
  if (at < 0 || at + 4 > limit || at + 4 > view.byteLength) return null;
  return view.getInt32(at, true);
}

function startsWith(bytes: Uint8Array, tag: Uint8Array): boolean {
  if (bytes.length < tag.length) return false;
  for (let index = 0; index < tag.length; index += 1) {
    if (bytes[index] !== tag[index]) return false;
  }
  return true;
}

function unmask(bytes: Uint8Array, mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    out[index] = bytes[index]! ^ (mask[index % 16]! ^ (index & 0xff));
  }
  return out;
}
