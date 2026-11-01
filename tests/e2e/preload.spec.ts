/**
 * The band screen's loader.
 *
 * Two things only a browser can see: a media element that is still arriving keeps
 * the Play button in its wait instead of starting a run without its drums, and a
 * band with everything in hand goes **straight** to the countdown rather than
 * flashing the load page. The stems are served by a real range-capable server (as
 * in `stem-sync.spec.ts`): media bytes through Playwright's router cross the
 * driver pipe and stall under load, which would test the fixture.
 */
import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "./base";
import { SONG_TITLE, disableFullscreen, installFixtures } from "./fixture";
import { enterGame, openBand, waitForPlaying } from "./helpers";

const PLAYLIST_URL =
  "https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/main/songs/playlist.json";
const ROOT = PLAYLIST_URL.slice(0, PLAYLIST_URL.lastIndexOf("/") + 1);
const SONG_ID = "preload-song";
const SONG_URL = `${ROOT}songs/${SONG_ID}.json`;
const DURATION_MS = 12_000;

/** A 16-bit PCM mono WAV of a steady tone — a stem with a real clock of its own. */
function wav(freq: number, seconds: number): Buffer {
  const rate = 22_050;
  const frames = Math.round(rate * seconds);
  const dataBytes = frames * 2;
  const out = Buffer.alloc(44 + dataBytes);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < frames; i += 1) {
    const value = Math.sin((2 * Math.PI * freq * i) / rate) * 0.2 * 32767;
    out.writeInt16LE(Math.round(value), 44 + i * 2);
  }
  return out;
}

function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /bytes=(\d*)-(\d*)/.exec(header);
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(rawStart);
  if (!Number.isFinite(start) || start >= size) return null;
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (end < start) return null;
  return { start, end };
}

const STEMS: Record<string, Buffer> = {
  "/audio/guitar.wav": wav(220, 12),
  "/audio/drums.wav": wav(110, 12),
};

/** The drum file is the one still arriving when the band screen appears. */
const DRUM_DELAY_MS = 3_500;

const server: Server = createServer((request, response) => {
  const path = (request.url ?? "/").split("?")[0];
  const bytes = STEMS[path];
  if (!bytes) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader("content-type", "audio/wav");
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("accept-ranges", "bytes");
  const span = parseRange(request.headers.range, bytes.length);
  const slice = span ? bytes.subarray(span.start, span.end + 1) : bytes;
  if (span) {
    response.writeHead(206, {
      "content-range": `bytes ${span.start}-${span.end}/${bytes.length}`,
      "content-length": String(slice.length),
    });
  } else {
    response.writeHead(200, { "content-length": String(bytes.length) });
  }
  // Headers first, body later: the element has a request in flight and no data,
  // which is exactly the state the loader has to show and wait out.
  const delay = path.endsWith("drums.wav") ? DRUM_DELAY_MS : 0;
  setTimeout(() => response.end(slice), delay);
});

const playlist = {
  schemaVersion: 1,
  name: "Preload fixtures",
  songs: [
    {
      id: SONG_ID,
      song: `songs/${SONG_ID}.json`,
      title: "Preload Song",
      artist: { id: "the-fixtures", name: "The Fixtures" },
      durationMs: DURATION_MS,
      previewStartMs: 0,
      offer: {
        instruments: [{ role: "guitar", difficulties: ["easy"] }],
        voice: null,
      },
    },
  ],
};

const chart = {
  schemaVersion: 1,
  chartType: "lanes",
  columns: 3,
  notes: [
    { timeMs: 500, lengthMs: 0, kind: "strum", column: 0 },
    { timeMs: 1_000, lengthMs: 0, kind: "strum", column: 1 },
    { timeMs: 1_500, lengthMs: 0, kind: "strum", column: 2 },
  ],
};

function songDoc(): unknown {
  return {
    schemaVersion: 1,
    id: SONG_ID,
    title: "Preload Song",
    artist: { id: "the-fixtures", name: "The Fixtures" },
    durationMs: DURATION_MS,
    previewStartMs: 0,
    audio: {
      source: "stems",
      stems: ["guitar", "drums"].map((name) => ({
        id: `stem_${name}`,
        name: name[0]!.toUpperCase() + name.slice(1),
        url: `${stemBase}/audio/${name}.wav`,
        instrument: name === "guitar" ? "lead_guitar" : "drums",
        defaultGainDb: 0,
        offsetMs: 0,
      })),
      mixPresets: {
        full: { stemIds: ["stem_guitar", "stem_drums"] },
        stems: { stemIds: ["stem_guitar", "stem_drums"] },
      },
      preview: null,
    },
    parts: [
      {
        id: "part_guitar",
        role: "guitar",
        controllerTypes: [],
        audioControl: null,
        charts: [
          {
            id: `${SONG_ID}-guitar-easy`,
            difficulty: "easy",
            chartType: "lanes",
            laneCount: 3,
            bpm: 120,
            url: `charts/${SONG_ID}/guitar-easy.json`,
          },
        ],
      },
    ],
  };
}

let stemBase = "";

/** Record every screen the document is told about, from before the press. */
async function watchScreens(page: Page): Promise<void> {
  await page.evaluate(() => {
    const record = window as unknown as { __screens?: string[] };
    record.__screens = [document.documentElement.dataset.screen ?? ""];
    new MutationObserver(() => {
      record.__screens?.push(document.documentElement.dataset.screen ?? "");
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-screen"],
    });
  });
}

async function screens(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __screens?: string[] }).__screens ?? [],
  );
}

/** The two stem elements, with their clocks and readiness. */
async function stems(page: Page): Promise<
  { name: string; time: number; ready: number; paused: boolean }[]
> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLAudioElement>(".song-audio audio")].map(
      (element) => {
        const url = decodeURIComponent(element.currentSrc || element.src);
        return {
          name: url.slice(url.lastIndexOf("/") + 1),
          time: Math.round(element.currentTime * 1000),
          ready: element.readyState,
          paused: element.paused,
        };
      },
    ),
  );
}

test.describe("the band's loader", () => {
  test.afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("Play waits for every stem, then starts without the load page", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await new Promise<void>((resolve) => {
      if (server.listening) {
        resolve();
        return;
      }
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    stemBase = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    await disableFullscreen(page);
    const documents: Record<string, unknown> = {
      [PLAYLIST_URL]: playlist,
      [SONG_URL]: songDoc(),
      [`${ROOT}songs/charts/${SONG_ID}/guitar-easy.json`]: chart,
    };
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      const parsed = new URL(url);
      if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
        await route.continue();
        return;
      }
      const body = documents[url];
      if (body !== undefined) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify(body),
        });
        return;
      }
      await route.abort();
    });

    await page.goto("/play?dev=1");
    const enter = page.getByRole("button", { name: "Enter the stage" });
    await expect(enter).toBeEnabled({ timeout: 20_000 });
    await enter.click();
    await page.getByRole("button", { name: /Quick Play/ }).click();
    await page.getByRole("button", { name: /Preload Song/ }).click();
    await page.getByRole("button", { name: "Next: your band" }).click();
    await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();
    // One guitar is the whole band; the drums are audio, not a player.
    await page.getByRole("button", { name: "Remove player 2" }).click();

    await watchScreens(page);
    const play = page.locator(".band-actions__play");
    await play.click();

    // The drum stem is still in flight: the button is the loader, and the table of
    // players stays where it is rather than handing over to the load page.
    await expect(play).toHaveText("Loading…");
    await expect(play).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator("html")).toHaveAttribute("data-screen", "band");

    await waitForPlaying(page);
    // Let the late drum be seated before reading the clocks.
    await page.waitForTimeout(1_000);

    const seen = await screens(page);
    expect(seen, "a ready band goes straight to the countdown").not.toContain("loading");

    const loaded = await stems(page);
    expect(loaded.map((stem) => stem.name).sort()).toEqual(["drums.wav", "guitar.wav"]);
    const times = loaded.map((stem) => stem.time);
    expect(
      Math.max(...times) - Math.min(...times),
      "a stem that was still arriving joins the playhead, not zero",
    ).toBeLessThan(500);

    // The dev read-out names the files and says where they are: the thing to
    // look at when a part is missing or late.
    await page.locator(".band-controls__toggle").click();
    const panel = page.locator(".band-controls");
    await expect(panel).toContainText(/guitar\.wav \d+s/);
    await expect(panel).toContainText(/drums\.wav \d+s/);
  });

  test("a band with nothing to wait for skips the load page", async ({
    context,
    page,
  }) => {
    await installFixtures(context);
    await disableFullscreen(page);
    await enterGame(page);
    await openBand(page, SONG_TITLE);
    await page.getByRole("button", { name: "Remove player 2" }).click();

    await watchScreens(page);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await waitForPlaying(page);

    const seen = await screens(page);
    expect(seen).not.toContain("loading");
    expect(seen).toContain("countdown");
  });
});
