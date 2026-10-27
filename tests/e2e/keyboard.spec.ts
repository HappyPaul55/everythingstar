import { expect, test } from "@playwright/test";
import {
  FIXTURE_NOTE_COUNT,
  SONG_TITLE,
  disableFullscreen,
  installFixtures,
} from "./fixture";
import { enterGame, openBand, startRun, waitForPlaying } from "./helpers";

/**
 * The keyboard, end to end.
 *
 * It is Player 1's default controller, and until now only the pointer and MIDI
 * paths were driven in a browser: the pad spec taps, the MIDI spec sends notes,
 * and neither touches a key. What the unit suite cannot see is the route between
 * them — a `keydown` carries the game's own key code, and its `timeStamp` has to
 * be projected onto the song clock exactly as a tap's or a MIDI message's is.
 *
 * The fixture's only chord is the first moment of the song, columns 0 and 2. A
 * guitar's left-hand preset is `KeyA`, `KeyS`, `KeyD` for three columns, and the
 * strum is `ArrowDown`; holding the two frets and strumming once plays the chord —
 * both notes or neither, because a chord is one gesture.
 */
test("holding two frets and strumming with the keyboard plays a chord", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  // One player, the person at the keyboard: a machine lane beside them would put
  // its own score in the card this test reads.
  await openBand(page, SONG_TITLE);
  await startRun(page);

  // Put the frets down **before** the chord, then wait for the two notes to be
  // live. A fret on nothing is not an error, and holding them early leaves only
  // the single strum on the critical path inside the 150ms window. The strum is a
  // real key event, so its own timestamp is what judges the chord.
  await waitForPlaying(page);
  await page.keyboard.down("KeyA");
  await page.keyboard.down("KeyD");
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".highway__pad.is-held").length === 2 &&
      document.querySelectorAll(".highway__note.is-live").length >= 2,
    undefined,
    { timeout: 30_000 },
  );
  await page.keyboard.press("ArrowDown");
  await page.keyboard.up("KeyA");
  await page.keyboard.up("KeyD");
  // The score on the results card is the stable proof the chord landed; the hit's
  // burst is a short visual read-out covered by `hitBursts`' unit tests.
  await expect(page.locator(".highway__note.is-hit")).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({
    timeout: 20_000,
  });
  // A chord is 100 points and two notes; one fret held would be 50 and leave the
  // other note of the chord to pass.
  const card = page.locator(".results__player").first();
  await expect(card.locator(".results__player-score")).toHaveText("100");
  await expect(card.locator(".results__player-stats")).toContainText(
    `2/${FIXTURE_NOTE_COUNT} notes`,
  );

  expect(leaked, "unexpected external requests").toEqual([]);
});
