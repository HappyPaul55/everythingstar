import { defineConfig, devices } from "@playwright/test";

/**
 * The frame-cost harness: measured, not gated.
 *
 * It drives the real game against the dev server and reads Chrome DevTools'
 * `Performance` metrics under a CPU throttle. It is its own command so a timing
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
  projects: [{ name: "perf", use: { ...devices["Desktop Chrome"], headless: true } }],
  webServer: {
    command: `bun run dev --host 127.0.0.1 --port ${PORT} --ignore-lock`,
    url: `http://127.0.0.1:${PORT}/play`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
