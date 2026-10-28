/**
 * The mock, written out as the files a real library serves.
 *
 * The game reads a playlist, a song and its charts off the network. The mock's songs
 * are **fixtures**, not content: `mockLibraryFiles` writes them into the three
 * documents the readers expect, so a test can read its own output back and prove the
 * two agree. The shipped library is the published EverythingStar FOSS playlist.
 *
 * The fixtures exercise what a real playlist has to: songs with no instruments at
 * all, a lyrics song, a duet, art on some songs and none on others, a video on some
 * and not on others, and charts that only exist at one level. Throwaway — a real
 * library replaces them.
 */

import { hashString } from "../hash";
import {
  INSTRUMENT_KINDS,
  type InstrumentKind,
  type Track,
} from "../track";
import { chartJson, melodyJson } from "../sources/write";
import { slug } from "../text";
import { MOCK_SONGS, type MockSong } from "./songs";
import { buildMockTrack } from "./track";

/** How many of the mock's songs a fixture library carries. */
export const MOCK_FILE_COUNT = 36;

/** The songs written by hand, which the playlist always carries. */
const NAMED_COUNT = 7;

/** One file the fixture library needs, at the path the test serves it from. */
export interface MockFile {
  path: string;
  body: string;
}

/** Where the whole playlist lives: one directory to serve. */
const ROOT = "playlist";

/** The backdrop every mock song stands in front of. */
const PLACEHOLDER_VIDEO = "n_GFN3a0yj0";

/** The colours a generated cover is drawn in: the brand's, and the frets'. */
const COVER_COLOURS = [
  "#ffd400",
  "#22e0ff",
  "#3fae5a",
  "#d24d3f",
  "#3b7bd4",
  "#e08b2a",
];

/** What an artist's record is called. One album each, so art has somewhere to live. */
const ALBUM_TITLES = [
  "First Light",
  "Night Shift",
  "Paper Cuts",
  "The Long Way Home",
  "Neon Season",
  "After Hours",
];

/**
 * The mock library as **fixture** files.
 *
 * Everything is relative to the playlist itself, so the whole thing can be served
 * from one directory — or moved somewhere else without editing a path.
 */
export function mockLibraryFiles(count = MOCK_FILE_COUNT): MockFile[] {
  // The songs worth naming, then a **spread** through the generated list rather
  // than the first of it: an index means something when the letters are far apart.
  const named = MOCK_SONGS.slice(0, NAMED_COUNT);
  const spread = MOCK_SONGS.slice(NAMED_COUNT).filter((_, index) => index % 4 === 0);
  const songs = [...named, ...spread].slice(0, Math.max(1, count));
  const artists = [...new Set(songs.map((song) => song.artist))];
  // Two artists carry no album art: one so a song falls through to the **artist's**
  // art, one so it falls all the way to the **tile**. The four levels of "what does
  // this song look like" are all in the list because of them.
  const noAlbumArt = artists[artists.length - 1];
  const noArtAtAll = artists[artists.length - 2];

  const files: MockFile[] = [];
  const entries: unknown[] = [];

  songs.forEach((song, index) => {
    const track = buildMockTrack({
      seed: song.seed,
      parts: song.parts,
      hasPitch: song.hasPitch,
      durationMs: song.durationMs,
      title: song.title,
      charts: song.charts,
    });
    const art = hashString(`art:${song.id}`) % 3 !== 2 || index < NAMED_COUNT;
    const album = albumTitle(song.artist);
    const songArt = art ? `art/songs/${song.id}.svg` : null;
    const albumArt =
      song.artist !== noAlbumArt && song.artist !== noArtAtAll
        ? `art/albums/${slug(album)}.svg`
        : null;
    const artistArt = song.artist !== noArtAtAll ? `art/artists/${slug(song.artist)}.svg` : null;

    files.push({
      path: `${ROOT}/songs/${song.id}.json`,
      body: pretty(songDocument(song, track)),
    });
    for (const chart of track.charts) {
      files.push({
        path: `${ROOT}/charts/${song.id}/${chart.instrument}-${chart.difficulty}.json`,
        body: pretty(chartJson(chart)),
      });
    }
    files.push({
      path: `${ROOT}/charts/${song.id}/${song.hasPitch ? "vocals" : "lyrics"}.json`,
      body: pretty(melodyJson(track.melody)),
    });

    if (songArt) files.push({ path: `${ROOT}/${songArt}`, body: cover(song.id, COVER_COLOURS) });
    if (albumArt) files.push({ path: `${ROOT}/${albumArt}`, body: cover(album, COVER_COLOURS) });
    if (artistArt) {
      files.push({
        path: `${ROOT}/${artistArt}`,
        body: cover(song.artist, COVER_COLOURS),
      });
    }

    entries.push({
      id: song.id,
      song: `songs/${song.id}.json`,
      title: song.title,
      artist: {
        id: slug(song.artist),
        name: song.artist,
        ...(artistArt ? { art: artistArt } : {}),
      },
      album: {
        id: slug(album),
        name: album,
        year: 2007,
        ...(albumArt ? { art: albumArt } : {}),
      },
      ...(songArt ? { art: songArt } : {}),
      accent: COVER_COLOURS[hashString(song.id) % COVER_COLOURS.length],
      durationMs: song.durationMs,
      previewStartMs: Math.round(song.durationMs * 0.3),
      // Only the named songs carry a video: the rest are a blank stage, which is
      // the other half of what a backdrop has to do.
      ...(index < 7 ? { video: { kind: "youtube", id: PLACEHOLDER_VIDEO } } : {}),
      offer: {
        instruments: song.charts.map((chart) => ({
          role: chart.instrument,
          difficulties: chart.difficulties,
        })),
        voice: { chartType: song.hasPitch ? "vocals" : "lyrics", parts: song.parts },
      },
    });
  });

  files.unshift({
    path: `${ROOT}/default.json`,
    body: pretty({
      schemaVersion: 1,
      name: "Fixture playlist",
      description: "A starter list: every kind of song this stage can play.",
      songs: entries,
    }),
  });
  return files;
}

/** A song's own document: what it is, its audio, and where its charts live. */
function songDocument(song: MockSong, track: Track): unknown {
  const instruments = INSTRUMENT_KINDS.filter((kind) =>
    track.charts.some((chart) => chart.instrument === kind),
  );
  return {
    schemaVersion: 1,
    id: song.id,
    title: song.title,
    artist: { id: slug(song.artist), name: song.artist },
    album: { id: slug(`${song.artist} — singles`), name: `${song.artist} — singles`, year: 2007 },
    durationMs: song.durationMs,
    previewStartMs: Math.round(song.durationMs * 0.3),
    audio: {
      // **A mock song has no audio, and says so.** The parts below still carry the
      // `audioControl` a real song would use — miss, and your stem drops out — but
      // there are no files to name, because the game would fetch them and a fixture
      // that 404s on every run is a fixture that lies about what a song is. A real
      // song brings its own stems (see `docs/developers/audio.md`); this is the shape without them.
      stems: [],
      mixPresets: {},
    },
    parts: [
      ...instruments.map((instrument) => ({
        id: `part_${instrument}`,
        role: instrument,
        label: labelOf(instrument),
        controllerTypes: [instrument === "drums" ? "drum_kit" : "guitar_controller"],
        audioControl: {
          controlledStemIds: [`stem_${instrument}`],
          onHit: { action: "unmute", fadeMs: 20 },
          onMiss: { action: "mute", fadeMs: 80, restore: "next_hit" },
        },
        charts: track.charts
          .filter((chart) => chart.instrument === instrument)
          .map((chart) => ({
            id: `${song.id}-${instrument}-${chart.difficulty}`,
            difficulty: chart.difficulty,
            chartType: instrument === "drums" ? "drums" : "lanes",
            laneCount: chart.columns,
            url: `../charts/${song.id}/${instrument}-${chart.difficulty}.json`,
            bpm: chart.bpm,
          })),
      })),
      {
        id: "part_vocals",
        role: "vocals",
        label: song.hasPitch ? "Vocals" : "Lyrics",
        controllerTypes: [song.hasPitch ? "microphone" : "keyboard"],
        charts: [
          {
            id: `${song.id}-voice`,
            chartType: song.hasPitch ? "vocals" : "lyrics",
            url: `../charts/${song.id}/${song.hasPitch ? "vocals" : "lyrics"}.json`,
          },
        ],
      },
    ],
  };
}

/** An abstract cover: a stripe, a disc and a colour, decided by the name. */function cover(name: string, colours: readonly string[]): string {
  const seed = hashString(name);
  const colour = colours[seed % colours.length];
  const angle = seed % 360;
  const disc = 46 + ((seed >> 4) % 60);
  const cx = 90 + ((seed >> 8) % 220);
  const cy = 90 + ((seed >> 12) % 220);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">',
    '  <rect width="400" height="400" fill="#14150f"/>',
    `  <g transform="rotate(${angle} 200 200)">`,
    `    <rect x="-120" y="164" width="640" height="72" fill="${colour}"/>`,
    "  </g>",
    `  <circle cx="${cx}" cy="${cy}" r="${disc}" fill="#fafaf4" opacity="0.92"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${Math.round(disc / 2.4)}" fill="#14150f"/>`,
    "</svg>",
    "",
  ].join("\n");
}

function albumTitle(artist: string): string {
  return ALBUM_TITLES[hashString(`album:${artist}`) % ALBUM_TITLES.length];
}

function labelOf(kind: InstrumentKind): string {
  switch (kind) {
    case "guitar":
      return "Guitar";
    case "bass":
      return "Bass";
    case "drums":
      return "Drums";
    case "keys":
      return "Keys";
    default:
      return "Dance";
  }
}

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
