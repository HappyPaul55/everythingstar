import { expect, test } from "./base";
import { SONG_TITLE, installFixtures } from "./fixture";
import { enterGame, openBand, startRun, waitForPlaying } from "./helpers";

/**
 * The whole screen is a product feature, not a dev tool.
 *
 * Every other spec stubs fullscreen *out* (`disableFullscreen`), so the one path
 * that takes the stage over the browser chrome — and the rule that leaving it
 * pauses a run — had no browser proof at all. The API is stubbed here instead:
 * Chromium's headless window cannot really go fullscreen, but the document events
 * and the element state are exactly what the game reads.
 */
test("a run takes the whole screen, and leaving it pauses", async ({ context, page }) => {
  await page.addInitScript(() => {
    let element: Element | null = null;
    const change = () => document.dispatchEvent(new Event("fullscreenchange"));

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => element,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: () => {
        element = null;
        change();
        return Promise.resolve();
      },
    });
    const take = (next: Element) => {
      element = next;
      change();
    };
    Object.defineProperty(Element.prototype, "requestFullscreen", {
      configurable: true,
      value: function requestFullscreen(this: Element) {
        take(this);
        return Promise.resolve();
      },
    });
  });

  const leaked = await installFixtures(context);
  await enterGame(page);
  const shell = page.locator("#site-header");

  // Entering the stage **is** the ask for the screen (`ScreenHost`), so the shell
  // has already stood aside by the time the menu is up.
  await expect(page.locator("html")).toHaveAttribute("data-game-fullscreen", "");
  await expect(shell).toBeHidden();

  // Leaving it puts the shell back, and the menu is not a run to pause.
  await page.evaluate(() => void document.exitFullscreen());
  await expect(page.locator("html")).not.toHaveAttribute("data-game-fullscreen");
  await expect(shell).toBeVisible();

  await openBand(page, SONG_TITLE);
  await startRun(page);
  await waitForPlaying(page);

  // The corner chip is the other way in, for a player who left it.
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-game-fullscreen", "");
  await expect(shell).toBeHidden();

  // Escape (or a swipe) is the browser's, not a button's: ending the element's
  // fullscreen during a run pauses exactly where the song was.
  await page.evaluate(() => void document.exitFullscreen());
  await expect(page.locator("html")).not.toHaveAttribute("data-game-fullscreen");
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
  await expect(shell).toBeVisible();

  expect(leaked, "unexpected external requests").toEqual([]);
});
