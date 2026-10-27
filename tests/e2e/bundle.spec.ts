import { expect, test, type Page } from "@playwright/test";
import { SONG_TITLE, disableFullscreen, installFixtures } from "./fixture";
import { enterGame } from "./helpers";

/**
 * What the first download is allowed to contain.
 *
 * The build keeps the source translators and the rarely opened dialogs in their own
 * chunks. `scripts/check-budget.ts` guards the built graph; this test guards the
 * development module graph, where a new static import is visible immediately: the
 * parser modules are only fetched when a local folder or a package is read, so
 * browsing the JSON library must not request any of them.
 *
 * The dialog checks are the other half: a lazy dialog still has to open as a native
 * `<dialog>` and give its opener back on Escape, because it arrives after the press
 * rather than during it.
 */
/** The modules the page has requested, as the browser's resource timing saw them. */
function resourceNames(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
}

/**
 * The modules in `sources/` that the first download already contains.
 *
 * The readers are reached only through the lazy `parse.ts`, but the library's own
 * seam statically imports the small helpers around them: text decoding and the
 * file-name table, the `.sng` name table, the duration estimate and the writer that
 * turns a source into documents. Those are not translators and have always been
 * in `/play`'s graph. Every other module under `sources/` is a reader, so a
 * reader here is a leak — and a new one is watched without touching this list.
 */
const FIRST_DOWNLOAD_HELPERS = new Set([
  "bytes.ts",
  "duration.ts",
  "files.ts",
  "ini.ts",
  "sngNames.ts",
  "write.ts",
]);

/** The source translators among those modules. */
function parserRequests(names: string[]): string[] {
  return names.filter((name) => {
    const module = /\/src\/lib\/game\/sources\/([\w.-]+\.ts)(?:[?#]|$)/.exec(name)?.[1];
    return module !== undefined && !FIRST_DOWNLOAD_HELPERS.has(module);
  });
}

test("the source parsers are not fetched while the JSON library is browsed", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  // Only the Vite dev server serves the app as `/src/` modules, and only there is
  // "no parser was requested" a fact about the page. `reuseExistingServer` can
  // adopt a preview build on the same port, where no source module is fetched at
  // all and the empty list would say nothing.
  const served = await resourceNames(page);
  expect(
    served.some((name) => /\/src\//.test(name)),
    "the page is on the Vite dev server",
  ).toBe(true);

  // The welcome, the menu and the jukebox all run without a translator.
  expect(parserRequests(served)).toEqual([]);

  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(SONG_TITLE) })).toBeVisible();
  await expect(page.getByRole("button", { name: /Next: your band/ })).toBeVisible();

  expect(parserRequests(await resourceNames(page))).toEqual([]);
  expect(leaked, "unexpected external requests").toEqual([]);
});

test("the Playlists dialog is lazy, native, and gives its button back", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();

  const opener = page.getByRole("button", { name: /Playlists/ });
  await expect(opener).toHaveAttribute("aria-haspopup", "dialog");
  await opener.click();

  const dialog = page.getByRole("dialog", { name: "Playlists" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Songs come from playlists")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  expect(leaked, "unexpected external requests").toEqual([]);
});
