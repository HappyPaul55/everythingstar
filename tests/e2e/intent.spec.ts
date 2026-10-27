import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { disableFullscreen, installFixtures } from "./fixture";

/**
 * `/open` end to end: a link asks before it changes anything, then stops being a
 * command.
 *
 * The fixture library is the seeded playlist; these tests add a second playlist and
 * a song document from a host of their own, so a press has something new to add and
 * the hermeticity check still sees every request answered.
 */

const PLAYLIST_URL = "https://links.test/playlist.json";
const LINKED_DOC_URL = "https://links.test/linked.json";
const PINNED_DOC_URL = "https://links.test/pinned.json";

const PLAYLIST = {
  schemaVersion: 1,
  name: "Link Fixtures",
  songs: [
    {
      id: "linked-song",
      song: "linked.json",
      title: "Linked Song",
      artist: { id: "link-artist", name: "Link Artist" },
      durationMs: 60_000,
      previewStartMs: 0,
      offer: {
        instruments: [{ role: "guitar", difficulties: ["easy"] }],
        voice: null,
      },
    },
  ],
};

function songDoc(id: string, title: string) {
  return {
    schemaVersion: 1,
    id,
    title,
    artist: { id: "link-artist", name: "Link Artist" },
    durationMs: 60_000,
    previewStartMs: 0,
    audio: { source: "stems", stems: [], mixPresets: {} },
    parts: [],
  };
}

async function routeLinks(context: BrowserContext): Promise<void> {
  const documents: Record<string, unknown> = {
    [PLAYLIST_URL]: PLAYLIST,
    [LINKED_DOC_URL]: songDoc("linked-song", "Linked Song"),
    [PINNED_DOC_URL]: songDoc("pinned-song", "Pinned Song"),
  };
  await context.route("https://links.test/**", async (route) => {
    const body = documents[route.request().url()];
    if (body === undefined) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(body),
    });
  });
}

/**
 * How long a link's question gets. The dialog is read after the welcome's warm-up
 * and the island's hydration, so it waits as long as the front door does.
 */
const ASK_TIMEOUT = 20_000;

/** Enter from the welcome: `/open` has no site header, so `enterGame` cannot help. */
async function enterFromWelcome(page: Page): Promise<void> {
  const enter = page.getByRole("button", { name: "Enter the stage" });
  await expect(enter).toBeEnabled({ timeout: 20_000 });
  await enter.click();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
}

test("a playlist link asks, adds on Add, and takes itself out of the address", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await routeLinks(context);
  await disableFullscreen(page);

  await page.goto(`/open?playlist=${encodeURIComponent(PLAYLIST_URL)}`);

  // The question is a dialog, not an automatic add: the host is what it names.
  const dialog = page.getByRole("dialog", { name: "Add this playlist?" });
  await expect(dialog).toBeVisible({ timeout: ASK_TIMEOUT });
  await expect(dialog.getByText("From links.test.")).toBeVisible();

  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  const added = page.getByRole("dialog", { name: "Added" });
  await expect(added.getByText("Link Fixtures added.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(added.getByText("one song")).toBeVisible();
  await added.getByRole("button", { name: "Close" }).last().click();

  // The command is gone: a reload asks nothing and the game is just the game.
  await expect(page).toHaveURL(/\/open$/);

  await enterFromWelcome(page);
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("button", { name: /Linked Song/ })).toBeVisible();

  // The playlist is a source like any other, with the URL that was added.
  await page.getByRole("button", { name: /^Playlists/ }).click();
  const lists = page.getByRole("dialog", { name: "Playlists" });
  await expect(lists.getByText("Link Fixtures")).toBeVisible();
  await expect(lists.getByText(PLAYLIST_URL)).toBeVisible();

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("Not now changes nothing, and a reload does not ask again", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await routeLinks(context);
  await disableFullscreen(page);

  await page.goto(`/open?playlist=${encodeURIComponent(PLAYLIST_URL)}`);
  const dialog = page.getByRole("dialog", { name: "Add this playlist?" });
  await expect(dialog).toBeVisible({ timeout: ASK_TIMEOUT });
  await dialog.getByRole("button", { name: "Not now" }).click();
  await expect(page).toHaveURL(/\/open$/);

  await page.reload();
  await expect(page.getByRole("button", { name: "Enter the stage" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("dialog")).toBeHidden();

  // And the library is exactly what it was: two fixture songs, no link playlist.
  await enterFromWelcome(page);
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await page.getByRole("button", { name: /^Playlists/ }).click();
  const lists = page.getByRole("dialog", { name: "Playlists" });
  await expect(lists.getByText("Link Fixtures")).toBeHidden();

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("an address that cannot be added is said, not fetched", async ({ context, page }) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);

  await page.goto(
    `/open?playlist=${encodeURIComponent("javascript:alert('no')")}`,
  );
  const dialog = page.getByRole("dialog", { name: "That link can't be added" });
  await expect(dialog).toBeVisible({ timeout: ASK_TIMEOUT });
  await expect(dialog.getByText(/full http/i)).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(page).toHaveURL(/\/open$/);

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("a song link is added as a song of its own, and can be removed", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await routeLinks(context);
  await disableFullscreen(page);

  await page.goto(`/open?song=${encodeURIComponent(PINNED_DOC_URL)}`);
  const dialog = page.getByRole("dialog", { name: "Add this song?" });
  await expect(dialog.getByText("From links.test.")).toBeVisible({
    timeout: ASK_TIMEOUT,
  });
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  const added = page.getByRole("dialog", { name: "Added" });
  await expect(added.getByText("Pinned Song added.")).toBeVisible({
    timeout: 15_000,
  });
  await added.getByRole("button", { name: "Close" }).last().click();
  await expect(page).toHaveURL(/\/open$/);

  await enterFromWelcome(page);
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("button", { name: /Pinned Song/ })).toBeVisible();

  // It is listed as a link of its own, with a way to forget it.
  await page.getByRole("button", { name: /^Playlists/ }).click();
  const lists = page.getByRole("dialog", { name: "Playlists" });
  await expect(lists.getByText("Songs from links")).toBeVisible();
  const pinned = lists
    .getByRole("listitem")
    .filter({ hasText: "Pinned Song" });
  await expect(pinned).toBeVisible();
  await pinned.getByRole("button", { name: "Remove" }).click();
  await expect(pinned).toBeHidden();

  expect(leaked, "unexpected external requests").toEqual([]);
});
