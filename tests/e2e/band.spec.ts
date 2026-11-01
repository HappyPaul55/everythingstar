import { expect, test, type Page } from "./base";
import { SONG_TITLE, disableFullscreen, installFixtures } from "./fixture";
import { enterGame } from "./helpers";

/**
 * The band screen's boxes, at the two sizes that lay them out differently.
 *
 * A phone cannot hold a box the width of half its screen and still say what the
 * box is for, so it draws **one box a row** — and stops at the first row of four,
 * because eight full-width boxes is a page of pickers before the Play button and a
 * phone is not going to have eight players. The desk still gets four a row and the
 * offer of a second row. Computed geometry is the guard: a grid template being
 * present proves nothing about what the browser did with it.
 */

/** The band screen for the fixture song. */
async function toBand(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await page.getByRole("button", { name: new RegExp(SONG_TITLE) }).click();
  await page.getByRole("button", { name: "Next: your band" }).click();
  await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();
}

/** Fill every empty box, which is what makes the second row an offer. */
async function fillFirstRow(page: Page): Promise<void> {
  for (let seat = 0; seat < 4; seat += 1) {
    const join = page.locator(".screen--band .slot__join");
    if ((await join.count()) === 0) break;
    await join.first().click();
  }
  await expect(page.locator(".screen--band .slot__join")).toHaveCount(0);
}

/** How many tracks a computed grid template resolved to. */
async function gridTracks(
  page: Page,
  selector: string,
): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length,
    );
}

test("a phone draws the band one box a row, and offers no second row", async ({
  context,
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);
  await toBand(page);

  // The first row is all a phone offers: four boxes, no offer of four more.
  await expect(page.locator(".screen--band .slot")).toHaveCount(4);

  // A box fills the screen's width, and the next one stands **below** it rather
  // than beside it. The pickers inside it get two tiles a row in the width that
  // gives them.
  const boxes = await page.locator(".screen--band .slot").evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        top: Math.round(box.top),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    }),
  );
  expect(boxes).toHaveLength(4);
  expect(boxes[0].left).toBe(boxes[1].left);
  expect(boxes[1].top).toBeGreaterThanOrEqual(boxes[0].top + boxes[0].height);
  expect(boxes[0].width).toBeGreaterThan(300);
  expect(await gridTracks(page, ".screen--band .slot__kinds")).toBe(2);

  // Filling the row is the only way the offer could appear, so the absence after
  // filling it is the phone's rule rather than an empty band.
  await fillFirstRow(page);
  await expect(page.getByRole("button", { name: "Add more players" })).toHaveCount(0);
  await expect(page.locator(".screen--band .slot")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("a wide screen keeps four boxes a row and offers the second", async ({
  context,
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);
  await toBand(page);

  const first = await page
    .locator(".screen--band .slot")
    .first()
    .evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { left: Math.round(box.left), top: Math.round(box.top) };
    });
  const second = await page
    .locator(".screen--band .slot")
    .nth(1)
    .evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { left: Math.round(box.left), top: Math.round(box.top) };
    });
  expect(second.left).toBeGreaterThan(first.left + 50);
  expect(second.top).toBe(first.top);

  await fillFirstRow(page);
  const more = page.getByRole("button", { name: "Add more players" });
  await expect(more).toBeVisible();
  await more.click();
  await expect(page.locator(".screen--band .slot")).toHaveCount(8);
});
