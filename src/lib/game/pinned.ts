/**
 * A song from a link.
 *
 * A playlist is the library's index, but a link may name **one song** — a song
 * document that a provider serves without a playlist around it. This turns that
 * document into the summary the jukebox draws, so the song lists, opens, plays and
 * downloads exactly like one a playlist named.
 *
 * `from` is the document itself: a pinned song has no playlist, and the field is
 * what the Playlists dialog groups by and what a download caches first.
 */

import { hashString } from "./hash";
import { seedForId, type Song } from "./song";
import { offerFromDoc, type SourceSongDoc } from "./source";

/**
 * A pinned song's revision: a hash of the document itself.
 *
 * A playlist entry is the revision for a song a playlist lists — changing the entry
 * is how a published summary is re-issued. A pinned song has no entry, so its
 * content is the revision: the same parsed document hashes the same on every read,
 * and one that changed under the same URL hashes differently, which is what lets a
 * refresh invalidate the document and the charts read against it.
 */
export function pinnedRevision(doc: SourceSongDoc): string {
  return hashString(JSON.stringify(doc)).toString(36);
}

export function pinnedSong(doc: SourceSongDoc, url: string): Song {
  return {
    id: doc.id,
    title: doc.title,
    artist: doc.artist,
    album: doc.album,
    art: doc.art,
    accent: null,
    durationMs: doc.durationMs,
    previewStartMs: doc.previewStartMs,
    // The document is the truth about what can be played: a pinned song has no
    // playlist summary to be stale, and this is the same reader the band screen
    // uses for every song.
    offer: offerFromDoc(doc),
    video: doc.video,
    doc: url,
    from: url,
    revision: pinnedRevision(doc),
    seed: seedForId(doc.id),
  };
}
