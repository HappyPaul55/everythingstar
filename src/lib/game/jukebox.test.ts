import { describe, expect, test } from "bun:test";
import type { InstrumentKind } from "./track";
import type { Song, SongVoice } from "./song";
import {
  INDEX_LETTERS,
  groupSongs,
  letterOf,
  matches,
  searchSongs,
  songChips,
} from "./jukebox";

/** A song as the library hands one over: only what the jukebox reads. */
function song(
  title: string,
  artist = "Static Bloom",
  over: {
    instruments?: InstrumentKind[];
    voice?: SongVoice | null;
    album?: string | null;
  } = {},
): Song {
  return {
    id: title.toLowerCase().replace(/\W+/g, "-"),
    title,
    artist: { id: "a", name: artist, art: null },
    album:
      over.album === undefined || over.album === null
        ? null
        : { id: "al", name: over.album, year: null, art: null },
    art: null,
    accent: null,
    durationMs: 180_000,
    previewStartMs: 0,
    offer: {
      instruments: (over.instruments ?? ["guitar"]).map((kind) => ({
        kind,
        difficulties: ["normal"],
      })),
      voice: over.voice === undefined ? { chartType: "vocals", parts: 1 } : over.voice,
    },
    video: null,
    doc: "https://x/songs/a.json",
    from: "https://x/playlist.json",
    revision: "test",
    seed: 1,
  };
}

describe("letterOf", () => {
  test("files a title under its first letter, whatever its case", () => {
    expect(letterOf("Neon Hearts")).toBe("N");
    expect(letterOf("neon hearts")).toBe("N");
  });

  test("anything that is not a letter goes in the hash bucket", () => {
    expect(letterOf("1999 Forever")).toBe("#");
    expect(letterOf("(Turn It Up)")).toBe("#");
    expect(letterOf("")).toBe("#");
  });
});

describe("groupSongs", () => {
  test("sorts by title and groups by letter", () => {
    const groups = groupSongs([song("Nine Lives"), song("Anthem"), song("1999 Forever")]);
    expect(groups.map((group) => group.letter)).toEqual(["#", "A", "N"]);
    expect(groups.map((group) => group.entries[0].song.title)).toEqual([
      "1999 Forever",
      "Anthem",
      "Nine Lives",
    ]);
  });

  test("a slot is the letter and the song's place under it", () => {
    const groups = groupSongs([song("Bass Line"), song("Broken Radio"), song("Bright")]);
    const b = groups.find((group) => group.letter === "B");
    expect(b?.entries.map((entry) => entry.slot)).toEqual(["B·01", "B·02", "B·03"]);
  });

  test("the list and the index are the same order, at a library's size", () => {
    // A few hundred songs is what the index is for, so it is tested at that size.
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const many = Array.from({ length: 300 }, (_, index) =>
      song(`${letters[index % 26]}${index} Song`),
    );
    const groups = groupSongs(many);
    const seen = groups.map((group) => group.letter);
    expect(seen).toEqual(INDEX_LETTERS.filter((letter) => seen.includes(letter)));
    expect(seen.length).toBe(26);
  });

  test("a title that does not begin with a letter files under the hash", () => {
    // Collation would have put this one among the Ts; the list files it by its
    // first character instead, which is what the index promises.
    const groups = groupSongs([song("(Turn It Up)"), song("Turn It Up")]);
    expect(groups.map((group) => group.letter)).toEqual(["#", "T"]);
  });

  test("the order does not depend on how the list arrived", () => {
    const one = groupSongs([song("Delta"), song("Charlie")]);
    const two = groupSongs([song("Charlie"), song("Delta")]);
    expect(one).toEqual(two);
  });
});

describe("matches", () => {
  test("matches the title or the artist, whatever the case", () => {
    const found = song("Neon Hearts", "Velvet Hours");
    expect(matches(found, "neon")).toBe(true);
    expect(matches(found, "VELVET")).toBe(true);
    expect(matches(found, "hours")).toBe(true);
    expect(matches(found, "static")).toBe(false);
  });

  test("an accent is not a difference", () => {
    expect(matches(song("Café"), "cafe")).toBe(true);
    expect(matches(song("Cafe"), "café")).toBe(true);
    expect(matches(song("Static Bloom", "Zürich"), "zurich")).toBe(true);
  });

  test("the album is part of what a song is", () => {
    const found = song("Neon Hearts", "Velvet Hours", { album: "Midnight Drive" });
    expect(matches(found, "midnight")).toBe(true);
    expect(matches(found, "MIDNIGHT")).toBe(true);
    expect(matches(song("Neon Hearts", "Velvet Hours"), "midnight")).toBe(false);
  });

  test("a run of whitespace is one space", () => {
    expect(matches(song("Neon   Hearts"), "neon hearts")).toBe(true);
    expect(matches(song("Neon Hearts"), "  neon   hearts  ")).toBe(true);
  });

  test("one typo is forgiven on a long enough word", () => {
    const found = song("Neon Hearts", "Velvet Hours");
    // A substitution, an insertion, a deletion and a swapped pair: each is one slip.
    expect(matches(found, "heartz")).toBe(true);
    expect(matches(found, "neonn")).toBe(true);
    expect(matches(found, "velvt")).toBe(true);
    expect(matches(found, "enon")).toBe(true);
  });

  test("a short query is never guessed at", () => {
    // "nen" is one insertion away from "neon", but three characters is too little
    // to know the player meant it.
    expect(matches(song("Neon"), "nen")).toBe(false);
  });

  test("two edits away is still nothing", () => {
    expect(matches(song("Anthem"), "antxam")).toBe(false);
  });

  test("a phrase is searched exactly, without typo tolerance", () => {
    expect(matches(song("Neon Hearts"), "neon heartz")).toBe(false);
    expect(matches(song("Neon Hearts"), "neon hearts")).toBe(true);
  });

  test("an empty search matches everything", () => {
    expect(matches(song("Anything"), "")).toBe(true);
    expect(matches(song("Anything"), "   ")).toBe(true);
  });
});

describe("searchSongs", () => {
  test("keeps only what matched, and keeps the slots as they were", () => {
    const groups = groupSongs([song("Bass Line"), song("Beta"), song("Charlie")]);
    const found = searchSongs(groups, "be");
    expect(found.map((group) => group.letter)).toEqual(["B"]);
    expect(found[0].entries.map((entry) => entry.slot)).toEqual(["B·02"]);
  });

  test("no query is the whole jukebox", () => {
    const groups = groupSongs([song("Alpha"), song("Beta")]);
    expect(searchSongs(groups, "")).toEqual(groups);
  });

  test("a search that matches nothing keeps no groups", () => {
    expect(searchSongs(groupSongs([song("Alpha")]), "zzz")).toEqual([]);
  });

  test("a song an on-demand playlist found stays, even when its text does not match", () => {
    // A resolver can call "Timber" a cover with a different title; the player asked
    // for it, so the local text filter must not throw the answer away.
    const groups = groupSongs([song("Alpha"), song("Cover of the Century")]);
    const keep = new Set(["cover-of-the-century"]);
    const found = searchSongs(groups, "timber", keep);
    expect(found.map((group) => group.letter)).toEqual(["C"]);
    expect(found[0].entries[0].song.title).toBe("Cover of the Century");
  });

  test("the keep set is not a second list: it only rescues what is there", () => {
    const groups = groupSongs([song("Alpha")]);
    expect(searchSongs(groups, "timber", new Set(["not-in-the-library"]))).toEqual([]);
  });

  test("an on-demand answer survives a long query no local field matches", () => {
    // The resolver knows the song by a name this library's summary does not carry.
    // Fuzzy matching must not narrow what it may answer with.
    const groups = groupSongs([song("Alpha"), song("Cover of the Century")]);
    const keep = new Set(["cover-of-the-century"]);
    const found = searchSongs(groups, "timbr", keep);
    expect(found.map((group) => group.letter)).toEqual(["C"]);
  });
});

describe("songChips", () => {
  test("says what the song offers, in order: the words, then the parts to play", () => {
    expect(songChips(song("A", "B", { instruments: ["guitar", "drums", "bass"] }))).toEqual([
      "song.vocals",
      "band.guitar",
      "band.drums",
      "band.bass",
    ]);
  });

  test("a lead and a rhythm guitar are two chips, not Guitar twice", () => {
    const two = song("A", "B", { instruments: [] });
    two.offer = {
      instruments: [
        { kind: "guitar", role: "lead", difficulties: ["normal"] },
        { kind: "guitar", role: "rhythm", difficulties: ["normal"] },
      ],
      voice: two.offer.voice,
    };
    expect(songChips(two)).toEqual([
      "song.vocals",
      "band.leadGuitar",
      "band.rhythmGuitar",
    ]);
  });

  test("a solo is implied, so only a duet says so", () => {
    expect(songChips(song("A", "B", { instruments: [] }))).toEqual(["song.vocals"]);
    const duet = songChips(
      song("A", "B", { instruments: [], voice: { chartType: "vocals", parts: 2 } }),
    );
    expect(duet[0]).toBe("song.duet");
  });

  test("one place at the words: Vocals with pitch, Lyrics without", () => {
    expect(songChips(song("A", "B", { instruments: [] }))).toEqual(["song.vocals"]);
    expect(songChips(song("A", "B", { instruments: [] }))).not.toContain("song.lyrics");
    expect(
      songChips(song("A", "B", { instruments: [], voice: { chartType: "lyrics", parts: 1 } })),
    ).toEqual(["song.lyrics"]);
  });

  test("an instrumental offers only what is played on it", () => {
    expect(songChips(song("A", "B", { instruments: ["drums"], voice: null }))).toEqual([
      "band.drums",
    ]);
  });

  test("difficulty is never a song's own chip", () => {
    // A song can be easy on the guitar and hard to sing, so difficulty belongs to
    // whoever is playing — never advertised here, not even as a level.
    const chips = songChips(song("A", "B", { instruments: ["guitar"] }));
    for (const level of ["easy", "normal", "hard", "expert"]) {
      expect(chips).not.toContain(`band.${level}` as "band.easy");
    }
  });
});
