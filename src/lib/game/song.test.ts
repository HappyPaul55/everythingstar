import { describe, expect, test } from "bun:test";
import type { Song } from "./song";
import {
  isSongRole,
  laneRoleOf,
  resolveLaneRole,
  roleKind,
  songArt,
  songDifficulties,
  songForId,
  songHasPart,
  songHasPitch,
  songParts,
  songRoleFor,
  songRoles,
  songWords,
} from "./song";

function song(over: Partial<Song> = {}): Song {
  return {
    id: "a",
    title: "A Song",
    artist: { id: "ar", name: "An Artist", art: null },
    album: null,
    art: null,
    accent: null,
    durationMs: 1000,
    previewStartMs: 0,
    offer: { instruments: [{ kind: "guitar", difficulties: ["easy"] }], voice: null },
    video: null,
    doc: "https://x/songs/a.json",
    from: "https://x/playlist.json",
    revision: "test",
    seed: 1,
    ...over,
  };
}

describe("roleKind", () => {
  test("a guitar flavour is a guitar, whatever it is called", () => {
    expect(roleKind("lead_guitar")).toBe("guitar");
    expect(roleKind("rhythm_guitar")).toBe("guitar");
    expect(roleKind("guitar")).toBe("guitar");
  });

  test("the voice is the one place at the words", () => {
    expect(roleKind("vocals")).toBe("words");
  });

  test("an instrument is itself", () => {
    expect(roleKind("drums")).toBe("drums");
    expect(roleKind("keys")).toBe("keys");
  });

  test("only the parts a song can carry are roles", () => {
    expect(isSongRole("lead_guitar")).toBe(true);
    expect(isSongRole("vocals")).toBe(true);
    expect(isSongRole("words")).toBe(false);
    expect(isSongRole(7)).toBe(false);
  });
});

describe("songDifficulties", () => {
  test("an instrument gets what its charts carry, and nothing else", () => {
    const found = song({
      offer: {
        instruments: [{ kind: "guitar", difficulties: ["hard", "expert"] }],
        voice: null,
      },
    });
    expect(songDifficulties(found, "guitar")).toEqual(["hard", "expert"]);
    expect(songDifficulties(found, "bass")).toEqual([]);
  });

  test("a singer always has the three a voice has, whatever the chart says", () => {
    const sung = song({ offer: { instruments: [], voice: { chartType: "vocals", parts: 1 } } });
    expect(songDifficulties(sung, "words")).toEqual(["easy", "normal", "hard"]);
  });

  test("a typist has none: a lyrics song is free play", () => {
    const typed = song({ offer: { instruments: [], voice: { chartType: "lyrics", parts: 1 } } });
    expect(songDifficulties(typed, "words")).toEqual([]);
  });
});

describe("the guitar roles", () => {
  const twoRoles = song({
    offer: {
      instruments: [
        { kind: "guitar", role: "lead", difficulties: ["easy", "hard"] },
        { kind: "guitar", role: "rhythm", difficulties: ["hard"] },
      ],
      voice: null,
    },
  });

  test("names a lane role and the part it is called in a document", () => {
    expect(laneRoleOf("lead_guitar")).toBe("lead");
    expect(laneRoleOf("rhythm_guitar")).toBe("rhythm");
    expect(laneRoleOf("bass")).toBeNull();
    expect(songRoleFor("lead")).toBe("lead_guitar");
    expect(songRoleFor("rhythm")).toBe("rhythm_guitar");
  });

  test("a song's roles are its own, in the order a band screen offers them", () => {
    expect(songRoles(twoRoles, "guitar")).toEqual(["lead", "rhythm"]);
    expect(songRoles(song(), "guitar")).toEqual([]);
  });

  test("a roleless seat takes the lead, and an unknown role falls back", () => {
    expect(resolveLaneRole(twoRoles, "guitar")).toBe("lead");
    expect(resolveLaneRole(twoRoles, "guitar", "rhythm")).toBe("rhythm");
    expect(resolveLaneRole(twoRoles, "guitar", "lead")).toBe("lead");
  });

  test("a plain guitar offer is the lead even when a rhythm is also offered", () => {
    const mixed = song({
      offer: {
        instruments: [
          { kind: "guitar", difficulties: ["easy"] },
          { kind: "guitar", role: "rhythm", difficulties: ["hard"] },
        ],
        voice: null,
      },
    });
    expect(resolveLaneRole(mixed, "guitar")).toBeUndefined();
    expect(songDifficulties(mixed, "guitar")).toEqual(["easy"]);
    expect(songHasPart(mixed, "guitar")).toBe(true);
    expect(songDifficulties(mixed, "guitar", "rhythm")).toEqual(["hard"]);
  });

  test("each role's difficulties and part are its own", () => {
    expect(songDifficulties(twoRoles, "guitar", "lead")).toEqual(["easy", "hard"]);
    expect(songDifficulties(twoRoles, "guitar", "rhythm")).toEqual(["hard"]);
    expect(songHasPart(twoRoles, "guitar", "lead")).toBe(true);
    expect(songHasPart(twoRoles, "guitar", "rhythm")).toBe(true);
    // A roleless question follows the same preference.
    expect(songDifficulties(twoRoles, "guitar")).toEqual(["easy", "hard"]);
  });
});

describe("what a song offers", () => {
  test("the words are offered when there is a voice, and the pitch says which", () => {
    expect(songWords(song())).toBe(false);
    const sung = song({ offer: { instruments: [], voice: { chartType: "vocals", parts: 2 } } });
    expect(songWords(sung)).toBe(true);
    expect(songHasPitch(sung)).toBe(true);
    expect(songParts(sung)).toBe(2);
  });

  test("a song with nothing to play has no part for anything", () => {
    const nothing = song({ offer: { instruments: [], voice: null } });
    expect(songHasPart(nothing, "guitar")).toBe(false);
    expect(songHasPart(nothing, "words")).toBe(false);
  });

  test("a duet is the song's own fact, and a solo is what it is without one", () => {
    expect(songParts(song())).toBe(1);
  });
});

describe("songArt", () => {
  test("takes the nearest art there is: its own, its album's, its artist's", () => {
    const all = song({
      art: "https://x/art/song.jpg",
      album: { id: "al", name: "An Album", year: 2007, art: "https://x/art/album.jpg" },
      artist: { id: "ar", name: "An Artist", art: "https://x/art/artist.jpg" },
    });
    expect(songArt(all)).toBe("https://x/art/song.jpg");
    expect(songArt({ ...all, art: null })).toBe("https://x/art/album.jpg");
    expect(songArt({ ...all, art: null, album: null })).toBe("https://x/art/artist.jpg");
  });

  test("says nothing when the song has no art anywhere", () => {
    expect(songArt(song())).toBeNull();
  });
});

describe("songForId", () => {
  test("finds a song, or nothing at all", () => {
    const songs = [song({ id: "a" }), song({ id: "b" })];
    expect(songForId(songs, "b")?.id).toBe("b");
    expect(songForId(songs, "c")).toBeNull();
  });
});
