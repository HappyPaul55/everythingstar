import { describe, expect, test } from "bun:test";
import { checkPlaylist, formatPlaylistCheck } from "./playlistCheck";

/** The playlist URL everything in these tests is relative to. */
const PLAYLIST = "https://everythingstar.test/library/playlist.json";

/** One entry the reader can take, so a test changes only what it is about. */
function entry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "song_example",
    title: "Example Song",
    artist: { id: "artist_1", name: "Example Artist" },
    song: "songs/song_example.json",
    durationMs: 240000,
    offer: {
      instruments: [{ role: "guitar", difficulties: ["easy", "normal"] }],
      voice: null,
    },
    ...over,
  };
}

/** A playlist as a provider writes one. */
function body(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    name: "The example list",
    description: "One song, for the checker.",
    songs: [entry()],
    ...over,
  };
}

describe("checkPlaylist", () => {
  test("a document the reader takes is ready, and counts what it lists", () => {
    const check = checkPlaylist(body(), PLAYLIST);
    expect(check.ok).toBe(true);
    expect(check.name).toBe("The example list");
    expect(check.songs).toBe(1);
    expect(check.onDemand).toBeNull();
    expect(check.problems).toEqual([]);
  });

  test("an on-demand capability is a playlist with no songs, and names its parameter", () => {
    const check = checkPlaylist(
      { schemaVersion: 1, name: "Search", ondemand: { param: "search" }, songs: [] },
      PLAYLIST,
    );
    expect(check.ok).toBe(true);
    expect(check.songs).toBe(0);
    expect(check.onDemand).toBe("search");
  });

  test("a broken entry is skipped, named, and fails the document", () => {
    const check = checkPlaylist(
      body({ songs: [entry(), entry({ id: "broken", song: undefined })] }),
      PLAYLIST,
    );
    expect(check.ok).toBe(false);
    // The readable songs are still counted: the game would list them.
    expect(check.songs).toBe(1);
    expect(check.problems).toContain("broken: needs an id, a title and a song");
  });

  test("a document that is not a playlist fails with a reason", () => {
    const check = checkPlaylist({ schemaVersion: 1 }, PLAYLIST);
    expect(check.ok).toBe(false);
    expect(check.problems).toEqual([
      "not a playlist: it lists no songs and cannot be searched",
    ]);
    // A body of the wrong version is already named by the reader.
    const older = checkPlaylist({ schemaVersion: 3, songs: [] }, PLAYLIST);
    expect(older.ok).toBe(false);
    expect(older.problems[0]).toContain("schemaVersion");
  });
});

describe("formatPlaylistCheck", () => {
  test("the text report is one fact a line, then every problem, then the verdict", () => {
    const check = checkPlaylist(body(), PLAYLIST);
    expect(formatPlaylistCheck(check)).toBe(
      [
        "Playlist: The example list",
        `URL: ${PLAYLIST}`,
        "Songs: 1",
        "Search: no (a fixed catalogue)",
        "Problems: none",
        "Result: ok",
      ].join("\n"),
    );
  });

  test("a failed check names each problem and says so", () => {
    const broken = checkPlaylist(body({ songs: [entry({ id: "" })] }), PLAYLIST);
    const text = formatPlaylistCheck(broken);
    expect(text).toContain("1 problem:");
    expect(text).toContain("  - Example Song: needs an id, a title and a song");
    expect(text).toContain("Result: failed");
  });

  test("json is the same record for a build step", () => {
    const check = checkPlaylist(body(), PLAYLIST);
    expect(JSON.parse(formatPlaylistCheck(check, true))).toEqual({
      ok: true,
      url: PLAYLIST,
      name: "The example list",
      songs: 1,
      onDemand: null,
      problems: [],
    });
  });

  test("a search endpoint reads its parameter back", () => {
    const check = checkPlaylist({ schemaVersion: 1, ondemand: true }, PLAYLIST);
    expect(formatPlaylistCheck(check)).toContain("Search: ?q");
  });
});
