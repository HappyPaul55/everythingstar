/**
 * The documentation capture tests.
 *
 * `tests/e2e/docs` holds one spec per shot, with
 * `annotation: [{ type: "doc", description: "<id>" }]`; a page shows it with
 * `[description](shot:<id>)`. Playwright runs each spec once per project — a
 * project per variant in `docshots.config.ts` — with its own fresh page. The dev server is
 * the target for the same reason the smoke suite uses it: the capture is about a
 * screen, not about the bundle.
 */
import { defineConfig } from "@playwright/test";
import docshots from "./docshots.config";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4321);

export default defineConfig({
  testDir: "./tests/e2e/docs",
  // Screenshots are a sequence of states in one browser: running them in
  // parallel would make a busy machine's timing visible in the pixels.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  // A doc shot drives the whole game, so it gets the smoke suite's budget and
  // more: the first visit loads the mixer and the fixture playlist.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results/docshots",
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    // A stray animation or a scrollbar gutter is a different image; the capture
    // itself disables animations and hides the caret.
    viewport: { width: 1440, height: 900 },
  },
  // The variant names are the project names, so `testInfo.project.name` is the
  // manifest variant and the label in the built page. No second list to drift.
  projects: Object.entries(docshots.variants).map(([name, options]) => ({
    name,
    use: { ...options },
  })),
  webServer: {
    command: `bun run dev --host 127.0.0.1 --port ${PORT} --ignore-lock`,
    url: `http://127.0.0.1:${PORT}/play`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
