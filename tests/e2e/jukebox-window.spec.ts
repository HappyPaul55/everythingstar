import { expect, test } from "@playwright/test";
import {
  BIG_SONG_COUNT,
  BIG_SONG_TITLES,
  bigSongId,
  disableFullscreen,
  installBigFixtures,
} from "./fixture";
import { enterGame } from "./helpers";

/**
 * The jukebox at a library's real size.
 *
 * A folder off this machine is not a playlist of a few hundred: 2,000 songs is
 * the number the windowed list exists for. This spec opens that library and
 * checks the four things a window can get wrong — the DOM stays bounded, the
 * bottom is still reachable, the A–Z index can reach a letter that was never
 * mounted, and focus crosses a window boundary with the arrows.
 *
 * The fixture is deterministic (see `fixture.ts`), and every assertion polls, so
 * nothing here depends on how many frames a scroll takes.
 */
test("windows a library of 2,000 songs", async ({ context, page }) => {
  const leaked = await installBigFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();

  const scroller = page.locator(".jukebox__scroller");
  const rows = scroller.locator(".song-row");

  // The list is built after the screen is up; the first row is the proof it has
  // arrived. Only a window of it is in the DOM.
  await expect(page.getByRole("button", { name: /A Song 001/ })).toBeVisible();
  await expect.poll(() => rows.count()).toBeLessThan(60);
  const opened = await rows.count();
  console.log(`window rows open: ${opened}`);
  // The last song is nowhere near the DOM at the top.
  const last = scroller.locator(
    `.song-row[data-song-id="${bigSongId(BIG_SONG_COUNT - 1)}"]`,
  );
  await expect(last).toHaveCount(0);

  // A row brought to the top by the arrows sits **below** the sticky letter
  // heading, not behind it: down past the viewport, then up across the boundary.
  const focusedId = () =>
    page.evaluate(() => document.activeElement?.getAttribute("data-song-id") ?? null);
  await expect.poll(focusedId).toBe(bigSongId(0));
  for (let step = 0; step < 30; step += 1) {
    await page.keyboard.press("ArrowDown");
    if ((await scroller.evaluate((element) => element.scrollTop)) > 0) break;
  }
  expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  let previousTop = await scroller.evaluate((element) => element.scrollTop);
  let scrolledBack = false;
  for (let step = 0; step < 40 && !scrolledBack; step += 1) {
    await page.keyboard.press("ArrowUp");
    const top = await scroller.evaluate((element) => element.scrollTop);
    scrolledBack = top < previousTop;
    previousTop = top;
  }
  expect(scrolledBack).toBe(true);
  const aboveHeading = await page.evaluate(() => {
    const box = document.querySelector<HTMLElement>(".jukebox__scroller");
    const row = document.activeElement;
    if (!box || !(row instanceof HTMLElement) || !row.matches(".song-row")) return null;
    const frame = box.getBoundingClientRect();
    // The heading in sight is the sticky one at the top of the scroller.
    const heading = [...box.querySelectorAll<HTMLElement>(".song-group__letter")]
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.bottom > frame.top + 1 && rect.top < frame.bottom)
      .sort((a, b) => a.top - b.top)[0];
    if (!heading) return null;
    return row.getBoundingClientRect().top - heading.bottom;
  });
  expect(aboveHeading).not.toBeNull();
  expect(aboveHeading ?? -1).toBeGreaterThanOrEqual(-1);

  // The bottom is the bottom of the whole list, not of the mounted slice. The
  // window mounts the last rows as the scroller arrives, which can grow the
  // content under the scrollbar for a frame; keep asking for the bottom until the
  // last row is actually inside the frame rather than trusting one write.
  await expect
    .poll(async () => {
      await scroller.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      if ((await last.count()) === 0) return false;
      return last.evaluate((row) => {
        const box = row.closest<HTMLElement>(".jukebox__scroller");
        if (!box) return false;
        const frame = box.getBoundingClientRect();
        const at = row.getBoundingClientRect();
        return at.top >= frame.top - 1 && at.bottom <= frame.bottom + 1;
      });
    })
    .toBe(true);
  // The list's own frame is the viewport that matters: `/play` keeps the site
  // header, so the scroller can be taller than the browser viewport even when the
  // last row is sitting on its floor. `toBeInViewport` would test the document,
  // not the list.
  await expect(last).toBeVisible();
  await expect(last.locator(".song-row__title")).toHaveText(
    BIG_SONG_TITLES[BIG_SONG_COUNT - 1],
  );
  await expect.poll(() => rows.count()).toBeLessThan(60);
  console.log(`window rows at the bottom: ${await rows.count()}`);

  // The index reaches a letter whose section was not mounted: click T and its
  // heading is at the top of the scroller, with T's songs under it.
  await page.getByRole("button", { name: "T", exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const box = document.querySelector<HTMLElement>(".jukebox__scroller");
        const header = [
          ...document.querySelectorAll<HTMLElement>(".song-group__letter"),
        ].find((node) => node.querySelector("span")?.textContent === "T");
        if (!box || !header) return false;
        return (
          Math.abs(header.getBoundingClientRect().top - box.getBoundingClientRect().top) <=
          2
        );
      }),
    )
    .toBe(true);

  const visibleTitles = await page.evaluate(() => {
    const box = document.querySelector<HTMLElement>(".jukebox__scroller");
    if (!box) return [];
    const rect = box.getBoundingClientRect();
    return [...box.querySelectorAll<HTMLElement>(".song-row")]
      .filter((row) => {
        const at = row.getBoundingClientRect();
        return at.bottom > rect.top + 2 && at.top < rect.bottom - 2;
      })
      .map(
        (row) =>
          row.querySelector<HTMLElement>(".song-row__title")?.textContent ?? "",
      );
  });
  expect(visibleTitles.length).toBeGreaterThan(2);
  expect(visibleTitles.every((title) => title.startsWith("T Song "))).toBe(true);

  // ArrowDown across the window: start near the bottom of what is visible and
  // keep going until the next row was *not* in the DOM before the press. The
  // press must mount it and put focus on it.
  const rendered = new Set(
    await rows.evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).dataset.songId ?? ""),
    ),
  );
  const start = await page.evaluate(() => {
    const box = document.querySelector<HTMLElement>(".jukebox__scroller");
    if (!box) return null;
    const rect = box.getBoundingClientRect();
    const inside = [...box.querySelectorAll<HTMLElement>(".song-row")].filter(
      (row) => {
        const at = row.getBoundingClientRect();
        return at.top >= rect.top && at.bottom <= rect.bottom;
      },
    );
    return inside.at(-1)?.dataset.songId ?? null;
  });
  expect(start).not.toBeNull();
  await page
    .locator(`.song-row[data-song-id="${start}"]`)
    .evaluate((element) => element.focus({ preventScroll: true }));

  let id = start ?? "";
  let crossed = false;
  for (let step = 0; step < 60 && !crossed; step += 1) {
    const nextIndex = Number(id.slice("big-".length)) + 1;
    expect(nextIndex).toBeLessThan(BIG_SONG_COUNT);
    const nextId = bigSongId(nextIndex);
    const mountedBefore = rendered.has(nextId);
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.activeElement?.getAttribute("data-song-id") ?? null,
        ),
      )
      .toBe(nextId);
    if (!mountedBefore) crossed = true;
    id = nextId;
  }
  expect(crossed).toBe(true);
  console.log(`window rows after the boundary: ${await rows.count()}`);

  // Tab is the same step inside the list, so the window cannot shorten the
  // browser's own order; it goes forwards and back without leaving the row.
  const tabNext = bigSongId(Number(id.slice("big-".length)) + 1);
  const focused = () =>
    page.evaluate(() => document.activeElement?.getAttribute("data-song-id") ?? null);
  await page.keyboard.press("Tab");
  await expect.poll(focused).toBe(tabNext);
  await page.keyboard.press("Shift+Tab");
  await expect.poll(focused).toBe(id);

  expect(leaked, "unexpected external requests").toEqual([]);
});
