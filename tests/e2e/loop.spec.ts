import { expect, test } from "@playwright/test";
import {
  FIXTURE_NOTE_COUNT,
  SNG_SONG_TITLE,
  SONG_ARTIST,
  SONG_TITLE,
  disableFullscreen,
  installFixtures,
} from "./fixture";
import { enterGame, openBand, startRun, waitForPlaying, waitForStage } from "./helpers";

/**
 * The screen machine, end to end.
 *
 * This is the guard the unit suite cannot be: the island really mounts, the
 * machine really moves between screens, the run really ends on the clock and the
 * results screen really receives the published runs.
 */
test("plays the fixture song through the whole loop, pausing and resuming", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  // Menu → songs.
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();

  // The fixture library is listed, and picking a row puts it in now playing.
  const row = page.getByRole("button", { name: new RegExp(SONG_TITLE) });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole("complementary", { name: "now playing" })).toContainText(
    SONG_TITLE,
  );
  await expect(page.getByText(SONG_ARTIST).first()).toBeVisible();

  // Songs → band. Player 1 is the default guitar; Player 2 arrives as the words,
  // which this song has none of, so replace them with a second guitar. That
  // second lane is the machine's (only the first lane takes a keyboard), which
  // gives the run a real score.
  await page.getByRole("button", { name: "Next: your band" }).click();
  await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();
  await startRun(page, "twoGuitars");

  // Loading is brief, then the stage's entrance is the band's hype and slide —
  // there is no 3-2-1 to wait out any more. Only once the entrance has handed over
  // is Escape the pause rather than a quit.
  await waitForPlaying(page);
  await expect(page.getByRole("region", { name: "Player 1 — Guitar" })).toBeVisible();

  // Escape pauses the run, and Resume puts it back.
  await page.keyboard.press("Escape");
  const pause = page.getByRole("dialog", { name: "Paused" });
  await expect(pause).toBeVisible();
  await expect(pause.getByRole("button", { name: "Start again" })).toBeVisible();
  await expect(pause.getByRole("button", { name: "Leave the stage" })).toBeVisible();
  await pause.getByRole("button", { name: "Resume" }).click();
  await expect(pause).toBeHidden();
  await expect(page.getByRole("region", { name: "Player 1 — Guitar" })).toBeVisible();

  // Run to the end: the fixture is four seconds of frame clock.
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("band score", { exact: true })).toBeVisible();
  await expect(page.getByText("who played what", { exact: true })).toBeVisible();

  // A card per player, with the band's own score above them.
  const cards = page.getByRole("list", { name: "Players" });
  await expect(cards).toBeVisible();
  await expect(cards.getByText("Player 1 · Guitar", { exact: true })).toBeVisible();
  await expect(cards.getByText("Player 2 · Guitar", { exact: true })).toBeVisible();
  // The machine's lane is the one with a score, and its **last** judged note is on
  // the card too: the fixture's ninth note is the run's final frame. A stage that
  // unmounts before its last publish shows 8/8 or 8/9 here rather than 9/9.
  const machineCard = cards
    .getByRole("listitem")
    .filter({ hasText: "Player 2 · Guitar" });
  await expect(machineCard).toContainText(
    `${FIXTURE_NOTE_COUNT}/${FIXTURE_NOTE_COUNT} notes`,
  );
  // The score is a read, not a placeholder: the machine's lane lands notes.
  const bandScore = page.getByText("band score", { exact: true });
  await expect(bandScore).toBeVisible();
  await expect(bandScore.locator("xpath=following-sibling::dd")).not.toHaveText("0");

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("the pause's quick panel changes the note speed and practises from here", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  await openBand(page, SONG_TITLE);
  await startRun(page);
  await waitForPlaying(page);

  await page.keyboard.press("Escape");
  const pause = page.getByRole("dialog", { name: "Paused" });
  await expect(pause).toBeVisible();

  // The note speed is the same stepper the Options page uses: one press is one
  // tenth, and the read-out is the setting's own words.
  const speed = pause.getByRole("group", { name: "Note speed" });
  await expect(speed.locator("output")).toHaveText("1.0×");
  await speed.getByRole("button", { name: "Faster" }).click();
  await expect(speed.locator("output")).toHaveText("1.1×");

  // This band is one guitar, so there is no singer and no guide vocal row.
  await expect(pause.getByRole("group", { name: "Guide vocal" })).toHaveCount(0);

  // Practise from here: the fixture has one stretch, so that is preselected, at
  // the record's speed and without a loop. The dialog gives its opener back.
  const here = pause.getByRole("button", { name: "Practice this section" });
  await here.click();
  const dialog = page.getByRole("dialog", { name: "Practice a stretch" });
  await expect(dialog.getByRole("radio", { name: "Whole song" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(dialog.getByRole("radio", { name: "100%" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(dialog.getByRole("checkbox", { name: "Loop this stretch" })).not.toBeChecked();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(here).toBeFocused();

  // A phone is the shape the panel has to stay compact for: the quick rows must
  // not push Resume out of the pause the player is already looking at.
  await page.setViewportSize({ width: 375, height: 720 });
  await expect(pause.getByRole("button", { name: "Resume" })).toBeInViewport();

  await pause.getByRole("button", { name: "Resume" }).click();
  await expect(pause).toBeHidden();

  expect(leaked, "unexpected external requests").toEqual([]);
});

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

  // Back in the jukebox the song's history is still empty — the Listen run was
  // never written down.
  await page.getByRole("button", { name: "Change song" }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await expect(page.locator(".jukebox__history")).toContainText("no score yet");

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("Escape in the search field clears it instead of leaving the jukebox", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();

  // A text field keeps its own Escape: the browser's search behaviour clears it,
  // and the screen behind it must not move as well.
  const search = page.getByRole("searchbox", { name: "Find a song" });
  await search.fill("ti");
  await expect(search).toHaveValue("ti");
  await search.press("Escape");

  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await expect(search).toHaveValue("");

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("coming back to the jukebox keeps the song that was chosen", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();

  // The fixture's second row in A–Z order — the first is "Tiny Package Song", so
  // a list that starts at the top on the way back would land on the wrong one.
  const chosen = page.getByRole("button", { name: new RegExp(SONG_TITLE) });
  await expect(chosen).toBeVisible();
  await chosen.click();
  const nowPlaying = page.getByRole("complementary", { name: "now playing" });
  await expect(nowPlaying).toContainText(SONG_TITLE);

  await page.getByRole("button", { name: "Next: your band" }).click();
  await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();

  // Back to the list: focus is the game's own placement and must not select the
  // row it lands on, so the now-playing slot is still the song that was chosen.
  await page.getByRole("button", { name: "Back to songs" }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await expect(nowPlaying).toContainText(SONG_TITLE);
  await expect(nowPlaying).not.toContainText(SNG_SONG_TITLE);

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("crossing the phone breakpoint on the band screen keeps its song", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  // Quick Play → Next without pressing a row: the first song is the default, and
  // the band screen is offered it.
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next: your band" })).toBeEnabled();
  await page.getByRole("button", { name: "Next: your band" }).click();
  const band = page.getByRole("heading", { name: "Who is playing?" });
  await expect(band).toBeVisible();

  // The phone's jukebox is the one screen that wants no default song. Crossing
  // the breakpoint on the band screen must not take the band's song away.
  await page.setViewportSize({ width: 375, height: 720 });
  await expect(band).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(band).toBeVisible();

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("a lone player on a portrait phone puts the rails above the highway", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  await openBand(page, SONG_TITLE);
  await startRun(page);
  await waitForPlaying(page);

  await page.setViewportSize({ width: 390, height: 844 });
  const panel = page.getByRole("region", { name: "Player 1 — Guitar" });
  await expect(panel).toBeVisible();
  const highway = panel.locator(".highway");
  const score = panel.locator(".panel-rail--score");
  const info = panel.locator(".panel-rail--info");
  await expect(highway).toBeVisible();

  const [panelBox, highwayBox, scoreBox, infoBox] = await Promise.all([
    panel.boundingBox(),
    highway.boundingBox(),
    score.boundingBox(),
    info.boundingBox(),
  ]);
  expect(panelBox).not.toBeNull();
  expect(highwayBox).not.toBeNull();
  expect(scoreBox).not.toBeNull();
  expect(infoBox).not.toBeNull();
  if (!panelBox || !highwayBox || !scoreBox || !infoBox) return;

  // The highway is the full width of the panel, and both rails are above it.
  expect(highwayBox.width).toBeGreaterThan(panelBox.width * 0.9);
  expect(highwayBox.y).toBeGreaterThanOrEqual(scoreBox.y + scoreBox.height - 1);
  expect(highwayBox.y).toBeGreaterThanOrEqual(infoBox.y + infoBox.height - 1);
  await page.keyboard.press("Escape");

  expect(leaked, "unexpected external requests").toEqual([]);
});
