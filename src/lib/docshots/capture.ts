import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import docshots from "../../../docshots.config";
import { recordVariant, variantFile } from "./manifest";

/**
 * The capture side of a documentation screenshot.
 *
 * A test names its shot — `docshot(test, "jukebox")` — and this takes the WebP
 * in `afterEach`, once per Playwright project, **only for a test that passed**.
 * The page names the same id with `[alt](shot:jukebox)`; neither side writes the
 * other's file name, and the manifest records what this produced.
 */
export interface ShotCrop {
  edge: "bottom";
  /** How much of the viewport's height to keep, from `edge`. */
  percent: number;
}

export interface DocshotOptions {
  /** Variant names this shot is captured in; omitted means every variant. */
  viewports?: string[];
  /** Per-variant crops, keyed by variant name. */
  crop?: Record<string, ShotCrop>;
}

export interface CapturableTest {
  beforeEach(
    hook: (args: { page: unknown }, testInfo: TestInfo) => Promise<void> | void,
  ): void;
  afterEach(
    hook: (args: { page: Page }, testInfo: TestInfo) => Promise<void> | void,
  ): void;
}

export function docshot(
  test: CapturableTest,
  id: string,
  options: DocshotOptions = {},
): void {
  // A shot that is desktop-only must not fail on the phone, and the tests that
  // are taken everywhere run in every project.
  if (options.viewports) {
    test.beforeEach(({ page: _page }, testInfo) => {
      if (!options.viewports?.includes(testInfo.project.name)) testInfo.skip();
    });
  }

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== "passed") return;

    const name = testInfo.project.name;
    const variant = docshots.variants[name];
    if (!variant) return;

    const root = process.cwd();
    // A webfont that swaps after the capture is a screenshot that disagrees with
    // the same page a second later.
    await page.evaluate(() => document.fonts.ready);

    // A crop keeps the part of the frame the page is about. The percentages are
    // of the viewport, and Playwright's clip is in CSS pixels, so a phone capture
    // is still the phone's own device scale.
    const viewport = page.viewportSize();
    const crop = options.crop?.[name];
    const clip =
      crop && viewport
        ? {
            x: 0,
            y: Math.round(viewport.height * (1 - crop.percent / 100)),
            width: viewport.width,
            height: Math.round(viewport.height * (crop.percent / 100)),
          }
        : undefined;

    const file = variantFile(id, name);
    mkdirSync(join(root, docshots.outDir), { recursive: true });
    await page.screenshot({
      path: join(root, docshots.outDir, file),
      type: "webp",
      quality: docshots.quality,
      // Finite animations are fast-forwarded and the caret is hidden: the things
      // that otherwise differ between a local run and CI. The device scale is the
      // project's, so a phone capture is a phone's own pixels.
      animations: "disabled",
      caret: "hide",
      ...(clip ? { clip } : {}),
    });

    recordVariant(root, docshots.outDir, docshots.quality, id, {
      name,
      file,
      ...variant.viewport,
    });
  });
}
