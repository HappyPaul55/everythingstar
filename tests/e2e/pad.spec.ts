import { expect, test } from "./base";
import { UI_BUTTON } from "../../src/lib/game/controls/uiPad";
import { SONG_TITLE, disableFullscreen, installFixtures } from "./fixture";
import { enterGame, installGamepad, pressPadButton, waitForPlaying } from "./helpers";

/**
 * The pad as a menu cursor over a **stack** of dialogs.
 *
 * `<dialog>` makes everything behind it inert, but the DOM has no "which one is on
 * top" — so the game keeps its own ordered list (`ui/modalStack.ts`). A Practice
 * dialog sits over the pause, and the pad must walk the Practice dialog and B must
 * close **it**, not the pause underneath. Closing the pause would resume the run
 * behind a dialog the player is still looking at.
 *
 * The pad is a fake one installed before the page's scripts run: the browser's
 * gamepad API is a poll, and the game reads it on its own frame loop.
 */
test("the pad closes the practice dialog on top, not the pause beneath it", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await installGamepad(page);
  await enterGame(page);

  // A short fixture run with the machine on the second lane, so the run is real.
  await page.getByRole("button", { name: /Quick Play/ }).click();
  const row = page.getByRole("button", { name: new RegExp(SONG_TITLE) });
  await row.click();
  await page.getByRole("button", { name: "Next: your band" }).click();
  await page.getByRole("button", { name: "Remove player 2" }).click();
  await page.getByRole("button", { name: /Player 2 .*join the band/ }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await waitForPlaying(page);

  // Escape opens the pause; Practice opens its dialog over it.
  await page.keyboard.press("Escape");
  const pause = page.getByRole("dialog", { name: "Paused" });
  await expect(pause).toBeVisible();
  await pause.getByRole("button", { name: "Practice", exact: true }).click();
  const practice = page.getByRole("dialog", { name: "Practice a stretch" });
  await expect(practice).toBeVisible();
  await expect(practice.getByRole("radio", { name: "Whole song" })).toBeFocused();

  // B is "back": the top dialog closes, and the pause is still what is left.
  await pressPadButton(page, UI_BUTTON.back);
  await expect(practice).toBeHidden();
  await expect(pause).toBeVisible();
  // The run was not resumed: the pause is still the screen.
  await expect(pause.getByRole("button", { name: "Resume" })).toBeVisible();

  // And Escape still closes the pause itself, exactly as the keyboard always did.
  await page.keyboard.press("Escape");
  await expect(pause).toBeHidden();
  await expect(page.getByRole("region", { name: "Player 1 — Guitar" })).toBeVisible();

  expect(leaked, "unexpected external requests").toEqual([]);
});
