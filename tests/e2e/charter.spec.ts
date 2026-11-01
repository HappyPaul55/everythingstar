import { expect, test } from "./base";
import { SONG_TITLE, installFixtures } from "./fixture";

/**
 * The charter island, end to end: open the fixture song, add a note by hand,
 * record a take, create a chart and download a `.chart`.
 *
 * The fixture has no stems, so the clock is the frame loop and the test does not
 * wait on audio. Every external request is routed by `installFixtures`, including
 * the charter's own song and chart reads.
 */
test("opens a song, edits, records and downloads a Clone Hero chart", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await page.goto("/charter");

  await expect(page.locator(".charter-picker h1")).toHaveText("Chart editor");
  await page.getByRole("button", { name: new RegExp(SONG_TITLE) }).click();

  await expect(page.getByRole("heading", { name: SONG_TITLE })).toBeVisible();
  await expect(page.locator(".charter-pane")).toHaveCount(1);
  await expect(page.locator(".charter-pane__name")).toContainText(/guitar/i);
  await expect(page.locator(".charter-pane.is-active")).toContainText(/editing/i);

  // A click on empty highway adds one note and selects it. The inspector is the
  // keyboard-accessible way to change it afterwards.
  const body = page.locator(".charter-pane__body");
  const box = await body.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * 0.45, box!.y + box!.height * 0.4);
  await expect(page.locator(".charter-inspect__left")).toContainText("1 selected");
  await expect(page.locator(".charter-note-editor")).toBeVisible();
  // A note is a strum or a hopo; tapping is a controller behaviour, not a kind.
  await expect(
    page.locator(".charter-note-editor select").nth(1).locator("option"),
  ).toHaveText(["Strum", "Hopo"]);

  // Undo puts the note back to where it was.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".charter-inspect__left")).toContainText(
    "Click a note to select it",
  );

  // The record split button opens its two settings without taking a row of its own.
  await page.getByRole("button", { name: "Record options" }).click();
  const recordMenu = page.getByRole("group", { name: "Record options" });
  await expect(recordMenu).toContainText("Record with");
  await expect(recordMenu).toContainText("Record mode");
  await page.keyboard.press("Escape");
  await expect(recordMenu).toBeHidden();

  // Record a take with the game's own left-hand layout: a fret and a strum.
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.locator(".charter-recording")).toBeVisible();
  await page.keyboard.down("KeyA");
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(180);
  await page.keyboard.up("ArrowUp");
  await page.waitForTimeout(300);
  await page.keyboard.up("KeyA");
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.locator(".charter-inspect__status")).toContainText("notes added");

  // The chart list is the whole song, and a new chart can be made from it.
  await page.getByRole("button", { name: "Charts" }).click();
  const dialog = page.getByRole("dialog", { name: "Charts" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.locator(".charter-pane")).toHaveCount(2);
  await expect(page.locator(".charter-pane.is-active")).toContainText(/expert/i);

  // The download is a real file, written by the same writer the unit test reads
  // back through the game's `.chart` parser.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download .chart" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("tiny-test-song.chart");

  expect(leaked, "unexpected external requests").toEqual([]);
});
