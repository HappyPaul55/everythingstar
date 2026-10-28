import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { SONG_TITLE, disableFullscreen, installFixtures } from "./fixture";
import { enterGame, openBand, startRun, waitForPlaying } from "./helpers";

/**
 * Critical and serious accessibility violations only.
 *
 * The house style is part of the design, so this is a gate for the things that
 * stop somebody using the screen rather than a warning list: a control with no
 * name, a missing landmark, a label that is not attached. Moderate findings
 * (for example a contrast preference that needs a design decision) are reported
 * in the ticket instead of being silently suppressed.
 *
 * The gate covers the paper pages as documents of their own, and the game's own
 * screens where they are reached: the welcome, the menu and its branches, the
 * jukebox and its Playlists dialog, the band screen, a run (the stage, then the
 * pause and the Practice dialog over it) and the results.
 */
async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
}

function describe(violations: Awaited<ReturnType<typeof seriousViolations>>): string {
  return violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n${violation.nodes
          .map((node) => `  ${node.target.join(" ")} — ${node.failureSummary ?? ""}`)
          .join("\n")}`,
    )
    .join("\n\n");
}

/**
 * The paper pages, each loaded on its own.
 *
 * They are plain Astro, so there is no screen machine to walk: the document is
 * the whole page and the audit is of exactly what a search or a link lands on.
 * The not-found page answers 404, which is still a document like any other.
 */
const PAPER_PAGES = [
  { path: "/", status: 200, name: "the landing page" },
  { path: "/privacy", status: 200, name: "the privacy page" },
  { path: "/docs", status: 200, name: "the documentation hub" },
  {
    path: "/docs/developers/architecture",
    status: 200,
    name: "a documentation page",
  },
  { path: "/404", status: 404, name: "the not-found page" },
];

for (const paper of PAPER_PAGES) {
  test(`${paper.name} has no critical or serious violations`, async ({
    context,
    page,
  }) => {
    const leaked = await installFixtures(context);
    const response = await page.goto(paper.path);
    expect(response?.status(), paper.path).toBe(paper.status);
    await expect(page.locator("#main")).toBeVisible();

    const violations = await seriousViolations(page);
    expect(describe(violations)).toBe("");

    expect(leaked, "unexpected external requests").toEqual([]);
  });
}

test("welcome, menu, songs, options and the Playlists dialog have no critical or serious violations", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);

  await page.goto("/play");
  const enter = page.getByRole("button", { name: "Enter the stage" });
  await expect(enter).toBeEnabled({ timeout: 20_000 });
  const welcome = await seriousViolations(page);
  expect(describe(welcome)).toBe("");

  await enter.click();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  const menu = await seriousViolations(page);
  expect(describe(menu)).toBe("");

  await page.getByRole("button", { name: /Options/ }).click();
  await expect(page.getByRole("heading", { name: "Options" })).toBeVisible();
  const options = await seriousViolations(page);
  expect(describe(options)).toBe("");

  await page.getByRole("button", { name: "Back to the menu" }).click();
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(SONG_TITLE) })).toBeVisible();
  const songs = await seriousViolations(page);
  expect(describe(songs)).toBe("");

  // The Playlists dialog is the jukebox's own `NativeDialog`: focus trap, Escape
  // and its opener are the product's, so it is audited in place rather than
  // through a test-only mount.
  await page.getByRole("button", { name: /^Playlists/ }).click();
  const playlists = page.getByRole("dialog", { name: "Playlists" });
  await expect(playlists).toBeVisible();
  const lists = await seriousViolations(page);
  expect(describe(lists)).toBe("");
  await page.keyboard.press("Escape");
  await expect(playlists).toBeHidden();

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("the band screen, the stage, the pause, Practice and the results have no critical or serious violations", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);
  await openBand(page, SONG_TITLE);

  const band = await seriousViolations(page);
  expect(describe(band)).toBe("");

  // Player 2 arrived as the words, which this song has no part for: one guitar is
  // the whole band, and its lane is the one that takes the keyboard.
  await startRun(page);

  // The stage is up only once the entrance has handed over; the highway is the
  // part of it a player actually reads.
  await waitForPlaying(page);
  await expect(page.getByRole("region", { name: "Player 1 — Guitar" })).toBeVisible();
  await expect(page.locator(".highway").first()).toBeVisible();
  const stage = await seriousViolations(page);
  expect(describe(stage)).toBe("");

  // The run is four seconds, so the pause is taken as soon as the stage has been
  // read rather than after it: Escape is the product's, and the dialog is what is
  // audited next.
  await page.keyboard.press("Escape");
  const pause = page.getByRole("dialog", { name: "Paused" });
  await expect(pause).toBeVisible();
  const paused = await seriousViolations(page);
  expect(describe(paused)).toBe("");

  // Practice is the second dialog a run opens, and it sits over the pause rather
  // than replacing it.
  await pause.getByRole("button", { name: "Practice", exact: true }).click();
  const practice = page.getByRole("dialog", { name: "Practice a stretch" });
  await expect(practice).toBeVisible();
  const practising = await seriousViolations(page);
  expect(describe(practising)).toBe("");
  await practice.getByRole("button", { name: "Cancel" }).click();

  // Resume, and the fixture's four seconds reach the results screen — the one
  // screen a run is read on, cards and history together.
  await pause.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({
    timeout: 20_000,
  });
  const results = await seriousViolations(page);
  expect(describe(results)).toBe("");

  expect(leaked, "unexpected external requests").toEqual([]);
});
