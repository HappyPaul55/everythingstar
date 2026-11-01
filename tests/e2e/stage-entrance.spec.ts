import { expect, test, type Page } from "./base";
import { SONG_TITLE, disableFullscreen, installFixtures } from "./fixture";
import { enterGame, openBand, startRun, waitForPlaying } from "./helpers";

/**
 * The run opens in two beats: the room first, then the band.
 *
 * The stage mounts on the countdown with the song's background, the progress bar
 * and the score rails already up. The highways and the words stay offscreen for a
 * quiet lead, then slide in — the highways from the floor, the words from the top —
 * while the band's hype plays. The song waits for the lead, the hype/slide and a
 * short breath (`hypeEntranceMs`).
 *
 * The old entrance moved the whole lanes and melody regions at once, so the score
 * arrived with the highways and everything happened together. This pins the two
 * beats: at the countdown the rail is visible and the highway is not, and a moment
 * later the highway has arrived.
 */
async function box(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    };
    return {
      screen: document.documentElement.dataset.screen,
      stage: rect(".band__stage"),
      panel: rect(".player-panel"),
      score: rect(".panel-rail--score"),
      highway: rect(".highway"),
      progress: rect(".song-progress"),
    };
  });
}

test("the room and the score arrive before the highways and the words", async ({
  context,
  page,
}) => {
  await installFixtures(context);
  await disableFullscreen(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterGame(page);
  await openBand(page, SONG_TITLE);
  await startRun(page);
  // The screen starts on the stage itself, not on its first highway pad: a pad is
  // a control the player plays, not where a screen begins.
  await expect(page.locator(".band__stage")).toBeFocused();

  // The quiet beat: the stage, the progress bar and the score rail are up; the
  // highway is still translated below the panel and clipped there. Polled rather
  // than slept through: the state holds for the entrance's lead, and a fixed wait
  // is a race under a loaded runner.
  await expect
    .poll(
      async () => {
        const sample = await box(page);
        return (
          sample.screen === "countdown" &&
          sample.panel !== null &&
          sample.highway !== null &&
          sample.highway.top >= sample.panel.bottom - 1
        );
      },
      { timeout: 1_000 },
    )
    .toBe(true);
  const lead = await box(page);
  expect(lead.screen).toBe("countdown");
  expect(lead.stage).not.toBeNull();
  expect(lead.panel).not.toBeNull();
  expect(lead.score).not.toBeNull();
  expect(lead.highway).not.toBeNull();
  expect(lead.progress).not.toBeNull();
  if (!lead.stage || !lead.panel || !lead.score || !lead.highway || !lead.progress) {
    return;
  }
  expect(lead.score.height).toBeGreaterThan(0);
  expect(lead.score.top).toBeGreaterThanOrEqual(lead.panel.top - 1);
  expect(lead.progress.height).toBe(5);
  expect(lead.highway.top).toBeGreaterThanOrEqual(lead.panel.bottom - 1);

  // The slide has arrived (lead 1.2s + slide 0.65s), and the song has not started.
  await expect
    .poll(
      async () => {
        const sample = await box(page);
        if (!sample.panel || !sample.highway) return false;
        return (
          sample.screen === "countdown" &&
          sample.highway.top < sample.panel.bottom &&
          sample.highway.top >= sample.panel.top
        );
      },
      { timeout: 8_000 },
    )
    .toBe(true);
  const arrived = await box(page);
  expect(arrived.screen).toBe("countdown");
  expect(arrived.panel).not.toBeNull();
  expect(arrived.highway).not.toBeNull();
  if (!arrived.panel || !arrived.highway) return;
  expect(arrived.highway.top).toBeLessThan(arrived.panel.bottom);
  expect(arrived.highway.top).toBeGreaterThanOrEqual(arrived.panel.top);

  // The entrance is over and the song is running; the highway stays put.
  await waitForPlaying(page);
  const running = await box(page);
  expect(running.screen).toBe("playing");
  expect(running.panel).not.toBeNull();
  expect(running.highway).not.toBeNull();
  if (!running.panel || !running.highway) return;
  expect(running.highway.top).toBeGreaterThanOrEqual(running.panel.top);
  expect(running.highway.top).toBeLessThan(running.panel.bottom);
});
