/**
 * A `.sng` package's **names**: what a song needs from it, and how one member is
 * addressed.
 *
 * Split from `sng.ts` because these are table lookups — a conventional file name to
 * an index entry, a member to the URL that names it, a name to its MIME type — and
 * the library's seam needs them to list, preview and draw a package. The reader keeps
 * the package's magic and its byte-level unmasking, so a player who only opens the
 * JSON library never downloads it: importing these helpers must not pull `SNGPKG`
 * into `/play`'s first graph.
 *
 * Only the reader's **types** are imported, so the two modules have no runtime cycle:
 * `sng.ts` imports these helpers, never the other way round.
 */

import { basename } from "../text";
import { ART_NAMES, AUDIO_NAMES, PREVIEW_NAMES } from "./files";
import type { SngEntry, SngHeader } from "./sng";
import type { StemRole } from "./types";

/** The files a song needs, picked from the package by their conventional names. */
export interface SngFiles {
  chart: SngEntry | null;
  audio: Partial<Record<StemRole, SngEntry>>;
  art: SngEntry | null;
  preview: SngEntry | null;
}

/**
 * The chart, audio, cover and preview a package carries.
 *
 * A package may put its files under a folder (`art/album.jpg`), so a conventional
 * name matches either the whole path or the file's own name. The chart is the one
 * canonical name first, then any `.mid`/`.chart` as a fallback.
 */
export function sngFiles(header: SngHeader): SngFiles {
  const chart =
    findEntry(header.files, ["notes.mid"]) ??
    findEntry(header.files, ["notes.chart"]) ??
    header.files.find((entry) => /\.mid$/i.test(entry.name)) ??
    header.files.find((entry) => /\.chart$/i.test(entry.name)) ??
    null;

  const audio: Partial<Record<StemRole, SngEntry>> = {};
  for (const [role, candidates] of AUDIO_NAMES) {
    const entry = findEntry(header.files, candidates);
    if (entry) audio[role] = entry;
  }

  return {
    chart,
    audio,
    art: findEntry(header.files, ART_NAMES),
    preview: findEntry(header.files, PREVIEW_NAMES),
  };
}

/** One package entry by a conventional name, matching a folder's basename too. */
export function findEntry(
  files: readonly SngEntry[],
  candidates: readonly string[],
): SngEntry | null {
  const lowered = entryIndex(files);
  for (const candidate of candidates) {
    const found = lowered.get(candidate.toLowerCase());
    if (found) return found;
  }
  return null;
}

/**
 * A package's entries by name, in the two ways a conventional name arrives: the whole
 * path as the index wrote it, and the file's own basename.
 *
 * Both keys are **lowercased**, because a package may capitalise either — `Audio/
 * Guitar.opus` has to answer to `guitar.opus` just as `audio/guitar.opus` does. The
 * reader and the package's own attachment of a `MusicStream` both use this, so the
 * two lookups cannot drift.
 */
export function entryIndex(files: readonly SngEntry[]): Map<string, SngEntry> {
  const index = new Map<string, SngEntry>();
  for (const entry of files) {
    index.set(entry.name.toLowerCase(), entry);
    index.set(basename(entry.name).toLowerCase(), entry);
  }
  return index;
}

/**
 * A local package entry as a URL that `localObjectUrl` can resolve.
 *
 * A package is a file a browser cannot point an `<img>` or `<audio>` at and ask for
 * one member of, so the URL carries the member's name in `?entry=`.
 */
export function sngEntryUrl(packageUrl: string, name: string): string {
  const base = packageUrl.split("#")[0]?.split("?")[0] ?? packageUrl;
  return `${base}?entry=${encodeURIComponent(name)}`;
}

/** The entry a package URL names, or null when it names no member. */
export function sngEntryName(url: string): string | null {
  const match = /[?&]entry=([^&#]*)/.exec(url);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1] ?? "");
  } catch {
    return match[1] ?? null;
  }
}

/** A MIME type for the browser's media and image elements, from the name. */
export function mimeForSng(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".ogg") || lower.endsWith(".opus")) return "audio/ogg";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  return "application/octet-stream";
}
