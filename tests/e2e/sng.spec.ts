import { expect, test } from "./base";
import {
  SNG_SONG_TITLE,
  SONG_ARTIST,
  disableFullscreen,
  installSngFixtures,
} from "./fixture";
import { enterGame, startRun } from "./helpers";

/**
 * One package, two readers.
 *
 * The jukebox fetches a `.sng` to play a row's preview; opening the band then wants
 * the same bytes for its chart and stems. The one-visit cache means the package is
 * requested **once**, so the test counts the route hits rather than inspecting the
 * cache from outside — the network is the behaviour a player pays for.
 */
test("a .sng package is downloaded once for the preview and the band", async ({
  context,
  page,
}) => {
  const fixture = await installSngFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();

  const row = page.getByRole("button", { name: new RegExp(SNG_SONG_TITLE) });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole("complementary", { name: "now playing" })).toContainText(
    SNG_SONG_TITLE,
  );
  await expect(page.getByText(SONG_ARTIST).first()).toBeVisible();

  // Selecting the row fetched the package for its preview.
  await expect.poll(fixture.packageRequests).toBe(1);

  // Opening the band reads the same package. The default second player is the
  // words, which this package has none of, so make it a second guitar as the loop
  // spec does.
  await page.getByRole("button", { name: "Next: your band" }).click();
  await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();
  await startRun(page, "twoGuitars");

  // The stage's entrance only starts once the band's load is ready, so this proves
  // the second reader really ran. It must not have downloaded the package again.
  await expect.poll(fixture.packageRequests).toBe(1);

  expect(fixture.leaked, "unexpected external requests").toEqual([]);
});
