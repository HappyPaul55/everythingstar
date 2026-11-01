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

/**
 * Which letter a title files under.
 *
 * The first character is folded first: `Écoute` and `Café` file under E and C, the
 * same rule the search uses, rather than under `#` while the index promises
 * accents are folded. A digit, a symbol or a script this index has no letter for
 * is `#`.
 */
export function letterOf(title: string): string {
  const first = title
    .trim()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .charAt(0)
    .toUpperCase();
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

/**
 * How a search compares text: **one normalisation for the query and the fields**,
 * so `Café` and `cafe` are the same word. NFD splits an accented letter into its
 * letter and its mark, the marks are dropped, case goes, and runs of whitespace
 * become one space — so a title written with a double space still matches a query
 * typed with one.
 */
function normaliseSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\p{M}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Whether two words are one edit apart: a substitution, an insertion, a deletion,
 * or a swap of two neighbours. A transposition counts as one edit because that is
 * how a hand types — `neon` for `enon` is one slip, not two. Anything further is
 * not a typo this search forgives.
 */
function withinOneEdit(a: string, b: string): boolean {
  const left = Array.from(a);
  const right = Array.from(b);
  if (Math.abs(left.length - right.length) > 1) return false;

  if (left.length === right.length) {
    let first = -1;
    for (let at = 0; at < left.length; at += 1) {
      if (left[at] !== right[at]) {
        first = at;
        break;
      }
    }
    if (first < 0) return true;
    // A swapped pair: both neighbours are there, the other way round.
    if (
      left[first + 1] === right[first] &&
      left[first] === right[first + 1]
    ) {
      return sameFrom(left, right, first + 2);
    }
    return sameFrom(left, right, first + 1);
  }

  const longer = left.length > right.length ? left : right;
  const shorter = left.length > right.length ? right : left;
  let at = 0;
  while (at < shorter.length && longer[at] === shorter[at]) at += 1;
  for (let index = at; index < shorter.length; index += 1) {
    if (longer[index + 1] !== shorter[index]) return false;
  }
  return true;
}

/** Whether the two arrays agree from `from` onwards. */
function sameFrom(
  left: readonly string[],
  right: readonly string[],
  from: number,
): boolean {
  for (let at = from; at < left.length; at += 1) {
    if (left[at] !== right[at]) return false;
  }
  return true;
}

/**
 * What a search matches: the song's **title, artist or album**.
 *
 * A field containing the query is the ordinary search. When none does, a single
 * typo is forgiven against any word of those fields — but only for a query of at
 * least four characters with no spaces, because `ant` is too short for a guess to
 * be worth anything and a multi-word query is a phrase to find rather than a word
 * to misspell. The result is still a yes or no: the matched songs keep their
 * order, their A–Z groups and their slot codes, so nothing is ranked.
 */
export function matches(song: Song, query: string): boolean {
  const needle = normaliseSearch(query);
  if (!needle) return true;
  const fields = [song.title, song.artist.name, song.album?.name ?? ""]
    .map(normaliseSearch)
    .filter(Boolean);
  if (fields.some((field) => field.includes(needle))) return true;
  if (Array.from(needle).length < 4 || needle.includes(" ")) return false;
  return fields.some((field) =>
    field.split(" ").some((word) => withinOneEdit(word, needle)),
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
