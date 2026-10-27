import { expect, test } from "@playwright/test";
import { disableFullscreen, installFixtures } from "./fixture";
import { enterGame } from "./helpers";

/**
 * The two branches off the menu, and the rule that Escape is "back".
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
