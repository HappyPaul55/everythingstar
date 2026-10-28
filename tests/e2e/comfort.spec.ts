import { expect, test } from "@playwright/test";
import { SONG_TITLE, disableFullscreen, installFixtures } from "./fixture";
import {
  enterGame,
  installGamepad,
  startRun,
  waitForPlaying,
} from "./helpers";

/**
 * The two comforts, in a real browser.
 *
 * A unit test can hold the rules — the gap between buzzes, the screens that want a
 * wake lock — but only a page can say the rules are **wired**: the run asks the
 * browser for a lock, a pause lets it go, and a miss actually reaches the device
 * and the pad in that player's hands.
 *
 * Everything is stubbed **before the page's own scripts run** (or on the fake pad
 * the game polls), so the product has no test-only path: it asks
 * `navigator.wakeLock` and `navigator.vibrate` exactly as it does in a player's
 * browser, and the fixture is the same four-second song every other spec plays.
 */
interface ComfortWindow extends Window {
  __wakeLock?: {
    requested: string[];
    released: number;
    active: boolean;
  };
  __buzzes?: (number | number[])[];
  __rumbles?: { effect: string; duration: number }[];
  __testPad?: {
    vibrationActuator?: {
      playEffect: (effect: string, params?: { duration?: number }) => Promise<string>;
    };
  };
}

test("a run holds the screen awake, a pause lets it go, and a resume asks again", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await page.addInitScript(() => {
    const log = {
      requested: [] as string[],
      released: 0,
      active: false,
    };
    (window as ComfortWindow).__wakeLock = log;
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async (type: string) => {
          log.requested.push(type);
          log.active = true;
          const sentinel = {
            released: false,
            type,
            addEventListener() {},
            removeEventListener() {},
            release: async () => {
              if (sentinel.released) return;
              sentinel.released = true;
              log.active = false;
              log.released += 1;
            },
          };
          return sentinel;
        },
      },
    });
  });
  await enterGame(page);
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await page.getByRole("button", { name: new RegExp(SONG_TITLE) }).click();
  await page.getByRole("button", { name: "Next: your band" }).click();
  await startRun(page, "one");
  await waitForPlaying(page);

  // The countdown asked for the screen, and the song kept it rather than dropping
  // and re-taking it as the entrance handed over.
  await expect
    .poll(() => page.evaluate(() => (window as ComfortWindow).__wakeLock?.requested))
    .toContain("screen");
  expect(await page.evaluate(() => (window as ComfortWindow).__wakeLock?.active)).toBe(
    true,
  );

  // A pause is not a song: the display may sleep.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as ComfortWindow).__wakeLock?.released ?? 0))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as ComfortWindow).__wakeLock?.active)).toBe(
    false,
  );

  // Resuming asks again, because the song is moving again.
  await page
    .getByRole("dialog", { name: "Paused" })
    .getByRole("button", { name: "Resume" })
    .click();
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as ComfortWindow).__wakeLock?.requested.length ?? 0,
      ),
    )
    .toBeGreaterThan(1);
  expect(await page.evaluate(() => (window as ComfortWindow).__wakeLock?.active)).toBe(
    true,
  );

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("a miss reaches the device and the pad that seat is holding", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await installGamepad(page);
  await page.addInitScript(() => {
    (window as ComfortWindow).__buzzes = [];
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (pattern: number | number[]) => {
        (window as ComfortWindow).__buzzes?.push(pattern);
        return true;
      },
    });
  });
  await enterGame(page);

  // The fake pad is the game's own polled device, so it is given a real actuator
  // here — the browser has no motor to stub, but the shape is the standard one.
  await page.evaluate(() => {
    const win = window as ComfortWindow;
    win.__rumbles = [];
    const pad = win.__testPad;
    if (!pad) return;
    pad.vibrationActuator = {
      playEffect: async (effect, params) => {
        win.__rumbles?.push({ effect, duration: params?.duration ?? 0 });
        return "complete";
      },
    };
  });

  await page.getByRole("button", { name: /Quick Play/ }).click();
  await page.getByRole("button", { name: new RegExp(SONG_TITLE) }).click();
  await page.getByRole("button", { name: "Next: your band" }).click();
  // One player, and the connected pad is theirs: the run then misses every note
  // it is never played, which is the fixture's own four seconds.
  await startRun(page, "one");
  await waitForPlaying(page);

  await expect
    .poll(() => page.evaluate(() => (window as ComfortWindow).__buzzes?.length ?? 0), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => (window as ComfortWindow).__rumbles?.length ?? 0), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);

  const first = await page.evaluate(
    () => (window as ComfortWindow).__buzzes?.[0],
  );
  expect(Array.isArray(first) ? first.length : 0).toBeGreaterThan(0);
  const rumble = await page.evaluate(
    () => (window as ComfortWindow).__rumbles?.[0],
  );
  expect(rumble?.effect).toBe("dual-rumble");

  expect(leaked, "unexpected external requests").toEqual([]);
});
