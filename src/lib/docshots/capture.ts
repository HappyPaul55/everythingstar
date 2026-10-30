import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { readManifest, shotKey } from "./manifest";

/**
 * The fixture a generated spec uses to capture its screenshot.
 *
 * The author never writes a file path or a `page.screenshot`: the fence names a
 * shot, and this turns that name into the manifest's variant for the Playwright
 * project the test is running in. It runs in `afterEach` and only for a test
 * that **passed**, so a failed assertion can never overwrite a good picture.
 */
export interface CapturableTest {
  afterEach(
    hook: (args: { page: Page }, testInfo: TestInfo) => Promise<void> | void,
  ): void;
}

export interface DocshotSpec {
  /** The document's id, e.g. `players/songs`. */
  doc: string;
  /** The fence's `id`. */
  id: string;
}

export function docshot(test: CapturableTest, spec: DocshotSpec): void {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== "passed") return;

    const root = process.cwd();
    const manifest = readManifest(root);
    if (!manifest) {
      throw new Error("docshots: no manifest — run `bun run docs:shots`");
    }

    const shot = manifest.shots[shotKey(spec.doc, spec.id)];
    if (!shot) {
      throw new Error(`docshots: ${spec.doc}#${spec.id} is not in the manifest`);
    }

    const variant = shot.variants.find((entry) => entry.name === testInfo.project.name);
    // A fence may name fewer viewports than the config; the other projects still
    // run the test file, and simply have nothing to capture.
    if (!variant) return;

    // A webfont that swaps after the capture is a screenshot that disagrees with
    // the same page a second later.
    await page.evaluate(() => document.fonts.ready);

    const path = join(root, manifest.outDir, variant.file);
    mkdirSync(join(root, manifest.outDir), { recursive: true });
    await page.screenshot({
      path,
      type: "webp",
      quality: manifest.quality,
      // Finite animations are fast-forwarded and the caret is hidden: the things
      // that otherwise differ between a local run and CI. The device scale is the
      // project's, so a phone capture is a phone's own pixels.
      animations: "disabled",
      caret: "hide",
    });
  });
}
