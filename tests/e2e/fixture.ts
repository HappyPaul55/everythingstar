import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * The fixture library the browser tests read.
 *
 * The game seeds the **published EverythingStar FOSS** playlist from
 * `raw.githubusercontent.com` on a first visit. A test must not depend on that
 * host, so the playlist, its song document, its chart and one tiny `.sng` package
 * are answered by `context.route` under the very URL the game seeds — the app is
 * not given a test-only path or hook. Any other external request is aborted and
 * recorded, so a new network dependency fails the hermeticity check instead of
 * leaking into a run.
 *
 * The first song is deliberately tiny and has **no audio stems**: a few notes on
 * one easy guitar chart, four seconds long, so the run finishes quickly and the
 * frame loop is the clock. The second is the same idea in a package: one chart, no
 * stems, small enough to be built here rather than a binary fixture.
 */

/** The URL `GameApp` seeds. */
const PLAYLIST_URL =
  "https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/main/songs/playlist.json";

/** Where the fixture's relative paths resolve. */
const ROOT = PLAYLIST_URL.slice(0, PLAYLIST_URL.lastIndexOf("/") + 1);

const SONG_ID = "tiny-test-song";
export const SONG_TITLE = "Tiny Test Song";
export const SONG_ARTIST = "The Fixtures";

const songUrl = `${ROOT}songs/${SONG_ID}.json`;
const chartUrl = `${ROOT}songs/charts/${SONG_ID}/guitar-easy.json`;

/**
 * The package fixture: one chart and no stems, so the jukebox's preview fetch and
 * the band's load are the two readers the one-visit cache exists for.
 *
 * It is built here rather than checked in as a binary: the bytes are a header, a
 * file index and one masked `.chart`, which is a few hundred bytes in this file.
 */
const SNG_SONG_ID = "tiny-package-song";
export const SNG_SONG_TITLE = "Tiny Package Song";
/** The song inside `folderFixtureFile()`, distinct from the playlist's songs. */
export const FOLDER_SONG_TITLE = "Tiny Folder Song";
const sngUrl = `${ROOT}songs/${SNG_SONG_ID}.sng`;

const SNG_MASK = new Uint8Array([
  0x13, 0x9a, 0x2c, 0x44, 0xf1, 0x08, 0xa7, 0x5d, 0xe2, 0x71, 0x3b, 0xc6, 0x90, 0x1d, 0x6e, 0xbb,
]);

const encoder = new TextEncoder();

const PACKAGE_CHART = [
  "[Song]",
  "{",
  `  Name = ${SNG_SONG_TITLE}`,
  `  Artist = ${SONG_ARTIST}`,
  "  Resolution = 480",
  "}",
  "[SyncTrack]",
  "{",
  "  0 = B 120000",
  "}",
  "[EasySingle]",
  "{",
  "  960 = N 0 0",
  "  1440 = N 1 0",
  "}",
  "",
].join("\n");

const SONG_PACKAGE = buildSngPackage(
  { name: SNG_SONG_TITLE, artist: SONG_ARTIST, song_length: "4200" },
  { "notes.chart": encoder.encode(PACKAGE_CHART) },
);

let packageFile: string | null = null;

/**
 * The `.sng` fixture as a real file, for a file input.
 *
 * An import test must hand the input what a player would pick, and a package is
 * bytes rather than JSON. It is written once per test process to the system's
 * temporary directory; the fixture is tiny and nothing reads it back.
 */
export function sngFixtureFile(): string {
  if (packageFile) return packageFile;
  const dir = mkdtempSync(join(tmpdir(), "everythingstar-sng-"));
  packageFile = join(dir, `${SNG_SONG_ID}.sng`);
  writeFileSync(packageFile, SONG_PACKAGE);
  return packageFile;
}

let folderFixture: string | null = null;

/**
 * A folder of loose chart files, for the directory input's own test.
 *
 * The package path covers the single-file import; this is the other shape the
 * picker has: a directory, with one song folder inside it.
 */
export function folderFixtureFile(): string {
  if (folderFixture) return folderFixture;
  const root = mkdtempSync(join(tmpdir(), "everythingstar-folder-"));
  const song = join(root, `${SONG_ARTIST} - ${FOLDER_SONG_TITLE}`);
  mkdirSync(song, { recursive: true });
  writeFileSync(join(song, "song.ini"), `[song]\nname = ${FOLDER_SONG_TITLE}\nartist = ${SONG_ARTIST}\n`);
  writeFileSync(
    join(song, "notes.chart"),
    [
      "[Song]",
      "{",
      `  Name = ${FOLDER_SONG_TITLE}`,
      `  Artist = ${SONG_ARTIST}`,
      "  Resolution = 480",
      "}",
      "[SyncTrack]",
      "{",
      "  0 = B 120000",
      "}",
      "[EasySingle]",
      "{",
      "  960 = N 0 0",
      "  1440 = N 1 0",
      "}",
      "",
    ].join("\n"),
  );
  folderFixture = root;
  return root;
}

const playlist = {
  schemaVersion: 1,
  name: "Browser test fixtures",
  description: "One tiny, silent song with a single easy guitar chart.",
  songs: [
    {
      id: SONG_ID,
      song: `songs/${SONG_ID}.json`,
      title: SONG_TITLE,
      artist: { id: "the-fixtures", name: SONG_ARTIST },
      durationMs: 4200,
      previewStartMs: 0,
      offer: {
        instruments: [{ role: "guitar", difficulties: ["easy"] }],
        voice: null,
      },
    },
    {
      id: SNG_SONG_ID,
      song: `songs/${SNG_SONG_ID}.sng`,
      title: SNG_SONG_TITLE,
      artist: { id: "the-fixtures", name: SONG_ARTIST },
      durationMs: 4200,
      previewStartMs: 0,
      offer: {
        instruments: [{ role: "guitar", difficulties: ["easy"] }],
        voice: null,
      },
    },
  ],
};

const song = {
  schemaVersion: 1,
  id: SONG_ID,
  title: SONG_TITLE,
  artist: { id: "the-fixtures", name: SONG_ARTIST },
  durationMs: 4200,
  previewStartMs: 0,
  // No stems: the run is driven by the frame loop, and there is nothing to
  // stream, decode or wait for.
  audio: { source: "stems", stems: [], mixPresets: {} },
  parts: [
    {
      id: `part_guitar`,
      role: "guitar",
      label: "Guitar",
      controllerTypes: ["guitar_controller"],
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

const chart = {
  schemaVersion: 1,
  chartType: "lanes",
  columns: 3,
  // The first note is a **chord** — two columns at one moment — so a two-finger tap
  // has something to land on. `tests/e2e/tap.spec.ts` is the only reader that cares;
  // every other spec plays this chart or ignores it.
  notes: [
    { timeMs: 500, lengthMs: 0, kind: "strum", column: 0 },
    { timeMs: 500, lengthMs: 0, kind: "strum", column: 2 },
    { timeMs: 1000, lengthMs: 0, kind: "strum", column: 1 },
    { timeMs: 1500, lengthMs: 0, kind: "strum", column: 2 },
    { timeMs: 2000, lengthMs: 0, kind: "strum", column: 0 },
    { timeMs: 2500, lengthMs: 0, kind: "strum", column: 1 },
    { timeMs: 3000, lengthMs: 0, kind: "strum", column: 2 },
    { timeMs: 3500, lengthMs: 0, kind: "strum", column: 0 },
    { timeMs: 3900, lengthMs: 0, kind: "strum", column: 1 },
  ],
};

/** Every note the fixture chart carries: the denominator a results card reads. */
export const FIXTURE_NOTE_COUNT = chart.notes.length;

/** Every document the fixture library needs, by the URL the game asks for. */
const RESPONSES: Record<string, unknown> = {
  [PLAYLIST_URL]: playlist,
  [songUrl]: song,
  [chartUrl]: chart,
  [sngUrl]: SONG_PACKAGE,
};

/**
 * The **large** fixture: a deterministic library of 2,000 songs, one letter at
 * a time, so the jukebox's window can be tested against the size it exists for.
 *
 * The tiny fixture above stays the default for every other spec. This one is
 * only a playlist (plus one silent song document for previews), because the
 * window spec never leaves the list: it does not need 2,000 charts to prove how
 * many rows are in the DOM.
 */
export const BIG_SONG_COUNT = 2_000;

/** Titles in list order — the fixture's own A–Z, which the list must preserve. */
export const BIG_SONG_TITLES: string[] = (() => {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const base = Math.floor(BIG_SONG_COUNT / letters.length);
  const spare = BIG_SONG_COUNT % letters.length;
  const titles: string[] = [];
  letters.forEach((letter, index) => {
    const count = base + (index < spare ? 1 : 0);
    for (let at = 0; at < count; at += 1) {
      titles.push(`${letter} Song ${String(at + 1).padStart(3, "0")}`);
    }
  });
  return titles;
})();

/** The id of the song at a list position. */
export function bigSongId(index: number): string {
  return `big-${index}`;
}

const bigSongDocUrl = `${ROOT}songs/big-empty.json`;

const bigPlaylist = {
  schemaVersion: 1,
  name: "Browser test fixtures — 2,000 songs",
  description: "A generated library big enough to need a windowed list.",
  songs: BIG_SONG_TITLES.map((title, index) => ({
    id: bigSongId(index),
    song: "songs/big-empty.json",
    title,
    artist: { id: "the-fixtures", name: SONG_ARTIST },
    durationMs: 90_000,
    previewStartMs: 0,
    offer: {
      instruments: [{ role: "guitar", difficulties: ["easy"] }],
      voice: null,
    },
  })),
};

const bigSongDoc = {
  schemaVersion: 1,
  id: "big-empty",
  title: "Empty fixture",
  artist: { id: "the-fixtures", name: SONG_ARTIST },
  durationMs: 90_000,
  previewStartMs: 0,
  audio: { source: "stems", stems: [], mixPresets: {} },
  parts: [],
};

/** A binary response: a picture the fixture serves under a URL the game asks for. */
export interface FixtureFile {
  body: Uint8Array;
  contentType: string;
}

function isFixtureFile(value: unknown): value is FixtureFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "body" in value &&
    "contentType" in value
  );
}

export async function installRoutes(
  context: BrowserContext,
  responses: Record<string, unknown>,
  seen?: (url: string) => void,
  /**
   * Hosts a spec means to leave unanswered (a stem that must fail). They are
   * aborted like any unknown host, but not recorded as a leak.
   */
  allowed: readonly RegExp[] = [],
): Promise<string[]> {
  const leaked: string[] = [];
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    const parsed = new URL(url);
    if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
      await route.continue();
      return;
    }
    const body = responses[url];
    if (body !== undefined) {
      seen?.(url);
      if (isFixtureFile(body)) {
        await route.fulfill({
          status: 200,
          contentType: body.contentType,
          headers: { "access-control-allow-origin": "*" },
          body: Buffer.from(body.body),
        });
        return;
      }
      if (body instanceof Uint8Array) {
        await route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          headers: { "access-control-allow-origin": "*" },
          body: Buffer.from(body),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });
      return;
    }
    if (allowed.some((pattern) => pattern.test(url))) {
      await route.abort();
      return;
    }
    leaked.push(url);
    await route.abort();
  });
  // Registered here, not only by `installFixtures`: a spec that routes directly
  // (a custom playlist, a failing host) gets the same automatic check instead of
  // silently aborting something it did not expect.
  leakLists.set(context, leaked);
  return leaked;
}

/**
 * Route every external request, and return what could not be answered.
 *
 * The returned array fills as the page runs; a spec checks it after the loop so
 * an unexpected host (YouTube, a font CDN, a new playlist) is a failure rather
 * than a silent network dependency. The list is also kept against the context, so
 * the suite's automatic fixture (`base.ts`) checks it even when a spec forgets to.
 */
const leakLists = new WeakMap<BrowserContext, string[]>();

/** What `installFixtures` recorded for this context, or undefined when unused. */
export function leaksFor(context: BrowserContext): string[] | undefined {
  return leakLists.get(context);
}

export async function installFixtures(context: BrowserContext): Promise<string[]> {
  const leaked = await installRoutes(context, RESPONSES);
  leakLists.set(context, leaked);
  return leaked;
}

/**
 * The same library, with a read-out of how many times the `.sng` package itself was
 * requested. That number is the point: the jukebox's preview and the band's load
 * must share one download.
 */
export async function installSngFixtures(
  context: BrowserContext,
): Promise<{ leaked: string[]; packageRequests: () => number }> {
  let requests = 0;
  const leaked = await installRoutes(context, RESPONSES, (url) => {
    if (url === sngUrl) requests += 1;
  });
  return { leaked, packageRequests: () => requests };
}

/** The same routes, with the 2,000-song library instead of the tiny one. */
export async function installBigFixtures(context: BrowserContext): Promise<string[]> {
  return installRoutes(context, {
    [PLAYLIST_URL]: bigPlaylist,
    [bigSongDocUrl]: bigSongDoc,
  });
}

/**
 * Keep the browser out of native fullscreen.
 *
 * Headless Chromium takes the whole screen on the welcome's press, and then
 * consumes Escape to leave it — which would test the browser rather than the
 * game's pause. The product's fullscreen path is untouched; this only refuses
 * the request in the test browser, exactly as a browser that does not support it
 * would.
 */
export async function disableFullscreen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const refuse = () =>
      Promise.reject(new DOMException("fullscreen is not used in tests", "NotAllowedError"));
    Object.defineProperty(Element.prototype, "requestFullscreen", {
      configurable: true,
      value: refuse,
    });
    Object.defineProperty(Element.prototype, "webkitRequestFullscreen", {
      configurable: true,
      value: refuse,
    });
  });
}

/* ---------------------------------------------------------------- the package */

/**
 * Build a real `.sng`: the little-endian header, the metadata table, the file index
 * and one masked file. The reader in `sources/sng.ts` is the authority on the
 * offsets; this only has to produce a package it can read.
 */
function buildSngPackage(
  metadata: Record<string, string>,
  files: Record<string, Uint8Array>,
): Uint8Array {
  const names = Object.keys(files);
  const metadataSection: number[] = [];
  pushU64(metadataSection, 0);
  pushU64(metadataSection, Object.keys(metadata).length);
  for (const [key, value] of Object.entries(metadata)) {
    const keyBytes = encoder.encode(key);
    const valueBytes = encoder.encode(value);
    pushI32(metadataSection, keyBytes.length);
    metadataSection.push(...keyBytes);
    pushI32(metadataSection, valueBytes.length);
    metadataSection.push(...valueBytes);
  }
  // The leading length is the section's body, not including itself.
  writeU64(metadataSection, 0, metadataSection.length - 8);

  const entrySize = (name: string) => 1 + encoder.encode(name).length + 8 + 8;
  const indexLength = names.reduce((total, name) => total + entrySize(name), 0) + 8;
  const headerLength = 26 + metadataSection.length + 8 + indexLength + 8;

  let at = headerLength;
  const offsets = new Map<string, { index: number; length: number }>();
  const data: number[] = [];
  for (const name of names) {
    const plain = files[name]!;
    offsets.set(name, { index: at, length: plain.length });
    data.push(...masked(plain));
    at += plain.length;
  }

  const fileIndex: number[] = [];
  pushU64(fileIndex, indexLength);
  pushU64(fileIndex, names.length);
  for (const name of names) {
    const nameBytes = encoder.encode(name);
    const found = offsets.get(name)!;
    fileIndex.push(nameBytes.length);
    fileIndex.push(...nameBytes);
    pushU64(fileIndex, found.length);
    pushU64(fileIndex, found.index);
  }

  const out: number[] = [];
  out.push(...encoder.encode("SNGPKG"));
  pushU32(out, 1);
  out.push(...SNG_MASK);
  out.push(...metadataSection);
  out.push(...fileIndex);
  pushU64(out, data.length);
  out.push(...data);
  return new Uint8Array(out);
}

function masked(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    out[index] = bytes[index]! ^ (SNG_MASK[index % 16]! ^ (index & 0xff));
  }
  return out;
}

function pushU32(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function pushI32(out: number[], value: number): void {
  pushU32(out, value >>> 0);
}

function pushU64(out: number[], value: number): void {
  let left = BigInt(value);
  for (let index = 0; index < 8; index += 1) {
    out.push(Number(left & 0xffn));
    left >>= 8n;
  }
}

function writeU64(bytes: number[], at: number, value: number): void {
  let left = BigInt(value);
  for (let index = 0; index < 8; index += 1) {
    bytes[at + index] = Number(left & 0xffn);
    left >>= 8n;
  }
}
