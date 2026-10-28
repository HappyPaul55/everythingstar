import { expect, test } from "@playwright/test";
import {
  FIXTURE_NOTE_COUNT,
  disableFullscreen,
  installFixtures,
} from "./fixture";
import { waitForPlaying } from "./helpers";

/**
 * The arcade entry, left to play itself.
 *
 * `demo=1` is the same immediate start the homepage window uses, so the test does
 * not wait out the thirty-second idle. The fixture library is one tiny silent song
 * (the package beside it is deliberately not an attract candidate), which keeps the
 * pass short enough to reach the results screen.
 */
test("the arcade plays a perfect machine run and leaves the board alone", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await page.goto("/arcade?demo=1&sound=0");

  await waitForPlaying(page);
  await expect(page.getByRole("region", { name: "Player 1 — Guitar" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({
    timeout: 25_000,
  });
  const cards = page.getByRole("list", { name: "Players" });
  await expect(cards).toContainText(
    `${FIXTURE_NOTE_COUNT}/${FIXTURE_NOTE_COUNT} notes`,
  );

  // The demo is nobody's run: a machine score must not become the song's best.
  expect(
    await page.evaluate(() => localStorage.getItem("everythingstar:scores:v2")),
  ).toBeNull();
  expect(leaked, "unexpected external requests").toEqual([]);
});

/**
 * The homepage's window is one player, silent, and starts at once. It is an iframe
 * because the game owns its own document; the page around it keeps the marketing
 * shell and no JavaScript of its own.
 */
test("the homepage shows the live window and links it to the game", async ({
  context,
  page,
}) => {
  await installFixtures(context);
  const audioRequests: string[] = [];
  page.on("request", (request) => {
    if (/\.(?:ogg|mp3|m4a|opus|wav)(?:[?#]|$)/i.test(request.url())) {
      audioRequests.push(request.url());
    }
  });

  await page.goto("/");

  const window = page.locator('iframe[title="The EverythingStar stage, playing itself"]');
  await expect(window).toHaveAttribute(
    "src",
    /\/arcade\?players=1&sound=0&demo=1&chrome=0$/,
  );
  await expect(
    page.getByRole("link", { name: "Play EverythingStar" }).first(),
  ).toBeVisible();

  // The preview really runs (it is an iframe of the demo), and it is silent: no
  // song file is requested even after the demo has left its welcome.
  const frame = page.frameLocator(
    'iframe[title="The EverythingStar stage, playing itself"]',
  );
  await expect(frame.locator("html")).toHaveAttribute(
    "data-screen",
    /^(countdown|playing)$/,
    { timeout: 25_000 },
  );
  expect(audioRequests).toEqual([]);

  // The whole frame is a real link and the iframe under it is decoration: the
  // anchor is named, takes focus, and a keypress really goes to the game. That is
  // the browser-only half — the static document says the same thing, but only a
  // page can be focused and followed.
  await expect(window).toHaveAttribute("aria-hidden", "true");
  await expect(window).toHaveAttribute("tabindex", "-1");
  const frameLink = page.getByRole("link", { name: "Play EverythingStar" }).first();
  await expect(frameLink).toHaveAttribute("href", "/play");
  await frameLink.focus();
  await expect(frameLink).toBeFocused();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/play$/);
});
