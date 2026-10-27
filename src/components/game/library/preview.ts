import {
  isLocalUrl,
  localObjectUrl,
  localPreview,
  localPreviewClip,
  localSongFiles,
} from "./folder";
import { isSngUrl } from "./sngUrl";
import { cachedJson } from "./store";
import type { Song } from "../../../lib/game/song";
import { previewFor, readSongDoc, type SongPreview } from "../../../lib/game/source";

/**
 * What a jukebox row can play, or null when it cannot be read.
 *
 * A preview is somebody else's file, fetched from somebody else's host, and none
 * of it is trusted: a song document that is not one, a `.sng` that will not open,
 * a browser that refuses an object URL. A row that cannot be auditioned is a
 * **quiet** row — never a rejected effect the player cannot see or dismiss — so
 * every failure here lands on the same answer: no preview.
 *
 * `read` and `local` are seams for the unit test; the hook passes the real
 * readers. Keeping the failure here rather than in the effect means the ownership
 * rule stays obvious: a resolved preview's object URLs are handed back to the
 * caller, and only the ones this request created are ever revoked.
 */
export async function resolvePreview(
  song: Song,
  signal?: AbortSignal,
  read: PreviewReader = previewSource,
  local: LocalReader = localObjectUrl,
): Promise<FoundPreview | null> {
  try {
    const found = await read(song, signal);
    if (!found) return null;
    if (found.object || !isLocalUrl(found.url)) return found;
    const object = await local(found.url);
    return object ? { ...found, url: object, object: true } : null;
  } catch {
    return null;
  }
}

/**
 * `URL.createObjectURL`, or null where this browser will not make one.
 *
 * A refusal is a preview the jukebox does without, exactly like a file that does
 * not arrive: it must not become an unhandled rejection above the row.
 */
export function safeObjectUrl(make: () => string | null): string | null {
  try {
    return make();
  } catch {
    return null;
  }
}

/** What this song can preview, from what is beside it or from its document. */
async function previewSource(song: Song, signal?: AbortSignal): Promise<FoundPreview | null> {
  if (isLocalUrl(song.doc)) {
    const found = localPreview(song.doc, song.previewStartMs);
    // A record from a build that did not write the clip down falls back to the master;
    // ask the folder once whether a clip is sitting beside the song before settling.
    if (!localSongFiles(song.doc)?.preview) {
      const clip = await localPreviewClip(song.doc);
      if (clip) return { url: clip, startMs: 0, object: true };
    }
    return found;
  }
  if (isSngUrl(song.doc)) return previewSng(song, signal);
  // The row's own signal: leaving the row aborts the document read as well as the
  // clip beside it, rather than letting a preview nobody is looking at finish.
  const body = await cachedJson(song.doc, "song", false, song.revision, signal);
  if (body === null) return null;
  const read = readSongDoc(body, song.doc);
  return read.doc ? previewFor(read.doc) : null;
}

/**
 * A package's preview, and the cover that came with it.
 *
 * Its members are read out of the package into object URLs, so the audio URL is
 * made first: a browser that cannot make one has no preview at all, while one that
 * refuses only the cover still plays the sound.
 *
 * The package reader arrives with this module's first package: a jukebox row for a
 * JSON song must not download it to ask whether it needs it.
 */
async function previewSng(song: Song, signal?: AbortSignal): Promise<FoundPreview | null> {
  const { loadSng, sngArtEntry, sngObjectUrl, sngPreviewEntry } = await import("./sng");
  const remote = await loadSng(song.doc, signal);
  if (!remote) return null;
  const choice = sngPreviewEntry(remote.header);
  if (!choice) return null;
  const url = safeObjectUrl(() => sngObjectUrl(remote.bytes, remote.header, choice.entry));
  if (!url) return null;
  const artEntry = sngArtEntry(remote.header);
  const art = artEntry
    ? safeObjectUrl(() => sngObjectUrl(remote.bytes, remote.header, artEntry))
    : null;
  return {
    url,
    startMs: choice.clip ? 0 : choice.startMs || Math.max(0, song.previewStartMs),
    object: true,
    art,
    artObject: art !== null,
  };
}

/** A preview and whether each URL is already an object URL read from a package. */
export interface FoundPreview extends SongPreview {
  object?: boolean;
  art?: string | null;
  artObject?: boolean;
}

/** The two reads `resolvePreview` makes, replaceable in a unit test. */
type PreviewReader = (song: Song, signal?: AbortSignal) => Promise<FoundPreview | null>;
type LocalReader = (url: string) => Promise<string | null>;
