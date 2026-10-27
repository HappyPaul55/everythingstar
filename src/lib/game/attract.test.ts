import { describe, expect, test } from "bun:test";
import {
  ATTRACT_INSTRUMENTS,
  ATTRACT_STOPS,
  attractBand,
  attractCycle,
  attractSoundOn,
  playableAttractSongs,
  readAttractConfig,
  type AttractConfig,
} from "./attract";
import type { Song } from "./song";

function song(overrides: Partial<Song> = {}): Song {
  const id = overrides.id ?? "song";
  return {
    id,
    title: `Song ${id}`,
    artist: { id: "artist", name: "Artist", art: null },
    album: null,
    art: null,
    accent: null,
    durationMs: 120_000,
    previewStartMs: 0,
    offer: {
      instruments: [
        { kind: "guitar", difficulties: ["easy", "normal", "hard", "expert"] },
      ],
      voice: null,
    },
    video: null,
    doc: `https://example.com/songs/${id}.json`,
    from: "https://example.com/playlist.json",
    revision: `revision-${id}`,
    seed: 7,
    ...overrides,
  };
}

describe("readAttractConfig", () => {
  test("defaults to a full band, polite sound, the idle and the corner", () => {
    expect(readAttractConfig("")).toEqual({
      players: "band",
      sound: "auto",
      demo: false,
      chrome: true,
    });
  });

  test("reads the homepage window's own shape", () => {
    expect(readAttractConfig("?players=1&sound=0&demo=1&chrome=0")).toEqual({
      players: 1,
      sound: "off",
      demo: true,
      chrome: false,
    });
  });

  test("reads a forced kiosk and aliases the immediate start", () => {
    expect(readAttractConfig("?instant=1&sound=on")).toEqual({
      players: "band",
      sound: "on",
      demo: true,
      chrome: true,
    });
  });
});

describe("attractSoundOn", () => {
  const base: AttractConfig = {
    players: "band",
    sound: "auto",
    demo: false,
    chrome: true,
  };

  test("auto is silent until the document has been touched", () => {
    expect(attractSoundOn(base, false)).toBe(false);
    expect(attractSoundOn(base, true)).toBe(true);
  });

  test("off never makes sound, and on always does", () => {
    expect(attractSoundOn({ ...base, sound: "off" }, true)).toBe(false);
    expect(attractSoundOn({ ...base, sound: "on" }, false)).toBe(true);
  });
});

describe("playableAttractSongs", () => {
  test("keeps a song with an instrument or words, and drops the rest", () => {
    const playable = song({ id: "playable" });
    const empty = song({
      id: "empty",
      offer: { instruments: [], voice: null },
    });
    expect(playableAttractSongs([playable, empty])).toEqual([playable]);
  });

  test("drops a local folder, a package, and a song with no length", () => {
    const local = song({ id: "local", doc: "folder://abc/song.ini" });
    const packageSong = song({
      id: "package",
      doc: "https://example.com/songs/one.sng",
    });
    const unknownLength = song({ id: "unknown", durationMs: 0 });
    expect(playableAttractSongs([local, packageSong, unknownLength])).toEqual([]);
  });
});

describe("attractCycle", () => {
  const songs = Array.from({ length: 8 }, (_, index) => song({ id: `s${index}` }));

  test("looks at a couple, settles on one, and never repeats one in a pass", () => {
    const pass = attractCycle(songs, 4);
    expect(pass).not.toBeNull();
    expect(pass!.hops).toHaveLength(ATTRACT_STOPS - 1);
    const all = [...pass!.hops, pass!.chosen].map((entry) => entry.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(ATTRACT_STOPS);
  });

  test("is stable for a seed and changes from one pass to the next", () => {
    expect(attractCycle(songs, 4)).toEqual(attractCycle(songs, 4));
    expect(attractCycle(songs, 4)?.chosen.id).not.toBe(
      attractCycle(songs, 5)?.chosen.id,
    );
  });

  test("with fewer songs than stops it shows what it has", () => {
    const pass = attractCycle(songs.slice(0, 2), 1);
    expect(pass!.hops).toHaveLength(1);
    expect(pass!.hops[0]!.id).not.toBe(pass!.chosen.id);
  });

  test("an empty library has no pass", () => {
    expect(attractCycle([], 1)).toBeNull();
  });

  test("the phone window prefers songs with a lane to fill it", () => {
    const voiceOnly = song({
      id: "voice",
      offer: { instruments: [], voice: { chartType: "vocals", parts: 1 } },
    });
    const withLane = song({ id: "lane" });
    const pass = attractCycle([voiceOnly, withLane], 0, 1);
    expect(pass?.chosen.id).toBe("lane");
    expect(pass?.hops).toEqual([]);
  });

  test("the arcade prefers a song with a band to show", () => {
    const single = song({ id: "single" });
    const voiceOnly = song({
      id: "voice",
      offer: { instruments: [], voice: { chartType: "vocals", parts: 1 } },
    });
    const bandSong = song({
      id: "band",
      offer: {
        instruments: [
          { kind: "guitar", difficulties: ["normal"] },
          { kind: "bass", difficulties: ["normal"] },
          { kind: "drums", difficulties: ["normal"] },
        ],
        voice: null,
      },
    });
    const pass = attractCycle([single, voiceOnly, bandSong], 0, "band");
    expect(pass?.chosen.id).toBe("band");
  });
});

describe("attractBand", () => {
  const full = song({
    id: "full",
    offer: {
      instruments: [
        { kind: "guitar", difficulties: ["hard", "expert"] },
        { kind: "bass", difficulties: ["normal"] },
        { kind: "drums", difficulties: ["expert"] },
        { kind: "keys", difficulties: ["normal"] },
      ],
      voice: { chartType: "vocals", parts: 1 },
    },
  });

  test("the home window is one player, on a lane when the song has one", () => {
    const plan = attractBand(full, 1);
    expect(plan.slots).toHaveLength(1);
    expect(plan.slots[0]?.kind).not.toBe("words");
    expect(plan.slots[0]?.controller).toEqual({ on: "none" });
  });

  test("the arcade band caps its instruments and keeps the words", () => {
    const plan = attractBand(full, "band");
    const lanes = plan.slots.filter((slot) => slot.kind !== "words");
    expect(lanes).toHaveLength(ATTRACT_INSTRUMENTS);
    expect(plan.slots.at(-1)).toMatchObject({
      kind: "words",
      wordsMode: "sing",
      controller: { on: "none" },
    });
  });

  test("takes the hardest chart the song carries", () => {
    const guitar = attractBand(song({ id: "guitar-only" }), 1).slots[0];
    expect(guitar).toMatchObject({ kind: "guitar", difficulty: "expert" });
  });

  test("a lyrics-only song types, and a voice-only song is the one player", () => {
    const lyrics = song({
      id: "lyrics",
      offer: {
        instruments: [{ kind: "guitar", difficulties: ["easy"] }],
        voice: { chartType: "lyrics", parts: 1 },
      },
    });
    expect(attractBand(lyrics, "band").slots.at(-1)).toMatchObject({
      kind: "words",
      wordsMode: "type",
    });

    const voiceOnly = song({
      id: "voice",
      offer: {
        instruments: [],
        voice: { chartType: "vocals", parts: 2 },
      },
    });
    expect(attractBand(voiceOnly, 1).slots).toEqual([
      expect.objectContaining({ kind: "words", wordsMode: "sing" }),
    ]);
  });

  test("a song with nothing playable has an empty band", () => {
    expect(
      attractBand(
        song({ id: "nothing", offer: { instruments: [], voice: null } }),
        "band",
      ).slots,
    ).toEqual([]);
  });
});
