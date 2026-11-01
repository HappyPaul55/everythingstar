import { expect, test, type Page } from "./base";
import {
  FOLDER_SONG_TITLE,
  SNG_SONG_TITLE,
  disableFullscreen,
  folderFixtureFile,
  installFixtures,
  sngFixtureFile,
} from "./fixture";
import { enterGame, waitForStage } from "./helpers";

/**
 * Importing, without a directory picker.
 *
 * The game copies what the player chooses into its own Origin Private File System
 * and reads it with the folder scanner. These tests hand the hidden inputs real
 * files, as a browser without `showDirectoryPicker` would, and then check the two
 * things an import promises: the song is in the jukebox and plays, and the copy
 * survives a reload.
 */
async function openPlaylists(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await page.getByRole("button", { name: /^Playlists/ }).click();
  await expect(page.getByRole("dialog", { name: "Playlists" })).toBeVisible();
}

/** Leave the fixture playlist out of the way, so an import is the only source. */
async function disableBuiltIn(page: Page): Promise<void> {
  const disable = page.getByRole("button", { name: "Disable", exact: true });
  if ((await disable.count()) > 0) await disable.click();
}

async function openImported(page: Page): Promise<void> {
  const row = page.getByRole("button", { name: new RegExp(SNG_SONG_TITLE) });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole("complementary", { name: "now playing" })).toContainText(
    SNG_SONG_TITLE,
  );
  await page.getByRole("button", { name: "Next: your band" }).click();
  await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();
}

/** Start the imported package: the stage's entrance arrives once its chart has been read. */
async function startImported(page: Page): Promise<void> {
  // The package has one guitar part. The default second player is the words, so
  // make them a second guitar as the other `.sng` spec does, then start the run.
  await page.getByRole("button", { name: "Remove player 2" }).click();
  await page.getByRole("button", { name: /Player 2 .*join the band/ }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await waitForStage(page);
}

test("a .sng imported from a file is in the library, playable, and still there next visit", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);
  await openPlaylists(page);
  await disableBuiltIn(page);

  await page.locator('input[data-import="files"]').setInputFiles(sngFixtureFile());
  // The folder row says what it is doing and then what it found. The import is
  // the song's only source, so one song is the whole library.
  const lists = page.getByRole("dialog", { name: "Playlists" });
  await expect(lists.getByText("one song").first()).toBeVisible();
  await expect(
    lists.getByText(/Copied into this browser's storage/),
  ).toBeVisible();
  await page.getByText("Close", { exact: true }).click();

  // Opening it now proves the copy is readable in this visit.
  await openImported(page);

  // A second visit: the OPFS copy and the library record are still there, and an
  // import is never "locked" the way a picked folder is after a reload.
  await page.goto("/play");
  await enterGame(page);
  await openPlaylists(page);
  const listsAfter = page.getByRole("dialog", { name: "Playlists" });
  await expect(listsAfter.getByText("one song").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect", exact: true })).toHaveCount(0);
  await expect(
    listsAfter.getByText(/Copied into this browser's storage/),
  ).toBeVisible();
  await page.getByText("Close", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: new RegExp(SNG_SONG_TITLE) }),
  ).toBeVisible();

  // And the restored copy still opens and starts a run, not merely a row.
  await openImported(page);
  await startImported(page);

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("a folder imported with the directory input is read as a song", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);
  await openPlaylists(page);
  await disableBuiltIn(page);

  await page.locator('input[data-import="folder"]').setInputFiles(folderFixtureFile());
  const lists = page.getByRole("dialog", { name: "Playlists" });
  await expect(lists.getByText("one song").first()).toBeVisible();
  await expect(
    lists.getByText(/Copied into this browser's storage/),
  ).toBeVisible();
  await page.getByText("Close", { exact: true }).click();

  const row = page.getByRole("button", { name: new RegExp(FOLDER_SONG_TITLE) });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole("complementary", { name: "now playing" })).toContainText(
    FOLDER_SONG_TITLE,
  );

  expect(leaked, "unexpected external requests").toEqual([]);
});
