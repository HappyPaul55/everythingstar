import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * The **local visual guard** for a styling change.
 *
 * `tests/e2e/visual.spec.ts` drives the same screens the documentation captures
 * drive and compares them pixel by pixel against a baseline. The baselines are
 * **not** committed: this repository never commits captures (see `.gitignore`),
 * and a picture of a screen belongs to the build that made it. They live under
 * `.cache/visual/`, which is already ignored, and the spec skips every shot
 * whose baseline is not on disk — so CI is unaffected and a developer who wants
 * the guard runs:
 *
 *     bun run visual:baseline   # once, on the branch you are about to change
 *     bun run visual            # after each step of the change
 *
 * The shots are the static screens: the stage's own moving parts (the highway,
 * the piano roll, the progress bar) are driven by the audio clock and would
 * differ run to run, so those are guarded by the behavioural suite and by
 * `play-style.spec.ts` instead.
 */
export default defineConfig({
  ...base,
  testDir: "./tests/e2e",
  testMatch: ["**/visual.spec.ts"],
  // One picture per project and per name, under the cache rather than beside
  // the spec: a committed baseline is not this repository's model.
  snapshotPathTemplate: ".cache/visual/{projectName}/{arg}{ext}",
  // A plain `bun run visual` compares and never writes; `--update-snapshots`
  // overrides this to "all" for the arming run.
  updateSnapshots: "none",
  outputDir: "test-results/visual",
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
