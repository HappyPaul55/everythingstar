import { expect, test } from "./base";
import { SONG_TITLE, disableFullscreen, installFixtures } from "./fixture";
import { describeViolations, seriousViolations } from "./axe";

/**
 * The welcome, the menu and the song list's own dialog.
 *
 * The screen machine is walked rather than mounted screen by screen: the
 * FocusLayer, the menu and the song list dialog are the product's, and an audit of
 * a test-only mount would not be an audit of what a player gets.
 */
test("welcome, menu, the Jukebox, songs, options and the Playlists dialog have no critical or serious violations", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);

  await page.goto("/play");
  const enter = page.getByRole("button", { name: "Enter the stage" });
  await expect(enter).toBeEnabled({ timeout: 20_000 });
  const welcome = await seriousViolations(page);
  expect(describeViolations(welcome)).toBe("");

  await enter.click();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  const menu = await seriousViolations(page);
  expect(describeViolations(menu)).toBe("");

  await page.getByRole("button", { name: /Options/ }).click();
  await expect(page.getByRole("heading", { name: "Options" })).toBeVisible();
  const options = await seriousViolations(page);
  expect(describeViolations(options)).toBe("");

  await page.getByRole("button", { name: "Back to the menu" }).click();
  await page.getByRole("button", { name: /Jukebox/ }).click();
  await expect(page.getByRole("heading", { name: "Jukebox" })).toBeVisible();
  const jukebox = await seriousViolations(page);
  expect(describeViolations(jukebox)).toBe("");

  await page.getByRole("button", { name: "Pick a song" }).click();
  const picker = page.getByRole("dialog", { name: "Pick a song" });
  await expect(picker).toBeVisible();
  const jukeboxPicker = await seriousViolations(page);
  expect(describeViolations(jukeboxPicker)).toBe("");
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await page.getByRole("button", { name: "Back to the menu" }).click();

  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(SONG_TITLE) })).toBeVisible();
  const songs = await seriousViolations(page);
  expect(describeViolations(songs)).toBe("");

  // The Playlists dialog is the song list's own `NativeDialog`: focus trap, Escape
  // and its opener are the product's, so it is audited in place rather than
  // through a test-only mount.
  await page.getByRole("button", { name: /^Playlists/ }).click();
  const playlists = page.getByRole("dialog", { name: "Playlists" });
  await expect(playlists).toBeVisible();
  const lists = await seriousViolations(page);
  expect(describeViolations(lists)).toBe("");
  await page.keyboard.press("Escape");
  await expect(playlists).toBeHidden();

  // The room's join form is a page of the site, not a game screen: it carries the
  // site's landmarks and one labelled form in the middle.
  await page.goto("/join");
  await expect(page.getByRole("heading", { name: "Join a room" })).toBeVisible();
  await expect(page.locator("#site-header")).toBeVisible();
  const join = await seriousViolations(page);
  expect(describeViolations(join)).toBe("");

  expect(leaked, "unexpected external requests").toEqual([]);
});
