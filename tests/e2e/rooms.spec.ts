import { expect, test } from "./base";
import { installFixtures, leaksFor } from "./fixture";
import { openBand } from "./helpers";

/**
 * A host on a desktop, a guest on a phone viewport, one fixture song.
 *
 * The relay is a real process (Playwright starts `server/bun.ts`). The host picks
 * the fixture song, the guest takes seat 2, the host starts, and both screens
 * reach the results. No audio device is involved: the fixture has no stems, so
 * the host's clock is the frame clock and the guest follows its playhead.
 */
test("a guest joins the host's room, plays and reaches the results", async ({
  page,
  browser,
}) => {
  await installFixtures(page.context());
  await page.goto("/play");
  await page.getByRole("button", { name: /enter the stage/i }).click();
  await openBand(page);
  // The fixture carries a guitar only; the remembered band's words box would be
  // a seat with nothing to play.
  await page.getByRole("button", { name: "Remove player 2" }).click();
  await page.getByRole("button", { name: /invite players/i }).click();
  await page.waitForSelector(".room__code");
  const code = (await page.locator(".room__code").first().textContent())?.trim() ?? "";
  expect(code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
  await expect(page.locator(".invite__qr svg")).toBeVisible();

  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  await installFixtures(guestContext);
  const guest = await guestContext.newPage();
  await guest.goto(`/join?room=${code}`);
  // The join form is a page of the site; entering the room is what hands the
  // viewport to the game surface.
  await expect(guest.locator("#site-header")).toBeVisible();
  await expect(guest.locator("body > footer")).toBeVisible();
  await guest.fill("#join-name", "Phone");
  await guest.getByRole("button", { name: /join the room/i }).click();
  await expect(guest.locator("#site-header")).toBeHidden();
  await expect(guest.locator("body > footer")).toBeHidden();
  await guest.locator(".join-seat").nth(1).click();

  // Close the invite modal; the room stays open, and the band's Play waits for
  // the phone's chart and readiness.
  await page.getByRole("button", { name: "Keep open", exact: true }).click();
  const play = page.getByRole("button", { name: "Play", exact: true });
  await expect(play).toHaveAttribute("aria-disabled", "false", { timeout: 20_000 });
  await play.click();

  await expect(guest.locator(".join-stage__hud")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Phone/).first()).toBeVisible();
  await expect(guest.getByText(/Run over|Results/i).first()).toBeVisible({
    timeout: 30_000,
  });
  expect(leaksFor(guestContext)).toEqual([]);
  await guestContext.close();
});

/**
 * The Jukebox's invitation: the same modal, a shared queue instead of seats.
 *
 * A phone opens the room's library, which carries only URL-addressable songs, and
 * adds one to the host's queue. The host's own Jukebox reads that queue, and the
 * phone can take its entry back out.
 */
test("a listener queues a room's song from the Jukebox", async ({ page, browser }) => {
  await installFixtures(page.context());
  await page.goto("/play");
  await page.getByRole("button", { name: /enter the stage/i }).click();
  await page.getByRole("button", { name: /Jukebox/ }).click();
  await expect(page.getByRole("heading", { name: "Jukebox" })).toBeVisible();
  await page.getByRole("button", { name: /invite listeners/i }).click();
  await page.waitForSelector(".room__code");
  const code = (await page.locator(".room__code").first().textContent())?.trim() ?? "";
  expect(code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);

  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  await installFixtures(guestContext);
  const guest = await guestContext.newPage();
  await guest.goto(`/join?room=${code}`);
  await guest.fill("#join-name", "Phone");
  await guest.getByRole("button", { name: /join the room/i }).click();
  await expect(guest.getByRole("heading", { name: /Listening together/i })).toBeVisible({
    timeout: 20_000,
  });

  const songs = guest.locator(".join-listen__song");
  await expect(songs.first()).toBeVisible({ timeout: 20_000 });
  // One of the two is already playing on the host, so the other is the one that
  // can enter the queue.
  for (const add of await songs.getByRole("button", { name: /^add$/i }).all()) {
    await add.click();
  }
  const count = page.locator(".jukebox__queue-count");
  await expect(count).not.toHaveText("0", { timeout: 20_000 });
  await expect(guest.locator(".join-listen__queue ol li").first()).toBeVisible({
    timeout: 20_000,
  });
  const queued = Number(await count.textContent());
  await guest.locator(".join-listen__queue ol li button").first().click();
  await expect(count).toHaveText(String(queued - 1), { timeout: 20_000 });

  expect(leaksFor(guestContext)).toEqual([]);
  await guestContext.close();
});
