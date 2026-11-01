import { expect, test } from "../e2e/base";
import { installDocsFixtures } from "../e2e/docs-library";
import { disableFullscreen } from "../e2e/fixture";
import {
  enterGame,
  openDocsBand,
  seatPlayers,
  setSlot,
  waitForStage,
  waitForPlaying,
} from "../e2e/helpers";

/**
 * Where the per-frame DOM writes actually go.
 *
 * The question this answers: does a highway move each note, or one layer? A note
 * is mounted at a fixed percentage of the track, and `useScrollTrack` writes one
 * `transform` on the track. This counts the mutations, so a bar-container idea can
 * be judged on the real distribution rather than on an assumption.
 */
test("per-frame DOM writes on the highways", async ({ context, page }) => {
  const seats = Number(process.env.BENCH_SEATS ?? 4);
  await installDocsFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);
  await openDocsBand(page);
  await seatPlayers(page, seats);
  for (let seat = 1; seat <= seats; seat += 1) {
    await setSlot(page, seat, "Guitar");
  }
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await waitForStage(page);
  await waitForPlaying(page);

  const result = await page.evaluate(
    () =>
      new Promise<{
        ms: number;
        frames: number;
        trackStyle: number;
        noteStyle: number;
        noteClass: number;
        progressStyle: number;
        added: number;
        removed: number;
        notes: number;
      }>((resolve) => {
        const counts = {
          trackStyle: 0,
          noteStyle: 0,
          noteClass: 0,
          progressStyle: 0,
          added: 0,
          removed: 0,
        };
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            const target = record.target as Element;
            if (record.type === "attributes") {
              if (target.matches(".highway__track")) counts.trackStyle += 1;
              else if (target.matches(".highway__note")) {
                if (record.attributeName === "style") counts.noteStyle += 1;
                if (record.attributeName === "class") counts.noteClass += 1;
              } else if (target.matches(".song-progress__fill")) {
                counts.progressStyle += 1;
              }
            } else {
              counts.added += record.addedNodes.length;
              counts.removed += record.removedNodes.length;
            }
          }
        });
        observer.observe(document.body, {
          subtree: true,
          attributes: true,
          attributeFilter: ["style", "class"],
          childList: true,
        });

        let frames = 0;
        let last = performance.now();
        const start = last;
        const step = (now: number) => {
          frames += 1;
          last = now;
          if (now - start < 3_000) requestAnimationFrame(step);
          else {
            observer.disconnect();
            resolve({
              ms: now - start,
              frames,
              ...counts,
              notes: document.querySelectorAll(".highway__note").length,
            });
          }
        };
        requestAnimationFrame(step);
      }),
  );

  console.log(JSON.stringify(result, null, 2));
  expect(result.frames).toBeGreaterThan(0);
});
