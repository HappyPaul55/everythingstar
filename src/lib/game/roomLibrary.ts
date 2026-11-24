import type { RoomLibrarySong } from "../net/protocol";
import type { Song } from "./song";
import { fetchableUrl } from "./url";

/**
 * The songs a listening room publishes to its guests.
 *
 * A guest never fetches a song: the host plays it, and the guest only reads the
 * title, the artist and the address. What the room's index cannot carry is a song
 * that has no address at all — a folder on the host's disk, an OPFS import, a
 * package read from this machine. Those are skipped rather than shown as rows
 * that a guest could ask for but the host's own device is the only one that could
 * resolve.
 */
export function roomLibrarySongs(songs: readonly Song[]): RoomLibrarySong[] {
  return songs
    .filter(
      (song) =>
        fetchableUrl(song.doc) !== null && fetchableUrl(song.from) !== null,
    )
    .map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist.name,
      durationMs: song.durationMs,
      art: fetchableUrl(song.art ?? ""),
      accent: song.accent,
    }));
}
