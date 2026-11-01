import { expect, test } from "./base";
import { SONG_TITLE, disableFullscreen, installFixtures } from "./fixture";
import { enterGame, startRun, waitForPlaying } from "./helpers";
import { describeViolations, seriousViolations } from "./axe";

/**
 * The charter, the stage's announcement, forced colours and the smallest window.
 *
 * These are separate from the run walk because they audit different surfaces —
 * the second island, the live region and the OS's own colour mode — and because
 * keeping them out of the long run test lets a shard finish one while the other
 * is still going.
 */
test("the charter picker and its open song have no critical or serious violations", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await page.goto("/charter");
  await expect(page.locator(".charter-picker h1")).toBeVisible();
  expect(describeViolations(await seriousViolations(page))).toBe("");

  await page.getByRole("button", { name: new RegExp(SONG_TITLE) }).click();
  await expect(page.locator(".charter-pane")).toHaveCount(1, { timeout: 20_000 });
  expect(describeViolations(await seriousViolations(page))).toBe("");

  await page.getByRole("button", { name: "Record options" }).click();
  await expect(page.getByRole("group", { name: "Record options" })).toBeVisible();
  expect(describeViolations(await seriousViolations(page))).toBe("");

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("the stage announces the song, and a forced-colours choice keeps an outline", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  // A chosen tile is a fill in colour; forced colours removes it, so the choice
  // must survive as an outline.
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await page.getByRole("button", { name: new RegExp(SONG_TITLE) }).click();
  await page.getByRole("button", { name: "Next: your band" }).click();
  const chosen = page.locator('.slot__option[aria-pressed="true"]').first();
  await expect(chosen).toBeVisible();
  await page.emulateMedia({ forcedColors: "active" });
  const outline = await chosen.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).toBe("solid");
  expect(outline.width).toBeGreaterThan(0);
  await page.emulateMedia({ forcedColors: "none" });

  // The stage is the song, not the page's marketing heading, and the live region
  // says the same thing once.
  await startRun(page);
  await waitForPlaying(page);
  const stage = page.getByRole("region", { name: `Playing: ${SONG_TITLE}` });
  await expect(stage).toBeVisible();
  const live = page.locator('[role="status"][aria-live="polite"]').first();
  await expect(live).toHaveText(`Playing: ${SONG_TITLE}`);

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("the way in stays reachable at a very small viewport", async ({ context, page }) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await page.setViewportSize({ width: 320, height: 240 });
  await page.goto("/play");
  const enter = page.getByRole("button", { name: "Enter the stage" });
  await expect(enter).toBeEnabled({ timeout: 20_000 });
  // `overflow: hidden` clipped this button, and the only door into the game cannot
  // be scrolled to. The screen scrolls now, so the press is reachable.
  await enter.scrollIntoViewIfNeeded();
  await expect(enter).toBeInViewport();
  await enter.click();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();

  expect(leaked, "unexpected external requests").toEqual([]);
});
