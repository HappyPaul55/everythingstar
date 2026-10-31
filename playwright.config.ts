import { availableParallelism } from "node:os";
import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests.
 *
 * The unit suite proves the pure parts; this is the only gate that mounts the
 * island and drives the screen machine in a real browser. The **dev server** is
 * the target rather than a preview build: `bun run verify` already builds the app,
 * and the smoke test is about the loop rather than the bundle, so starting Vite
 * keeps the run a single command with no second build to keep in step.
 *
 * Every external request is routed by the specs (`tests/e2e/fixture.ts`); the
 * browser never reaches the public FOSS playlist or YouTube. A local run stays on
 * one worker, so the timing-sensitive run is as quiet as the specs assume; CI
 * takes every core but one, because the suite is CPU-bound and a single worker
 * spends most of the run waiting on the test before it.
 */
// A worktree checkout can already hold 4321; let a local run pick another port
// rather than silently reusing a different tree's dev server.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4321);

export default defineConfig({
  testDir: "./tests/e2e",
  // The worker spec needs a production build and `astro preview`; it has its own
  // config (`playwright.pwa.config.ts`) and command. The documentation's capture
  // tests have their own config too (`playwright.docs.config.ts`): they take the
  // screenshots the build needs.
  testIgnore: ["**/pwa.spec.ts", "**/docs/**"],
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
      use: { ...devices["Desktop Chrome"], headless: true },
    },
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
