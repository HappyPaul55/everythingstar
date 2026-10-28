import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { SONG_TITLE, disableFullscreen, installFixtures } from "./fixture";
import { enterGame, openBand, startRun, waitForPlaying } from "./helpers";

/**
 * The brag card, end to end.
 *
 * It is a Blob and a file download: the preview is an `<img>` over an object URL and
 * the poster is saved through the browser's own download path, which no unit test
 * can see. The pure SVG is proved in `bragCard.test.ts`; this is the one press, the
 * picture and the saved file.
 */
test("a kept run offers a brag card, previews it and downloads the SVG", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  // A real run with a real score: the fixture's second guitar is the machine's, so
  // the band lands notes and the board keeps the run.
  await openBand(page, SONG_TITLE);
  await startRun(page, "twoGuitars");
  await waitForPlaying(page);
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({
    timeout: 20_000,
  });

  const opener = page.getByRole("button", { name: "Brag card" });
  await expect(opener).toBeVisible();
  await expect(opener).toHaveAttribute("aria-haspopup", "dialog");
  await opener.click();

  const dialog = page.getByRole("dialog", { name: "Brag card" });
  await expect(dialog).toBeVisible();

  // The preview is the card itself, as an image over a Blob — never markup.
  const preview = dialog.getByRole("img");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("src", /^blob:/);
  await expect(preview).toHaveAttribute("width", "1200");
  await expect(preview).toHaveAttribute("height", "630");

  // Download saves the same document. The browser event is the only proof the file
  // really left the page, so the downloaded bytes are read back.
  const saving = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download" }).click();
  const download = await saving;
  expect(download.suggestedFilename()).toMatch(/^everythingstar-brag-.*\.svg$/);
  const file = await download.path();
  expect(file).not.toBeNull();
  const svg = readFileSync(file as string, "utf8");
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg).toContain(`width="1200" height="630"`);
  // The song's own title, XML-escaped by the builder, and the run's band.
  expect(svg).toContain(SONG_TITLE);
  expect(svg).toContain("ON STAGE");

  // Escape is close, and the dialog gives its opener back — the game's own modal
  // behaviour, unchanged by the card.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  expect(leaked, "unexpected external requests").toEqual([]);
});
