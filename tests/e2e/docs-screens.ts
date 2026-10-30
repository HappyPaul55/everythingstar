import { expect, type BrowserContext, type Page } from "@playwright/test";
import { disableFullscreen } from "./fixture";
import { installDocsFixtures } from "./docs-library";
import {
  enterGame,
  expectNoExternalRequests,
  openDocsBand,
  seatPlayers,
  setSlot,
  startDocsRun,
} from "./helpers";

/**
 * The player pages' captures: the steps that get to each screen, and the
 * assertion that the screen is the one the page is about.
 *
 * A fence names the picture; the driving lives here because it is the same
 * every time and the prose beside the fence already describes the screen. The
 * library is the published FOSS playlist (`installDocsFixtures`), and Code
 * Monkey is the song: it carries guitar, bass, drums and vocals, so one fixture
 * covers the highway, the band and the singer.
 */

/** The shared opening: the library, no fullscreen, and the game alone. */
async function startPlayerCapture(
  context: BrowserContext,
  page: Page,
): Promise<string[]> {
  const leaked = await installDocsFixtures(context);
  await disableFullscreen(page);
  await enterGame(page, "/app");
  return leaked;
}

/** The jukebox, with a row selected so both halves are in the picture. */
export async function captureJukebox(context: BrowserContext, page: Page): Promise<void> {
  const leaked = await startPlayerCapture(context, page);

  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await expect(page.locator(".jukebox__index")).toBeVisible();

  await page.getByRole("button", { name: /Code Monkey/ }).first().click();
  await expect(page.locator(".jukebox__selection .jukebox__title")).toHaveText("Code Monkey");
  expectNoExternalRequests(leaked);
}

/** One guitar player's highway, a beat into the run. */
export async function captureGuitarHighway(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await startPlayerCapture(context, page);
  await openDocsBand(page);
  await seatPlayers(page, 1);
  await setSlot(page, 1, "Guitar");
  await startDocsRun(page);
  expectNoExternalRequests(leaked);
}

/** The band screen with a guitar, a drummer and a singer seated. */
export async function captureBandScreen(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await startPlayerCapture(context, page);
  await openDocsBand(page);
  await seatPlayers(page, 3);
  await setSlot(page, 1, "Guitar");
  await setSlot(page, 2, "Drums");
  await setSlot(page, 3, "Vocals");
  expectNoExternalRequests(leaked);
}

/** One singer's piano roll, a beat into the run. */
export async function captureSinger(context: BrowserContext, page: Page): Promise<void> {
  const leaked = await startPlayerCapture(context, page);
  await openDocsBand(page);
  await seatPlayers(page, 1);
  await setSlot(page, 1, "Vocals");
  await startDocsRun(page);
  expectNoExternalRequests(leaked);
}

/** The pads on a portrait phone, a beat into the run. */
export async function capturePhonePads(context: BrowserContext, page: Page): Promise<void> {
  const leaked = await startPlayerCapture(context, page);
  await openDocsBand(page);
  await seatPlayers(page, 1);
  await setSlot(page, 1, "Guitar");
  await startDocsRun(page);
  expectNoExternalRequests(leaked);
}
