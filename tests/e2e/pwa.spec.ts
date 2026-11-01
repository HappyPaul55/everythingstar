import { expect, test } from "./base";
import { installFixtures } from "./fixture";

/**
 * The installed game, with the network taken away.
 *
 * This is the one test of the worker itself: the first visit registers it, the
 * install fills the shell cache, and a reload with no network still draws the
 * welcome. Everything outside the shell (the built-in playlist) is read from the
 * library cache, exactly as it is on a train.
 */
test("the shell starts with no network after one visit", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);

  await page.goto("/app");
  // The worker claims the page as it activates; only then is the shell in hand.
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker?.controller),
    undefined,
    { timeout: 45_000 },
  );

  const shell = await page.evaluate(async () => {
    const cacheName = (await caches.keys()).find((name) =>
      name.startsWith("everythingstar-shell-"),
    );
    if (!cacheName) return null;
    const cache = await caches.open(cacheName);
    const keys = (await cache.keys()).map((request) => new URL(request.url).pathname);
    return {
      name: cacheName,
      app: keys.includes("/app.html"),
      open: keys.includes("/open.html"),
      sounds: keys.includes("/audio/sounds.json"),
      cue: keys.some((key) => key.startsWith("/audio/click_")),
    };
  });

  expect(shell, "a shell cache exists").not.toBeNull();
  expect(shell?.app, "the app page is precached").toBe(true);
  expect(shell?.open, "the link entry is precached").toBe(true);
  expect(shell?.sounds, "the sound manifest is precached").toBe(true);
  expect(shell?.cue, "the cues are precached").toBe(true);
  expect(leaked, "unexpected external requests").toEqual([]);

  // No network at all: the reload has to come from Cache Storage.
  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole("button", { name: "Enter the stage" })).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole("button", { name: "Enter the stage" }).click();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();

  // The link entry is part of the same shell, so it opens offline too.
  await page.goto("/open");
  await expect(page.getByRole("button", { name: "Enter the stage" })).toBeVisible({
    timeout: 45_000,
  });
});
