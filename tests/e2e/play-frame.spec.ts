import { expect, test } from "./base";
import { SONG_TITLE, disableFullscreen, installFixtures } from "./fixture";
import { enterGame, openBand, startRun, waitForPlaying } from "./helpers";

/**
 * `/play` is a page of the site, so the marketing header sits above the stage —
 * but the stage is a screen, not a section: the two share the **first** viewport.
 *
 * The stage used to be `100dvh` on its own, below the header, so header + stage was
 * taller than the window. Seeing the bottom of a run meant scrolling the top (the
 * progress bar and the score rail) out of view, and the footer was one scroll below
 * that. This pins the frame: at rest the header and the whole stage are on screen,
 * the footer is below the fold, and nothing has scrolled.
 */
const viewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

for (const viewport of viewports) {
  test(`the stage shares the first viewport with the header at ${viewport.width}x${viewport.height}`, async ({
    context,
    page,
  }) => {
    await installFixtures(context);
    // The site shell only exists outside fullscreen; that is the layout this pins.
    await disableFullscreen(page);
    await page.setViewportSize(viewport);
    await enterGame(page);
    await openBand(page, SONG_TITLE);
    await startRun(page);
    await waitForPlaying(page);

    const box = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const r = element.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height };
      };
      const stage = document.querySelector<HTMLElement>(".band__stage");
      return {
        scrollY: window.scrollY,
        stageScrollTop: stage?.scrollTop ?? -1,
        viewport: { width: innerWidth, height: innerHeight },
        header: rect("#site-header"),
        stage: rect(".band__stage"),
        progress: rect(".song-progress"),
        panel: rect(".player-panel"),
        footer: rect("body > footer"),
      };
    });

    expect(box.header, "the site header is on screen").not.toBeNull();
    expect(box.stage, "the stage is on screen").not.toBeNull();
    expect(box.progress, "the progress bar is on screen").not.toBeNull();
    expect(box.panel, "the lane panel is on screen").not.toBeNull();
    expect(box.footer, "the site footer is below the fold").not.toBeNull();
    if (!box.header || !box.stage || !box.progress || !box.panel || !box.footer) {
      return;
    }

    // Nothing has scrolled — neither the document nor the stage itself. The stage
    // used to be a `overflow: hidden` scroll container, and focusing a highway pad
    // scrolled it by a few dozen pixels: the progress bar left the top and the
    // bottom showed a strip of backdrop.
    expect(box.scrollY).toBe(0);
    expect(box.stageScrollTop).toBe(0);
    expect(box.header.top).toBeGreaterThanOrEqual(-1);
    expect(box.header.bottom).toBeGreaterThan(0);
    expect(box.stage.top).toBeGreaterThanOrEqual(box.header.bottom - 1);
    // The whole stage is the rest of the viewport, not a screen more.
    expect(box.stage.bottom).toBeLessThanOrEqual(box.viewport.height + 1);
    expect(box.stage.bottom).toBeGreaterThanOrEqual(box.viewport.height - 1);
    // The progress bar is at the stage's top, not above the screen.
    expect(box.progress.top).toBeGreaterThanOrEqual(box.stage.top - 1);
    expect(box.progress.bottom).toBeLessThanOrEqual(box.stage.top + 10);
    // The play area is inside the stage, so the bottom of the highway is visible.
    expect(box.panel.top).toBeGreaterThanOrEqual(box.stage.top - 1);
    expect(box.panel.bottom).toBeLessThanOrEqual(box.stage.bottom + 1);
    // The footer is one screen down, not in the first viewport.
    expect(box.footer.top).toBeGreaterThanOrEqual(box.viewport.height - 1);
  });
}
