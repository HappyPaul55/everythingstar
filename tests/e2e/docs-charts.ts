import type { BrowserContext, Page } from "@playwright/test";
import { disableFullscreen, installRoutes } from "./fixture";
import { waitRollBeat } from "./docs-screens";
import {
  enterGame,
  expectNoExternalRequests,
  openDocsBand,
  seatPlayers,
  setSlot,
  waitForPlaying,
  waitForStage,
} from "./helpers";

/**
 * The duet library: a song whose words carry pitch for two parts, and one whose
 * words carry none.
 *
 * The game's keys view is proved against these two shapes — a pitched song puts
 * the words on the roll's own layer, one strip per part, and a lyrics song keeps
 * the static view with no roll at all. `tests/e2e/keys-view.spec.ts` reads them
 * for that; the documentation's duet capture reads the same song, so the picture
 * and the proof cannot drift apart.
 *
 * The fixture answers the URL a fresh install seeds, like every other library
 * here, and carries no audio: the frame clock drives the run.
 */
const PLAYLIST_URL =
  "https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/main/songs/playlist.json";
const ROOT = PLAYLIST_URL.slice(0, PLAYLIST_URL.lastIndexOf("/") + 1);

/** The duet the capture shows: two parts, and a bar they share. */
export const DUET_TITLE = "Duet Pitch Song";
/** The words-only song, which has no pitch to draw. */
export const WORDS_TITLE = "Words Only Song";

const playlist = {
  schemaVersion: 1,
  name: "Keys view fixtures",
  description: "A duet with pitch and a words-only song.",
  songs: [
    {
      id: "duet-pitch-song",
      song: "songs/duet-pitch.json",
      title: DUET_TITLE,
      artist: { id: "the-fixtures", name: "The Fixtures" },
      durationMs: 16_000,
      previewStartMs: 0,
      offer: {
        instruments: [{ role: "guitar", difficulties: ["easy"] }],
        voice: { chartType: "vocals", parts: 2 },
      },
    },
    {
      id: "words-only-song",
      song: "songs/words-only.json",
      title: WORDS_TITLE,
      artist: { id: "the-fixtures", name: "The Fixtures" },
      durationMs: 12_000,
      previewStartMs: 0,
      offer: {
        instruments: [],
        voice: { chartType: "lyrics", parts: 1 },
      },
    },
  ],
};

const duetSong = {
  schemaVersion: 1,
  id: "duet-pitch-song",
  title: DUET_TITLE,
  artist: { id: "the-fixtures", name: "The Fixtures" },
  durationMs: 16_000,
  previewStartMs: 0,
  audio: { source: "stems", stems: [], mixPresets: {} },
  parts: [
    {
      id: "part_guitar",
      role: "guitar",
      label: "Guitar",
      charts: [
        {
          id: "duet-pitch-song-guitar-easy",
          difficulty: "easy",
          chartType: "lanes",
          laneCount: 3,
          bpm: 120,
          url: `charts/duet-pitch-song/guitar-easy.json`,
        },
      ],
    },
    {
      id: "part_vocals",
      role: "vocals",
      label: "Vocals",
      charts: [
        {
          id: "duet-pitch-song-vocals",
          chartType: "vocals",
          url: `charts/duet-pitch-song/vocals.json`,
        },
      ],
    },
  ],
};

const duetGuitarChart = {
  schemaVersion: 1,
  chartType: "lanes",
  columns: 3,
  notes: [
    { timeMs: 500, lengthMs: 0, kind: "strum", column: 0 },
    { timeMs: 1500, lengthMs: 0, kind: "strum", column: 1 },
    { timeMs: 2500, lengthMs: 0, kind: "strum", column: 2 },
  ],
};

/**
 * A duet: two lines both parts sing (which must appear in both rows), and one
 * line each for a part alone (which must not).
 */
const duetVocalsChart = {
  schemaVersion: 1,
  chartType: "vocals",
  parts: 2,
  rows: 6,
  rootMidi: 60,
  lines: [
    {
      timeMs: 2000,
      endMs: 5000,
      parts: [
        { part: 0, offset: 0 },
        { part: 1, offset: 0 },
      ],
      words: [
        { text: "Electric", timeMs: 2000 },
        { text: "Hearts", timeMs: 3000, hero: true },
      ],
    },
    {
      timeMs: 6000,
      endMs: 9000,
      parts: [{ part: 0, offset: 0 }],
      words: [
        { text: "Stay", timeMs: 6000 },
        { text: "Bright", timeMs: 7000 },
      ],
    },
    {
      timeMs: 9000,
      endMs: 12000,
      parts: [{ part: 1, offset: 0 }],
      words: [
        { text: "Until", timeMs: 9000 },
        { text: "Morning", timeMs: 10000 },
      ],
    },
    {
      timeMs: 12000,
      endMs: 15000,
      parts: [
        { part: 0, offset: 0 },
        { part: 1, offset: 3 },
      ],
      words: [
        { text: "One", timeMs: 12000 },
        { text: "Light", timeMs: 13000 },
      ],
    },
  ],
  notes: [
    { timeMs: 2000, lengthMs: 800, part: 0, row: 2, text: "Electric" },
    { timeMs: 3000, lengthMs: 800, part: 1, row: 3, text: "Hearts", hero: true },
    { timeMs: 6000, lengthMs: 800, part: 0, row: 2, text: "Stay" },
    { timeMs: 7000, lengthMs: 800, part: 0, row: 3, text: "Bright" },
    { timeMs: 9000, lengthMs: 800, part: 1, row: 2, text: "Until" },
    { timeMs: 10000, lengthMs: 800, part: 1, row: 4, text: "Morning", hero: true },
    // The same row at the same moment: one bar, shared between the two parts.
    { timeMs: 12000, lengthMs: 800, part: 0, row: 2, text: "One" },
    { timeMs: 12000, lengthMs: 800, part: 1, row: 2, text: "One" },
    { timeMs: 13000, lengthMs: 800, part: 0, row: 3, text: "Light" },
  ],
};

const wordsSong = {
  schemaVersion: 1,
  id: "words-only-song",
  title: WORDS_TITLE,
  artist: { id: "the-fixtures", name: "The Fixtures" },
  durationMs: 12_000,
  previewStartMs: 0,
  audio: { source: "stems", stems: [], mixPresets: {} },
  parts: [
    {
      id: "part_vocals",
      role: "vocals",
      label: "Words",
      charts: [
        {
          id: "words-only-song-lyrics",
          chartType: "lyrics",
          url: `charts/words-only-song/lyrics.json`,
        },
      ],
    },
  ],
};

const wordsLyricsChart = {
  schemaVersion: 1,
  chartType: "lyrics",
  parts: 1,
  rows: 6,
  rootMidi: 60,
  lines: [
    {
      timeMs: 1000,
      endMs: 4000,
      parts: [{ part: 0, offset: 0 }],
      words: [
        { text: "The", timeMs: 1000 },
        { text: "Words", timeMs: 2000 },
        { text: "Stay", timeMs: 3000 },
      ],
    },
    {
      timeMs: 5000,
      endMs: 8000,
      parts: [{ part: 0, offset: 0 }],
      words: [
        { text: "Put", timeMs: 5000 },
        { text: "Down", timeMs: 6000 },
      ],
    },
    {
      timeMs: 9000,
      endMs: 11000,
      parts: [{ part: 0, offset: 0 }],
      words: [
        { text: "Here", timeMs: 9000 },
        { text: "They", timeMs: 10000 },
      ],
    },
  ],
  notes: [],
};

/**
 * The duet library in place of the seeded one, at the same URL.
 *
 * `@public` — read through `tests/e2e/support.ts`, and by the keys view's own
 * spec, which is the behaviour this capture is a picture of.
 */
export async function installKeysFixtures(context: BrowserContext): Promise<string[]> {
  return installRoutes(context, {
    [PLAYLIST_URL]: playlist,
    [`${ROOT}songs/duet-pitch.json`]: duetSong,
    [`${ROOT}songs/charts/duet-pitch-song/guitar-easy.json`]: duetGuitarChart,
    [`${ROOT}songs/charts/duet-pitch-song/vocals.json`]: duetVocalsChart,
    [`${ROOT}songs/words-only.json`]: wordsSong,
    [`${ROOT}songs/charts/words-only-song/lyrics.json`]: wordsLyricsChart,
  });
}

/**
 * The duet: two singers on one song, a beat into the run.
 *
 * Both seats are words players on Vocals, so the keys view draws two rows of
 * words and the pitches they belong to. The wait is the roll's own beat — the
 * first line has started and the next is on the way, which is the moment both
 * parts are legible at once (and a phone's roll, being narrower, is caught
 * earlier so the words have not run off it).
 *
 * `@public` — read through `tests/e2e/support.ts` by the capture test.
 */
export async function captureDuet(context: BrowserContext, page: Page): Promise<void> {
  const leaked = await installKeysFixtures(context);
  await disableFullscreen(page);
  await enterGame(page, "/app");
  await openDocsBand(page, new RegExp(DUET_TITLE));
  await seatPlayers(page, 2);
  await setSlot(page, 1, "Vocals");
  await setSlot(page, 2, "Vocals");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await waitForStage(page);
  await waitForPlaying(page);
  await waitRollBeat(page);
  expectNoExternalRequests(leaked);
}
