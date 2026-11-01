import { expect } from "./base";
import type { BrowserContext, Page } from "./base";
import { disableFullscreen } from "./fixture";
import {
  enterGame,
  openDocsBand,
  seatPlayers,
  setSlot,
  waitForPlaying,
  waitForStage,
} from "./helpers";
import { installNoteFixtures } from "./note-guide";

/**
 * The slide fixture's run, shared by the two gestures.
 *
 * A slide is read from `pointerdown`, a `pointermove` that changes column and a
 * `pointerup` as one gesture, so the spec drives it **inside the page, on the
 * live frame**: a round trip after the target shows as live can outlast the
 * 150 ms window on a loaded runner.
 */
/** Open the note guide's slide song with one guitar player on a phone. */
export async function openSlideRun(context: BrowserContext, page: Page): Promise<string[]> {
  const leaked = await installNoteFixtures(context);
  await disableFullscreen(page);
  await enterGame(page, "/app");
  await openDocsBand(page, /A slide/);
  await seatPlayers(page, 1);
  await setSlot(page, 1, "Guitar");
  // `startDocsRun` holds the capture for 1.5 s so a note is above the line; this
  // gesture has to be waiting on the source's own window instead, so the run is
  // started and the page's live notes are watched from the first frame.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await waitForStage(page);
  await waitForPlaying(page);
  await expect(page.locator(".highway__pad")).toHaveCount(5);
  return leaked;
}
