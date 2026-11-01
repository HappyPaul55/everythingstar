import { expect, test } from "../e2e/base";
import { installRoutes, disableFullscreen } from "../e2e/fixture";
import { enterGame, waitForPlaying, waitForStage } from "../e2e/helpers";
import {
  CHART_URL,
  PLAYLIST_URL,
  SONG_URL,
  SONG_TITLE,
  chart,
  playlist,
  songDoc,
  startStems,
} from "./stems";

/**
 * The real clock: three media elements, read and corrected every frame.
 *
 * The guitar benchmark runs on the frame clock because the docs library has no
 * stems. This one serves WAVs from a local range-capable origin, so `SongAudio`'s
 * per-frame source read and drift correction are actually exercised, and the
 * playhead is the audio rather than a wall clock.
 */
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

test("stem-backed run cost", async ({ context, page }) => {
  test.setTimeout(180_000);
  const rate = Number(process.env.BENCH_RATE ?? 4);
  const profile = process.env.BENCH_PROFILE === "1";
  const withStems = process.env.BENCH_NO_STEMS !== "1";
  const stems = await startStems();
  try {
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
    await installRoutes(context, {
      [PLAYLIST_URL]: playlist,
      [SONG_URL]: songDoc(stems.base, withStems),
      [CHART_URL]: chart,
    });
    await disableFullscreen(page);
    await enterGame(page);
    await page.getByRole("button", { name: /Quick Play/ }).click();
    await page.getByRole("button", { name: new RegExp(SONG_TITLE) }).click();
    await page.getByRole("button", { name: "Next: your band" }).click();
    const remove = page.getByRole("button", { name: "Remove player 2" });
    if ((await remove.count()) > 0) await remove.click();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await waitForStage(page);
    await waitForPlaying(page);

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
          scenario: withStems ? "stems" : "no-stems",
          rate,
          frames: frames.length,
          p50: median(frames),
          p95:
            [...frames].sort((a, b) => a - b)[
              Math.floor(frames.length * 0.95)
            ] ?? 0,
          dropped: frames.filter((delay) => delay > 25).length,
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
  } finally {
    await stems.close();
  }
});
