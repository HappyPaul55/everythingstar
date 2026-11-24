import { expect, test } from "./base";
import { installFixtures, leaksFor } from "./fixture";

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
  await page.getByRole("button", { name: /play together/i }).click();
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
  await guest.locator(".join-seat").nth(1).click();

  await expect(page.getByRole("button", { name: /start the song/i })).toBeEnabled({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: /start the song/i }).click();

  await expect(guest.locator(".join-stage__hud")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Phone/).first()).toBeVisible();
  await expect(guest.getByText(/Run over|Results/i).first()).toBeVisible({
    timeout: 30_000,
  });
  expect(leaksFor(guestContext)).toEqual([]);
  await guestContext.close();
});
