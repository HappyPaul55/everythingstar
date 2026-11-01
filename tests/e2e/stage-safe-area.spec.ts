import { expect, test } from "./base";
import { SONG_TITLE, installFixtures } from "./fixture";
import { openBand, startRun, waitForPlaying } from "./helpers";

/**
 * The stage's play area is the space inside its padding, not the whole screen.
 *
 * The padding is the brand's gutter plus the device's **safe-area insets** on the
 * edges something can be pressed against — the status bar and the notch at the top,
 * the notch at the sides. It used to be measured as part of the stage, so the lanes
 * were laid out for the full height and the lone player's score rail (which sits
 * above the highway) was pushed off the top of the screen.
 *
 * The **bottom** is deliberately not reserved: the lowest thing on the stage is the
 * highway's deck, not a control, so the neck runs under the home indicator rather
 * than leaving a strip of backdrop below it. A headless browser has no safe-area
 * insets to hand, so the test stands a top one in — the shape of a notched phone in
 * fullscreen — and asserts both that the rail stays up and that the panel reaches
 * the bottom of the stage.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("a stage with a safe area keeps the score rail up and fills the bottom", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await page.goto("/play");
  await expect(page.getByRole("button", { name: "Enter the stage" })).toBeEnabled({
    timeout: 20_000,
  });
  // Before the stage ever mounts: the shape of the phone it will be played on.
  await page.addStyleTag({
    content: `
      .band__stage {
        padding-top: 72px !important;
      }
    `,
  });
  await page.getByRole("button", { name: "Enter the stage" }).click();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();

  // One player, so the lone lane's score and meter sit in a row above the highway —
  // the layout the report was about.
  await openBand(page, SONG_TITLE);
  await startRun(page);
  await waitForPlaying(page);

  const box = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    };
    return {
      stage: rect(".band__stage"),
      panel: rect(".player-panel"),
      score: rect(".panel-rail--score"),
      name: rect(".panel-rail__name"),
      highway: rect(".highway"),
    };
  });

  expect(box.stage, "the stage is on screen").not.toBeNull();
  expect(box.panel, "the lane panel is on screen").not.toBeNull();
  expect(box.score, "the score rail is on screen").not.toBeNull();
  expect(box.highway, "the highway is on screen").not.toBeNull();
  if (!box.stage || !box.panel || !box.score || !box.name || !box.highway) return;

  // The panel is the space inside the top safe area, not the screen behind it.
  expect(box.panel.top).toBeGreaterThanOrEqual(box.stage.top + 72 - 1);
  // The bottom is the deck's: the panel runs to the stage's bottom gutter instead of
  // stopping above the home indicator and leaving a strip of backdrop there.
  expect(box.panel.bottom).toBeGreaterThanOrEqual(box.stage.bottom - 16 - 1);
  expect(box.panel.bottom).toBeLessThanOrEqual(box.stage.bottom + 1);
  // The rail is above the highway — where the report lost it — and inside the panel.
  expect(box.score.top).toBeGreaterThanOrEqual(box.panel.top - 1);
  expect(box.score.bottom).toBeLessThanOrEqual(box.highway.top + 1);
  // The player's name is drawn at the top of that rail, not above the screen.
  expect(box.name.top).toBeGreaterThanOrEqual(box.stage.top + 72 - 1);
  await expect(page.locator(".panel-rail__name")).toContainText("Player 1");

  expect(leaked, "unexpected external requests").toEqual([]);
});
