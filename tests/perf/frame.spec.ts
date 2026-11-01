import { expect, test } from "../e2e/base";
import { installDocsFixtures } from "../e2e/docs-library";
import { disableFullscreen } from "../e2e/fixture";
import {
  enterGame,
  openDocsBand,
  seatPlayers,
  setSlot,
  waitForStage,
  waitForPlaying,
} from "../e2e/helpers";

/**
 * Four panels, eight seconds, CPU throttled: what a drawing change costs.
 *
 * Headless Chromium caps rAF at about 15 fps, so the frame deltas are not the
 * number to compare across machines. `ScriptDuration`, `LayoutCount`,
 * `RecalcStyleCount` and the heap are. A single note renders only when its own
 * state changes; that is the change this guards.
 */
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

test("four-panel frame and task cost", async ({ context, page }) => {
  const seats = Number(process.env.BENCH_SEATS ?? 4);
  const rate = Number(process.env.BENCH_RATE ?? 4);
  const scenario = process.env.BENCH_SCENARIO ?? "guitars";
  const profile = process.env.BENCH_PROFILE === "1";

  if (scenario === "singer") {
    await context.grantPermissions(["microphone"]);
  }
  const view = process.env.BENCH_VIEW;
  if (view) {
    await page.addInitScript((chosen) => {
      localStorage.setItem(
        "everythingstar:settings",
        JSON.stringify({ view: chosen }),
      );
    }, view);
  }
  // The worker is the only thing a preview carries that the dev server does not.
  // This is the installed-game test's subject, not the frame's: a no-op
  // registration keeps the page on the network and the fixtures answerable.
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

  await installDocsFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);
  await openDocsBand(page);
  await seatPlayers(page, 1);
  if (scenario === "singer") {
    await setSlot(page, 1, "Vocals");
  } else {
    await seatPlayers(page, seats);
    for (let seat = 1; seat <= seats; seat += 1) {
      await setSlot(page, seat, "Guitar");
    }
  }
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await waitForStage(page);
  await waitForPlaying(page);
  const width = Number(process.env.BENCH_WIDTH ?? 0);
  const height = Number(process.env.BENCH_HEIGHT ?? 0);
  if (width > 0 && height > 0) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
  }

  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  await page.waitForTimeout(1_000);
  if (profile) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 1_000 });
    await cdp.send("Profiler.start");
  }

  const before = await cdp.send("Performance.getMetrics");
  const frames = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const deltas: number[] = [];
        let last = performance.now();
        const start = last;
        const step = (now: number) => {
          deltas.push(now - last);
          last = now;
          if (now - start < 8_000) requestAnimationFrame(step);
          else resolve(deltas);
        };
        requestAnimationFrame(step);
      }),
  );
  const after = await cdp.send("Performance.getMetrics");
  if (profile) {
    const { profile: taken } = await cdp.send("Profiler.stop");
    const nodes = new Map(taken.nodes.map((node) => [node.id, node]));
    const self = new Map<string, number>();
    const samples = taken.samples ?? [];
    const deltas = taken.timeDeltas ?? [];
    samples.forEach((id, index) => {
      const node = nodes.get(id);
      if (!node) return;
      const frame = node.callFrame;
      const file = frame.url.split("/").pop() ?? "(inline)";
      const key = `${frame.functionName || "(anonymous)"} — ${file}:${frame.lineNumber}`;
      self.set(key, (self.get(key) ?? 0) + (deltas[index] ?? 0));
    });
    console.log(
      "profile:",
      JSON.stringify(
        [...self.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([key, micros]) => [key, Math.round(micros / 1000)]),
        null,
        2,
      ),
    );
  }
  const value = (snapshot: typeof before, name: string) =>
    snapshot.metrics.find((metric) => metric.name === name)?.value ?? 0;
  const delta = (name: string) => value(after, name) - value(before, name);

  console.log(
    JSON.stringify(
      {
        scenario,
        seats,
        rate,
        frames: frames.length,
        p50: median(frames),
        p95:
          [...frames].sort((a, b) => a - b)[
            Math.floor(frames.length * 0.95)
          ] ?? 0,
        dropped: frames.filter((value) => value > 25).length,
        taskMs: delta("TaskDuration") * 1000,
        scriptMs: delta("ScriptDuration") * 1000,
        layout: delta("LayoutCount"),
        recalcStyle: delta("RecalcStyleCount"),
        heapMb: value(after, "JSHeapUsedSize") / 1048576,
        nodes: value(after, "Nodes"),
      },
      null,
      2,
    ),
  );
  expect(frames.length).toBeGreaterThan(0);
});
