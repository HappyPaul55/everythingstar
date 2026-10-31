import {
  DIFFICULTIES,
  INSTRUMENT_KINDS,
  MAX_PARTS,
  strums,
  type Difficulty,
  type InstrumentKind,
  type LaneChart,
  type LaneNote,
  type LaneNoteKind,
  type MelodyLine,
  type MelodyNote,
  type MelodyPart,
  type Track,
} from "../track";
import { hashUnit } from "../hash";
import { randomInt, createRandom } from "./random";

/**
 * A mock track: twelve minutes of lyric lines with word timings and who sings
 * them, a pitch contour for the roll (with the odd freeform line), and a chart
 * for every instrument at every difficulty.
 *
 * It also opens with a **note zoo**: one of every note type and combination, in
 * the first few seconds of every chart, so the treatments are always on screen
 * and any regression in them is visible immediately. Deterministic for a seed.
 * Throwaway — real tracks are normalised into the same shape.
 */

/**
 * Pitch rows in the piano roll, and the MIDI note the bottom one sounds. Both go
 * into the track (a chart says what its rows are, and the view draws what the chart
 * says); the mock is only where these particular values come from.
 */
const MELODY_ROWS = 6;
const MELODY_ROOT_MIDI = 57;

/** Twelve minutes, so the scrolling and culling get a proper workout. */
const MOCK_DURATION_MS = 12 * 60 * 1000;

/** Roughly this share of notes are hero notes. */
const HERO_SHARE = 0.04;

/** Every so many lines is delivered freeform — spoken or rapped. */
const FREEFORM_EVERY = 5;

/** Where the note zoo starts, and how far apart its exhibits are. The step is a
 *  sixteenth at `MOCK_BPM`, so the zoo sits on the same grid as the rest. */
const ZOO_START_MS = 1500;
const ZOO_STEP_MS = 625;

/** The lane walk: an up-and-down shape, so a highway is used end to end. */
const LANE_WALK = [0, 1, 2, 1, 3, 2, 3, 4, 3, 2];

/**
 * The mock's tempo, and the grid its notes land on. The notes are snapped to a
 * sixteenth so the highway's **beat grid** passes through them: a fixture whose
 * grid and notes disagree would hide a grid that was a beat out.
 */
const MOCK_BPM = 120;
const MOCK_BEAT_MS = 60000 / MOCK_BPM;
const MOCK_SNAP_MS = MOCK_BEAT_MS / 4;

const LINE_POOL = [
  "turn the volume up",
  "and play it loud tonight",
  "everything is on the line",
  "we are running out of time",
  "hold the note a little longer",
  "the crowd is on their feet",
  "one more chorus then we go",
  "keep the rhythm steady now",
  "the lights are coming down",
  "sing it back to me",
  "we were never going home",
  "so play it one more time",
];

export interface MockTrackOptions {
  seed: number;
  /** Parts the melody has: 1 for a solo, up to `MAX_PARTS`. */
  parts?: number;
  /** Whether the melody carries pitch (vocals) or is words only (lyrics). */
  hasPitch?: boolean;
  durationMs?: number;
  /** The song's name, for the header and the results. */
  title?: string;
  /**
   * The charts the song carries: one entry per instrument, with the difficulties
   * that instrument has. A real chart does not come in every difficulty — one song
   * might be Hard and Expert on the guitar, another nothing but Easy — so this is
   * what the song offers, never a range to pick from.
   */
  charts?: SongChart[];
}

/** One instrument's share of a song: which difficulties it actually carries. */
export interface SongChart {
  instrument: InstrumentKind;
  difficulties: Difficulty[];
}

/** Every instrument at every difficulty: what a mock song carries unless told. */
function everyChart(): SongChart[] {
  return INSTRUMENT_KINDS.map((instrument) => ({
    instrument,
    difficulties: [...DIFFICULTIES],
  }));
}

/** Build the whole mock track. Pure; the same seed always produces the same track. */
export function buildMockTrack({
  seed,
  parts = 1,
  hasPitch = true,
  durationMs = MOCK_DURATION_MS,
  title = "Mock song",
  charts = everyChart(),
}: MockTrackOptions): Track {
  const partCount = clampParts(parts);
  const lines = buildLines(durationMs, createRandom(seed + 11), partCount);
  return {
    id: `mock-${seed}`,
    title,
    durationMs,
    melody: {
      parts: partCount,
      hasPitch,
      rows: MELODY_ROWS,
      // A row is a semitone, and the mock's contour starts on A3 (57) so six rows
      // reach D4: a range two voices can meet in, which is the point of a duet.
      rootMidi: MELODY_ROOT_MIDI,
      lines,
      notes: hasPitch ? buildMelody(lines, createRandom(seed + 23)) : [],
    },
    // The song's own charts, at the difficulties it carries them: a player picks
    // their own difficulty, but never one the song has no chart for.
    charts: charts.flatMap((entry) =>
      entry.difficulties.map((difficulty) =>
        buildChart(entry.instrument, difficulty, durationMs, seed),
      ),
    ),
  };
}

function clampParts(parts: number): number {
  return Math.max(1, Math.min(MAX_PARTS, Math.trunc(parts) || 1));
}

/* ------------------------------------------------------------------ lanes */

/** How many columns each difficulty uses, and how busy it is. */
const LANE_PLAN: Record<Difficulty, { columns: number; gap: [number, number]; skip: number }> = {
  easy: { columns: 3, gap: [520, 900], skip: 0.16 },
  normal: { columns: 4, gap: [380, 700], skip: 0.1 },
  hard: { columns: 5, gap: [260, 620], skip: 0.07 },
  expert: { columns: 5, gap: [190, 480], skip: 0.04 },
};

function buildChart(
  instrument: InstrumentKind,
  difficulty: Difficulty,
  durationMs: number,
  seed: number,
): LaneChart {
  const plan = LANE_PLAN[difficulty];
  const random = createRandom(seed + 101 + instrument.length * 17 + difficulty.length * 31);
  const strummed = strums(instrument);
  const notes: LaneNote[] = zoo(instrument, difficulty);
  let at = zooEnd();
  let serial = 0;

  const push = (note: Omit<LaneNote, "id" | "hero">, hero = random() < HERO_SHARE) => {
    notes.push({
      ...note,
      timeMs: Math.round(note.timeMs / MOCK_SNAP_MS) * MOCK_SNAP_MS,
      id: `${instrument}-${difficulty}-${serial}`,
      hero,
    });
    serial += 1;
  };

  while (at < durationMs - 4000) {
    if (random() < plan.skip) {
      at += randomInt(random, 900, 2600);
      continue;
    }
    // Once in a while an open note, which stands alone by definition.
    if (strummed && random() < 0.05) {
      push({ timeMs: Math.round(at), lengthMs: 0, kind: "strum", column: null });
      at += randomInt(random, 600, 1200);
      continue;
    }
    const column = LANE_WALK[serial % LANE_WALK.length] % plan.columns;
    const kind: LaneNoteKind = strummed && random() < 0.22 ? "hopo" : "strum";
    push({
      timeMs: Math.round(at),
      lengthMs: random() < 0.16 ? randomInt(random, 380, 1100) : 0,
      kind,
      column,
    });
    // A chord: a second note on the same moment, a column or two away.
    if (strummed && random() < 0.14 && plan.columns > 1) {
      const other = (column + 1 + randomInt(random, 0, Math.min(2, plan.columns - 2))) % plan.columns;
      if (other !== column) {
        push({
          timeMs: Math.round(at),
          lengthMs: 0,
          kind: "strum",
          column: other,
        });
      }
    }
    at += randomInt(random, plan.gap[0], plan.gap[1]);
  }
  return { instrument, difficulty, columns: plan.columns, bpm: MOCK_BPM, notes };
}

/** The end of the zoo, where a chart's own content starts. The last exhibit is
 *  its slide's target, at step nine. */
function zooEnd(): number {
  return ZOO_START_MS + ZOO_STEP_MS * 10;
}

/**
 * The note zoo: every type and combination the chart can carry, right at the
 * start. Kept in one place so a treatment that regresses is on screen within
 * seconds of pressing play.
 */
function zoo(instrument: InstrumentKind, difficulty: Difficulty): LaneNote[] {
  const strummed = strums(instrument);
  const columns = LANE_PLAN[difficulty].columns;
  const middle = Math.floor(columns / 2);
  /** The slide target's column: two across from the source, so the ribbon crosses
   *  the middle rather than stepping to the edge. */
  const targetColumn = Math.min(2, columns - 1);
  /** An exhibit, and the exhibit it slides to: ids exist only after the map. */
  type Exhibit = Omit<LaneNote, "id" | "slideTo"> & { slideToIndex?: number };
  const exhibits: Exhibit[] = strummed
    ? [
        // A plain note, then one that can be hammered on from it.
        { timeMs: ZOO_START_MS, lengthMs: 0, kind: "strum", column: middle, hero: false },
        { timeMs: ZOO_START_MS + ZOO_STEP_MS, lengthMs: 0, kind: "hopo", column: middle, hero: false },
        // An open note, alone.
        { timeMs: ZOO_START_MS + ZOO_STEP_MS * 2, lengthMs: 0, kind: "strum", column: null, hero: false },
        // Holds: short, and a hero hold.
        { timeMs: ZOO_START_MS + ZOO_STEP_MS * 3, lengthMs: 700, kind: "strum", column: middle, hero: false },
        { timeMs: ZOO_START_MS + ZOO_STEP_MS * 4, lengthMs: 900, kind: "strum", column: middle, hero: true },
        // A chord, and a hero chord.
        { timeMs: ZOO_START_MS + ZOO_STEP_MS * 5, lengthMs: 0, kind: "strum", column: 0, hero: false },
        { timeMs: ZOO_START_MS + ZOO_STEP_MS * 5, lengthMs: 0, kind: "strum", column: Math.min(1, columns - 1), hero: false },
        // A hero note, and a hero hopo to stack them.
        { timeMs: ZOO_START_MS + ZOO_STEP_MS * 6, lengthMs: 0, kind: "strum", column: middle, hero: true },
        { timeMs: ZOO_START_MS + ZOO_STEP_MS * 7, lengthMs: 0, kind: "hopo", column: middle, hero: true },
        // A slide: the earlier note links to a later one in another column.
        { timeMs: ZOO_START_MS + ZOO_STEP_MS * 8, lengthMs: 0, kind: "strum", column: 0, hero: false, slideToIndex: 10 },
        { timeMs: ZOO_START_MS + ZOO_STEP_MS * 9, lengthMs: 0, kind: "strum", column: targetColumn, hero: false },
      ]
    : [
        { timeMs: ZOO_START_MS, lengthMs: 0, kind: "strum", column: middle, hero: false },
        { timeMs: ZOO_START_MS + ZOO_STEP_MS, lengthMs: 600, kind: "strum", column: middle, hero: false },
        { timeMs: ZOO_START_MS + ZOO_STEP_MS * 2, lengthMs: 0, kind: "strum", column: middle, hero: true },
        { timeMs: ZOO_START_MS + ZOO_STEP_MS * 3, lengthMs: 800, kind: "strum", column: middle, hero: true },
        // A slide: the same exhibit a tapped highway can also carry.
        { timeMs: ZOO_START_MS + ZOO_STEP_MS * 4, lengthMs: 0, kind: "strum", column: 0, hero: false, slideToIndex: 5 },
        { timeMs: ZOO_START_MS + ZOO_STEP_MS * 5, lengthMs: 0, kind: "strum", column: targetColumn, hero: false },
      ];
  return exhibits.map(({ slideToIndex, ...note }, index) => ({
    ...note,
    id: `${instrument}-${difficulty}-zoo-${index}`,
    ...(slideToIndex === undefined
      ? {}
      : { slideTo: `${instrument}-${difficulty}-zoo-${slideToIndex}` }),
  }));
}

/* ----------------------------------------------------------------- melody */

function clampRow(row: number): number {
  return Math.max(0, Math.min(MELODY_ROWS - 1, row));
}

/**
 * Who sings a section of the duet, and how: the parts take turns, come together
 * in unison, take turns again, sing against each other (different words at
 * once), and come back together in harmony. Each entry is one line, and its
 * parts.
 */
function duetSection(section: number): MelodyPart[][] {
  switch (section % 8) {
    case 2:
      return [[{ part: 0, offset: 0 }, { part: 1, offset: 0 }]];
    case 4:
      return [[{ part: 0, offset: 0 }], [{ part: 1, offset: 0 }]];
    case 6:
      return [[{ part: 0, offset: 0 }, { part: 1, offset: 1 }]];
    default:
      return [[{ part: section % 2, offset: 0 }]];
  }
}

function buildLines(
  durationMs: number,
  random: () => number,
  parts: number,
): MelodyLine[] {
  const lines: MelodyLine[] = [];
  let at = 4200;
  let section = 0;
  // Walks the pool rather than the section, so no part sings the same lyric
  // twice in a row.
  let pool = 0;
  while (at < durationMs - 7000) {
    const freeform = section % FREEFORM_EVERY === FREEFORM_EVERY - 1;
    const groups: MelodyPart[][] =
      parts < 2 ? [[{ part: 0, offset: 0 }]] : duetSection(section);
    let longest = 0;
    groups.forEach((lineParts) => {
      const words = LINE_POOL[pool % LINE_POOL.length].split(" ");
      pool += 1;
      const lineMs = Math.min(words.length * randomInt(random, 360, 600), 4400);
      const step = lineMs / words.length;
      lines.push({
        timeMs: Math.round(at),
        endMs: Math.round(at + lineMs),
        parts: lineParts,
        freeform,
        words: words.map((text, word) => ({
          text,
          timeMs: Math.round(at + word * step),
          // The hero flag lives on the *word*, so every role that plays it —
          // singer or typist — honours the same one.
          hero: hashUnit(`hero:${section}:${word}`) < HERO_SHARE,
        })),
      });
      longest = Math.max(longest, lineMs);
    });
    section += 1;
    // A breath between sections, and now and then a longer instrumental break.
    at +=
      longest +
      (random() < 0.12 ? randomInt(random, 6000, 15000) : randomInt(random, 800, 2000));
  }
  return lines;
}

function buildMelody(lines: MelodyLine[], random: () => number): MelodyNote[] {
  const notes: MelodyNote[] = [];
  let row = Math.floor(MELODY_ROWS / 2);
  lines.forEach((line, lineIndex) => {
    line.words.forEach((word, wordIndex) => {
      if (!line.freeform) row = clampRow(row + randomInt(random, -1, 1));
      const next = line.words[wordIndex + 1]?.timeMs ?? line.endMs;
      const lengthMs = Math.max(150, next - word.timeMs - 70);
      for (const part of line.parts) {
        notes.push({
          id: `m-${lineIndex}-${wordIndex}-p${part.part}`,
          timeMs: word.timeMs,
          lengthMs,
          part: part.part,
          // A harmony part sits a row above the contour; in unison there is no
          // offset, so both parts land on the same note.
          row: line.freeform ? null : clampRow(row + part.offset),
          text: word.text,
          hero: word.hero,
        });
      }
    });
  });
  // Two lines can run at once, so the whole melody goes back into time order.
  return notes.sort((a, b) => a.timeMs - b.timeMs || a.part - b.part);
}

/** One part's notes, in order. A part that sings nothing gets an empty stream. */
export function splitParts(
  notes: readonly MelodyNote[],
  parts: number,
): MelodyNote[][] {
  const streams = Array.from(
    { length: Math.max(1, parts) },
    (): MelodyNote[] => [],
  );
  for (const note of notes) (streams[note.part] ?? streams[0]).push(note);
  return streams;
}
