import { expect, test } from "@playwright/test";
import { installFixtures } from "./fixture";

/**
 * `/play` keeps the game stylesheet out of the marketing pages, which means it
 * imports `band.css` itself. That import must come **after** `global.css`:
 * `band.css` declares the `components` layer, and if it is parsed first Tailwind's
 * `base` layer lands after it — preflight then resets the welcome title, the mode
 * chips and every `.band-btn`, and the game looks unstyled on the one page that
 * has a site shell around it.
 *
 * The production bundler can put `band.css` first even when the source imports
 * `global.css` first, so `band.css` states Tailwind's layer order itself. This
 * spec runs in the dev suite and again in the production-preview suite
 * (`playwright.pwa.config.ts`), because the bug only showed up in the built CSS.
 * The computed styles are the guard: a class being present proves nothing.
 */
test("the game stylesheet is layered after the site's base styles", async ({
  context,
  page,
}) => {
  await installFixtures(context);
  await page.goto("/play");
  const enter = page.getByRole("button", { name: "Enter the stage" });
  await expect(enter).toBeEnabled({ timeout: 20_000 });

  const styles = await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>(".welcome__enter");
    const title = document.querySelector<HTMLElement>(".screen__title--welcome");
    const mode = document.querySelector<HTMLElement>(".welcome__mode");
    if (!button || !title || !mode) return null;
    const buttonStyle = getComputedStyle(button);
    const titleStyle = getComputedStyle(title);
    const modeStyle = getComputedStyle(mode);
    return {
      buttonBackground: buttonStyle.backgroundColor,
      buttonPadding: buttonStyle.paddingLeft,
      buttonFont: buttonStyle.fontFamily,
      titleSize: parseFloat(titleStyle.fontSize),
      modePadding: modeStyle.paddingLeft,
    };
  });

  expect(styles).not.toBeNull();
  if (!styles) return;
  // A styled primary button is filled, has a gutter and is set in the game's
  // mono utility face; preflight's reset is transparent, flush and the body face.
  expect(styles.buttonBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(styles.buttonPadding).not.toBe("0px");
  expect(styles.buttonFont).toContain("Space Mono");
  // The welcome wordmark is the poster's, not a 16px browser heading.
  expect(styles.titleSize).toBeGreaterThan(30);
  expect(styles.modePadding).not.toBe("0px");
});
