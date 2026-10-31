import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BrowserContext } from "@playwright/test";
import { installRoutes, type FixtureFile } from "./fixture";

/**
 * The **published EverythingStar FOSS library**, as the documentation's mock.
 *
 * A capture is a picture of the product, and a library invented for a test is a
 * picture of the test. `playlist.json` is a snapshot of
 * `everythingstar-foss/songs/playlist.json`: real titles, artists, lengths,
 * offers and cover art. It is served under the URL a fresh install seeds, so the
 * game reaches it exactly as it reaches the published one.
 *
 * The **documents and charts are generated**, not copied: a capture needs a
 * plausible highway, not the record's every note, and a few hundred KB of chart
 * data per song would be a fixture nobody reads. `audio.stems` is empty, which
 * is the existing fixture's frame-clock path — nothing to stream or decode.
 *
 * The covers ARE committed, at 96×96, because a song's art is its stage backdrop
 * and a capture with the album blurred behind the words is the screen a player
 * sees. They are fixture inputs like the chart bytes in `fixture.ts`, not
 * captures; `docs/screenshots/` stays ignored.
 *
 * Sync with `bun run docs:library` (see `scripts/sync-docs-library.ts`).
 */
const DOCS_PLAYLIST_URL =
  "https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/main/songs/playlist.json";

interface Entry {
  id: string;
  song: string;
  title: string;
  artist: { id: string; name: string };
  art?: string;
  durationMs: number;
  previewStartMs: number;
  offer: {
    instruments: { role: string; difficulties: string[] }[];
    voice: { chartType: "vocals" | "lyrics"; parts: number } | null;
  };
}

interface Playlist {
  schemaVersion: number;
  name: string;
  description: string;
  songs: Entry[];
}

interface ChartRef {
  id: string;
  difficulty?: string;
  chartType: "lanes" | "drums" | "vocals" | "lyrics";
  laneCount?: number;
  bpm?: number;
  url: string;
}

interface Part {
  id: string;
  role: string;
  label: string;
  charts: ChartRef[];
}

interface SongDoc {
  schemaVersion: number;
  id: string;
  title: string;
  artist: { id: string; name: string };
  durationMs: number;
  previewStartMs: number;
  audio: { source: "stems"; stems: never[]; mixPresets: Record<string, never> };
  parts: Part[];
  sections?: { timeMs: number; name: string }[];
}

const PLAYLIST = JSON.parse(
  readFileSync(fileURLToPath(new URL("./docs-library/playlist.json", import.meta.url)), "utf8"),
) as Playlist;

/** The real record's chapters, so a practice dialog in a capture is plausible. */
const CODE_MONKEY_SECTIONS = [
  0, 18_029, 37_528, 57_037, 75_037, 94_534, 114_029, 132_035, 151_536, 171_036,
].map((timeMs, index) => ({ timeMs, name: `${index * 10}%-${index * 10 + 10}%` }));

const LANES: Record<string, number> = { easy: 3, normal: 5, hard: 5, expert: 5 };

function lanesChart(entry: Entry, columns: number, stepMs: number) {
  const notes: { timeMs: number; lengthMs: number; kind: "strum"; column: number }[] = [];
  let index = 0;
  for (let timeMs = 700; timeMs < entry.durationMs - 1_000; timeMs += stepMs) {
    const column = (index * 3 + Math.floor(index / 4)) % columns;
    notes.push({ timeMs, lengthMs: index % 7 === 0 ? 320 : 0, kind: "strum", column });
    // A chord every fourth beat, and a second note inside a long one.
    if (index % 4 === 0) {
      notes.push({ timeMs, lengthMs: 0, kind: "strum", column: (column + 2) % columns });
    }
    index += 1;
  }
  return { schemaVersion: 1, chartType: "lanes", columns, bpm: 158.07, notes };
}

function drumsChart(entry: Entry) {
  const notes: { timeMs: number; lengthMs: number; kind: "strum"; column: number }[] = [];
  let index = 0;
  for (let timeMs = 700; timeMs < entry.durationMs - 1_000; timeMs += 180) {
    const column = index % 3 === 0 ? 0 : 1 + (index % 4);
    notes.push({ timeMs, lengthMs: 46, kind: "strum", column });
    index += 1;
  }
  return { schemaVersion: 1, chartType: "drums", columns: 5, bpm: 158.07, notes };
}

const PHRASES = [
  ["Code", "Monkey", "in", "the", "cloud"],
  ["Nothing", "to", "show", "for", "it"],
  ["Sitting", "by", "the", "window"],
  ["Waiting", "for", "a", "sign"],
];

function vocalsChart(entry: Entry) {
  const lines: unknown[] = [];
  const notes: unknown[] = [];
  let line = 0;
  for (let timeMs = 700; timeMs + 4_200 < entry.durationMs - 1_000; timeMs += 4_200) {
    const words = PHRASES[line % PHRASES.length]!;
    lines.push({
      timeMs,
      endMs: timeMs + 3_800,
      parts: [{ part: 0, offset: 0 }],
      words: words.map((text, index) => ({ text, timeMs: timeMs + index * 700 })),
    });
    words.forEach((text, index) => {
      notes.push({
        timeMs: timeMs + index * 700,
        lengthMs: 620,
        part: 0,
        row: 2 + ((line + index) % 4),
        text,
      });
    });
    line += 1;
  }
  return { schemaVersion: 1, chartType: "vocals", parts: 1, rows: 6, rootMidi: 60, lines, notes };
}

function songDoc(entry: Entry): SongDoc {
  const parts: Part[] = [];

  for (const instrument of entry.offer.instruments) {
    const role = instrument.role;
    parts.push({
      id: `part_${role}`,
      role,
      label: role.charAt(0).toUpperCase() + role.slice(1),
      charts: instrument.difficulties.map((difficulty) => ({
        id: `${entry.id}-${role}-${difficulty}`,
        difficulty,
        chartType: role === "drums" ? ("drums" as const) : ("lanes" as const),
        laneCount: role === "drums" ? 5 : LANES[difficulty] ?? 4,
        bpm: 158.07,
        url: `charts/${entry.id}/${role}-${difficulty}.json`,
      })),
    });
  }

  if (entry.offer.voice) {
    parts.push({
      id: "part_vocals",
      role: "vocals",
      label: "Vocals",
      charts: [
        {
          id: `${entry.id}-vocals`,
          chartType: entry.offer.voice.chartType,
          url: `charts/${entry.id}/vocals.json`,
        },
      ],
    });
  }

  return {
    schemaVersion: 1,
    id: entry.id,
    title: entry.title,
    artist: entry.artist,
    durationMs: entry.durationMs,
    previewStartMs: entry.previewStartMs,
    audio: { source: "stems", stems: [], mixPresets: {} },
    parts,
    ...(entry.id === "jonathan-coulton-code-monkey" ? { sections: CODE_MONKEY_SECTIONS } : {}),
  };
}

function chartBody(chart: ChartRef, entry: Entry) {
  if (chart.chartType === "vocals" || chart.chartType === "lyrics") {
    return vocalsChart(entry);
  }
  if (chart.chartType === "drums") return drumsChart(entry);
  return lanesChart(entry, chart.laneCount ?? 4, chart.difficulty === "easy" ? 520 : 360);
}

function responses(): Record<string, unknown> {
  const routes: Record<string, unknown> = { [DOCS_PLAYLIST_URL]: PLAYLIST };

  for (const entry of PLAYLIST.songs) {
    if (entry.art) {
      routes[new URL(entry.art, DOCS_PLAYLIST_URL).href] = cover(entry.id);
    }
    const docUrl = new URL(entry.song, DOCS_PLAYLIST_URL).href;
    const doc = songDoc(entry);
    routes[docUrl] = doc;
    for (const part of doc.parts) {
      for (const chart of part.charts) {
        routes[new URL(chart.url, docUrl).href] = chartBody(chart, entry);
      }
    }
  }

  return routes;
}

/** The 96×96 cover `sync-docs-library.ts` wrote for this song. */
function cover(id: string): FixtureFile {
  return {
    body: readFileSync(new URL(`./docs-library/covers/${id}.webp`, import.meta.url)),
    contentType: "image/webp",
  };
}

/**
 * The published library in place of the tiny default.
 *
 * `@public` — read through `tests/e2e/support.ts`, one level away from knip's
 * entry specs.
 */
export async function installDocsFixtures(context: BrowserContext): Promise<string[]> {
  return installRoutes(context, responses());
}
