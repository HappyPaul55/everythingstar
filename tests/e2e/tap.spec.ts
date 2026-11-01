import { expect, test } from "./base";
import {
  FIXTURE_NOTE_COUNT,
  SONG_TITLE,
  disableFullscreen,
  installFixtures,
} from "./fixture";
import { enterGame, openBand, startRun, waitForPlaying } from "./helpers";

/**
 * Tap play, on a phone.
 *
 * The pads are the only way to play a highway on a touch screen, and the unit
 * suite cannot see the two things that make them work: the DOM event's own
 * `timeStamp` has to be projected onto the song clock (a tap stamped with wall
 * time never lands), and each pad's target has to be its whole column (a finger
 * is not a 2px rail). A chord needs both at once — two fingers, one moment — so
 * this drives the fixture's two-note chord and reads the score it earned.
 *
 * Playwright's own touchscreen is single-point, so the fingers come through CDP.
 * The points deliberately land **above the visible pads**, in the band the pad's
 * target covers, so a pad that is only its visible box fails here.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("two fingers on the hit line play a chord", async ({ context, page }) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);

  await openBand(page, SONG_TITLE);
  await startRun(page);
  // The run opens with the highways offscreen while the room and the score arrive,
  // so measure the pads only once the song is running and the neck has landed.
  await waitForPlaying(page);

  // Columns 0 and 2 carry the fixture's only chord, at 500ms. The press happens
  // **inside the page, on the live frame**: a CDP round trip after the live state
  // is visible can outlast the 150ms window on a loaded runner. The points are 8px
  // above the visible pads, so `elementFromPoint` still proves the column target
  // owns that space.
  await expect(page.locator(".highway__pad")).toHaveCount(3);
  const chord = await page.evaluate(
    () =>
      new Promise<{ held: number }>((resolve, reject) => {
        const press = () => {
          if (document.querySelectorAll(".highway__note.is-live").length < 2) {
            requestAnimationFrame(press);
            return;
          }
          const pads = [...document.querySelectorAll<HTMLElement>(".highway__pad")];
          // The fixture's chord is columns 0 and 2; the middle pad is not part of it.
          const points = [pads[0], pads[2]].flatMap((pad) => {
            if (!pad) return [];
            const rect = pad.getBoundingClientRect();
            return [{ x: rect.x + rect.width / 2, y: rect.y - 8 }];
          });
          const targets: Element[] = [];
          for (const point of points) {
            const target = document.elementFromPoint(point.x, point.y);
            if (!target) {
              reject(new Error("no pad target above the column"));
              return;
            }
            targets.push(target);
          }
          const send = (type: "pointerdown" | "pointerup", target: Element, at: number) => {
            const point = points[at]!;
            target.dispatchEvent(
              new PointerEvent(type, {
                pointerId: at + 1,
                pointerType: "touch",
                isPrimary: at === 0,
                clientX: point.x,
                clientY: point.y,
                bubbles: true,
                cancelable: true,
                button: 0,
                buttons: type === "pointerdown" ? 1 : 0,
              }),
            );
          };
          targets.forEach((target, at) => send("pointerdown", target, at));

          // Let React commit the hand's own read-out, then let the fingers go. The
          // hit's burst is deliberately not asserted here: it is a few-hundred-
          // millisecond read-out whose timing belongs to `hitBursts`' unit tests,
          // while the score on the results card is the stable proof the taps landed.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const held = document.querySelectorAll(".highway__pad.is-held").length;
              targets.forEach((target, at) => send("pointerup", target, at));
              resolve({ held });
            });
          });
        };
        press();
      }),
  );
  // The press reached two columns at once, not one pad twice.
  expect(chord.held).toBe(2);
  await expect(page.locator(".highway__note.is-hit")).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({
    timeout: 20_000,
  });
  // Two taps that were a chord are 100 points; a single finger is 50 and leaves the
  // other note of the chord to pass.
  const card = page.locator(".results__player").first();
  await expect(card.locator(".results__player-score")).toHaveText("100");
  await expect(card.locator(".results__player-stats")).toContainText(
    `2/${FIXTURE_NOTE_COUNT} notes`,
  );

  expect(leaked, "unexpected external requests").toEqual([]);
});
