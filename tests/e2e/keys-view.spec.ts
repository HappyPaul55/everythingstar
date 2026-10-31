import { expect, test } from "@playwright/test";
import { DUET_TITLE, WORDS_TITLE, installKeysFixtures } from "./docs-charts";
import { disableFullscreen } from "./fixture";
import { enterGame, waitForPlaying, waitForStage } from "./helpers";

/**
 * What the keys view shows for each kind of song.
 *
 * A song that carries pitch (a `vocals` chart) puts the words on the roll's own
 * layer: one strip per part, placed at its own moment, and the roll's single
 * transform carries the words with the bars. A song whose words carry no pitch
 * (a `lyrics` chart) keeps the static lyrics view, with no roll at all. The
 * fixture answers the seeded playlist URL, like every other spec, and lives in
 * `docs-charts.ts` because the documentation's duet capture is a picture of
 * this same song.
 */

test("a pitched song puts the words on the roll's own layer, sliding with the bars", async ({
  context,
  page,
}) => {
  const leaked = await installKeysFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(DUET_TITLE) }).click();
  await page.getByRole("button", { name: "Next: your band" }).click();
  await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await waitForStage(page);
  await waitForPlaying(page);

  const keys = page.locator(".melody .keys");
  await expect(keys).toBeVisible();
  // The words live on the roll's translated layer, one strip per part.
  const lines = page.locator(".keys__track .keys__line");
  expect(await lines.count()).toBeGreaterThan(0);
  expect(await page.locator(".keys__line.is-part-0").count()).toBeGreaterThan(0);
  expect(await page.locator(".keys__line.is-part-1").count()).toBeGreaterThan(0);

  // Give the first line its own moment, so the window carries lines two and
  // three on screen at once.
  await page.waitForTimeout(2_500);

  // A line both parts sing appears in both rows, and a line one part sings is
  // on that part's row alone.
  await expect(
    page.locator(".keys__line.is-part-0", { hasText: "Electric" }),
  ).toBeVisible();
  await expect(
    page.locator(".keys__line.is-part-1", { hasText: "Electric" }),
  ).toBeVisible();
  await expect(page.locator(".keys__line.is-part-0", { hasText: "Stay" })).toBeVisible();
  expect(await page.locator(".keys__line.is-part-1", { hasText: "Stay" }).count()).toBe(0);

  // The point of the layout: the words are on the roll's translated layer,
  // **below every bar**, and the track's one transform carries both.
  const geometry = () =>
    page.evaluate(() => {
      const track = document.querySelector<HTMLElement>(".keys__track");
      const lines = Array.from(document.querySelectorAll<HTMLElement>(".keys__line"));
      const notes = Array.from(document.querySelectorAll<HTMLElement>(".keys__note"));
      const at = (element: Element) => element.getBoundingClientRect();
      return {
        linesInTrack: lines.every((line) => line.closest(".keys__track") === track),
        notesInTrack: notes.every((note) => note.closest(".keys__track") === track),
        linesTop: Math.min(...lines.map((line) => at(line).top)),
        notesBottom: Math.max(...notes.map((note) => at(note).bottom)),
        track: getComputedStyle(track!).transform,
        lineLeft: lines[0] ? at(lines[0]).left : -1,
        noteLeft: notes[0] ? at(notes[0]).left : -1,
      };
    });

  const before = await geometry();
  expect(before.linesInTrack, "the words are inside the roll's track").toBe(true);
  expect(before.notesInTrack, "the notes are inside the roll's track").toBe(true);
  expect(before.linesTop, "the words are under every bar").toBeGreaterThan(
    before.notesBottom,
  );

  await page.waitForTimeout(700);
  const after = await geometry();
  expect(after.track).not.toBe(before.track);
  const lineMove = before.lineLeft - after.lineLeft;
  const noteMove = before.noteLeft - after.noteLeft;
  expect(lineMove).toBeGreaterThan(0);
  expect(Math.abs(lineMove - noteMove)).toBeLessThanOrEqual(1);

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("a words-only song keeps the static lyrics view, with no roll", async ({
  context,
  page,
}) => {
  const leaked = await installKeysFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(WORDS_TITLE) }).click();
  await page.getByRole("button", { name: "Next: your band" }).click();
  await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await waitForStage(page);
  await waitForPlaying(page);

  await expect(page.locator(".melody .lyrics-view")).toBeVisible();
  await expect(page.locator(".melody .keys")).toHaveCount(0);
  await expect(page.locator(".lyrics-view__word").first()).toBeVisible();

  // With no roll there is no axis to ride: the words stay where they are.
  const wordLeft = () =>
    page.evaluate(
      () =>
        document.querySelector<HTMLElement>(".lyrics-view__word")?.getBoundingClientRect()
          .left ?? -1,
    );
  const before = await wordLeft();
  await page.waitForTimeout(500);
  expect(await wordLeft()).toBe(before);

  expect(leaked, "unexpected external requests").toEqual([]);
});
