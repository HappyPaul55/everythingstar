import { describe, expect, test } from "bun:test";
import {
  isPlaylistBody,
  looksLikePlaylist,
  mergeSongs,
  readPlaylist,
  searchUrl,
} from "./playlist";

/** The playlist URL everything in these tests is relative to. */
const PLAYLIST = "https://everythingstar.test/playlist/default.json";

/** A playlist as a file writes one: the shape is the contract. */
function body(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    name: "The starter list",
    songs: [
      {
        id: "song_example",
        song: "songs/song_example.json",
        title: "Example Song",
        artist: { id: "artist_1", name: "Example Artist", art: "art/artists/1.jpg" },
        album: { id: "album_1", name: "Example Album", year: 2007, art: "art/albums/1.jpg" },
        art: "art/songs/1.jpg",
        accent: "#ffd400",
        durationMs: 240000,
        previewStartMs: 45000,
        offer: {
          instruments: [
            { role: "lead_guitar", difficulties: ["easy", "normal", "hard"] },
            { role: "rhythm_guitar", difficulties: ["hard"] },
            { role: "bass", difficulties: ["easy", "normal"] },
            { role: "drums", difficulties: ["expert"] },
          ],
          voice: { chartType: "vocals", parts: 1 },
        },
        video: { kind: "youtube", id: "n_GFN3a0yj0" },
      },
    ],
    ...over,
  };
}

describe("readPlaylist", () => {
  test("reads a song, with every path resolved against the playlist", () => {
    const read = readPlaylist(body(), PLAYLIST);
    expect(read.name).toBe("The starter list");
    expect(read.problems).toEqual([]);
    const [song] = read.songs;
    expect(song.id).toBe("song_example");
    expect(song.title).toBe("Example Song");
    // The playlist's own URL is the base: the songs live beside it.
    expect(song.doc).toBe("https://everythingstar.test/playlist/songs/song_example.json");
    expect(song.from).toBe(PLAYLIST);
    expect(song.art).toBe("https://everythingstar.test/playlist/art/songs/1.jpg");
    expect(song.artist.art).toBe("https://everythingstar.test/playlist/art/artists/1.jpg");
    expect(song.album?.year).toBe(2007);
    expect(song.durationMs).toBe(240000);
    expect(song.previewStartMs).toBe(45000);
    expect(song.video).toEqual({ kind: "youtube", id: "n_GFN3a0yj0" });
  });

  test("a relative video resolves against the playlist; an absolute one stays absolute", () => {
    const read = readPlaylist(
      body({
        songs: [
          {
            id: "near",
            title: "Near",
            song: "songs/near.json",
            artist: "Paper Hands",
            video: { kind: "video", url: "video/neon-hearts.mp4" },
          },
          {
            id: "far",
            title: "Far",
            song: "songs/far.json",
            artist: "Paper Hands",
            video: { kind: "video", url: "https://cdn.test/far.mp4" },
          },
        ],
      }),
      PLAYLIST,
    );
    expect(read.songs[0].video).toEqual({
      kind: "video",
      url: "https://everythingstar.test/playlist/video/neon-hearts.mp4",
    });
    expect(read.songs[1].video).toEqual({
      kind: "video",
      url: "https://cdn.test/far.mp4",
    });
    expect(read.problems.some((problem) => problem.includes("video"))).toBe(false);
  });

  test("a video URL that cannot be resolved is refused, and named", () => {
    const read = readPlaylist(
      body({
        songs: [
          {
            id: "broken",
            title: "Broken",
            song: "songs/broken.json",
            artist: "Paper Hands",
            video: { kind: "video", url: "https://[" },
          },
        ],
      }),
      PLAYLIST,
    );
    expect(read.songs[0].video).toBeNull();
    expect(read.problems.some((problem) => problem.includes("is not a URL"))).toBe(true);
  });

  test("a ref this game cannot fetch is refused, and named", () => {
    // A remote playlist may only name http(s): a scheme the browser would run, open
    // or read off this machine is accepted by `resolveUrl` but never by `fetch`.
    const read = readPlaylist(
      body({
        songs: [
          { id: "script", title: "Script", song: "javascript:alert(1)" },
          { id: "data", title: "Data", song: "data:application/json,{}" },
          { id: "local", title: "Local", song: "file:///etc/passwd" },
          { id: "folder", title: "Folder", song: "folder://library/song.json" },
          // A relative ref is still resolved against the playlist that wrote it.
          { id: "good", title: "Good", song: "songs/good.json" },
        ],
      }),
      PLAYLIST,
    );
    expect(read.songs.map((song) => song.id)).toEqual(["good"]);
    expect(read.songs[0].doc).toBe("https://everythingstar.test/playlist/songs/good.json");
    expect(
      read.problems.filter((problem) => problem.includes("will fetch")),
    ).toHaveLength(4);
  });

  test("a song's art and video are held to the same policy", () => {
    const read = readPlaylist(
      body({
        songs: [
          {
            id: "a",
            title: "A",
            song: "songs/a.json",
            art: "javascript:alert(1)",
            artist: { name: "Paper Hands", art: "data:image/png;base64,AA" },
            album: { name: "Paper Album", art: "file:///cover.png" },
            video: { kind: "video", url: "folder://room/clip.mp4" },
          },
        ],
      }),
      PLAYLIST,
    );
    expect(read.songs[0].art).toBeNull();
    expect(read.songs[0].artist.art).toBeNull();
    expect(read.songs[0].album?.art).toBeNull();
    expect(read.songs[0].video).toBeNull();
    expect(
      read.problems.filter((problem) => problem.includes("will fetch")),
    ).toHaveLength(4);
  });

  test("a local playlist keeps its own refs as they are", () => {
    // A folder is not fetched at all: its files are the browser's to resolve, and the
    // http(s) rule has nothing to say about them.
    const read = readPlaylist(
      body({
        songs: [
          {
            id: "a",
            title: "A",
            song: "javascript:alert(1)",
            artist: "Paper Hands",
            art: "folder://library/art/a.jpg",
            offer: { instruments: [{ role: "guitar", difficulties: ["normal"] }] },
          },
        ],
      }),
      "folder://library/playlist.json",
    );
    expect(read.songs[0].doc).toBe("javascript:alert(1)");
    expect(read.songs[0].art).toBe("folder://library/art/a.jpg");
    expect(read.problems).toEqual([]);
  });

  test("the two guitar flavours stay two roles, each with its own levels", () => {
    const read = readPlaylist(body(), PLAYLIST);
    expect(read.songs[0].offer.instruments).toEqual([
      { kind: "guitar", role: "lead", difficulties: ["easy", "normal", "hard"] },
      { kind: "guitar", role: "rhythm", difficulties: ["hard"] },
      { kind: "bass", difficulties: ["easy", "normal"] },
      { kind: "drums", difficulties: ["expert"] },
    ]);
    expect(read.songs[0].offer.voice).toEqual({ chartType: "vocals", parts: 1 });
  });

  test("a song's seed comes from its id, so it is the same everywhere", () => {
    const once = readPlaylist(body(), PLAYLIST).songs[0];
    const twice = readPlaylist(body(), PLAYLIST).songs[0];
    expect(once.seed).toBe(twice.seed);
    expect(typeof once.seed).toBe("number");
  });

  test("its revision follows the playlist entry, not the URL", () => {
    const base = body();
    const once = readPlaylist(base, PLAYLIST).songs[0];
    const twice = readPlaylist(base, PLAYLIST).songs[0];
    expect(once.revision).toBe(twice.revision);

    const entries = base.songs as Record<string, unknown>[];
    const changed = body({
      songs: [{ ...entries[0], durationMs: 240_001 }],
    });
    expect(readPlaylist(changed, PLAYLIST).songs[0].revision).not.toBe(once.revision);
  });

  test("an artist can be written as a bare name", () => {
    const read = readPlaylist(
      body({
        songs: [{ id: "a", title: "A", song: "songs/a.json", artist: "Paper Hands" }],
      }),
      PLAYLIST,
    );
    expect(read.songs[0].artist).toEqual({
      id: "paper-hands",
      name: "Paper Hands",
      art: null,
    });
  });

  test("a song missing its file is skipped, and named", () => {
    const read = readPlaylist(
      body({
        songs: [
          {
            id: "good",
            title: "Good",
            song: "songs/good.json",
            artist: "Paper Hands",
            offer: { instruments: [{ role: "guitar", difficulties: ["normal"] }] },
          },
          { id: "bad", title: "Bad" },
          { title: "No id at all", song: "songs/c.json" },
        ],
      }),
      PLAYLIST,
    );
    expect(read.songs.map((song) => song.id)).toEqual(["good"]);
    expect(read.problems).toHaveLength(2);
    expect(read.problems[0]).toContain("bad");
  });

  test("a part nobody can play is dropped, and the rest of the song kept", () => {
    const read = readPlaylist(
      body({
        songs: [
          {
            id: "a",
            title: "A",
            song: "songs/a.json",
            offer: {
              instruments: [
                { role: "bagpipes", difficulties: ["normal"] },
                { role: "bass", difficulties: ["normal", "sideways"] },
              ],
            },
          },
        ],
      }),
      PLAYLIST,
    );
    expect(read.songs[0].offer.instruments).toEqual([
      { kind: "bass", difficulties: ["normal"] },
    ]);
    expect(read.problems.some((problem) => problem.includes("bagpipes"))).toBe(true);
  });

  test("an unknown difficulty is named rather than dropped in silence", () => {
    const read = readPlaylist(
      body({
        songs: [
          {
            id: "a",
            title: "A",
            song: "songs/a.json",
            artist: "Paper Hands",
            offer: {
              instruments: [
                { role: "guitar", difficulties: ["normal", "sideways"] },
                { role: "drums", difficulties: ["hard", "impossible", "weird"] },
              ],
            },
          },
        ],
      }),
      PLAYLIST,
    );
    // The levels that are real still make each part playable.
    expect(read.songs[0].offer.instruments).toEqual([
      { kind: "guitar", difficulties: ["normal"] },
      { kind: "drums", difficulties: ["hard"] },
    ]);
    expect(read.problems.filter((problem) => problem.includes("difficult"))).toEqual([
      "a: guitar “sideways” is not a difficulty",
      "a: drums “impossible”, “weird” are not difficulties",
    ]);
  });

  test("the voice belongs in its own field, not among the instruments", () => {
    const read = readPlaylist(
      body({
        songs: [
          {
            id: "a",
            title: "A",
            song: "songs/a.json",
            offer: { instruments: [{ role: "vocals", difficulties: ["normal"] }] },
          },
        ],
      }),
      PLAYLIST,
    );
    expect(read.songs[0].offer.instruments).toEqual([]);
    expect(read.songs[0].offer.voice).toBeNull();
    expect(read.problems.some((problem) => problem.includes("voice"))).toBe(true);
  });

  test("a song that lists twice is one song", () => {
    const entry = { id: "a", title: "A", song: "songs/a.json" };
    const read = readPlaylist(body({ songs: [entry, entry] }), PLAYLIST);
    expect(read.songs).toHaveLength(1);
    expect(read.problems.some((problem) => problem.includes("twice"))).toBe(true);
  });

  test("a document that is not a playlist we know comes back empty", () => {
    expect(readPlaylist(null, PLAYLIST).songs).toEqual([]);
    expect(readPlaylist({ songs: [] }, PLAYLIST).problems[0]).toContain("schemaVersion");
    expect(readPlaylist(body({ schemaVersion: 3 }), PLAYLIST).problems[0]).toContain("3");
  });

  test("a song with no offer is still listed, and says it has nothing", () => {
    const read = readPlaylist(
      body({
        songs: [
          { id: "a", title: "A", song: "songs/a.json", artist: "Paper Hands" },
        ],
      }),
      PLAYLIST,
    );
    expect(read.songs[0].offer).toEqual({ instruments: [], voice: null });
    expect(read.problems[0]).toContain("played");
  });

  test("a playlist can be a capability rather than a catalogue", () => {
    const read = readPlaylist(
      { schemaVersion: 1, name: "Karaoke search", ondemand: true, songs: [] },
      PLAYLIST,
    );
    expect(read.onDemand).toEqual({ param: "q" });
    expect(read.songs).toEqual([]);
    expect(read.problems).toEqual([]);
  });

  test("an on-demand playlist may name its own query parameter", () => {
    const read = readPlaylist(
      { schemaVersion: 1, ondemand: { param: "search" } },
      PLAYLIST,
    );
    expect(read.onDemand).toEqual({ param: "search" });
  });

  test("a parameter that cannot be a name falls back to q, and says so", () => {
    const read = readPlaylist(
      { schemaVersion: 1, ondemand: { param: "not a name" } },
      PLAYLIST,
    );
    expect(read.onDemand).toEqual({ param: "q" });
    expect(read.problems.some((problem) => problem.includes("query parameter"))).toBe(true);
  });

  test("a false or unknown ondemand leaves a catalogue a catalogue", () => {
    expect(readPlaylist(body({ ondemand: false }), PLAYLIST).onDemand).toBeNull();
    expect(readPlaylist(body({ ondemand: "yes" }), PLAYLIST).onDemand).toBeNull();
    expect(readPlaylist(body(), PLAYLIST).onDemand).toBeNull();
  });

  test("a search answer is read against its query but belongs to the playlist", () => {
    const query = "https://everythingstar.test/playlist/default.json?q=Timber";
    const read = readPlaylist(body(), query, PLAYLIST);
    expect(read.songs[0].from).toBe(PLAYLIST);
    // The files still resolve against the answer's own URL.
    expect(read.songs[0].doc).toBe(
      "https://everythingstar.test/playlist/songs/song_example.json",
    );
  });
});

describe("looksLikePlaylist", () => {
  test("a catalogue and a capability are playlists; a song document is not", () => {
    expect(isPlaylistBody(body())).toBe(true);
    expect(looksLikePlaylist(body())).toBe(true);
    expect(
      looksLikePlaylist({ schemaVersion: 1, ondemand: true }),
    ).toBe(true);
    expect(looksLikePlaylist({ schemaVersion: 1 })).toBe(false);
    expect(looksLikePlaylist({ songs: [] })).toBe(false);
    expect(looksLikePlaylist(null)).toBe(false);
  });
});

describe("searchUrl", () => {
  test("adds the query to a plain URL", () => {
    expect(searchUrl("https://x.test/playlist.json", "Timber")).toBe(
      "https://x.test/playlist.json?q=Timber",
    );
  });

  test("keeps a query string the playlist already has", () => {
    expect(searchUrl("https://x.test/playlist.json?key=abc", "Timber")).toBe(
      "https://x.test/playlist.json?key=abc&q=Timber",
    );
  });

  test("keeps a hash at the end, where it belongs", () => {
    expect(searchUrl("https://x.test/playlist.json#songs", "Timber")).toBe(
      "https://x.test/playlist.json?q=Timber#songs",
    );
  });

  test("encodes the words rather than pasting them", () => {
    const url = searchUrl("https://x.test/playlist.json", "Back in Black & Roll");
    expect(url).toContain("q=Back+in+Black+%26+Roll");
    expect(new URL(url!).searchParams.get("q")).toBe("Back in Black & Roll");
  });

  test("can name another parameter, and replaces its own", () => {
    expect(searchUrl("https://x.test/playlist.json?q=old", "new", "q")).toBe(
      "https://x.test/playlist.json?q=new",
    );
    expect(searchUrl("https://x.test/playlist.json", "new", "search")).toBe(
      "https://x.test/playlist.json?search=new",
    );
  });

  test("an empty query or a URL that cannot be read is null", () => {
    expect(searchUrl("https://x.test/playlist.json", "  ")).toBeNull();
    expect(searchUrl("not a url", "Timber")).toBeNull();
  });
});

describe("mergeSongs", () => {
  const one = readPlaylist(
    body({ songs: [{ id: "a", title: "A", song: "songs/a.json" }] }),
    PLAYLIST,
  ).songs;
  const two = readPlaylist(
    body({
      songs: [
        { id: "a", title: "A again", song: "songs/a.json" },
        { id: "b", title: "B", song: "songs/b.json" },
      ],
    }),
    "https://other.test/playlist.json",
  ).songs;

  test("is every playlist's songs, in the order they arrived", () => {
    const merged = mergeSongs([one, two]);
    expect(merged.songs.map((song) => song.id)).toEqual(["a", "b"]);
    expect(merged.songs[0].title).toBe("A");
  });

  test("the same id in two playlists is one song: the first wins, and says so", () => {
    const merged = mergeSongs([one, two]);
    expect(merged.duplicates).toEqual(["a"]);
    expect(merged.songs[0].from).toBe(PLAYLIST);
  });
});
