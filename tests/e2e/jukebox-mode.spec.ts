import { expect, test, type BrowserContext, type Page } from "./base";
import { installDocsFixtures } from "./docs-library";
import { disableFullscreen } from "./fixture";
import { enterGame } from "./helpers";

/**
 * The Jukebox as a screen: a song plays through the one clock, its words follow,
 * the record turns only while the transport is moving, and the queue is only
 * what the listener chose.
 *
 * The docs library is the published FOSS one; only Code Monkey is given a tiny
 * master here, because the other fixtures are deliberately silent. Choosing it
 * by name is therefore both the way to get a song with sound and the way to get
 * one whose vocals chart gives the capture words.
 */
const CODE_MONKEY = "jonathan-coulton-code-monkey";

async function openJukebox(context: BrowserContext, page: Page) {
  await installDocsFixtures(context, {
    audioSongId: [CODE_MONKEY, "jonathan-coulton-ikea"],
  });
  await disableFullscreen(page);
  await enterGame(page, "/app");
  await page.getByRole("button", { name: /Jukebox/ }).click();
  await expect(page.getByRole("heading", { name: "Jukebox" })).toBeVisible();
}

/** Choose Code Monkey through the picker and play it now. */
async function playCodeMonkey(page: Page) {
  await page.getByRole("button", { name: "Pick a song" }).click();
  const picker = page.getByRole("dialog", { name: "Pick a song" });
  await expect(picker).toBeVisible();
  await picker.getByRole("searchbox", { name: "find a song" }).fill("Code Monkey");
  const row = picker.getByRole("button", { name: /Code Monkey/ }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await picker.getByRole("button", { name: "Play now" }).click();
  await expect(page.locator(".jukebox__title")).toHaveText("Code Monkey", {
    timeout: 20_000,
  });
}

test("the Jukebox plays a song with timed words and a turning record", async ({
  context,
  page,
}) => {
  await openJukebox(context, page);
  await playCodeMonkey(page);

  const record = page.locator(".jukebox__record");
  await expect(record).toHaveClass(/is-playing/);
  await expect(page.locator(".jukebox__line").first()).toBeVisible();
  await expect(page.locator(".jukebox__line.is-active")).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(record).not.toHaveClass(/is-playing/);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(record).toHaveClass(/is-playing/);
});

test("leaving the Jukebox and coming back resumes where the song was", async ({
  context,
  page,
}) => {
  await openJukebox(context, page);
  await playCodeMonkey(page);

  await expect(page.locator(".jukebox__time")).not.toHaveText(/^0:00/, {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Back to the menu" }).click();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  await page.getByRole("button", { name: /Jukebox/ }).click();
  await expect(page.locator(".jukebox__title")).toHaveText("Code Monkey", {
    timeout: 20_000,
  });
  await expect(page.locator(".jukebox__time")).not.toHaveText(/^0:00/, {
    timeout: 15_000,
  });
});

test("the queue is the listener's picks, and Next does not add fillers", async ({
  context,
  page,
}) => {
  await openJukebox(context, page);
  await playCodeMonkey(page);
  await page.getByRole("button", { name: "Pick a song" }).click();
  const picker = page.getByRole("dialog", { name: "Pick a song" });
  // The picker is a dialog over the player, not a pause: the record is still
  // turning while the listener chooses.
  await expect(page.locator(".jukebox__record")).toHaveClass(/is-playing/);
  await picker.getByRole("searchbox", { name: "find a song" }).fill("Ikea");
  const addRow = picker.getByRole("button", { name: /Ikea/ }).first();
  await expect(addRow).toBeVisible({ timeout: 20_000 });
  await addRow.click();
  await expect(addRow).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: "Add to queue" }).click();
  await expect(picker.locator(".jukebox__picker-status")).toContainText("Added to the queue");
  await picker.getByRole("button", { name: "Close" }).click();

  await expect(page.locator(".jukebox__queue-count")).toHaveText("1");
  await expect(page.locator(".jukebox__up-next-line")).toContainText("Ikea");

  // Next consumes the one queued song; the shuffle behind it is not queue.
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".jukebox__queue-count")).toHaveText("0", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".jukebox__queue-count")).toHaveText("0");
});
