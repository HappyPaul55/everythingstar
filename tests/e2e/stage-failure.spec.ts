import { expect, test } from "./base";
import {
  SONG_TITLE,
  disableFullscreen,
  installFixtures,
  installRoutes,
} from "./fixture";
import { enterGame, openBand, startRun, waitForPlaying } from "./helpers";

/**
 * The run's two failure paths, as a player meets them.
 *
 * A phone has no Escape key, so the stage carries a Pause control on a coarse
 * pointer; and a song whose sound never arrives must not hold the playhead at 0:00
 * for ever. Both are rules with unit tests behind them and, until now, no browser
 * test in front of them.
 */

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("the stage offers a pause control, and it opens the pause", async ({
    context,
    page,
  }) => {
    await installFixtures(context);
    await disableFullscreen(page);
    await enterGame(page);
    await openBand(page, SONG_TITLE);
    await startRun(page);
    await waitForPlaying(page);

    const pause = page.getByRole("button", { name: "Pause", exact: true });
    await expect(pause).toBeVisible();
    // The chip is a real target, not a 17 px glyph: the accessibility rule is 44 px.
    const box = await pause.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await pause.click();
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-screen", "paused");
  });
});

test("a mouse stage has no pause chip", async ({ context, page }) => {
  await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);
  await openBand(page, SONG_TITLE);
  await startRun(page);
  await waitForPlaying(page);

  // Escape and a pad's Start are the desktop's own ways in; a second control would
  // only be furniture.
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
  await expect(page.locator(".stage-corner")).toBeVisible();
});

/**
 * A song whose only stem cannot be fetched: the stage must fall back to the frame
 * clock, say the sound is gone, and still reach the results.
 */
const PLAYLIST_URL =
  "https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/main/songs/playlist.json";
const ROOT = "https://silent.example.test/";
const SONG_ID = "silent-song";
const SONG_DOC = `${ROOT}songs/${SONG_ID}.json`;
const CHART = `${ROOT}songs/charts/${SONG_ID}/guitar-easy.json`;

const PLAYLIST = {
  schemaVersion: 1,
  name: "Silent fixtures",
  description: "One song whose only stem never arrives.",
  songs: [
    {
      id: SONG_ID,
      song: SONG_DOC,
      title: "Silent Song",
      artist: { id: "the-fixtures", name: "The Fixtures" },
      durationMs: 3000,
      previewStartMs: 0,
      offer: {
        instruments: [{ role: "guitar", difficulties: ["easy"] }],
        voice: null,
      },
    },
  ],
};

const SONG = {
  schemaVersion: 1,
  id: SONG_ID,
  title: "Silent Song",
  artist: { id: "the-fixtures", name: "The Fixtures" },
  durationMs: 3000,
  previewStartMs: 0,
  // One stem, and its host is not answered: every fetch of it fails.
  audio: {
    source: "stems",
    stems: [
      {
        id: "stem_song",
        name: "Song",
        url: "https://nowhere.example.test/silence.ogg",
        instrument: null,
      },
    ],
    mixPresets: {},
  },
  parts: [
    {
      id: "part_guitar",
      role: "guitar",
      label: "Guitar",
      controllerTypes: ["guitar_controller"],
      charts: [
        {
          id: `${SONG_ID}-guitar-easy`,
          difficulty: "easy",
          chartType: "lanes",
          laneCount: 3,
          bpm: 120,
          url: `charts/${SONG_ID}/guitar-easy.json`,
        },
      ],
    },
  ],
};

const CHART_BODY = {
  schemaVersion: 1,
  chartType: "lanes",
  columns: 3,
  notes: [
    { timeMs: 500, lengthMs: 0, kind: "strum", column: 0 },
    { timeMs: 900, lengthMs: 0, kind: "strum", column: 1 },
    { timeMs: 1300, lengthMs: 0, kind: "strum", column: 2 },
    { timeMs: 1700, lengthMs: 0, kind: "strum", column: 0 },
    { timeMs: 2100, lengthMs: 0, kind: "strum", column: 1 },
  ],
};

test("a run whose only stem never arrives plays on, says so, and ends", async ({
  context,
  page,
}) => {
  // No `installFixtures` here: this spec answers the seeded playlist itself, so the
  // stem URL is simply not in the table and the router aborts it.
  await installRoutes(
    context,
    {
      [PLAYLIST_URL]: PLAYLIST,
      [SONG_DOC]: SONG,
      [CHART]: CHART_BODY,
    },
    undefined,
    // The run's whole point is a stem whose host never answers.
    [/^https:\/\/nowhere\.example\.test\//],
  );

  await disableFullscreen(page);
  await enterGame(page);
  await openBand(page, "Silent Song");
  await startRun(page);
  await waitForPlaying(page);

  // The stem failed, so the sound never answers. After the stall window the frame
  // clock takes over and the stage admits why there is no music.
  await expect(page.getByText("No sound from this song")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("html")).toHaveAttribute("data-screen", "playing", {
    timeout: 5_000,
  });

  // And the run ends by itself rather than standing at 0:00 for ever.
  await expect(page.locator("html")).toHaveAttribute("data-screen", "results", {
    timeout: 30_000,
  });
});
