/**
 * A playlist **checked**: what a provider's document says, and what the game's
 * reader had to skip.
 *
 * The authority is `readPlaylist` in `playlist.ts` — the same reader the jukebox
 * and the band use — so a document this says is ready is one the game will list.
 * `docs/playlist.schema.json` is the advisory shape beside it: an editor can catch
 * a typo before the game does, but a schema cannot say what resolves, what is
 * playable, and what is merely tolerated.
 *
 * Pure: the report is built from a body and its URL, and the script that fetches
 * the body is a thin caller.
 */

import { looksLikePlaylist, readPlaylist } from "./playlist";

/** What one playlist document came to. */
export interface PlaylistCheck {
  /** The document's own URL — what every relative path in it resolves against. */
  url: string;
  /** Ready to list: it is a playlist, and the reader named nothing it skipped. */
  ok: boolean;
  name: string | null;
  /** The songs the game would list, after the unreadable entries were skipped. */
  songs: number;
  /** The query parameter when it is a search endpoint, or null for a catalogue. */
  onDemand: string | null;
  /** Everything the reader pushed aside, in its own words. */
  problems: string[];
}

/**
 * Hold a body to the reader.
 *
 * `looksLikePlaylist` is the other half: `{ "schemaVersion": 1 }` alone is a
 * document the reader accepts without a problem, because there was nothing in it
 * to read — but it is not a playlist, so a provider is told rather than left with
 * an empty list that looks like a bug in the game.
 */
export function checkPlaylist(body: unknown, url: string): PlaylistCheck {
  const read = readPlaylist(body, url);
  const problems = [...read.problems];
  const playlist = looksLikePlaylist(body);
  if (!playlist && problems.length === 0) {
    problems.push("not a playlist: it lists no songs and cannot be searched");
  }
  return {
    url,
    ok: playlist && problems.length === 0,
    name: read.name,
    songs: read.songs.length,
    onDemand: read.onDemand?.param ?? null,
    problems,
  };
}

/**
 * The check as something a person or a machine reads.
 *
 * Text is the shape a provider runs in a terminal: one fact a line, then each
 * problem in the reader's own words, then the verdict. `json` is the same record
 * for a build step, with `ok` as the field to test.
 */
export function formatPlaylistCheck(check: PlaylistCheck, json = false): string {
  if (json) {
    return JSON.stringify(
      {
        ok: check.ok,
        url: check.url,
        name: check.name,
        songs: check.songs,
        onDemand: check.onDemand,
        problems: check.problems,
      },
      null,
      2,
    );
  }
  return [
    `Playlist: ${check.name ?? "(unnamed)"}`,
    `URL: ${check.url}`,
    `Songs: ${check.songs}`,
    `Search: ${check.onDemand ? `?${check.onDemand}` : "no (a fixed catalogue)"}`,
    check.problems.length === 0
      ? "Problems: none"
      : `${check.problems.length} problem${check.problems.length === 1 ? "" : "s"}:`,
    ...check.problems.map((problem) => `  - ${problem}`),
    `Result: ${check.ok ? "ok" : "failed"}`,
  ].join("\n");
}
