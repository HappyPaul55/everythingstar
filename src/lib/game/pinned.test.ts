import { describe, expect, test } from "bun:test";
import { pinnedRevision, pinnedSong } from "./pinned";
import type { SourceSongDoc } from "./source";

const DOC: SourceSongDoc = {
  id: "one-song",
  title: "One Song",
  artist: { id: "the-band", name: "The Band", art: null },
  album: { id: "record", name: "Record", year: 1999, art: null },
  art: "https://example.com/art.png",
  durationMs: 201_000,
  previewStartMs: 12_000,
  video: null,
  audio: { source: "stems", stems: [], mixPresets: [], preview: null },
  parts: [
    {
      id: "guitar",
      role: "lead_guitar",
      label: null,
      controllerTypes: [],
      audioControl: null,
      charts: [
        {
          id: "guitar-expert",
          chartType: "lanes",
          role: "lead",
          difficulty: "expert",
          url: "https://example.com/charts/guitar.json",
          columns: 5,
          bpm: 120,
          offsetMs: 0,
        },
      ],
    },
    {
      id: "vocals",
      role: "vocals",
      label: null,
      controllerTypes: [],
      audioControl: null,
      charts: [
        {
          id: "vocals",
          chartType: "vocals",
          difficulty: null,
          url: "https://example.com/charts/vocals.json",
          columns: null,
          bpm: null,
          offsetMs: 0,
        },
      ],
    },
  ],
  sections: [],
};

const URL = "https://example.com/songs/one-song.json";

describe("pinnedSong", () => {
  test("carries the document's own name, artist, art and length", () => {
    const song = pinnedSong(DOC, URL);
    expect(song.id).toBe("one-song");
    expect(song.title).toBe("One Song");
    expect(song.artist.name).toBe("The Band");
    expect(song.album?.name).toBe("Record");
    expect(song.art).toBe("https://example.com/art.png");
    expect(song.durationMs).toBe(201_000);
    expect(song.previewStartMs).toBe(12_000);
  });

  test("is its own source: the document is where it came from", () => {
    const song = pinnedSong(DOC, URL);
    expect(song.doc).toBe(URL);
    expect(song.from).toBe(URL);
    expect(song.revision).toBeTruthy();
    expect(song.seed).toBeGreaterThan(0);
  });

  test("offers what the document's parts say can be played", () => {
    const song = pinnedSong(DOC, URL);
    expect(song.offer.instruments).toEqual([
      { kind: "guitar", role: "lead", difficulties: ["expert"] },
    ]);
    expect(song.offer.voice?.chartType).toBe("vocals");
  });
});

describe("pinnedRevision", () => {
  test("is stable for the same parsed document", () => {
    // A read is a parse: the same JSON read twice is the same document, and its
    // revision has to be the one already in the cache or the read misses.
    expect(pinnedRevision(structuredClone(DOC))).toBe(pinnedRevision(DOC));
  });

  test("changes when a field of the document changes", () => {
    const changed = { ...DOC, title: "Another Song" };
    expect(pinnedRevision(changed)).not.toBe(pinnedRevision(DOC));
  });

  test("is the document's content, not its address", () => {
    // A pinned song has no playlist entry to fingerprint, so the same document at a
    // second URL is the same revision — and a changed document at the same URL is a
    // new one.
    expect(pinnedSong(DOC, "https://example.com/elsewhere.json").revision).toBe(
      pinnedSong(DOC, URL).revision,
    );
    expect(pinnedSong(DOC, URL).revision).toBe(pinnedRevision(DOC));
  });
});
