import { expect, test } from "./base";
import { SONG_TITLE, disableFullscreen, installFixtures } from "./fixture";
import { enterGame, openBand, startRun, waitForPlaying } from "./helpers";
import { describeViolations, seriousViolations } from "./axe";

/**
 * The band, the stage, the pause and the results — one run, read at each screen.
 *
 * This is the longest screen walk in the suite, so it is its own file: the
 * browser shards can give it a worker even while the paper pages and the menu
 * scans are still running.
 */
test("the band screen, the stage, the pause, Practice and the results have no critical or serious violations", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);
  await openBand(page, SONG_TITLE);

  const band = await seriousViolations(page);
  expect(describeViolations(band)).toBe("");

  // Player 2 arrived as the words, which this song has no part for: one guitar is
  // the whole band, and its lane is the one that takes the keyboard.
  await startRun(page);

  // The stage is up only once the entrance has handed over; the highway is the
  // part of it a player actually reads.
  await waitForPlaying(page);
  await expect(page.getByRole("region", { name: "Player 1 — Guitar" })).toBeVisible();
  await expect(page.locator(".highway").first()).toBeVisible();
  const stage = await seriousViolations(page);
  expect(describeViolations(stage)).toBe("");

  // The run is four seconds, so the pause is taken as soon as the stage has been
  // read rather than after it: Escape is the product's, and the dialog is what is
  // audited next.
  await page.keyboard.press("Escape");
  const pause = page.getByRole("dialog", { name: "Paused" });
  await expect(pause).toBeVisible();
  const paused = await seriousViolations(page);
  expect(describeViolations(paused)).toBe("");

  // Practice is the second dialog a run opens, and it sits over the pause rather
  // than replacing it.
  await pause.getByRole("button", { name: "Practice", exact: true }).click();
  const practice = page.getByRole("dialog", { name: "Practice a stretch" });
  await expect(practice).toBeVisible();
  const practising = await seriousViolations(page);
  expect(describeViolations(practising)).toBe("");
  await practice.getByRole("button", { name: "Cancel" }).click();

  // Resume, and the fixture's four seconds reach the results screen — the one
  // screen a run is read on, cards and history together.
  await pause.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({
    timeout: 20_000,
  });
  const results = await seriousViolations(page);
  expect(describeViolations(results)).toBe("");

  expect(leaked, "unexpected external requests").toEqual([]);
});
