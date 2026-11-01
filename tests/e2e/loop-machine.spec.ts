import { expect, test } from "./base";
import {
  FIXTURE_NOTE_COUNT,
  SONG_ARTIST,
  SONG_TITLE,
  disableFullscreen,
  installFixtures,
} from "./fixture";
import {
  enterGame,
  openBand,
  startRun,
  waitForPlaying,
} from "./helpers";

/**
 * The screen machine, end to end: one song through the loop, and the pause's quick panel. Split from the practice and jukebox walks so a shard can run them on different workers.
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
