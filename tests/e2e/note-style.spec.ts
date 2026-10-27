import { expect, test } from "@playwright/test";
import { SONG_TITLE, disableFullscreen, installFixtures } from "./fixture";
import { enterGame, openBand, startRun, waitForPlaying } from "./helpers";

/**
 * A note skin is drawing, but it still has to reach the stage: the setting is a
 * browser value, the highway reads it, and the arrows skin has to put a direction
 * on the note and on the pad.
 *
 * The run is left immediately after the stage says what it drew — the skin is the
 * subject here, not the song.
 */
test("choosing a note skin changes what the highway draws", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  await page.getByRole("button", { name: /Options/ }).click();
  const style = page.getByRole("group", { name: "Note style" });
  await expect(style).toBeVisible();
  // The game's own note is the default, so a player who never opens this page keeps
  // the board they know.
  await expect(style.getByRole("button", { name: "Bars" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await style.getByRole("button", { name: "Arrows" }).click();
  await expect(style.getByRole("button", { name: "Arrows" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Back to the menu" }).click();

  // The fixture is a guitar song: the words seat has nothing to play, so it goes
  // rather than blocking Play.
  await openBand(page, SONG_TITLE);
  await startRun(page);
  await waitForPlaying(page);

  const highway = page.getByRole("group", { name: "Note highway" }).first();
  await expect(highway).toHaveClass(/highway--notes-arrows/);
  // The face is the drawing's own node, and an arrow carries a direction: one per
  // column on the line, and one on the note when a note is in the window.
  await expect(highway.locator(".highway__pad--arrow")).toHaveCount(3);
  await expect(highway.locator(".highway__glyph").first()).toBeVisible();
  // The first run's own lesson is on the same highway: the seat's keys and the
  // strum, not the arrow skin's glyphs.
  await expect(highway.locator(".highway__pad-key")).toHaveText(["A", "S", "D"]);
  await expect(highway.locator(".highway__coach")).toContainText("↑ ↓");

  expect(leaked, "unexpected external requests").toEqual([]);
});
