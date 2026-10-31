import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import docshots from "../../../docshots.config";

/**
 * The capture side of a documentation screenshot.
 *
 * A test carries `annotation: [{ type: "doc", description: "jukebox" }]`; an
 * automatic fixture in `tests/e2e/support.ts` reads it, and this writes the WebP
 * in the test's own teardown, once per Playwright project, only when the test
 * passed. The page names the same id with `[description](shot:jukebox)`.
 */
export interface DocShot {
  id: string;
  /** Variants this shot is captured in; omitted means every variant. */
  viewports?: string[];
  /** Per-variant crops, keyed by variant name. */
  crop?: Record<string, { edge: "bottom"; percent: number }>;
}

function cropOf(value: string | undefined): DocShot["crop"] {
  if (!value) return undefined;
  const crops: NonNullable<DocShot["crop"]> = {};
  for (const entry of value.split(",")) {
    const match = /^\s*([a-z][a-z0-9-]*):bottom\s+(\d{1,3})%\s*$/.exec(entry);
    if (match) {
      crops[match[1]!] = { edge: "bottom", percent: Number(match[2]) };
    }
  }
  return Object.keys(crops).length > 0 ? crops : undefined;
}

/** The shot a test declares, from its annotations. */
export function docOf(testInfo: TestInfo): DocShot | null {
  const id = testInfo.annotations.find((entry) => entry.type === "doc")?.description;
  if (!id) return null;
  const viewports = testInfo.annotations
    .find((entry) => entry.type === "doc-viewport")
    ?.description?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const crop = cropOf(
    testInfo.annotations.find((entry) => entry.type === "doc-crop")?.description,
  );
  return {
    id,
    ...(viewports && viewports.length > 0 ? { viewports } : {}),
    ...(crop ? { crop } : {}),
  };
}

export async function captureDoc(page: Page, testInfo: TestInfo): Promise<void> {
  const doc = docOf(testInfo);
  if (!doc) return;
  const variant = docshots.variants[testInfo.project.name];
  if (!variant) return;

  const root = process.cwd();
  // A webfont that swaps after the capture is a screenshot that disagrees with
  // the same page a second later.
  await page.evaluate(() => document.fonts.ready);

  // A crop keeps the part of the frame the page is about. The percentages are of
  // the viewport, and Playwright's clip is in CSS pixels, so a phone capture is
  // still the phone's own device scale.
  const viewport = page.viewportSize();
  const crop = doc.crop?.[testInfo.project.name];
  const clip =
    crop && viewport
      ? {
          x: 0,
          y: Math.round(viewport.height * (1 - crop.percent / 100)),
          width: viewport.width,
          height: Math.round(viewport.height * (crop.percent / 100)),
        }
      : undefined;

  const file = `${doc.id}-${testInfo.project.name}.webp`;
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
}
