import { defineConfig, devices } from "@playwright/test";

/**
 * The frame-cost harness: measured, not gated.
 *
 * It drives the real game against a **production build** (`astro preview`) and
 * reads Chrome DevTools' `Performance` metrics under a CPU throttle. The dev
 * server is not the thing players run: its JSX dev runtime dominated an earlier
 * profile, so the numbers must come from the build. It is its own command so a timing
 * number never makes a pull request red — the docs explain the method and the
 * numbers live in the commit that changes the drawing. Run it before and after
 * such a change:
 *
 *     bun run perf
 *
 * `BENCH_SEATS=1` and `BENCH_RATE=1` make it cheaper and unthrottled.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4323);

export default defineConfig({
  testDir: "./tests/perf",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "perf",
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
        // A fake microphone, so the singing path (and its pitch detector) can be
        // measured without a device. It is the browser's own fake, not a product
        // hook: the game still asks for a real permission.
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      },
    },
  ],
  webServer: {
    command: `DOCSHOTS_PWA=1 bun run build:quick && bun run preview --host 127.0.0.1 --port ${PORT} --ignore-lock`,
    url: `http://127.0.0.1:${PORT}/play`,
    // A preview of a stale build is worse than a slow start: always rebuild.
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
