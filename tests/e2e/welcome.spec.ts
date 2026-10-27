import { expect, test } from "@playwright/test";
import { disableFullscreen, installFixtures } from "./fixture";

/** Each part's pill, and the word it puts in the wordmark's place. */
const PILLS: Array<[string, string]> = [
  ["Guitar", "Guitar"],
  ["Bass", "Bass"],
  ["Keys", "Key"],
  ["Drums", "Drum"],
  ["Typing", "Typing"],
  ["Vocals", "Vocal"],
];

/**
 * The marquee strip is also the poster's name plate: the part under the pointer
 * renames the game ("GuitarStar"), and the name **stays** after the pointer
 * leaves — the strip is a choice, not a preview. Hovering the wordmark itself is
 * the way back. It is a flourish, so the heading's accessible name must not move
 * with it.
 *
 * The wordmark's box is the whole name, so renaming the game must not move the
 * "Star" at either shape: beside the word on a wide screen, and on its own line
 * when the poster wraps. Stacked, the word is centred over the Star too — not
 * held against a Star that is no longer beside it. Both are the same loop over
 * the same pills, so one test carries both viewports.
 */
const VIEWPORTS = [
  { width: 1440, height: 900, wrapped: false },
  { width: 240, height: 760, wrapped: true },
];

test("a part pill renames the wordmark, and the Star stays put", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/play");
    const enter = page.getByRole("button", { name: "Enter the stage" });
    await expect(enter).toBeEnabled({ timeout: 20_000 });

    const heading = page.getByRole("heading", { name: "EverythingStar" });
    const prefix = heading.locator(".welcome__word-live");
    const star = heading.locator(".welcome__word--star");
    await expect(prefix).toHaveText("Everything");
    if (viewport.wrapped) {
      await expect(heading).toHaveAttribute("data-wrapped", "true");
    }

    const starAtRest = await star.boundingBox();
    expect(starAtRest, "the Star has a box").not.toBeNull();

    for (const [pill, word] of PILLS) {
      await page.getByRole("listitem").filter({ hasText: pill }).hover();
      await expect(prefix).toHaveText(word);
      const wordBox = await prefix.boundingBox();
      const starNow = await star.boundingBox();
      expect(starNow, "the Star has a box").not.toBeNull();
      // The poster stays where it is, whatever the word's width.
      expect(Math.abs((starNow?.x ?? 0) - (starAtRest?.x ?? 0))).toBeLessThan(1);
      expect(Math.abs((starNow?.y ?? 0) - (starAtRest?.y ?? 0))).toBeLessThan(1);
      if (viewport.wrapped) {
        expect(wordBox, "the word has a box").not.toBeNull();
        // On its own line, the word is centred over the Star.
        const wordCentre = (wordBox?.x ?? 0) + (wordBox?.width ?? 0) / 2;
        const starCentre = (starNow?.x ?? 0) + (starNow?.width ?? 0) / 2;
        expect(Math.abs(wordCentre - starCentre)).toBeLessThan(1);
      }
    }

    // Away from the strip the poster keeps the part's name; the wordmark itself
    // is the way back, and the heading's accessible name never moved.
    await page.locator(".welcome__tagline").hover();
    await expect(prefix).toHaveText("Vocal");
    await heading.hover();
    await expect(prefix).toHaveText("Everything");
    await expect(heading).toHaveAccessibleName("EverythingStar");
  }

  expect(leaked, "unexpected external requests").toEqual([]);
});
