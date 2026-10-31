import { expect, type BrowserContext, type Page } from "@playwright/test";
import { disableFullscreen, sngFixtureFile } from "./fixture";
import { installDocsFixtures } from "./docs-library";
import {
  enterGame,
  expectNoExternalRequests,
  openDocsBand,
  seatPlayers,
  setSlot,
  startDocsRun,
  startRun,
  waitForPlaying,
  waitForStage,
} from "./helpers";

/**
 * The player pages' captures and the loop's: the steps that get to each screen,
 * and the assertion that the screen is the one the page is about.
 *
 * A capture test names the picture; the driving lives here because it is the
 * same every time and the page's prose already describes the screen. The
 * library is the published FOSS playlist (`installDocsFixtures`), and Code
 * Monkey is the song: it carries guitar, bass, drums and vocals, so one fixture
 * covers the highway, the band and the singer. The screens that only exist
 * around a run — results, a pause, the practice chooser — use the tiny fixture,
 * whose four seconds of frame clock reach them inside a test.
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
  // The letter rail is part of the jukebox on a wide screen; a phone's list is
  // the screen, so the stylesheet hides the 27-letter column there. It is the
  // same box either way, and the rows below are the picture's other half.
  await expect(page.locator(".jukebox__index")).toHaveCount(1);

  await page.getByRole("button", { name: /Code Monkey/ }).first().click();
  await expect(page.locator(".jukebox__selection .jukebox__title")).toHaveText("Code Monkey");
  expectNoExternalRequests(leaked);
}

/** One guitar player's highway, a beat into the run. */
export async function captureGuitarHighway(context: BrowserContext, page: Page): Promise<void> {
  const leaked = await startPlayerCapture(context, page);
  await openDocsBand(page);
  await seatPlayers(page, 1);
  await setSlot(page, 1, "Guitar");
  await startDocsRun(page);
  expectNoExternalRequests(leaked);
}

/**
 * The beat a roll capture is taken on.
 *
 * The keys view shows about nine seconds of song across a desktop and two and a
 * half across a phone, so one wait is not one picture: the same wall-clock has
 * the words a long way further along on the small screen, or already past its
 * edge. The desktop keeps the documentation's own beat (`startDocsRun`); the
 * phone's comes earlier, so the line the capture is about is still in the frame.
 *
 * `@public` — the duet capture in `tests/e2e/docs-charts.ts` reads it too.
 */
export async function waitRollBeat(page: Page): Promise<void> {
  const width = page.viewportSize()?.width ?? 1440;
  await page.waitForTimeout(width < 640 ? 600 : 1_500);
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
  // The seats are set by pressing them, and a phone's band is a column: the last
  // press leaves the list scrolled to the player it changed. The picture is the
  // screen, so its head goes back in view.
  await page
    .getByRole("heading", { name: "Who is playing?" })
    .scrollIntoViewIfNeeded();
  expectNoExternalRequests(leaked);
}

/** One singer's piano roll, a beat into the run. */
export async function captureSinger(context: BrowserContext, page: Page): Promise<void> {
  const leaked = await startPlayerCapture(context, page);
  await openDocsBand(page);
  await seatPlayers(page, 1);
  await setSlot(page, 1, "Vocals");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await waitForStage(page);
  await waitForPlaying(page);
  await waitRollBeat(page);
  expectNoExternalRequests(leaked);
}

/**
 * The pads on a portrait phone, a beat into the run.
 */
export async function capturePhonePads(context: BrowserContext, page: Page): Promise<void> {
  const leaked = await startPlayerCapture(context, page);
  await openDocsBand(page);
  await seatPlayers(page, 1);
  await setSlot(page, 1, "Guitar");
  await startDocsRun(page);
  expectNoExternalRequests(leaked);
}

/* --------------------------------------------------- the loop, screen by screen */

/**
 * The published song, shortened so a run reaches its end inside a test.
 *
 * The screens that only exist around a run — results, a pause — would otherwise
 * spend a test waiting out three and a half minutes of Code Monkey. The fixture
 * keeps the record's title, artist and art and cuts only the length, so the
 * picture is of a real song reaching a real end.
 */
const SHORT_SONG_ID = "jonathan-coulton-code-monkey";

async function startShortDocsCapture(
  context: BrowserContext,
  page: Page,
): Promise<string[]> {
  const leaked = await installDocsFixtures(context, {
    shortSongId: SHORT_SONG_ID,
    shortDurationMs: 8_000,
  });
  await disableFullscreen(page);
  await enterGame(page, "/app");
  await openDocsBand(page);
  return leaked;
}

/** The way in: the poster and its one button, waiting to be pressed. */
export async function captureWelcome(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await installDocsFixtures(context);
  await disableFullscreen(page);
  await page.goto("/app");
  // The press is the picture's subject, not its next step: the capture stops on
  // the welcome, with the button the mixer has finished warming behind.
  await expect(page.getByRole("button", { name: "Enter the stage" })).toBeEnabled({
    timeout: 20_000,
  });
  expectNoExternalRequests(leaked);
}

/** The main menu, where the loop starts. */
export async function captureMenu(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await startPlayerCapture(context, page);
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  expectNoExternalRequests(leaked);
}

/** Options: what the game is set to, before a song is chosen. */
export async function captureOptions(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await startPlayerCapture(context, page);
  await page.getByRole("button", { name: /Options/ }).click();
  await expect(page.getByRole("heading", { name: "Options" })).toBeVisible();
  expectNoExternalRequests(leaked);
}

/** The jukebox's Playlists dialog: the sources the library is read from. */
export async function capturePlaylists(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await startPlayerCapture(context, page);
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await page.getByRole("button", { name: /^Playlists/ }).click();
  await expect(page.getByRole("dialog", { name: "Playlists" })).toBeVisible();
  expectNoExternalRequests(leaked);
}

/** The same dialog after a package was copied into the browser's storage. */
export async function captureImport(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await startPlayerCapture(context, page);
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await page.getByRole("button", { name: /^Playlists/ }).click();
  const lists = page.getByRole("dialog", { name: "Playlists" });
  await expect(lists).toBeVisible();

  // The seeded playlist is not the subject: the import is the only source, so
  // the row that reports it is the library.
  const disable = page.getByRole("button", { name: "Disable", exact: true });
  if ((await disable.count()) > 0) await disable.click();

  await page.locator('input[data-import="files"]').setInputFiles(sngFixtureFile());
  await expect(lists.getByText("one song").first()).toBeVisible();
  await expect(lists.getByText(/Copied into this browser's storage/)).toBeVisible();
  expectNoExternalRequests(leaked);
}

/** Listen: the published library's song with nobody on stage. */
export async function captureListen(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await startPlayerCapture(context, page);
  await openDocsBand(page);
  await startRun(page, "listen");
  await waitForPlaying(page);
  await page.waitForTimeout(1_500);
  expectNoExternalRequests(leaked);
}

/**
 * The results screen, after a run the machine played.
 *
 * The seat is the machine because a capture does not press frets: a human seat
 * would miss every note and the band would lose the run, which is a true screen
 * but not the one the page is introducing. The machine plays the same chart
 * through the same rules, so the card and the band score are real.
 */
export async function captureResults(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await startShortDocsCapture(context, page);
  await seatPlayers(page, 1);
  await setSlot(page, 1, "Guitar");
  await page.getByRole("button", { name: "Player 1: controller" }).click();
  await page
    .getByRole("dialog", { name: /Player 1/ })
    .getByRole("button", { name: "The machine", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await startDocsRun(page);
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({
    timeout: 20_000,
  });
  expectNoExternalRequests(leaked);
}

/** The pause, a beat into a lone player's run. */
export async function capturePause(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await startShortDocsCapture(context, page);
  await seatPlayers(page, 1);
  await setSlot(page, 1, "Guitar");
  await startDocsRun(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
  expectNoExternalRequests(leaked);
}

/**
 * A run of the documentation's song, paused, with the pause's own Practice
 * dialog open over it.
 *
 * Both practice captures start here: the chooser is one screen, and what the
 * read-out capture adds is the plan it starts. The song is Code Monkey, whose
 * chapters are the stretches the chooser lists.
 */
async function openPracticeDialog(
  context: BrowserContext,
  page: Page,
): Promise<string[]> {
  const leaked = await startPlayerCapture(context, page);
  await openDocsBand(page);
  await seatPlayers(page, 1);
  await setSlot(page, 1, "Guitar");
  await startDocsRun(page);
  await page.keyboard.press("Escape");
  const pause = page.getByRole("dialog", { name: "Paused" });
  await expect(pause).toBeVisible();
  await pause.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Practice a stretch" })).toBeVisible();
  return leaked;
}

/** The practice chooser over a paused run of the documentation's song. */
export async function capturePracticeDialog(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await openPracticeDialog(context, page);
  expectNoExternalRequests(leaked);
}

/** A practice run at 80%, looping, with the stage's own read-out on it. */
export async function capturePracticeReadout(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await openPracticeDialog(context, page);
  const dialog = page.getByRole("dialog", { name: "Practice a stretch" });
  await dialog.getByRole("radio", { name: "80%", exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Loop this stretch" }).check();
  await dialog.getByRole("button", { name: "Start practice" }).click();
  await waitForPlaying(page);
  await expect(page.locator(".practice-readout")).toBeVisible();
  expectNoExternalRequests(leaked);
}

/** One typist on the words, with the read-along they type. */
export async function captureTyping(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await startPlayerCapture(context, page);
  await openDocsBand(page);
  await seatPlayers(page, 1);
  // Words are one place, and Typing is the way of playing them that needs no
  // microphone. On a pitched song the view follows the players: no singer, so
  // the words are the static read-along a typist types.
  await page
    .locator(".slot")
    .first()
    .getByRole("button", { name: "Typing", exact: true })
    .click();
  await startDocsRun(page);
  await expect(page.locator(".lyrics-view")).toBeVisible();
  expectNoExternalRequests(leaked);
}

/** One player's controller, open on the device they hold. */
export async function captureController(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await startPlayerCapture(context, page);
  await openDocsBand(page);
  await page.getByRole("button", { name: "Player 1: controller" }).click();
  await expect(page.getByRole("dialog", { name: /Player 1/ })).toBeVisible();
  expectNoExternalRequests(leaked);
}

/** The charter's front door: the picker, before a song is opened. */
export async function captureCharterPicker(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await installDocsFixtures(context);
  await disableFullscreen(page);
  await page.goto("/charter");
  await expect(
    page.locator(".charter-picker").getByRole("heading", { name: "Chart editor" }),
  ).toBeVisible();
  expectNoExternalRequests(leaked);
}

/** The editor on a song, with one note added and selected. */
export async function captureCharterEditor(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await installDocsFixtures(context);
  await disableFullscreen(page);
  await page.goto("/charter");
  await openCharterSong(page);

  // A click on the highway adds one note and selects it, which is what makes the
  // inspector under it visible.
  const body = activePane(page).locator(".charter-pane__body");
  await expect(body).toBeVisible();
  const box = await body.boundingBox();
  expect(box).not.toBeNull();
  if (box) await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.4);
  // The click is the state the shot is about: one note, selected, and the
  // inspector saying so. The numeric editor beside it is a desktop affordance —
  // below 540px the stylesheet hides it, because a phone has no room for six
  // inputs — so the assertion is the inspector's own read-out.
  await expect(page.locator(".charter-inspect__left")).toContainText("1 selected");
  await expect(page.locator(".charter-note-editor")).toHaveCount(1);
  expectNoExternalRequests(leaked);
}

/** The chart list over the editor: what the song already has, and a new one. */
export async function captureCharterCharts(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const leaked = await installDocsFixtures(context);
  await disableFullscreen(page);
  await page.goto("/charter");
  await openCharterSong(page);
  await page.getByRole("button", { name: "Charts" }).click();
  await expect(page.getByRole("dialog", { name: "Charts" })).toBeVisible();
  expectNoExternalRequests(leaked);
}

/** The charter's picker, then the song the documentation writes about. */
async function openCharterSong(page: Page): Promise<void> {
  await expect(
    page.locator(".charter-picker").getByRole("heading", { name: "Chart editor" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Code Monkey/ }).first().click();
  // A song opens on every chart it already has — guitar, bass and drums at each
  // difficulty — so the editor is a stack of panes from the first moment.
  await expect(page.locator(".charter-pane").first()).toBeVisible();
}

/** The pane the editor is working in: the one a click adds a note to. */
function activePane(page: Page) {
  return page.locator(".charter-pane.is-active");
}
