/**
 * The jukebox: how a list of songs becomes an indexed one.
 *
 * Pure, so what "A–Z" means — which letter a title files under, what a song's slot
 * is called, what a search matches — is unit-tested rather than buried in a
 * component. A real library replaces the songs, not this: it works on the **song**
 * the library hands it, and knows nothing about where the list came from.
 */

import type { MessageKey } from "../../i18n";
import { INSTRUMENTS } from "./track";
import { songHasPitch, songParts, type Song } from "./song";

/**
 * The index's order — and, because the list files itself by the same letters, the
 * **list's** order too.
 *
 * `#` comes first because that is where a title that does not begin with a letter
 * files (digits and punctuation), and music libraries put those first. Whatever
 * this array says, the list and the index agree: `groupSongs` walks it, so the two
 * cannot drift apart.
 */
export const INDEX_LETTERS: string[] = [
  "#",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
];

/** Which letter a title files under. Anything that is not a letter is "#". */
export function letterOf(title: string): string {
  const first = title.trim().charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : "#";
}

/** One song, with the jukebox's own address for it. */
export interface SongEntry {
  song: Song;
  /** `A·03`: the letter it files under, and its place there. */
  slot: string;
}

export interface SongGroup {
  letter: string;
  entries: SongEntry[];
}

/**
 * Songs by title, filed under their letter, each with its slot code.
 *
 * The letters come out in `INDEX_LETTERS` order rather than in whatever order the
 * titles happen to collate in: a title that begins with punctuation files under
 * `#`, and `localeCompare` would otherwise have sorted it among the letters.
 */
export function groupSongs(songs: readonly Song[]): SongGroup[] {
  const byLetter = new Map<string, Song[]>();
  for (const song of songs) {
    const letter = letterOf(song.title);
    const list = byLetter.get(letter);
    if (list) list.push(song);
    else byLetter.set(letter, [song]);
  }
  return INDEX_LETTERS.filter((letter) => byLetter.has(letter)).map((letter) => {
    const entries = [...(byLetter.get(letter) ?? [])]
      .sort((a, b) => a.title.localeCompare(b.title, "en"))
      .map((song, index) => ({
        song,
        slot: `${letter}·${String(index + 1).padStart(2, "0")}`,
      }));
    return { letter, entries };
  });
}

/** What a search matches: the song's title, or its artist. */
export function matches(song: Song, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    song.title.toLowerCase().includes(needle) ||
    song.artist.name.toLowerCase().includes(needle)
  );
}

/**
 * What a song offers, as chips, **in the order it offers it**.
 *
 * Additions only: a solo is what a song is unless it says otherwise, and a song
 * with vocals shows the words too, so `Lyrics` is not said as well — the list is
 * what this song has *besides* the ordinary.
 *
 * **Difficulty is deliberately not here.** It is a chart's, not a song's: a song
 * can be easy on the guitar and hard to sing, so a player chooses their difficulty
 * per part on the band screen instead.
 */
export function songChips(song: Song): MessageKey[] {
  const chips: MessageKey[] = [];
  if (songParts(song) > 1) chips.push("song.duet");
  if (song.offer.voice) chips.push(songHasPitch(song) ? "song.vocals" : "song.lyrics");
  for (const instrument of song.offer.instruments) {
    // A lead and a rhythm guitar are two parts and both worth naming; the role is
    // the name, so the list does not say "Guitar" twice.
    chips.push(
      instrument.role === "lead"
        ? "band.leadGuitar"
        : instrument.role === "rhythm"
          ? "band.rhythmGuitar"
          : INSTRUMENTS[instrument.kind].labelKey,
    );
  }
  return chips;
}

/**
 * The groups a search keeps. A slot is a song's place in the whole jukebox, so a
 * filtered list keeps the codes it had — a song does not move because the list
 * around it changed.
 *
 * `keep` is for an on-demand playlist's answer: a resolver may legitimately find a
 * song whose title and artist do not contain the words that were typed, and hiding
 * it because the **local** filter does not match would throw away the very result
 * the player asked for. Those entries stay filed under their own letter.
 */
export function searchSongs(
  groups: readonly SongGroup[],
  query: string,
  keep?: ReadonlySet<string>,
): SongGroup[] {
  if (!query.trim()) return [...groups];
  return groups
    .map((group) => ({
      letter: group.letter,
      entries: group.entries.filter(
        (entry) => matches(entry.song, query) || keep?.has(entry.song.id),
      ),
    }))
    .filter((group) => group.entries.length > 0);
}
