import { expect, test } from "./base";
import {
  SONG_TITLE,
  disableFullscreen,
  installFixtures,
} from "./fixture";
import {
  enterGame,
  openBand,
  startRun,
  waitForPlaying,
  waitForStage,
} from "./helpers";

/**
 * Practice from the pause: a section at 80%, a whole-song single pass, and Listen (no run at all).
 */
test("practises a stretch at 80%, loops it, and leaves no score behind", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  // The same short fixture run, with a machine-played second lane so the score
  // read-out has something real in it.
  await openBand(page, SONG_TITLE);
  await startRun(page, "twoGuitars");
  await waitForPlaying(page);

  // Pause, then Practise: the fixture song has no sections or phrases, so its
  // one stretch is the whole song.
  await page.keyboard.press("Escape");
  const pause = page.getByRole("dialog", { name: "Paused" });
  await expect(pause).toBeVisible();
  await pause.getByRole("button", { name: "Practice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Practice a stretch" });
  await expect(dialog).toBeVisible();
  const firstSection = dialog.getByRole("radio", { name: "Whole song" });
  await expect(firstSection).toBeFocused();
  await firstSection.click();
  await dialog.getByRole("radio", { name: "80%" }).click();
  await dialog.getByRole("checkbox", { name: "Loop this stretch" }).check();
  await dialog.getByRole("button", { name: "Start practice" }).click();

  // The entrance is the practice count-in too, and the stage then carries the plan.
  await waitForStage(page);
  await waitForPlaying(page);
  const readout = page.locator(".practice-readout");
  await expect(readout).toBeVisible();
  await expect(readout).toContainText("Whole song");
  await expect(readout).toContainText("80% speed");
  await expect(readout).toContainText("looping");

  // The machine's lane scores, then the loop takes it back to the start: the
  // read-out stays and the run is reset rather than carried over.
  const score = page
    .getByRole("region", { name: "Player 2 — Guitar" })
    .locator(".panel-stat__value")
    .first();
  const readScore = () =>
    score.evaluate((node) => Number((node.textContent ?? "").replace(/\D/g, "")));
  // The loop resets the run, so the score climbs through a pass and falls back
  // toward zero. Watching for the zero itself is a race the product is allowed to
  // win: the run publishes on an 80 ms throttle, so a reset that lands beside the
  // machine's next note may never be rendered as "0" at all — no observer can see
  // a value the DOM never held. The **drop** is the same evidence and lasts for
  // the seconds the next pass takes to climb back, so it survives a loaded runner.
  let peak = 0;
  await expect
    .poll(
      async () => {
        peak = Math.max(peak, await readScore());
        return peak;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () => {
        const now = await readScore();
        peak = Math.max(peak, now);
        return now < peak / 2;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  await expect(readout).toBeVisible();
  // Practice never asks the screen machine for a result.
  await expect(page.getByRole("heading", { name: "Results" })).toBeHidden();

  // Pausing again opens the dialog on the plan that is running.
  await page.keyboard.press("Escape");
  const pausedAgain = page.getByRole("dialog", { name: "Paused" });
  await expect(pausedAgain).toBeVisible();
  await pausedAgain.getByRole("button", { name: "Practice", exact: true }).click();
  const again = page.getByRole("dialog", { name: "Practice a stretch" });
  await expect(again.getByRole("radio", { name: "Whole song" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(again.getByRole("radio", { name: "80%" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(again.getByRole("checkbox", { name: "Loop this stretch" })).toBeChecked();
  await again.getByRole("button", { name: "Cancel" }).click();
  // The dialog gives its opener back, exactly like every other game modal.
  await expect(
    pausedAgain.getByRole("button", { name: "Practice", exact: true }),
  ).toBeFocused();

  // Leaving practice leaves the jukebox's history exactly as it was.
  await pausedAgain.getByRole("button", { name: "Leave the stage" }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await expect(page.locator(".jukebox__history")).toContainText("no score yet");

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("a whole-song practice stops at the song's own end, and asks", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  await openBand(page, SONG_TITLE);
  await startRun(page);
  await waitForPlaying(page);

  // A single pass over the whole song — the stretch whose end **is** the song's
  // end, so the transport and the practice rule meet on the same frame.
  await page.keyboard.press("Escape");
  const pause = page.getByRole("dialog", { name: "Paused" });
  await expect(pause).toBeVisible();
  await pause.getByRole("button", { name: "Practice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Practice a stretch" });
  await dialog.getByRole("radio", { name: "Whole song" }).click();
  await expect(dialog.getByRole("checkbox", { name: "Loop this stretch" })).not.toBeChecked();
  await dialog.getByRole("button", { name: "Start practice" }).click();
  await waitForStage(page);
  await waitForPlaying(page);

  // Four seconds later the pass ends: the pause is where the player chooses to
  // repeat it, not a still frame with no door.
  await expect(pause).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("html")).toHaveAttribute("data-screen", "paused");
  await expect(page.getByRole("heading", { name: "Results" })).toBeHidden();
  await expect(pause.getByRole("button", { name: "Repeat this stretch" })).toBeVisible();

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("Listen leaves the board alone: no run, no score, no best", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  // The fixture song with **nobody** on stage: Listen, not a run. There is no
  // player to publish a run, so there is no score to keep — and a zero written
  // down would become the song's best, which is the one thing a history must not
  // say.
  await openBand(page, SONG_TITLE);
  await page.getByRole("button", { name: "Remove player 2" }).click();
  await page.getByRole("button", { name: "Remove player 1" }).click();
  await expect(page.getByRole("button", { name: "Listen", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Listen", exact: true }).click();

  // The four-second fixture runs out and the results screen receives no runs.
  await waitForStage(page);
  await waitForPlaying(page);
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({
    timeout: 20_000,
  });
  // Nobody played, so there are no cards, and the screen says nothing about a best.
  await expect(page.getByText("who played what", { exact: true })).toBeHidden();
  await expect(page.locator(".results__best")).toHaveText("");
  // Nobody played, so there is no run to post: a brag card is for a run the board
  // kept, and Listen keeps nothing.
  await expect(page.getByRole("button", { name: "Brag card" })).toHaveCount(0);

  // Back in the jukebox the song's history is still empty — the Listen run was
  // never written down.
  await page.getByRole("button", { name: "Change song" }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await expect(page.locator(".jukebox__history")).toContainText("no score yet");

  expect(leaked, "unexpected external requests").toEqual([]);
});
