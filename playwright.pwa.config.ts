import { defineConfig, devices } from "@playwright/test";

/**
 * The installed game, tested against a **production build**.
 *
 * The ordinary smoke suite runs on the dev server, where there is no `sw.js` and
 * therefore no offline half. This one builds the site, serves `dist/` with
 * `astro preview`, lets the worker take over, and then cuts the network: the
 * welcome has to appear from the shell cache, not from the server.
 *
 * It is a separate command (`bun run test:pwa`) and a separate CI step, because it
 * costs a build. It is opt-in in the sense that nobody's ordinary dev loop runs it.
 */
const PORT = Number(process.env.PLAYWRIGHT_PWA_PORT ?? 4322);

/**
 * CI's build job has already built `dist/` once, with the real documentation
 * captures. Set `PLAYWRIGHT_PWA_BUILT=1` there and this config only serves that
 * build. A local `test:pwa` still builds a throwaway copy, so it needs no capture
 * run.
 */
const PREBUILT = process.env.PLAYWRIGHT_PWA_BUILT === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  // The install test, plus the computed-style guard for `/play`: that one only
  // failed against the built CSS bundle, so it has to run here as well as in the
  // dev suite.
  testMatch: ["**/pwa.spec.ts", "**/play-style.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // The same refusal as the smoke suite: a `test.only` must not turn CI green
  // with the rest of the install test missing.
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Its own output directory, because a run clears it first. The e2e run's traces
  // and the JUnit reports sit beside it, not inside it.
  outputDir: "test-results/pwa",
  reporter: [["list"], ["junit", { outputFile: "test-results/pwa-junit.xml" }]],
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
    // The installed game does not carry the documentation, and the capture run is
    // five minutes of browser: a local build asks for the docs placeholder rather
    // than the real captures. What the worker and `/play`'s CSS need is the same
    // either way. CI's build job sets PREBUILT and serves the build it already
    // checked, so there is no second build.
    command: `${
      PREBUILT ? "" : "DOCSHOTS_PWA=1 bun run build:quick && "
    }bun run preview --host 127.0.0.1 --port ${PORT} --ignore-lock`,
    url: `http://127.0.0.1:${PORT}/app`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
