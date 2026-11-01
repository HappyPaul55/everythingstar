import { expect, test } from "./base";
import { openSlideRun } from "./slide-run";
import { expectNoExternalRequests } from "./helpers";

/** A slide on a touch highway; the run is opened by `slide-run.ts`. */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("a finger gliding from a note to the one it links scores the slide", async ({
  context,
  page,
}) => {
  const leaked = await openSlideRun(context, page);

  // The press lands when the source is live; the move only once the source has
  // left and the target is live, so the glide is judged on the arrival's window.
  await page.evaluate(async () => {
    const hit = document.querySelector<HTMLElement>(".highway__hit");
    if (!hit) throw new Error("no hit line");
    const pads = [...document.querySelectorAll<HTMLElement>(".highway__pad")];
    if (pads.length < 4) throw new Error("the slide's columns are not on the highway");
    const centre = (pad: HTMLElement) => {
      const rect = pad.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    };
    const source = centre(pads[1]!);
    const target = centre(pads[3]!);
    const send = (
      type: "pointerdown" | "pointermove" | "pointerup",
      point: { x: number; y: number },
      buttons: number,
    ) => {
      hit.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
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

    await waitFor(() => live() >= 1);
    send("pointerdown", source, 1);
    // The source leaves the neck once it is judged; the next live note is the
    // link's target.
    await waitFor(() => live() === 0);
    await waitFor(() => live() >= 1);
    send("pointermove", target, 1);
    // A couple of frames for the run to judge the arrival, then the finger lifts.
    await new Promise<void>((next) =>
      requestAnimationFrame(() => requestAnimationFrame(() => next())),
    );
    send("pointerup", target, 0);
  });

  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({
    timeout: 20_000,
  });
  const card = page.locator(".results__player").first();
  // Two notes at 50, and the glide's 800 ms span at 120 BPM: 50 + 50 + 10.
  await expect(card.locator(".results__player-score")).toHaveText("110");
  await expect(card.locator(".results__player-stats")).toContainText("2/2 notes");

  expectNoExternalRequests(leaked);
});
