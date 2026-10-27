import { expect, test, type BrowserContext } from "@playwright/test";
import { disableFullscreen } from "./fixture";
import { enterGame, waitForPlaying, waitForStage } from "./helpers";

/**
 * What the keys view shows for each kind of song.
 *
 * A song that carries pitch (a `vocals` chart) puts the words on the roll's own
 * layer: one strip per part, placed at its own moment, and the roll's single
 * transform carries the words with the bars. A song whose words carry no pitch
 * (a `lyrics` chart) keeps the static lyrics view, with no roll at all. The
 * fixture answers the seeded playlist URL, like every other spec.
 */

const PLAYLIST_URL =
  "https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/main/songs/playlist.json";
const ROOT = PLAYLIST_URL.slice(0, PLAYLIST_URL.lastIndexOf("/") + 1);

const DUET_TITLE = "Duet Pitch Song";
const WORDS_TITLE = "Words Only Song";

const playlist = {
  schemaVersion: 1,
  name: "Keys view fixtures",
  description: "A duet with pitch and a words-only song.",
  songs: [
    {
      id: "duet-pitch-song",
      song: "songs/duet-pitch.json",
      title: DUET_TITLE,
      artist: { id: "the-fixtures", name: "The Fixtures" },
      durationMs: 16_000,
      previewStartMs: 0,
      offer: {
        instruments: [{ role: "guitar", difficulties: ["easy"] }],
        voice: { chartType: "vocals", parts: 2 },
      },
    },
    {
      id: "words-only-song",
      song: "songs/words-only.json",
      title: WORDS_TITLE,
      artist: { id: "the-fixtures", name: "The Fixtures" },
      durationMs: 12_000,
      previewStartMs: 0,
      offer: {
        instruments: [],
        voice: { chartType: "lyrics", parts: 1 },
      },
    },
  ],
};

const duetSong = {
  schemaVersion: 1,
  id: "duet-pitch-song",
  title: DUET_TITLE,
  artist: { id: "the-fixtures", name: "The Fixtures" },
  durationMs: 16_000,
  previewStartMs: 0,
  audio: { source: "stems", stems: [], mixPresets: {} },
  parts: [
    {
      id: "part_guitar",
      role: "guitar",
      label: "Guitar",
      charts: [
        {
          id: "duet-pitch-song-guitar-easy",
          difficulty: "easy",
          chartType: "lanes",
          laneCount: 3,
          bpm: 120,
          url: `charts/duet-pitch-song/guitar-easy.json`,
        },
      ],
    },
    {
      id: "part_vocals",
      role: "vocals",
      label: "Vocals",
      charts: [
        {
          id: "duet-pitch-song-vocals",
          chartType: "vocals",
          url: `charts/duet-pitch-song/vocals.json`,
        },
      ],
    },
  ],
};

const duetGuitarChart = {
  schemaVersion: 1,
  chartType: "lanes",
  columns: 3,
  notes: [
    { timeMs: 500, lengthMs: 0, kind: "strum", column: 0 },
    { timeMs: 1500, lengthMs: 0, kind: "strum", column: 1 },
    { timeMs: 2500, lengthMs: 0, kind: "strum", column: 2 },
  ],
};

/**
 * A duet: two lines both parts sing (which must appear in both rows), and one
 * line each for a part alone (which must not).
 */
const duetVocalsChart = {
  schemaVersion: 1,
  chartType: "vocals",
  parts: 2,
  rows: 6,
  rootMidi: 60,
  lines: [
    {
      timeMs: 2000,
      endMs: 5000,
      parts: [
        { part: 0, offset: 0 },
        { part: 1, offset: 0 },
      ],
      words: [
        { text: "Electric", timeMs: 2000 },
        { text: "Hearts", timeMs: 3000, hero: true },
      ],
    },
    {
      timeMs: 6000,
      endMs: 9000,
      parts: [{ part: 0, offset: 0 }],
      words: [
        { text: "Stay", timeMs: 6000 },
        { text: "Bright", timeMs: 7000 },
      ],
    },
    {
      timeMs: 9000,
      endMs: 12000,
      parts: [{ part: 1, offset: 0 }],
      words: [
        { text: "Until", timeMs: 9000 },
        { text: "Morning", timeMs: 10000 },
      ],
    },
    {
      timeMs: 12000,
      endMs: 15000,
      parts: [
        { part: 0, offset: 0 },
        { part: 1, offset: 3 },
      ],
      words: [
        { text: "One", timeMs: 12000 },
        { text: "Light", timeMs: 13000 },
      ],
    },
  ],
  notes: [
    { timeMs: 2000, lengthMs: 800, part: 0, row: 2, text: "Electric" },
    { timeMs: 3000, lengthMs: 800, part: 1, row: 3, text: "Hearts", hero: true },
    { timeMs: 6000, lengthMs: 800, part: 0, row: 2, text: "Stay" },
    { timeMs: 7000, lengthMs: 800, part: 0, row: 3, text: "Bright" },
    { timeMs: 9000, lengthMs: 800, part: 1, row: 2, text: "Until" },
    { timeMs: 10000, lengthMs: 800, part: 1, row: 4, text: "Morning", hero: true },
    // The same row at the same moment: one bar, shared between the two parts.
    { timeMs: 12000, lengthMs: 800, part: 0, row: 2, text: "One" },
    { timeMs: 12000, lengthMs: 800, part: 1, row: 2, text: "One" },
    { timeMs: 13000, lengthMs: 800, part: 0, row: 3, text: "Light" },
  ],
};

const wordsSong = {
  schemaVersion: 1,
  id: "words-only-song",
  title: WORDS_TITLE,
  artist: { id: "the-fixtures", name: "The Fixtures" },
  durationMs: 12_000,
  previewStartMs: 0,
  audio: { source: "stems", stems: [], mixPresets: {} },
  parts: [
    {
      id: "part_vocals",
      role: "vocals",
      label: "Words",
      charts: [
        {
          id: "words-only-song-lyrics",
          chartType: "lyrics",
          url: `charts/words-only-song/lyrics.json`,
        },
      ],
    },
  ],
};

const wordsLyricsChart = {
  schemaVersion: 1,
  chartType: "lyrics",
  parts: 1,
  rows: 6,
  rootMidi: 60,
  lines: [
    {
      timeMs: 1000,
      endMs: 4000,
      parts: [{ part: 0, offset: 0 }],
      words: [
        { text: "The", timeMs: 1000 },
        { text: "Words", timeMs: 2000 },
        { text: "Stay", timeMs: 3000 },
      ],
    },
    {
      timeMs: 5000,
      endMs: 8000,
      parts: [{ part: 0, offset: 0 }],
      words: [
        { text: "Put", timeMs: 5000 },
        { text: "Down", timeMs: 6000 },
      ],
    },
    {
      timeMs: 9000,
      endMs: 11000,
      parts: [{ part: 0, offset: 0 }],
      words: [
        { text: "Here", timeMs: 9000 },
        { text: "They", timeMs: 10000 },
      ],
    },
  ],
  notes: [],
};

/** The keys view's own fixture library, under the seeded URL. */
async function installKeysFixtures(context: BrowserContext): Promise<string[]> {
  const responses: Record<string, unknown> = {
    [PLAYLIST_URL]: playlist,
    [`${ROOT}songs/duet-pitch.json`]: duetSong,
    [`${ROOT}songs/charts/duet-pitch-song/guitar-easy.json`]: duetGuitarChart,
    [`${ROOT}songs/charts/duet-pitch-song/vocals.json`]: duetVocalsChart,
    [`${ROOT}songs/words-only.json`]: wordsSong,
    [`${ROOT}songs/charts/words-only-song/lyrics.json`]: wordsLyricsChart,
  };
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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });
      return;
    }
    leaked.push(url);
    await route.abort();
  });
  return leaked;
}

test("a pitched song puts the words on the roll's own layer, sliding with the bars", async ({
  context,
  page,
}) => {
  const leaked = await installKeysFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(DUET_TITLE) }).click();
  await page.getByRole("button", { name: "Next: your band" }).click();
  await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await waitForStage(page);
  await waitForPlaying(page);

  const keys = page.locator(".melody .keys");
  await expect(keys).toBeVisible();
  // The words live on the roll's translated layer, one strip per part.
  const lines = page.locator(".keys__track .keys__line");
  expect(await lines.count()).toBeGreaterThan(0);
  expect(await page.locator(".keys__line.is-part-0").count()).toBeGreaterThan(0);
  expect(await page.locator(".keys__line.is-part-1").count()).toBeGreaterThan(0);

  // Give the first line its own moment, so the window carries lines two and
  // three on screen at once.
  await page.waitForTimeout(2_500);

  // A line both parts sing appears in both rows, and a line one part sings is
  // on that part's row alone.
  await expect(
    page.locator(".keys__line.is-part-0", { hasText: "Electric" }),
  ).toBeVisible();
  await expect(
    page.locator(".keys__line.is-part-1", { hasText: "Electric" }),
  ).toBeVisible();
  await expect(page.locator(".keys__line.is-part-0", { hasText: "Stay" })).toBeVisible();
  expect(await page.locator(".keys__line.is-part-1", { hasText: "Stay" }).count()).toBe(0);

  // The point of the layout: the words are on the roll's translated layer,
  // **below every bar**, and the track's one transform carries both.
  const geometry = () =>
    page.evaluate(() => {
      const track = document.querySelector<HTMLElement>(".keys__track");
      const lines = Array.from(document.querySelectorAll<HTMLElement>(".keys__line"));
      const notes = Array.from(document.querySelectorAll<HTMLElement>(".keys__note"));
      const at = (element: Element) => element.getBoundingClientRect();
      return {
        linesInTrack: lines.every((line) => line.closest(".keys__track") === track),
        notesInTrack: notes.every((note) => note.closest(".keys__track") === track),
        linesTop: Math.min(...lines.map((line) => at(line).top)),
        notesBottom: Math.max(...notes.map((note) => at(note).bottom)),
        track: getComputedStyle(track!).transform,
        lineLeft: lines[0] ? at(lines[0]).left : -1,
        noteLeft: notes[0] ? at(notes[0]).left : -1,
      };
    });

  const before = await geometry();
  expect(before.linesInTrack, "the words are inside the roll's track").toBe(true);
  expect(before.notesInTrack, "the notes are inside the roll's track").toBe(true);
  expect(before.linesTop, "the words are under every bar").toBeGreaterThan(
    before.notesBottom,
  );

  await page.waitForTimeout(700);
  const after = await geometry();
  expect(after.track).not.toBe(before.track);
  const lineMove = before.lineLeft - after.lineLeft;
  const noteMove = before.noteLeft - after.noteLeft;
  expect(lineMove).toBeGreaterThan(0);
  expect(Math.abs(lineMove - noteMove)).toBeLessThanOrEqual(1);

  await page.locator(".melody").screenshot({ path: "test-results/e2e/keys-view-duet.png" });

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("a words-only song keeps the static lyrics view, with no roll", async ({
  context,
  page,
}) => {
  const leaked = await installKeysFixtures(context);
  await disableFullscreen(page);
  await enterGame(page);
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await expect(page.getByRole("heading", { name: "Pick a song" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(WORDS_TITLE) }).click();
  await page.getByRole("button", { name: "Next: your band" }).click();
  await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await waitForStage(page);
  await waitForPlaying(page);

  await expect(page.locator(".melody .lyrics-view")).toBeVisible();
  await expect(page.locator(".melody .keys")).toHaveCount(0);
  await expect(page.locator(".lyrics-view__word").first()).toBeVisible();

  // With no roll there is no axis to ride: the words stay where they are.
  const wordLeft = () =>
    page.evaluate(
      () =>
        document.querySelector<HTMLElement>(".lyrics-view__word")?.getBoundingClientRect()
          .left ?? -1,
    );
  const before = await wordLeft();
  await page.waitForTimeout(500);
  expect(await wordLeft()).toBe(before);

  await page.locator(".melody").screenshot({ path: "test-results/e2e/keys-view-words-only.png" });

  expect(leaked, "unexpected external requests").toEqual([]);
});
