/**
 * A chart set as a Clone Hero / YARG `.chart` file.
 *
 * `.chart` is the easiest format the game already reads: it is plain text, its
 * tracks are one block per instrument and difficulty (`[ExpertSingle]`,
 * `[HardDrums]`), and the same file can carry every chart of a song. The chart is
 * written from **absolute milliseconds**, converted to ticks at the project's
 * tempo, so the exported notes land where the charter heard them.
 *
 * Only the instruments the format names are written: guitar, bass, drums and keys.
 * A dance chart is named and skipped rather than written as something it is not.
 */

import type {
  CharterChart,
} from "./edit";
import { chartStrums } from "./edit";
import type { CharterGrid } from "./grid";
import { clampBpm } from "./grid";
import type { TrackSection } from "../track";
import { slug } from "../text";

/** The `.chart` resolution the writer uses. It is a tick grid, not a tempo. */
const CHART_RESOLUTION = 192;

export interface ChartExportInput {
  title: string;
  artist: string;
  album?: string | null;
  charts: readonly CharterChart[];
  grid: CharterGrid;
  sections?: readonly TrackSection[];
  /** The chart's author line, as the file states it. */
  charter?: string;
}

export interface ChartExport {
  text: string;
  fileName: string;
  /** What was left out, so the UI can say it rather than pretend otherwise. */
  problems: string[];
}

const DIFFICULTY_WORD: Record<string, string> = {
  easy: "Easy",
  normal: "Medium",
  hard: "Hard",
  expert: "Expert",
};

/**
 * The `.chart` section for one instrument and difficulty.
 *
 * `Single` is the lead guitar, `DoubleRhythm` a rhythm guitar, `DoubleBass` the
 * bass, `Drums` the kit and `Keyboard` the keys. A six-column guitar is
 * `GHLGuitar`, the format's wider guitar.
 */
function trackWord(chart: CharterChart): string | null {
  if (chart.instrument === "guitar") {
    if (chart.role === "rhythm") return "DoubleRhythm";
    if (chart.columns >= 6) return "GHLGuitar";
    return "Single";
  }
  if (chart.instrument === "bass") return "DoubleBass";
  if (chart.instrument === "drums") return "Drums";
  if (chart.instrument === "keys") return "Keyboard";
  return null;
}

function quote(value: string): string {
  // A `.chart` value is one line in quotes. A quote or a newline would end it
  // early, and the reader does not unescape, so the plain apostrophe is the honest
  // replacement rather than an escape the file cannot carry.
  return `"${value.replace(/["\r\n]+/g, "'").trim()}"`;
}

function ticks(ms: number, bpm: number): number {
  return Math.round((Math.max(0, ms) / 1000) * (bpm / 60) * CHART_RESOLUTION);
}

/** One note line: `tick = N fret type lengthTicks`. */
function noteLine(
  chart: CharterChart,
  note: CharterChart["notes"][number],
  bpm: number,
): string | null {
  const strummed = chartStrums(chart);
  let fret = note.column;
  if (fret === null) {
    // The open note is fret 5 on a five-column guitar. A six-column guitar has a
    // real column there, so an open note has no representation and is skipped.
    if (!strummed || chart.columns >= 6) return null;
    fret = 5;
  }
  if (fret < 0 || (fret >= chart.columns && chart.columns > 0)) return null;
  const type = note.kind === "hopo" ? 1 : 0;
  const length = Math.max(0, ticks(note.lengthMs, bpm));
  return `${ticks(note.timeMs, bpm)} = N ${fret} ${type} ${length}`;
}

/** Write the whole set as one `.chart` file. */
export function writeChart(input: ChartExportInput): ChartExport {
  const grid = input.grid;
  const bpm = clampBpm(grid.bpm);
  const problems: string[] = [];
  const used = new Set<string>();
  const blocks: string[] = [];

  for (const chart of input.charts) {
    const word = trackWord(chart);
    if (!word) {
      problems.push(`${chart.key}: ${chart.instrument} is not a .chart instrument`);
      continue;
    }
    const difficulty = DIFFICULTY_WORD[chart.difficulty] ?? "Expert";
    let section = `${difficulty}${word}`;
    // Two charts can want the same section (a roleless guitar and a lead, or two
    // charts of one kind after a copy). A second one gets the format's other
    // guitar word; after that it is named rather than silently overwriting.
    if (used.has(section)) {
      if (word === "Single") section = `${difficulty}DoubleGuitar`;
      else if (word === "DoubleGuitar") section = `${difficulty}Single`;
    }
    if (used.has(section)) {
      problems.push(`${chart.key}: a second ${section} cannot share the file`);
      continue;
    }
    used.add(section);
    if (chart.notes.length === 0) {
      problems.push(`${chart.key}: empty, so it was not written`);
      continue;
    }

    const lines: string[] = [];
    for (const note of chart.notes) {
      const line = noteLine(chart, note, bpm);
      if (line) lines.push(line);
    }
    for (const phrase of chart.phrases ?? []) {
      const length = Math.max(0, ticks(phrase.endMs, bpm) - ticks(phrase.startMs, bpm));
      if (length > 0) lines.push(`${ticks(phrase.startMs, bpm)} = S 2 ${length}`);
    }
    if (lines.length === 0) {
      problems.push(`${chart.key}: nothing the file can carry`);
      continue;
    }
    lines.sort((a, b) => Number(a.split(" ")[0]) - Number(b.split(" ")[0]));
    blocks.push(`[${section}]\n{\n${lines.map((line) => `  ${line}`).join("\n")}\n}`);
  }

  if (blocks.length === 0) {
    return {
      text: "",
      fileName: `${slug(input.title) || "charter"}.chart`,
      problems: problems.length > 0 ? problems : ["there is no chart to export"],
    };
  }

  const songLines = [
    `  Name = ${quote(input.title)}`,
    `  Artist = ${quote(input.artist)}`,
    ...(input.album ? [`  Album = ${quote(input.album)}`] : []),
    `  Charter = ${quote(input.charter ?? "EverythingStar Charter")}`,
    "  Offset = 0",
    `  Resolution = ${CHART_RESOLUTION}`,
    "  Difficulty = 0",
    "  PreviewStart = 0",
    "  PreviewEnd = 0",
    '  Genre = "EverythingStar"',
    '  MediaType = "cd"',
    '  MusicStream = "song.ogg"',
  ];

  const sync = [
    "  0 = TS 4",
    `  0 = B ${Math.round(bpm * 1000)}`,
  ];

  const events = (input.sections ?? [])
    .filter((section) => section.name.trim().length > 0)
    .sort((a, b) => a.timeMs - b.timeMs)
    .map((section) => `  ${ticks(section.timeMs, bpm)} = E "section ${section.name.replace(/["\r\n]+/g, "'")}"`);

  const text = [
    "[Song]",
    "{",
    ...songLines,
    "}",
    "",
    "[SyncTrack]",
    "{",
    ...sync,
    "}",
    "",
    "[Events]",
    "{",
    ...events,
    "}",
    "",
    ...blocks.flatMap((block) => [block, ""]),
  ].join("\n");

  return {
    text,
    fileName: `${slug(input.title) || "charter"}.chart`,
    problems,
  };
}
