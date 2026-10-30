import { expect, type Page } from "@playwright/test";

/**
 * The game's own front door: wait for the mixer to warm, enter, and land on the
 * menu. Every spec starts here, so the welcome's loading gate is exercised once
 * in one place.
 */
export async function enterGame(page: Page, path = "/play"): Promise<void> {
  await page.goto(path);
  const enter = page.getByRole("button", { name: "Enter the stage" });
  await expect(enter).toBeEnabled({ timeout: 20_000 });
  await enter.click();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
}

/**
 * Wait for the stage's entrance (the screen machine's `countdown`).
 *
 * There is no 3-2-1 overlay any more: the stage slides in with the band's hype, so
 * the screen attribute is the only reliable signal that the run is arriving.
 */
export async function waitForStage(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute(
    "data-screen",
    /^(countdown|playing)$/,
    { timeout: 20_000 },
  );
}

/** Wait until the entrance has handed over and the song is actually running. */
export async function waitForPlaying(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-screen", "playing", {
    timeout: 20_000,
  });
}

/**
 * Pick the song and carry it to the band screen.
 *
 * `song` is a title fragment. Omit it to take whatever the jukebox offers — the
 * first row — which is what a player who presses Next without picking does. A
 * spec that needs to read the row (the now-playing slot, the artist) clicks it
 * itself and then calls `startRun`.
 */
export async function openBand(page: Page, song?: string): Promise<void> {
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  if (song) await page.getByRole("button", { name: new RegExp(song) }).click();
  await page.getByRole("button", { name: "Next: your band" }).click();
  await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();
}

/** Who is on stage when the run starts. */
export type RunSeats = "one" | "twoGuitars" | "listen";

/**
 * Take the band screen to a run: one player, two guitars (the second played by
 * the machine), or Listen with nobody. It stops at the stage's entrance; a spec
 * that needs the song moving waits for `playing` itself.
 */
export async function startRun(page: Page, seats: RunSeats = "one"): Promise<void> {
  await page.getByRole("button", { name: "Remove player 2" }).click();
  if (seats === "twoGuitars") {
    await page.getByRole("button", { name: /Player 2 .*join the band/ }).click();
  }
  if (seats === "listen") {
    await page.getByRole("button", { name: "Remove player 1" }).click();
    await page.getByRole("button", { name: "Listen", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Play", exact: true }).click();
  }
  await waitForStage(page);
}

/**
 * A capture answered every request it made.
 *
 * The fixture routes the seeded library and aborts everything else, so this is
 * how a capture says "the screen is the game's, not the network's". It lives
 * here rather than in each fence because it is a property of every capture, not
 * a step of the screen being documented.
 *
 * `@public` — read by the capture helpers, which the docs fences call.
 */
export function expectNoExternalRequests(leaked: string[]): void {
  expect(leaked, "the capture made an unexpected external request").toEqual([]);
}

/**
 * The documentation captures' front door.
 *
 * `installDocsFixtures` serves the published FOSS library, and Code Monkey is
 * the one song in it with guitar, bass and drums as well as vocals — so a
 * capture can show a lone highway, a whole band, or a singer without three
 * different songs in the screenshots.
 *
 * `@public` — read by the capture fences in `docs/`, which are Markdown.
 */
export async function openDocsBand(page: Page, title = /Code Monkey/): Promise<void> {
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await page.getByRole("button", { name: title }).first().click();
  await page.getByRole("button", { name: "Next: your band" }).click();
  await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();
}

/** Exactly `count` seats: the extras leave, then the band grows to fill the row.
 *  `@public` — a capture fence in `docs/` is its only caller. */
export async function seatPlayers(page: Page, count: number): Promise<void> {
  // A box is `li.slot` whether somebody is in it or not: the filled ones carry
  // the remove cross, the empty ones the join button.
  const filled = page.locator(".slot:has(.slot__remove)");
  while ((await filled.count()) > count) {
    await filled.last().getByRole("button", { name: /^Remove player/ }).click();
  }
  while ((await filled.count()) < count) {
    await page
      .locator(".slot:has(.slot__join)")
      .first()
      .getByRole("button", { name: /join the band/ })
      .click();
  }
}

/** What one seat takes. The button carries the instrument's own label.
 *  `@public` — a capture fence in `docs/` is its only caller. */
export async function setSlot(page: Page, player: number, instrument: string): Promise<void> {
  const slot = page.locator(".slot").nth(player - 1);
  await slot.getByRole("button", { name: instrument, exact: true }).click();
}

/**
 * Play, then stop once the stage has settled.
 *
 * A capture of a run is a capture of a moment, and the moment worth showing is
 * just after the entrance: the highway is on screen and there are notes above
 * the hit line. The frame clock is the only clock (the fixture has no stems), so
 * this is a beat of the run rather than a seek — `Practice` is the product's own
 * way to a later stretch when a capture needs one.
 *
 * `@public` — a capture fence in `docs/` is its only caller.
 */
export async function startDocsRun(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await waitForStage(page);
  await waitForPlaying(page);
  await page.waitForTimeout(1_500);
}

/** The shape the game polls, so the fake is a gamepad and not a second interface. */
interface FakePad {
  id: string;
  index: number;
  connected: boolean;
  mapping: string;
  timestamp: number;
  axes: number[];
  buttons: { pressed: boolean; touched: boolean; value: number }[];
}

/** Where the fake pad is parked on the page, so a press can find it again. */
interface PadWindow extends Window {
  __testPad?: FakePad;
}

/**
 * A standard gamepad the page can see.
 *
 * The browser's gamepad API is a **poll**, not an event: `navigator.getGamepads()`
 * returns a snapshot whenever the game asks, so a test cannot press a real button.
 * This installs one mutable pad before the page's own scripts run — the game then
 * reads it on its frame loop exactly as it reads a pad somebody is holding, with
 * no test-only path in the product.
 *
 * The button indices are the standard mapping `uiPad.ts` reads: A is 0, B is 1,
 * Start is 9, the shoulders 4 and 5, and the D-pad 12–15.
 */
export async function installGamepad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    const pad = {
      id: "EverythingStar test pad",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons,
    };
    (window as PadWindow).__testPad = pad;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [pad],
    });
  });
}

/**
 * Press and release one button of the fake pad.
 *
 * The press has to survive a frame before it is an **edge** (the game compares
 * this poll with the last) and another before the release is one, so the whole
 * gesture is spread over a couple of animation frames rather than written and
 * undone in the same tick.
 */
export async function pressPadButton(page: Page, index: number): Promise<void> {
  await page.evaluate(async (button) => {
    const pad = (window as PadWindow).__testPad;
    const target = pad?.buttons[button];
    if (!pad || !target) return;
    const frame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const set = (down: boolean) => {
      target.pressed = down;
      target.touched = down;
      target.value = down ? 1 : 0;
      pad.timestamp = performance.now();
    };
    set(true);
    await frame();
    await frame();
    set(false);
    await frame();
    await frame();
  }, index);
}
