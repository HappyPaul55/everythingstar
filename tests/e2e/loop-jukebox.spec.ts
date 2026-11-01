import { expect, test } from "./base";
import {
  SNG_SONG_TITLE,
  SONG_TITLE,
  disableFullscreen,
  installFixtures,
} from "./fixture";
import {
  enterGame,
  openBand,
  startRun,
  waitForPlaying,
} from "./helpers";

/**
 * The jukebox as a screen: search Escape, the chosen song on return, the phone breakpoint, and the lone player's portrait rails.
 */
test("Escape in the search field clears it instead of leaving the jukebox", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();

  // A text field keeps its own Escape: the browser's search behaviour clears it,
  // and the screen behind it must not move as well.
  const search = page.getByRole("searchbox", { name: "Find a song" });
  await search.fill("ti");
  await expect(search).toHaveValue("ti");
  await search.press("Escape");

  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await expect(search).toHaveValue("");

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("coming back to the jukebox keeps the song that was chosen", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();

  // The fixture's second row in A–Z order — the first is "Tiny Package Song", so
  // a list that starts at the top on the way back would land on the wrong one.
  const chosen = page.getByRole("button", { name: new RegExp(SONG_TITLE) });
  await expect(chosen).toBeVisible();
  await chosen.click();
  const nowPlaying = page.getByRole("complementary", { name: "now playing" });
  await expect(nowPlaying).toContainText(SONG_TITLE);

  await page.getByRole("button", { name: "Next: your band" }).click();
  await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();

  // Back to the list: focus is the game's own placement and must not select the
  // row it lands on, so the now-playing slot is still the song that was chosen.
  await page.getByRole("button", { name: "Back to songs" }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await expect(nowPlaying).toContainText(SONG_TITLE);
  await expect(nowPlaying).not.toContainText(SNG_SONG_TITLE);

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("crossing the phone breakpoint on the band screen keeps its song", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  // Quick Play → Next without pressing a row: the first song is the default, and
  // the band screen is offered it.
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next: your band" })).toBeEnabled();
  await page.getByRole("button", { name: "Next: your band" }).click();
  const band = page.getByRole("heading", { name: "Who is playing?" });
  await expect(band).toBeVisible();
  // The band's own line names the song; that is the thing the breakpoint must not
  // take away, and the old test only checked that a heading was still on screen.
  const songLine = page.locator(".screen--band .screen__lede");
  await expect(songLine).toContainText(SONG_TITLE);

  // The phone's jukebox is the one screen that wants no default song. Crossing
  // the breakpoint on the band screen must not take the band's song away.
  await page.setViewportSize({ width: 375, height: 720 });
  await expect(band).toBeVisible();
  await expect(songLine).toContainText(SONG_TITLE);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(band).toBeVisible();
  await expect(songLine).toContainText(SONG_TITLE);

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("a lone player on a portrait phone puts the rails above the highway", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  await openBand(page, SONG_TITLE);
  await startRun(page);
  await waitForPlaying(page);

  await page.setViewportSize({ width: 390, height: 844 });
  const panel = page.getByRole("region", { name: "Player 1 — Guitar" });
  await expect(panel).toBeVisible();
  const highway = panel.locator(".highway");
  const score = panel.locator(".panel-rail--score");
  const info = panel.locator(".panel-rail--info");
  await expect(highway).toBeVisible();

  const [panelBox, highwayBox, scoreBox, infoBox] = await Promise.all([
    panel.boundingBox(),
    highway.boundingBox(),
    score.boundingBox(),
    info.boundingBox(),
  ]);
  expect(panelBox).not.toBeNull();
  expect(highwayBox).not.toBeNull();
  expect(scoreBox).not.toBeNull();
  expect(infoBox).not.toBeNull();
  if (!panelBox || !highwayBox || !scoreBox || !infoBox) return;

  // The highway is the full width of the panel, and both rails are above it.
  expect(highwayBox.width).toBeGreaterThan(panelBox.width * 0.9);
  expect(highwayBox.y).toBeGreaterThanOrEqual(scoreBox.y + scoreBox.height - 1);
  expect(highwayBox.y).toBeGreaterThanOrEqual(infoBox.y + infoBox.height - 1);
  await page.keyboard.press("Escape");

  expect(leaked, "unexpected external requests").toEqual([]);
});
