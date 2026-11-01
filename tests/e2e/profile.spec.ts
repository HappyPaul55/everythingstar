import { expect, test, type Page } from "./base";
import { SONG_TITLE, disableFullscreen, installFixtures } from "./fixture";
import { enterGame } from "./helpers";

/**
 * A profile is four local records in one file — settings, band, board and hints —
 * and importing one replaces them, then reloads. That reload is the reason this is
 * a browser test: the setting has to come back from `localStorage` in a **new
 * document**, and IndexedDB has to be exactly as it was, because a profile carries
 * no library.
 *
 * The pure envelope is proved in `profile.test.ts`; this is the file input, the
 * confirmation and the reload.
 */

/** The library's own storage, as one comparable string: the sources and the cache. */
function libraryRecord(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open("everythingstar");
        request.onerror = () => reject(request.error?.message ?? "open failed");
        request.onsuccess = () => {
          const db = request.result;
          const stores = ["sources", "cache"].filter((name) =>
            db.objectStoreNames.contains(name),
          );
          if (stores.length < 2) {
            db.close();
            resolve("{}");
            return;
          }
          const transaction = db.transaction(stores, "readonly");
          const sources = transaction.objectStore("sources").get("playlists");
          const cached = transaction.objectStore("cache").count();
          transaction.oncomplete = () => {
            resolve(
              JSON.stringify({ sources: sources.result ?? null, cached: cached.result }),
            );
            db.close();
          };
          transaction.onerror = () =>
            reject(transaction.error?.message ?? "transaction failed");
        };
      }),
  );
}

/** A profile with one distinctive setting, one saved run and one taught seat. */
const PROFILE = JSON.stringify(
  {
    format: "everythingstar-profile",
    version: 1,
    exportedAt: Date.UTC(2026, 9, 28, 12),
    settings: { noteSpeed: 1.5 },
    band: { slots: [{ kind: "guitar", difficulty: "normal" }] },
    board: [
      {
        song: "tiny-test-song",
        title: "Tiny Test Song",
        failed: false,
        score: 1234,
        bestCombo: 9,
        hits: 8,
        misses: 1,
        players: [{ label: "Player 1 · Guitar", score: 1234, difficulty: "normal" }],
        at: Date.UTC(2026, 9, 28, 12),
      },
    ],
    onboarding: { seats: [0] },
  },
  null,
  2,
);

/** Enter the stage on the document that is already open (after the import's reload). */
async function reEnter(page: Page): Promise<void> {
  const enter = page.getByRole("button", { name: "Enter the stage" });
  await expect(enter).toBeEnabled({ timeout: 20_000 });
  await enter.click();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
}

test("importing a profile replaces the four records, reloads, and leaves the library alone", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  // Read the library once, so the jukebox has fetched and cached it before the
  // import. The profile must not change any of this.
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("button", { name: new RegExp(SONG_TITLE) })).toBeVisible();
  // The product's own Back, not Escape: the jukebox search keeps its Escape, and
  // which control has focus when this lands was a race the retry sometimes won.
  await page.getByRole("button", { name: "Back to the menu" }).click();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  const libraryBefore = await libraryRecord(page);

  await page.getByRole("button", { name: "Options" }).click();
  const speed = page.locator("#option-note-speed");
  await expect(speed).toHaveValue("1");

  // Cancelling the confirmation writes nothing: the file was read, the question was
  // asked, and the settings are still this browser's.
  await page.getByRole("button", { name: "Import profile" }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "profile.json", mimeType: "application/json", buffer: Buffer.from(PROFILE) });
  await expect(
    page.getByText("Replace this browser's settings, band, scores and hints?"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByText("Replace this browser's settings, band, scores and hints?"),
  ).toBeHidden();
  await expect(speed).toHaveValue("1");

  // Now replace. The page reloads, so the next assertions are a new document — the
  // one that has to have read the records back.
  await page.getByRole("button", { name: "Import profile" }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "profile.json", mimeType: "application/json", buffer: Buffer.from(PROFILE) });
  const question = page.getByText(
    "Replace this browser's settings, band, scores and hints?",
  );
  await expect(question).toBeVisible();
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Replace", exact: true }).click(),
  ]);

  await reEnter(page);
  await page.getByRole("button", { name: "Options" }).click();
  await expect(page.locator("#option-note-speed")).toHaveValue("1.5");

  // The records really are the file's: the setting, the board and the hints.
  const stored = await page.evaluate(() => ({
    settings: JSON.parse(localStorage.getItem("everythingstar:settings") ?? "null"),
    scores: JSON.parse(localStorage.getItem("everythingstar:scores:v2") ?? "null"),
    onboarding: JSON.parse(localStorage.getItem("everythingstar:onboarding") ?? "null"),
  }));
  expect(stored.settings?.noteSpeed).toBe(1.5);
  expect(stored.scores).toHaveLength(1);
  expect(stored.scores?.[0]?.score).toBe(1234);
  expect(stored.onboarding?.seats).toEqual([0]);

  // And the library is untouched: a profile carries none of it.
  expect(await libraryRecord(page)).toBe(libraryBefore);

  expect(leaked, "unexpected external requests").toEqual([]);
});
