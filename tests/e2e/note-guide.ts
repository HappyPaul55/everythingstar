import type { BrowserContext, Page } from "@playwright/test";
import { disableFullscreen, installRoutes } from "./fixture";
import {
  enterGame,
  expectNoExternalRequests,
  openDocsBand,
  seatPlayers,
  setSlot,
  startDocsRun,
} from "./helpers";

/**
 * The chart the **note types** page is written against.
 *
 * One song per example, each a few notes at a known moment, so a capture needs
 * nothing but the song's own start: the page shows the note the prose names, not
 * a highway that happens to have one. The playlist is served under the URL a
 * fresh install seeds, exactly as the documentation library is, and no audio is
 * attached — the fixture's frame clock drives the run.
 *
 * The timing matters. A run is captured 1.5 s after `playing`, so a note at 2.2 s
 * is just above the hit line and nothing has been missed yet.
 */
export const NOTE_PLAYLIST_URL =
  "https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/main/songs/playlist.json";

interface GuideNote {
  timeMs: number;
  lengthMs?: number;
  kind?: "strum" | "tap" | "hopo";
  column: number | null;
}

/** A note: strummed unless it says otherwise. */
function note(
  timeMs: number,
  column: number | null,
  options: { kind?: "strum" | "tap" | "hopo"; lengthMs?: number } = {},
): GuideNote {
  return { timeMs, column, kind: options.kind ?? "strum", lengthMs: options.lengthMs ?? 0 };
}

interface GuideSong {
  id: string;
  title: string;
  /** A sentence for the page's own list; the capture does not read it. */
  notes: GuideNote[];
}

/**
 * The ten songs the page captures. A style sample is the same chart under three
 * settings, so it is one song rather than three.
 */
export const GUIDE_SONGS: GuideSong[] = [
  { id: "single-note", title: "One note", notes: [note(2_200, 2)] },
  {
    id: "chord",
    title: "Three at once",
    notes: [note(2_200, 1), note(2_200, 2), note(2_200, 3)],
  },
  {
    id: "hammer-on",
    title: "Hammered on",
    // The first note is strummed; the second is reached without one, upwards.
    notes: [note(2_100, 1), note(2_900, 2, { kind: "hopo" })],
  },
  {
    id: "pull-off",
    title: "Pulled off",
    // The same pair downwards: the game draws both as a hopo.
    notes: [note(2_100, 4), note(2_900, 2, { kind: "hopo" })],
  },
  {
    id: "sustain",
    title: "One held note",
    notes: [note(2_200, 2, { lengthMs: 4_000 })],
  },
  {
    id: "chord-sustain",
    title: "Three held at once",
    notes: [
      note(2_200, 1, { lengthMs: 4_000 }),
      note(2_200, 2, { lengthMs: 4_000 }),
      note(2_200, 3, { lengthMs: 4_000 }),
    ],
  },
  {
    id: "sustain-and-strum",
    title: "Held, then strummed",
    // The hold stays held while a second note is strummed inside it.
    notes: [note(2_200, 2, { lengthMs: 5_000 }), note(2_900, 4)],
  },
  {
    id: "sustain-and-hammer",
    title: "Held, then hammered",
    // The same shape, but the second note needs no strum.
    notes: [note(2_200, 2, { lengthMs: 5_000 }), note(2_900, 4, { kind: "hopo" })],
  },
  {
    id: "empty-strum",
    title: "Nothing fretted",
    // No fret at all: one open note across the highway.
    notes: [note(2_200, null)],
  },
  {
    id: "note-style",
    title: "Note style",
    // Enough shapes that a skin's own drawing is the difference between shots.
    notes: [
      note(2_000, 1),
      note(2_000, 3),
      note(2_400, 2, { lengthMs: 2_600 }),
      note(3_400, 4, { kind: "hopo" }),
    ],
  },
];

function chartOf(song: GuideSong) {
  return {
    schemaVersion: 1,
    chartType: "lanes",
    columns: 5,
    bpm: 120,
    notes: song.notes.map((entry) => ({
      timeMs: entry.timeMs,
      lengthMs: entry.lengthMs ?? 0,
      kind: entry.kind ?? "strum",
      column: entry.column,
    })),
  };
}

function docOf(song: GuideSong) {
  return {
    schemaVersion: 1,
    id: song.id,
    title: song.title,
    artist: { id: "the-fixtures", name: "The Fixtures" },
    durationMs: 12_000,
    previewStartMs: 0,
    audio: { source: "stems", stems: [], mixPresets: {} },
    parts: [
      {
        id: "part_guitar",
        role: "guitar",
        label: "Guitar",
        charts: [
          {
            id: `${song.id}-guitar-normal`,
            difficulty: "normal",
            chartType: "lanes",
            laneCount: 5,
            bpm: 120,
            url: `charts/${song.id}.json`,
          },
        ],
      },
    ],
  };
}

/**
 * The note guide in place of the seeded library, at the same URL.
 *
 * `@public` — read by the capture fences in `docs/`, which are Markdown, so knip
 * cannot see the import that uses it.
 */
export async function installNoteFixtures(context: BrowserContext): Promise<string[]> {
  const routes: Record<string, unknown> = {
    [NOTE_PLAYLIST_URL]: {
      schemaVersion: 1,
      name: "Note guide",
      description: "One song per note type, for the documentation's captures.",
      songs: GUIDE_SONGS.map((song) => ({
        id: song.id,
        song: `${song.id}.json`,
        title: song.title,
        artist: { id: "the-fixtures", name: "The Fixtures" },
        durationMs: 12_000,
        previewStartMs: 0,
        offer: { instruments: [{ role: "guitar", difficulties: ["normal"] }], voice: null },
      })),
    },
  };

  for (const song of GUIDE_SONGS) {
    const docUrl = new URL(`${song.id}.json`, NOTE_PLAYLIST_URL).href;
    routes[docUrl] = docOf(song);
    routes[new URL(`charts/${song.id}.json`, docUrl).href] = chartOf(song);
  }

  return installRoutes(context, routes);
}

/** The menu's note style, set before a run: the skin is a setting, not a chart. */
async function setNoteStyle(page: Page, label: "Bars" | "Gems" | "Arrows"): Promise<void> {
  await page.getByRole("button", { name: /Options/ }).click();
  const style = page.getByRole("group", { name: "Note style" });
  await style.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: "Back to the menu" }).click();
}

/**
 * Open one guide song and stop on its highway.
 *
 * This is the whole of a note-type capture: the fixture, one guitar player, the
 * song named by its title, and the beat of the run the screenshot is taken on.
 * The style is set first, from the menu, because it is a setting the highway
 * reads rather than a property of the chart.
 *
 * `@public` — read by the capture fences in `docs/`, which are Markdown.
 */
export async function captureNoteType(
  context: BrowserContext,
  page: Page,
  title: string,
  style?: "Bars" | "Gems" | "Arrows",
): Promise<void> {
  const leaked = await installNoteFixtures(context);
  await disableFullscreen(page);
  await enterGame(page, "/app");
  if (style) await setNoteStyle(page, style);

  // The row's accessible name is its length, title, artist and offers in DOM
  // order, so the title is matched anywhere in it — but chosen to be unique.
  const titlePattern = new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  await openDocsBand(page, titlePattern);
  await seatPlayers(page, 1);
  await setSlot(page, 1, "Guitar");
  await startDocsRun(page);
  expectNoExternalRequests(leaked);
}
