import { expect, test } from "./base";
import { disableFullscreen, installFixtures } from "./fixture";
import { enterGame } from "./helpers";

/**
 * The branches off the menu, and the rule that Escape is "back".
 *
 * These are round trips nothing else in the loop knows about, and they are the
 * part most likely to regress: a branch that can get somewhere else, or a key
 * that stops going back one step.
 */
test("visits options and credits, and Escape goes back a step", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  const menu = page.getByRole("navigation", { name: "Main menu" });

  // Options, out with the page's own Back button.
  await page.getByRole("button", { name: /Options/ }).click();
  await expect(page.getByRole("heading", { name: "Options" })).toBeVisible();
  await expect(page.getByText("Audio lag", { exact: true })).toBeVisible();
  // The comfort controls are real labelled sliders, and their defaults are the
  // settings' own — the page and the store cannot drift apart.
  await expect(page.getByRole("slider", { name: "Note speed" })).toHaveValue("1");
  await expect(page.getByRole("slider", { name: "Backdrop dim" })).toHaveValue("0");
  await expect(page.getByRole("group", { name: "Drifting lights" })).toBeVisible();
  // The room under a song has a toggle of its own, and it starts on.
  const crowd = page.getByRole("group", { name: "Crowd" });
  await expect(crowd).toBeVisible();
  await expect(crowd.getByRole("button", { name: "On", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await crowd.getByRole("button", { name: "Off", exact: true }).click();
  await expect(crowd.getByRole("button", { name: "Off", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await crowd.getByRole("button", { name: "On", exact: true }).click();
  await page.getByRole("button", { name: "Back to the menu" }).click();
  await expect(menu).toBeVisible();
  await expect(page.getByRole("button", { name: /Options/ })).toBeFocused();

  // Credits, out with Escape.
  await page.getByRole("button", { name: /Credits/ }).click();
  await expect(page.getByRole("heading", { name: "Credits" })).toBeVisible();
  await expect(page.getByText("the fonts", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeVisible();
  await expect(page.getByRole("button", { name: /Credits/ })).toBeFocused();

  // And on the menu itself Escape is the way back to the welcome.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Enter the stage" })).toBeVisible();
  await expect(menu).toBeHidden();

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("a screen left before its focus frame still gives its button back", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  // Hold the placement frame. A screen that is **left** before its
  // `requestAnimationFrame` must still count as the screen the return came from, or
  // the menu has nothing to put focus back on and `<body>` keeps it. Firefox on CI
  // hit that window for real — Escape out of Credits inside a frame — and this used
  // to pass or fail on whether a frame happened to land.
  await page.addInitScript(() => {
    const real = window.requestAnimationFrame.bind(window);
    const held: FrameRequestCallback[] = [];
    let holding = false;
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      if (!holding) return real(callback);
      held.push(callback);
      return 0;
    };
    (window as unknown as { __holdFrames: (on: boolean) => void }).__holdFrames = (on) => {
      holding = on;
      if (!on) for (const callback of held.splice(0)) real(callback);
    };
  });
  await enterGame(page);

  type Frames = { __holdFrames: (on: boolean) => void };
  await page.evaluate(() => (window as unknown as Frames).__holdFrames(true));
  await page.getByRole("button", { name: /Credits/ }).click();
  // Back to the menu, with the credits screen's own placement frame never having run.
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as unknown as Frames).__holdFrames(false));

  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Credits/ })).toBeFocused();
  expect(leaked, "unexpected external requests").toEqual([]);
});

test("both calibration dialogs open from Options, and Escape gives their buttons back", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  await page.getByRole("button", { name: /Options/ }).click();
  await expect(page.getByText(/eight clicks/i)).toBeVisible();

  // The sound measurement: a native dialog with the instructions and the measured
  // promise. The browser test does not try to hear the clicks — measuring audio
  // belongs in the unit tests, and this guards the way in and the way out.
  const sound = page.getByRole("button", { name: "Calibrate", exact: true });
  await sound.click();
  const soundDialog = page.getByRole("dialog", { name: "Calibrate the audio lag" });
  await expect(soundDialog).toBeVisible();
  await expect(soundDialog.getByText(/Tap in time with each click/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(soundDialog).toBeHidden();
  await expect(sound).toBeFocused();

  // The picture row is its own measurement, with the same stepper and a Calibrate
  // button that opens the dialog already on Picture.
  await expect(page.getByText("Picture lag", { exact: true })).toBeVisible();
  const picture = page.getByRole("button", { name: "Calibrate the picture lag" });
  await picture.click();
  const pictureDialog = page.getByRole("dialog", { name: "Calibrate the picture lag" });
  await expect(pictureDialog).toBeVisible();
  await expect(pictureDialog.getByText(/marker will sweep/i)).toBeVisible();
  await expect(pictureDialog.getByText(/No sound plays/i)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pictureDialog).toBeHidden();
  await expect(picture).toBeFocused();

  expect(leaked, "unexpected external requests").toEqual([]);
});

/**
 * The arcade is meant for a wall display. A 1080x1920 TV is wider than the phone
 * breakpoint, so the menu must not fall back to the desktop's two columns: it
 * stacks the wordmark above the doors and gives them the screen's width.
 */
test("a portrait screen wider than a phone gets the stacked poster", async ({
  context,
  page,
}) => {
  await installFixtures(context);
  await disableFullscreen(page);
  await page.setViewportSize({ width: 1080, height: 1920 });
  await enterGame(page);

  const menu = page.getByRole("navigation", { name: "Main menu" });
  await expect(menu).toBeVisible();
  const nav = await menu.boundingBox();
  const brand = await page
    .getByRole("button", { name: "EverythingStar", exact: true })
    .boundingBox();
  expect(nav, "the menu has a box").not.toBeNull();
  expect(brand, "the wordmark has a box").not.toBeNull();

  // The phone column is capped at 28rem (448px); the poster uses most of a TV.
  expect(nav?.width ?? 0).toBeGreaterThan(700);
  // The wordmark sits over the doors, not beside them.
  expect((brand?.y ?? 0) + (brand?.height ?? 0)).toBeLessThan(nav?.y ?? 0);
  // Every door is the same shape, side doors included.
  const heights = await page
    .locator(".menu__item")
    .evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1);
});
