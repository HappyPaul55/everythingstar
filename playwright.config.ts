import { availableParallelism } from "node:os";
import { defineConfig, devices } from "@playwright/test";
import docshots from "./docshots.config";

/**
 * Browser tests: the behavioural suite and the documentation captures.
 *
 * The unit suite proves the pure parts; this is the only gate that mounts the
 * island and drives the screen machine in a real browser. The **dev server** is
 * the target rather than a preview build: the smoke test is about the loop, and
 * the capture tests need the app's own document routes with no service worker to
 * intercept them.
 *
 * Every external request is routed by the specs (`tests/e2e/fixture.ts`); the
 * browser never reaches the public FOSS playlist or YouTube. A local run stays on
 * one worker, so the timing-sensitive run is as quiet as the specs assume; CI
 * takes every core but one, because the suite is CPU-bound and a single worker
 * spends most of the run waiting on the test before it.
 *
 * `desktop` and `mobile` are the capture projects from `docshots.config.ts`; the
 * `chromium` project is the behavioural suite and ignores them. `test:e2e` runs
 * all three, so one browser run both validates the app and writes the images the
 * build names.
 */
// A worktree checkout can already hold 4321; let a local run pick another port
// rather than silently reusing a different tree's dev server.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4321);

export default defineConfig({
  testDir: "./tests/e2e",
  // The worker spec needs a production build and `astro preview`; it has its own
  // config (`playwright.pwa.config.ts`) and command. The documentation captures
  // are projects here, so the browser suite and the capture run cannot drift.
  testIgnore: ["**/pwa.spec.ts"],
  fullyParallel: false,
  // One worker is the quiet local run. In CI the count follows the runner: every
  // core but one, because the suite is CPU-bound and a single worker spends most
  // of the run waiting on the test before it — but never fewer than two, because a
  // 2-vCPU runner (the private-repo size) would otherwise leave half the machine
  // waiting between notes. On a 4-vCPU runner one worker takes 5m46 and three take
  // about 3m, while a fourth — every core, with none left for the dev server and
  // the browser's own processes — is no faster.
  workers: process.env.CI ? Math.max(2, availableParallelism() - 1) : 1,
  // A loaded runner can lose a race the product does not have: a timing
  // assertion can step over a frame a quiet run would see. One retry tells a
  // flake from a break; local runs stay honest, and a test that needs two is a
  // test to fix.
  retries: process.env.CI ? 1 : 0,
  // A committed `test.only` would run one test and exit 0, so CI would go green
  // with the suite gone. Refuse it where it matters.
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Traces and failure screenshots live here, under a directory of this config's
  // own: Playwright clears the output directory before every run, and the PWA run
  // must not delete what this one wrote.
  outputDir: "test-results/e2e",
  // `list` for a readable log, JUnit for CI's artifact. The report sits beside the
  // output directory rather than inside it, so clearing one never takes the other.
  reporter: [["list"], ["junit", { outputFile: "test-results/e2e-junit.xml" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: ["**/pwa.spec.ts", "**/docs/**"],
      use: { ...devices["Desktop Chrome"], headless: true },
    },
    ...Object.entries(docshots.variants).map(([name, options]) => ({
      name,
      testMatch: ["**/docs/**"],
      // A capture drives the whole game, and the slower screens (the results,
      // the charter) spend more time waiting than the smoke tests do.
      timeout: 120_000,
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
        ...options,
      },
    })),
  ],
  webServer: {
    // `--ignore-lock` keeps the dev server in the foreground: Astro's agent
    // detection otherwise daemonises it when a test run is started by an agent,
    // and Playwright would see the wrapper exit instead of a server to wait on.
    command: `bun run dev --host 127.0.0.1 --port ${PORT} --ignore-lock`,
    url: `http://127.0.0.1:${PORT}/play`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
