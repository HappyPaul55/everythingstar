import { describe, expect, test } from "bun:test";
import type { Song } from "./song";
import { roomLibrarySongs } from "./roomLibrary";

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
    offer: { instruments: [], voice: null },
    video: null,
    doc: `https://example.com/songs/${id}.json`,
    from: "https://example.com/playlist.json",
    revision: `revision-${id}`,
    seed: 7,
    ...overrides,
  };
}

describe("roomLibrarySongs", () => {
  test("publishes a song from a URL playlist", () => {
    const entry = song({ id: "url", art: "https://example.com/art/url.jpg" });
    expect(roomLibrarySongs([entry])).toEqual([
      {
        id: "url",
        title: "Song url",
        artist: "Artist",
        durationMs: 120_000,
        art: "https://example.com/art/url.jpg",
        accent: null,
      },
    ]);
  });

  test("leaves out a folder and a song with no document address", () => {
    const folder = song({
      id: "folder",
      doc: "folder://library/song.json",
      from: "folder://library/playlist.json",
    });
    const noDoc = song({ id: "no-doc", doc: "" });
    expect(roomLibrarySongs([folder, noDoc])).toEqual([]);
  });

  test("leaves out a URL song whose playlist is not an address", () => {
    const localPlaylist = song({
      id: "local-playlist",
      from: "folder://library/playlist.json",
    });
    expect(roomLibrarySongs([localPlaylist])).toEqual([]);
  });
});
