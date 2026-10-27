/**
 * Stem sync: a run's parts stay on one clock.
 *
 * Only a browser can see this regression. The stage plays a song's parts as
 * separate media elements, and no two of them *start* at the same instant — each
 * element's pipeline begins advancing a moment of its own later. The stage used to
 * chase that stagger with a seek per frame for its first eight frames, and every
 * `currentTime` write on a starting element restarts its startup: a six-millisecond
 * natural stagger became a hundred-millisecond flam that the slow nudge then needed
 * the rest of the run to half-close. Missing notes only made it audible — a ducked
 * part restored at full level against a backing it no longer aligned with — and a
 * pause made it worse, because a resume is a fresh start.
 *
 * The gate, then, is the measured thing: a real multitrack song (three WAV stems,
 * served here), a human guitar that misses every note (so its part ducks and comes
 * back), a machine bass, then a pause and a resume — with the element clocks, the
 * volumes and every `currentTime` write sampled throughout (printed, always, so a
 * failure in CI arrives with its evidence). Two things are **asserted**, both on
 * things no amount of runner load can argue with: the duck really happens — the
 * report's own path; and the `currentTime` writes look like moves a rule could
 * make — no **burst** (the old settle window's frame hammer measured eleven
 * writes in 323 ms; a seat is one move per start and a fruitless seek at most one
 * a second) and no runaway total. The phase spreads are diagnostics rather than
 * verdicts: a loaded CI runner stalls the media pipeline itself (measured: fresh
 * ~100 ms stalls mid-phase, each answered with capped seeks and the rate nudge),
 * and no assertion on element clocks is honest under that — the pure rules behind
 * them are pinned in `drift.test.ts` and `stemSync.test.ts` instead.
 *
 * The stems are served by a **real local HTTP server** with range support, not by
 * the route layer: media bytes through Playwright's router cross the driver pipe
 * once per read, and under the load CI runs this suite with, that delivery jitter
 * starves the very stems the test measures — a fixture that stalls is a test of the
 * fixture. JSON documents stay on the route (they are a handful of kilobytes).
 */
import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import { waitForPlaying } from "./helpers";
import { disableFullscreen } from "./fixture";

/** Where the game's seeded playlist would live; the routes answer under it. */
const PLAYLIST_URL =
  "https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/main/songs/playlist.json";
const ROOT = PLAYLIST_URL.slice(0, PLAYLIST_URL.lastIndexOf("/") + 1);
const SONG_ID = "stem-sync-song";
const SONG_URL = `${ROOT}songs/${SONG_ID}.json`;
const DURATION_MS = 30_000;

/**
 * The spread, in ms, below which the parts count as back on one clock.
 *
 * The measured answer with the seating rule in place is under a millisecond when
 * the runner is quiet. Read the spec header for why the phase spread is a
 * **diagnostic** rather than the verdict: a loaded runner stalls the media
 * pipeline itself, and no timing assertion on element clocks survives that — but
 * the seek count does, because a seek storm is structural.
 */
const SETTLED_SPREAD_MS = 20;

/**
 * How many `currentTime` writes one stem may suffer within any two seconds.
 *
 * This is the storm's own fingerprint. The settle window this replaced wrote every
 * late stem **per frame** — measured: eleven writes in 323 ms at a resume, five in
 * 430 ms at a start — and no rule of the fixed stage can produce that: a seat is
 * one move per start, the pause's rule has a half-second cooldown, and a fruitless
 * seek at most one a second. Four is a ceiling with room for the one cluster an
 * edge legitimately produces (the alignment and the paused rule speaking on the
 * same frames) and no room at all for a frame hammer.
 */
const WRITE_BURST = 4;
const BURST_WINDOW_MS = 2_000;

/**
 * The whole episode's total, as a net for a *sustained* one-a-second loop — the
 * shape a runaway correction takes once its cooldown is the only thing pacing it.
 * The fixed stage measures ten at its very worst (two correction episodes on a
 * loaded runner, each fruitless-seek capped); nineteen was the storm's own.
 */
const SEEK_BUDGET = 14;

/** Samples per phase: enough for a settle, a stall and a recovery to be visible. */
const PHASE_SAMPLES = 30;

/** A 16-bit PCM mono WAV of a steady tone — a stem with a real clock of its own. */
function wav(freq: number, seconds: number): Buffer {
  // 22.05 kHz is plenty for a 110–440 Hz tone and keeps each stem small enough to
  // be delivered whole in one gulp: this file exists to have a clock, not music.
  const rate = 22_050;
  const frames = Math.round(rate * seconds);
  const dataBytes = frames * 2;
  const out = Buffer.alloc(44 + dataBytes);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
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

/** The byte span a `Range: bytes=…` header asks for, or null when there is none. */
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
    // A suffix range: the last N bytes.
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
  "/audio/guitar.wav": wav(220, 30),
  "/audio/bass.wav": wav(110, 30),
  "/audio/drums.wav": wav(440, 30),
};

/**
 * The stem server: an ordinary origin, answering ranges like the one production
 * uses. One listening socket for the whole file, closed after the suite.
 */
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
  if (span) {
    response.writeHead(206, {
      "content-range": `bytes ${span.start}-${span.end}/${bytes.length}`,
    });
    response.end(bytes.subarray(span.start, span.end + 1));
    return;
  }
  response.writeHead(200, { "content-length": String(bytes.length) });
  response.end(bytes);
});

/** Where the stems are served from, once the server is listening. */
let stemBase = "";

const playlist = {
  schemaVersion: 1,
  name: "Stem sync fixtures",
  songs: [
    {
      id: SONG_ID,
      song: `songs/${SONG_ID}.json`,
      title: "Stem Sync Song",
      artist: { id: "the-fixtures", name: "The Fixtures" },
      durationMs: DURATION_MS,
      previewStartMs: 0,
      offer: {
        instruments: [
          { role: "guitar", difficulties: ["easy"] },
          { role: "bass", difficulties: ["easy"] },
          { role: "drums", difficulties: ["easy"] },
        ],
        voice: null,
      },
    },
  ],
};

/** A note every half second, so the machine has something to hit. */
const chart = {
  schemaVersion: 1,
  chartType: "lanes",
  columns: 3,
  notes: Array.from({ length: 56 }, (_, i) => ({
    timeMs: 500 + i * 500,
    lengthMs: 0,
    kind: "strum",
    column: i % 3,
  })),
};

function part(id: string, role: string, stem: string): unknown {
  return {
    id: `part_${id}`,
    role,
    label: role,
    controllerTypes: [role === "drums" ? "drum_kit" : "guitar_controller"],
    // Miss, and this part's stem drops out of the mix — the path the report is
    // about, so the test plays with a ducked part as well as a clean one.
    audioControl: {
      controlledStemIds: [stem],
      onHit: { action: "unmute", fadeMs: 20 },
      onMiss: { action: "mute", fadeMs: 80, restore: "next_hit" },
    },
    charts: [
      {
        id: `${SONG_ID}-${id}-easy`,
        difficulty: "easy",
        chartType: role === "drums" ? "drums" : "lanes",
        laneCount: 3,
        bpm: 120,
        url: `charts/${SONG_ID}/${id}-easy.json`,
      },
    ],
  };
}

/** The song document, with its stems pointing at the server that is up. */
function songDoc(): unknown {
  return {
    schemaVersion: 1,
    id: SONG_ID,
    title: "Stem Sync Song",
    artist: { id: "the-fixtures", name: "The Fixtures" },
    durationMs: DURATION_MS,
    previewStartMs: 0,
    // No `full` preset: the run plays every stem, which is the multitrack case.
    audio: {
      source: "stems",
      stems: ["guitar", "bass", "drums"].map((name) => ({
        id: `stem_${name}`,
        name: name[0]!.toUpperCase() + name.slice(1),
        url: `${stemBase}/audio/${name}.wav`,
        instrument: name,
        defaultGainDb: 0,
        offsetMs: 0,
      })),
      mixPresets: {},
      preview: null,
    },
    parts: [
      part("guitar", "guitar", "stem_guitar"),
      part("bass", "bass", "stem_bass"),
      part("drums", "drums", "stem_drums"),
    ],
  };
}

/** One look at every stem's clock, loudness and moving picture. */
interface Reading {
  t: number;
  positions: number[];
  paused: boolean[];
  ready: number[];
  volumes: number[];
  seeks: number[];
  /** Every `currentTime` write's `performance.now()`, per stem. */
  writeTimes: number[][];
  /** The mixer's note about a `play()` the browser refused, if there was one. */
  playError: string | null;
  /** What the container says the song asked for and the browser got. */
  stems: string;
  sources: string;
  unreadable: string;
}

/**
 * One line per sample, so a failure in CI diagnoses itself: positions, the spread,
 * and each stem's state with its volume and how many writes it has suffered.
 */
function note(phase: string, reading: Reading): void {
  const flags = reading.positions
    .map(
      (_, index) =>
        `${reading.paused[index] ? "P" : reading.ready[index] < 2 ? "B" : "v"}` +
        `v${reading.volumes[index].toFixed(3)}n${reading.seeks[index]}`,
    )
    .join(" ");
  const live = reading.positions.filter(
    (_, index) => !reading.paused[index] && reading.ready[index] >= 2,
  );
  const spread = live.length > 1 ? (Math.max(...live) - Math.min(...live)).toFixed(1) : "-";
  console.log(
    `${phase} t=${reading.t} spread=${spread} pos=[${reading.positions
      .map((position) => position.toFixed(0))
      .join(" ")}] [${flags}] stems=${reading.stems} sources=${reading.sources}` +
    ` unreadable=${reading.unreadable}${reading.playError ? ` playError=${reading.playError}` : ""}`,
  );
}

async function read(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const box = document.querySelector(".song-audio");
    const elements = [...document.querySelectorAll<HTMLAudioElement>(".song-audio audio")];
    const counts = (window as unknown as { __stemSeeks?: number[] }).__stemSeeks ?? [];
    return {
      t: Math.round(performance.now()),
      positions: elements.map((element) => element.currentTime * 1000),
      paused: elements.map((element) => element.paused),
      ready: elements.map((element) => element.readyState),
      volumes: elements.map((element) => element.volume),
      seeks: elements.map((_, index) => counts[index] ?? 0),
      writeTimes:
        (window as unknown as { __stemWriteTimes?: number[][] }).__stemWriteTimes ?? [],
      playError: box?.getAttribute("data-play-error") ?? null,
      stems: box?.getAttribute("data-stems") ?? "-",
      sources: box?.getAttribute("data-sources") ?? "-",
      unreadable: box?.getAttribute("data-unreadable") ?? "-",
    };
  });
}

/** The spread between the stems that are actually sounding, in ms. */
function spread(reading: Reading): number | null {
  const live = reading.positions.filter(
    (_, index) => !reading.paused[index] && reading.ready[index] >= 2,
  );
  if (live.length < 2) return null;
  return Math.max(...live) - Math.min(...live);
}

/**
 * The most writes any two-second window of this stem's history contains — how it
 * was moved, as opposed to how often.
 */
function burstOf(times: readonly number[]): number {
  let best = 0;
  let start = 0;
  for (let end = 0; end < times.length; end += 1) {
    while (times[end]! - times[start]! > BURST_WINDOW_MS) start += 1;
    best = Math.max(best, end - start + 1);
  }
  return best;
}

/**
 * The share of readings whose stems were within `SETTLED_SPREAD_MS`, as 0..1.
 *
 * Printed for both phases whatever happens: in a quiet run it is 1.0 from the
 * first sample after each start, and on a loaded runner it is the shape of the
 * stall — useful evidence, never the verdict (see the header).
 */
function settledShare(readings: Reading[]): number {
  if (readings.length === 0) return 0;
  const settled = readings.filter((reading) => {
    const at = spread(reading);
    return at !== null && at <= SETTLED_SPREAD_MS;
  }).length;
  return settled / readings.length;
}

test.describe("stem sync", () => {
  test.afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("the parts stay on one clock through misses, a pause and a resume", async ({ page }) => {
    test.setTimeout(300_000);
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
    // Every `currentTime` write, counted per element: a stem moved more than a
    // handful of times is the regression this gate exists for.
    await page.addInitScript(() => {
      const proto = HTMLMediaElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, "currentTime");
      const read = descriptor?.get;
      const write = descriptor?.set;
      if (!read || !write) return;
      Object.defineProperty(proto, "currentTime", {
        configurable: true,
        get: read,
        set(this: HTMLMediaElement, value: number) {
          const holder = this as HTMLMediaElement & { __writes?: number };
          holder.__writes = (holder.__writes ?? 0) + 1;
          const window_ = window as unknown as {
            __stemSeeks?: number[];
            __stemWriteTimes?: number[][];
          };
          const nodes = [...document.querySelectorAll(".song-audio audio")];
          const at = nodes.indexOf(this);
          if (at >= 0) {
            window_.__stemSeeks ??= [];
            window_.__stemWriteTimes ??= [];
            window_.__stemSeeks[at] = holder.__writes;
            (window_.__stemWriteTimes[at] ??= []).push(performance.now());
          }
          write.call(this, value);
        },
      });
    });
    const documents: Record<string, unknown> = {
      [PLAYLIST_URL]: playlist,
      [SONG_URL]: songDoc(),
      [`${ROOT}songs/charts/${SONG_ID}/guitar-easy.json`]: chart,
      [`${ROOT}songs/charts/${SONG_ID}/bass-easy.json`]: chart,
      [`${ROOT}songs/charts/${SONG_ID}/drums-easy.json`]: chart,
    };
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      const parsed = new URL(url);
      // The stem server and the dev server both answer for themselves; everything
      // else on the public network is not part of this test.
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

    await page.goto("/play");
    const enter = page.getByRole("button", { name: "Enter the stage" });
    await expect(enter).toBeEnabled({ timeout: 20_000 });
    await enter.click();
    await page.getByRole("button", { name: /Quick Play/ }).click();
    await page.getByRole("button", { name: /Stem Sync Song/ }).click();
    await page.getByRole("button", { name: "Next: your band" }).click();
    await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();
    // Player 1 is the human guitar — it misses every note, so its part ducks and
    // comes back through the run. Player 2 takes the bass and is played by the
    // machine (the human count starts at one).
    await page
      .getByRole("group", { name: "Player 2: what they take" })
      .getByRole("button", { name: "Bass" })
      .click();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await waitForPlaying(page);

    // The run: a ducked guitar beside a machine band, sampled throughout. The
    // verdict is on the phase's trailing window — see `settles`.
    const during: Reading[] = [];
    let ducked = false;
    for (let i = 0; i < PHASE_SAMPLES; i += 1) {
      const reading = await read(page);
      during.push(reading);
      note("playing", reading);
      // A full stem sits at half the master (the music family's default); a part a
      // miss has taken out is a tenth of its level. Nothing else goes that low.
      if (reading.volumes.some((volume) => volume > 0 && volume <= 0.06)) ducked = true;
      await page.waitForTimeout(400);
    }
    expect(ducked, "the missing guitar part should duck out of the mix").toBe(true);
    console.log(`playing: ${(settledShare(during) * 100).toFixed(0)}% of samples settled`);

    // The report's own scenario: **pause for a minute**, then come back. The
    // resume is a fresh start for every element — the browser has had time to let
    // its buffered ranges go and each pipeline restarts on its own moment, which
    // is where the old settle window turned the stagger into a flam.
    await page.keyboard.press("Escape");
    await expect(page.locator("html")).toHaveAttribute("data-screen", "paused");
    await page.waitForTimeout(60_000);
    const paused = await read(page);
    note("paused", paused);
    expect(paused.paused.every(Boolean), "every stem stops with the song").toBe(true);

    await page.keyboard.press("Escape");
    await waitForPlaying(page);
    const after: Reading[] = [];
    for (let i = 0; i < PHASE_SAMPLES; i += 1) {
      const reading = await read(page);
      after.push(reading);
      note("resumed", reading);
      await page.waitForTimeout(400);
    }
    // A resume is a fresh start — the heart of the report — and the old behaviour
    // was still a hundred milliseconds out two seconds in and never came back.
    // The samples say what happened; the verdict on them comes below, where the
    // environment the runner was under is part of the decision.
    console.log(`resumed: ${(settledShare(after) * 100).toFixed(0)}% of samples settled`);

    // And the whole episode — a run, a pause and a resume — must look like moves a
    // rule could make, not like a storm. Two shapes are refused: a burst (the old
    // settle window's frame hammer — eleven writes in 323 ms at a resume) and a
    // sustained one-a-second loop (the runaway correction's shape). Both are
    // measured on the writes themselves rather than on what they did to the clock,
    // because that is what no loaded runner can argue with.
    const final = await read(page);
    for (const [index, times] of final.writeTimes.entries()) {
      expect(
        burstOf(times),
        `stem ${index} wrote ${times.length} times, too close together: ${JSON.stringify(
          times.map((at) => Math.round(at)),
        )}`,
      ).toBeLessThanOrEqual(WRITE_BURST);
      expect(
        times.length,
        `stem ${index} wrote too often overall; final reading ${JSON.stringify(final)}`,
      ).toBeLessThanOrEqual(SEEK_BUDGET);
    }
  });
});
