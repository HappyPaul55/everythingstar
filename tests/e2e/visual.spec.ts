import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { expect, test } from "./base";
import {
  captureBandScreen,
  captureCharterEditor,
  captureController,
  captureImport,
  captureJukebox,
  captureMenu,
  captureOptions,
  capturePause,
  capturePlaylists,
  capturePracticeDialog,
  captureResults,
  captureWelcome,
} from "./docs-screens";

/**
 * The local visual guard for a styling change: see `playwright.visual.config.ts`.
 *
 * Each test drives a screen with the documentation's own drivers and compares
 * the viewport against the baseline the last `bun run visual:baseline` wrote.
 * A missing baseline means the guard was not armed on this machine, which is the
 * normal state of CI, so the test skips rather than fails.
 *
 * Deliberately **not** here: anything whose pixels move with the song's clock.
 * A highway's notes, the piano roll, the progress bar and the stage's lights are
 * snapshots of a moment, not of a layout; they are covered by the behavioural
 * suite and by `play-style.spec.ts`. The charter's picker is the other one: its
 * list is read asynchronously and the read lands in different frames on different
 * runs, so the picture is of a moment in a load rather than of the screen. Its
 * layout is covered by the charter's own behavioural spec and by the capture.
 */

const SHOTS = fileURLToPath(new URL("../../.cache/visual", import.meta.url));

function guardArmed(project: string, name: string): boolean {
  return existsSync(join(SHOTS, project, `${name}.png`));
}

function shot(name: string): void {
  const info = test.info();
  // `--update-snapshots` is the run that writes the baseline; every other run
  // skips a shot that has none, so CI and a fresh checkout never fail on this.
  // Only "all" writes: Playwright's default is "missing", which would otherwise
  // write a baseline during a plain run and call it a failure.
  if (info.config.updateSnapshots === "all") return;
  const project = info.project.name;
  test.skip(!guardArmed(project, name), `no visual baseline for ${project}/${name}`);
}

/**
 * Let the page settle before the picture: the self-hosted faces swap in, and a
 * font that arrives a frame late would repaint every glyph and read as a layout
 * change. Two frames after `fonts.ready` also lets a queued style flush land.
 */
async function settle(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async () => {
    const frame = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await document.fonts.ready;
    // Let the screen's own first render land before asking what it is doing: a
    // library read starts a tick after the route does, and asking too early is
    // how a shot catches the "reading your library" state.
    await frame();
    // A screen that is still reading says so with `aria-busy`; the picture is
    // about the layout, not about which of the two states happened to be up.
    const busy = () => document.querySelector('[aria-busy="true"]');
    const until = performance.now() + 3_000;
    while (busy() && performance.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await frame();
  });
}

/** The guard's one call: decide whether to compare, then settle and compare. */
async function capture(
  page: import("@playwright/test").Page,
  name: string,
  maxDiffPixelRatio = 0.005,
): Promise<void> {
  shot(name);
  await settle(page);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio,
  });
}

test("welcome", async ({ context, page }) => {
  await captureWelcome(context, page);
  await capture(page, "welcome", 0.005);
});

test("menu", async ({ context, page }) => {
  await captureMenu(context, page);
  await capture(page, "menu", 0.005);
});

test("jukebox", async ({ context, page }) => {
  await captureJukebox(context, page);
  await capture(page, "jukebox", 0.005);
});

test("band setup", async ({ context, page }) => {
  await captureBandScreen(context, page);
  await capture(page, "band-setup", 0.005);
});

test("controller dialog", async ({ context, page }) => {
  await captureController(context, page);
  await capture(page, "controller", 0.005);
});

test("options", async ({ context, page }) => {
  await captureOptions(context, page);
  await capture(page, "options", 0.005);
});

test("playlists dialog", async ({ context, page }) => {
  await capturePlaylists(context, page);
  await capture(page, "playlists", 0.005);
});

test("import result", async ({ context, page }) => {
  await captureImport(context, page);
  await capture(page, "import", 0.005);
});

test("pause", async ({ context, page }) => {
  await capturePause(context, page);
  await capture(page, "pause", 0.01);
});

test("results", async ({ context, page }) => {
  await captureResults(context, page);
  await capture(page, "results", 0.01);
});

test("practice dialog", async ({ context, page }) => {
  await capturePracticeDialog(context, page);
  await capture(page, "practice", 0.01);
});

test("charter editor", async ({ context, page }) => {
  await captureCharterEditor(context, page);
  await capture(page, "charter-editor", 0.005);
});
