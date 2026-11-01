import { expect, test } from "./base";
import { installDocsFixtures } from "./docs-library";
import { disableFullscreen } from "./fixture";
import { enterGame, openDocsBand, waitForPlaying } from "./helpers";

/**
 * The microphone is asked for by **choosing Vocals**, not by pressing Play.
 *
 * A remembered singer who never granted the microphone used to turn the first
 * Play into a browser permission prompt — a question a new player had no reason
 * to expect and no way to read. The machine sings that part instead, the seat says
 * so, and the Vocals button is the gesture that asks.
 */

/** Count `getUserMedia` calls, so "no prompt" is a number rather than a hope. */
async function countMicCalls(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    const media = navigator.mediaDevices;
    if (!media) return;
    const original = media.getUserMedia?.bind(media);
    if (!original) return;
    Object.defineProperty(media, "getUserMedia", {
      configurable: true,
      value: (constraints: MediaStreamConstraints) => {
        (window as unknown as { __micCalls: number }).__micCalls =
          ((window as unknown as { __micCalls?: number }).__micCalls ?? 0) + 1;
        return original(constraints);
      },
    });
  });
}

const calls = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __micCalls?: number }).__micCalls ?? 0);

test("Play does not ask for the microphone a remembered singer never granted", async ({
  context,
  page,
}) => {
  await countMicCalls(page);
  const leaked = await installDocsFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);
  await openDocsBand(page);

  // The song has pitch, so the remembered words seat (the second box) is a
  // singer. Every box offers the Vocals *instrument*; this one has it pressed.
  const singer = page.locator(".slot").nth(1);
  await expect(singer.getByRole("button", { name: "Vocals" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await waitForPlaying(page);

  expect(await calls(page)).toBe(0);
  expect(leaked, "unexpected external requests").toEqual([]);
});

test("choosing Vocals asks, and a refusal is said in the seat", async ({
  context,
  page,
}) => {
  await countMicCalls(page);
  await installDocsFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);
  await openDocsBand(page);

  const slot = page.locator(".slot").nth(1);
  await slot.getByRole("button", { name: "Vocals" }).click();

  // Headless Chromium denies a permission nobody granted, so the ask is refused
  // and the seat says who is singing instead.
  await expect.poll(() => calls(page), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect(slot.getByText(/microphone was refused/i)).toBeVisible();
  await expect(slot.getByRole("button", { name: "Vocals" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
