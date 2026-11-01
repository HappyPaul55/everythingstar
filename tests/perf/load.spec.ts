import { expect, test } from "../e2e/base";
import { installFixtures } from "../e2e/fixture";

/**
 * The first load, on a slow link: hydration and the JavaScript graph.
 *
 * The frame harness starts after `waitForPlaying`; this one measures the welcome
 * appearing, which is where the module graph, the HTML and the first paint are
 * paid. It is a report, not a gate: headless timing and a shared runner are not
 * stable enough to fail a build, but the resource count and hydration number make
 * a discovery chain or a preload regression visible.
 */
test("first load cost", async ({ context, page }) => {
  test.setTimeout(180_000);
  await installFixtures(context);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        controller: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        register: () => Promise.resolve({ update: () => Promise.resolve() }),
      },
    });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  // Slow 4G, the profile the preload is meant to help.
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: 200_000,
    uploadThroughput: 100_000,
  });
  const started = Date.now();
  await page.goto("/play");
  const enter = page.getByRole("button", { name: "Enter the stage" });
  await expect(enter).toBeVisible({ timeout: 120_000 });
  const hydrationMs = Date.now() - started;
  const resources = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/_astro/"))
      .map((entry) => {
        const resource = entry as PerformanceResourceTiming;
        return {
          file: resource.name.split("/").pop(),
          start: Math.round(resource.startTime),
          end: Math.round(resource.responseEnd),
        };
      }),
  );
  console.log(
    JSON.stringify(
      {
        hydrationMs,
        jsFiles: resources.length,
        firstJsStart: Math.min(...resources.map((entry) => entry.start)),
        lastJsEnd: Math.max(...resources.map((entry) => entry.end)),
      },
      null,
      2,
    ),
  );
  expect(resources.length).toBeGreaterThan(0);
});
