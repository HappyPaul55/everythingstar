/**
 * StepMania `.sm`: the dance format.
 *
 * A list of `#TAG:value;` settings and then one `#NOTES:` block per chart, each a
 * grid of measures. Every measure is four beats cut into as many rows as it has
 * lines, and each row has one character per column: `0` nothing, `1` a step, `2` or
 * `4` the start of a hold or a roll and `3` its end, `M` a mine. Times are **beats**,
 * with a tempo map (`#BPMS`) and pauses (`#STOPS`) turning them into milliseconds
 * from the file's `#OFFSET`.
 *
 * ```text
 * #TITLE:Nine Lives;
 * #BPMS:0.000=120.000;
 * #OFFSET:-0.123;
 * #NOTES:
 *      dance-single:
 *      :
 *      Challenge:
 *      10:
 *      0,0,0,0,0:
 *      1000
 *      0100
 *      0010
 *      0001
 * ;
 * ```
 *
 * Mines have nowhere to go — this game has no way to say "do not step there" — so
 * they are dropped and named rather than turned into a note nobody should hit.
 */

import { boundNotes, type Difficulty, type LaneChart, type LaneNote } from "../track";
import type { SongVideo } from "../song";
import type { SourceAudio } from "../source";
import { audioFromFiles } from "./files";
import { emptySource, type ParsedSource, type StemRole } from "./types";
import { SONG_TAIL_MS } from "./duration";
import { resolveFileRef } from "./common";
import { slug } from "../text";

/** What a chart's difficulty word means to this game. */
const DIFFICULTY_WORDS: Record<string, Difficulty> = {
  beginner: "easy",
  easy: "easy",
  medium: "normal",
  basic: "normal",
  hard: "hard",
  difficult: "hard",
  challenge: "expert",
  expert: "expert",
  edit: "expert",
};

/** The cells a chart's grid can hold. */
const STEP = "1";
const HOLD_HEADS = ["2", "4"];
const HOLD_TAIL = "3";
const MINE = "M";

export interface StepManiaInput {
  text: string;
  id?: string;
  fallbackTitle?: string;
  art?: string | null;
  stems?: Partial<Record<StemRole, string>>;
  video?: SongVideo | null;
  /**
   * The chart's own absolute URL. `#MUSIC` is resolved against it when the folder
   * table did not find the file, so `audio/song.ogg` is played rather than listed as
   * a bare name. A local folder passes its `folder://` URL.
   */
  baseUrl?: string | null;
}

export function readStepMania(input: StepManiaInput): ParsedSource {
  const problems: string[] = [];
  const file = readFile(input.text);
  const title = file.tags.get("title") ?? input.fallbackTitle ?? "Untitled";
  const source = emptySource(input.id ?? (slug(title) || "song"), title);
  source.problems = problems;

  const offsetMs = (Number(file.tags.get("offset") ?? 0) || 0) * 1000;
  const clock = readClock(file.tags.get("bpms") ?? "", file.tags.get("stops") ?? "", offsetMs, problems);

  source.meta = {
    ...source.meta,
    artist: file.tags.get("artist") ?? "",
    album: file.tags.get("album") ?? null,
    art: input.art ?? file.tags.get("cdimage") ?? file.tags.get("background") ?? null,
    video: input.video ?? null,
  };
  source.audio = readAudio(
    input.stems ?? {},
    file.tags.get("music") ?? null,
    input.baseUrl ?? null,
  );

  const charts = new Map<Difficulty, LaneChart>();
  for (const block of file.notes) {
    if (!isSingleMode(block.type)) {
      problems.push(`“${block.type}” is not a single-player mode; skipped`);
      continue;
    }
    const difficulty = DIFFICULTY_WORDS[block.difficulty.toLowerCase()];
    if (!difficulty) {
      problems.push(`“${block.difficulty}” is not a difficulty this game has`);
      continue;
    }
    const chart = readChart(block, difficulty, clock.toMs, clock.bpm, problems);
    if (!chart) continue;
    // Two charts at one level is a stepfile that means it; the first is the one.
    if (charts.has(difficulty)) {
      problems.push(`a second chart at ${difficulty} was dropped`);
      continue;
    }
    charts.set(difficulty, chart);
  }
  source.lanes = [...charts.values()];

  const last = source.lanes.reduce(
    (max, chart) =>
      Math.max(max, chart.notes.reduce((end, note) => Math.max(end, note.timeMs + note.lengthMs), 0)),
    0,
  );
  const stated = Number(file.tags.get("length") ?? 0) * 1000;
  source.meta.durationMs = stated > 0 ? stated : last + SONG_TAIL_MS;
  return source;
}

/* ----------------------------------------------------------------- the file */

/**
 * The file's settings, and its charts.
 *
 * `#NOTES:` repeats — one block a chart — so it is collected rather than overwritten,
 * which is the mistake a plain "tag → value" map makes of every stepfile but the
 * simplest. A `.ssc` puts a chart's `#STEPSTYPE`/`#DIFFICULTY` beside a raw
 * `#NOTES:` grid instead of inside the block, so those two are carried to it.
 */
function readFile(text: string): { tags: Map<string, string>; notes: NotesBlock[] } {
  const tags = new Map<string, string>();
  const notes: NotesBlock[] = [];
  const withoutComments = stripComments(text);
  const pattern = /#([A-Za-z0-9_]+)\s*:\s*([\s\S]*?)\s*;/g;
  let pendingType = "";
  let pendingDifficulty = "";
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(withoutComments)) !== null) {
    const key = match[1].toLowerCase();
    if (key === "notes" || key === "notes2") {
      const block =
        readNotesBlock(match[2]) ??
        (pendingType && pendingDifficulty
          ? { type: pendingType, difficulty: pendingDifficulty, data: match[2] }
          : null);
      if (block) notes.push(block);
    } else {
      const value = match[2].trim();
      tags.set(key, match[2]);
      if (key === "notedata") {
        pendingType = "";
        pendingDifficulty = "";
      } else if (key === "stepstype") {
        pendingType = value;
      } else if (key === "difficulty") {
        pendingDifficulty = value;
      }
    }
  }
  return { tags, notes };
}

/**
 * The file without its `//` comments.
 *
 * A comment is a `//` at the start of a line or after whitespace. A `//` inside a
 * value is part of it: `#MUSIC:https://host/song.ogg;` is a URL, not a comment, and
 * stripping it turned the song's own mix into `https:`. Line breaks are kept, so a
 * tag that spans lines still reads the same way.
 */
function stripComments(text: string): string {
  return text.replace(/(^|[ \t])\/\/[^\n]*/gm, "$1");
}

/** One `#NOTES:` block: what it is for, and its grid. */
interface NotesBlock {
  type: string;
  difficulty: string;
  data: string;
}

/**
 * A `#NOTES:` block is six `:`-separated fields — the last of which is the grid and
 * may hold anything at all — so it is split on the first five colons and no more.
 */
function readNotesBlock(value: string): NotesBlock | null {
  const fields: string[] = [];
  let at = 0;
  for (let index = 0; index < 5; index += 1) {
    const colon = value.indexOf(":", at);
    if (colon < 0) return null;
    fields.push(value.slice(at, colon));
    at = colon + 1;
  }
  fields.push(value.slice(at));
  return { type: fields[0].trim(), difficulty: fields[2].trim(), data: fields[5] };
}

/* ---------------------------------------------------------------- the tempo */

interface Clock {
  toMs: (beat: number) => number;
  bpm: number;
}

/**
 * Beats → milliseconds, from `#BPMS` and `#STOPS`.
 *
 * A stop is a pause *after* a beat, so it shifts everything that follows it — which
 * is why this is a walk and not a multiplication. A beat before the first tempo
 * change keeps the opening tempo, and the offset is often **negative** (the music
 * starts before the chart does): both are real, so neither is clamped away.
 */
function readClock(
  bpms: string,
  stops: string,
  offsetMs: number,
  problems: string[],
): Clock {
  const changes: { beat: number; bpm: number }[] = [];
  for (const [beat, bpm] of parsePairs(bpms)) {
    // A non-positive tempo would make every later beat infinite (or run time
    // backwards). The last valid tempo is kept, and the change is named.
    if (!(bpm > 0)) {
      problems.push(`#BPMS ${beat}=${bpm} is not a positive tempo; dropped`);
      continue;
    }
    changes.push({ beat, bpm });
  }
  changes.sort((a, b) => a.beat - b.beat);
  if (changes.length === 0) {
    changes.push({ beat: 0, bpm: 120 });
    problems.push("no #BPMS; assuming 120");
  }
  const pauses = parsePairs(stops).sort((a, b) => a[0] - b[0]);
  const opening = changes[0].bpm;
  // One breakpoint table and one stop prefix, built once. The clock used to walk
  // every tempo change **and** every stop for every row of every measure, which is
  // quadratic in a file somebody else wrote.
  const at: number[] = [];
  {
    let ms = offsetMs;
    let lastBeat = 0;
    let bpm = opening;
    for (const change of changes) {
      ms += (change.beat - lastBeat) * (60_000 / bpm);
      lastBeat = change.beat;
      at.push(ms);
      bpm = change.bpm;
    }
  }
  /** The total pause before each stop, so a stop is a prefix sum lookup. */
  const pauseAt: number[] = [];
  const pauseTotal: number[] = [];
  {
    let total = 0;
    for (const [beat, seconds] of pauses) {
      total += seconds * 1000;
      pauseAt.push(beat);
      pauseTotal.push(total);
    }
  }
  /** Seconds of pause for stops strictly before `beat`. */
  const pausedBefore = (beat: number): number => {
    let low = 0;
    let high = pauseAt.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (pauseAt[mid] < beat) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return found < 0 ? 0 : pauseTotal[found];
  };

  const toMs = (beat: number): number => {
    // The last change at or before the beat; before the first one the opening
    // tempo runs from the top of the song.
    let low = 0;
    let high = changes.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (changes[mid].beat <= beat) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const ms =
      found < 0
        ? offsetMs + beat * (60_000 / opening)
        : at[found] + (beat - changes[found].beat) * (60_000 / changes[found].bpm);
    return ms + pausedBefore(beat);
  };
  return { toMs, bpm: opening };
}

/**
 * `a=b,c=d` as pairs of numbers, without trusting any of them.
 *
 * An empty side is not a zero: `0=` is a missing value, and `Number("")` is 0,
 * which is how a blank tempo became a tempo of zero. Missing and non-finite sides
 * are dropped here; what a valid pair *means* is the caller's business.
 */
function parsePairs(text: string): [number, number][] {
  const pairs: [number, number][] = [];
  for (const part of text.split(",")) {
    const [left, right] = part.split("=");
    const leftText = left?.trim() ?? "";
    const rightText = right?.trim() ?? "";
    if (leftText === "" || rightText === "") continue;
    const a = Number(leftText);
    const b = Number(rightText);
    if (Number.isFinite(a) && Number.isFinite(b)) pairs.push([a, b]);
  }
  return pairs;
}

/* --------------------------------------------------------------- one chart */

/**
 * A chart this game can play is a **single-player** one.
 *
 * The format's other modes — `dance-double`, `pump-double`, `dance-couple`,
 * `dance-solo` — need a second pad, a second player or six panels, and the
 * four-arrow highway cannot reach them. They are skipped and named rather than
 * narrowed into a chart nobody can play: capping the columns would silently turn
 * a double chart into half of itself.
 */
function isSingleMode(type: string): boolean {
  return /^[a-z0-9]+-single$/i.test(type.trim());
}

function readChart(
  block: NotesBlock,
  difficulty: Difficulty,
  toMs: (beat: number) => number,
  bpm: number,
  problems: string[],
): LaneChart | null {
  const measures = block.data.split(",").map((measure) =>
    measure
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== ""),
  );
  const columns = measures.flat().reduce((max, row) => Math.max(max, row.length), 0);
  if (columns === 0) return null;

  const notes: LaneNote[] = [];
  const open = new Map<number, { timeMs: number; index: number }>();
  let mines = 0;
  let serial = 0;

  // A measure is four beats however many rows it is cut into, which is the whole of
  // the timing: `beat = measure * 4 + row * (4 / rows)`.
  measures.forEach((rows, measure) => {
    const beatsPerRow = rows.length > 0 ? 4 / rows.length : 0;
    rows.forEach((row, index) => {
      const beat = measure * 4 + index * beatsPerRow;
      const timeMs = Math.max(0, Math.round(toMs(beat)));
      for (let column = 0; column < row.length; column += 1) {
        const cell = row[column];
        if (cell === MINE) {
          mines += 1;
          continue;
        }
        if (cell === STEP) {
          notes.push({ id: `dance-${difficulty}-${serial++}`, timeMs, lengthMs: 0, kind: "strum", column, hero: false });
          continue;
        }
        if (HOLD_HEADS.includes(cell)) {
          open.set(column, { timeMs, index: notes.length });
          notes.push({ id: `dance-${difficulty}-${serial++}`, timeMs, lengthMs: 0, kind: "strum", column, hero: false });
          continue;
        }
        const head = cell === HOLD_TAIL ? open.get(column) : undefined;
        if (head) {
          notes[head.index] = { ...notes[head.index], lengthMs: Math.max(0, timeMs - head.timeMs) };
          open.delete(column);
        }
      }
    });
  });

  if (mines > 0) {
    problems.push(`${block.type} ${difficulty}: ${mines} mines dropped, this game has none`);
  }
  // Before the length is read from them: a tempo map that went wrong is not a song
  // that lasts a month, and `chartProblems` would drop the chart rather than clamp.
  const bounded = boundNotes(notes, (note) =>
    problems.push(`${block.type} ${difficulty}: a note at ${note.timeMs} ms is outside any song`),
  );
  bounded.sort((a, b) => a.timeMs - b.timeMs || (a.column ?? 0) - (b.column ?? 0));
  if (bounded.length === 0) return null;

  return {
    instrument: "dance",
    difficulty,
    columns,
    ...(bpm > 0 ? { bpm } : {}),
    notes: bounded,
  };
}

/** A stepfile names its own mix in `#MUSIC`; a folder may also have brought one. */
function readAudio(
  stems: Partial<Record<StemRole, string>>,
  music: string | null,
  baseUrl: string | null,
): SourceAudio {
  const named = resolveFileRef(music, baseUrl);
  return audioFromFiles({ ...stems, ...(stems.master || !named ? {} : { master: named }) });
}
