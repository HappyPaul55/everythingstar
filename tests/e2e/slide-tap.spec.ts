import { expect, test } from "./base";
import { openSlideRun } from "./slide-run";
import { expectNoExternalRequests } from "./helpers";

/** A slide on a touch highway; the run is opened by `slide-run.ts`. */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("a tap on the linked target is a tap, not a slide", async ({ context, page }) => {
  const leaked = await openSlideRun(context, page);

  // The same two notes played with two presses and no glide: the target lands,
  // but its link is not played, so the span's points are not paid.
  await page.evaluate(async () => {
    const hit = document.querySelector<HTMLElement>(".highway__hit");
    if (!hit) throw new Error("no hit line");
    const pads = [...document.querySelectorAll<HTMLElement>(".highway__pad")];
    if (pads.length < 4) throw new Error("the slide's columns are not on the highway");
    const centre = (pad: HTMLElement) => {
      const rect = pad.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    };
    const send = (
      type: "pointerdown" | "pointerup",
      point: { x: number; y: number },
      buttons: number,
      pointerId: number,
    ) => {
      hit.dispatchEvent(
        new PointerEvent(type, {
          pointerId,
          pointerType: "touch",
          isPrimary: true,
          clientX: point.x,
          clientY: point.y,
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons,
        }),
      );
    };
    const live = () => document.querySelectorAll(".highway__note.is-live").length;
    const waitFor = (predicate: () => boolean) =>
      new Promise<void>((next) => {
        const tick = () => {
          if (predicate()) next();
          else requestAnimationFrame(tick);
        };
        tick();
      });
    const tap = (pad: HTMLElement, pointerId: number) => {
      const point = centre(pad);
      send("pointerdown", point, 1, pointerId);
      send("pointerup", point, 0, pointerId);
    };

    await waitFor(() => live() >= 1);
    tap(pads[1]!, 1);
    await waitFor(() => live() === 0);
    await waitFor(() => live() >= 1);
    tap(pads[3]!, 2);
    await new Promise<void>((next) =>
      requestAnimationFrame(() => requestAnimationFrame(() => next())),
    );
  });

  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({
    timeout: 20_000,
  });
  const card = page.locator(".results__player").first();
  await expect(card.locator(".results__player-score")).toHaveText("100");
  await expect(card.locator(".results__player-stats")).toContainText("2/2 notes");

  expectNoExternalRequests(leaked);
});
