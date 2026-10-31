import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { disableFullscreen } from "./fixture";
import {
  enterGame,
  expectNoExternalRequests,
  openDocsBand,
  seatPlayers,
  setSlot,
  waitForPlaying,
  waitForStage,
} from "./helpers";
import { installNoteFixtures } from "./note-guide";

/**
 * A **slide** on a touch highway.
 *
 * The chart links two notes in different columns, and only a finger already on
 * the source's pad can play the target by gliding to it: the run reads
 * `pointerdown`, a `pointermove` that changes column and a `pointerup` as one
 * gesture. The gesture is driven **inside the page, on the live frame**, because
 * a round trip after the target shows as live can outlast the 150 ms window on a
 * loaded runner. The results card is the proof: two notes pay 100, and the glide
 * across an 800 ms gap at 120 BPM adds the hold value, 10. The fixture's source is
 * column 1 and its target column 3.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** Open the note guide's slide song with one guitar player on a phone. */
async function openSlideRun(context: BrowserContext, page: Page): Promise<string[]> {
  const leaked = await installNoteFixtures(context);
  await disableFullscreen(page);
  await enterGame(page, "/app");
  await openDocsBand(page, /A slide/);
  await seatPlayers(page, 1);
  await setSlot(page, 1, "Guitar");
  // `startDocsRun` holds the capture for 1.5 s so a note is above the line; this
  // gesture has to be waiting on the source's own window instead, so the run is
  // started and the page's live notes are watched from the first frame.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await waitForStage(page);
  await waitForPlaying(page);
  await expect(page.locator(".highway__pad")).toHaveCount(5);
  return leaked;
}

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
