/**
 * Our track format — the one shape every source is normalised into.
 *
 * UltraStar charts, Guitar Hero/YARG MIDI and YouTube captions all get read and
 * translated into this. Nothing in the game knows where a track came from, and
 * nothing outside this module changes the shape.
 *
 * Vocabulary (kept in step with AGENTS.md's Glossary):
 *
 * - **Player** — someone on stage: an instrument, or a melody role.
 * - **Panel** — a player's own 1:1 area in the lanes region.
 * - **Highway** — the scrolling note area inside a panel.
 * - **Column** — one vertical lane of a highway.
 * - **Part** — a melodic line in the chart (1 is a solo, 2 a duet).
 * - **Role** — what a melody player does with a part: `sing` or `type`.
 * - **Chart** — one instrument at one difficulty, with its own note list.
 */

import type { MessageKey } from "../../i18n";

export type Difficulty = "easy" | "normal" | "hard" | "expert";

/** Every level there is, easiest first: the order levels are **compared** in. */
export const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard", "expert"];

/**
 * The levels **vocals** always carry. **Singing is never missing** — a song's
 * charts are whatever it came with (one is hard and expert on the guitar, the next
 * nothing but easy), but a voice has all three, because a singer's difficulty is
 * the microphone's **tolerance** rather than a chart (`VOCAL_TOLERANCE` in
 * `singing.ts`).
 */
export type VocalDifficulty = "easy" | "normal" | "hard";
export const VOCAL_DIFFICULTIES: VocalDifficulty[] = ["easy", "normal", "hard"];

export type InstrumentKind = "guitar" | "bass" | "drums" | "keys" | "dance";

/**
 * Which guitar part a chart carries: a song can ship a **lead** and a **rhythm**
 * guitar, two different things to play and one instrument to a band. Absent on
 * every other instrument, and on a guitar a source never named.
 */
export type LaneRole = "lead" | "rhythm";

/** The guitar roles, in the order the band screen offers them. */
export const LANE_ROLES: LaneRole[] = ["lead", "rhythm"];

export function isLaneRole(value: unknown): value is LaneRole {
  return value === "lead" || value === "rhythm";
}

/**
 * Parts a melody can carry: 1 is a solo, 2 a duet, 3 a trio. A song's own fact
 * rather than a count of players — more players than parts **share** them
 * (`melodyRoles`), so adding a singer never turns a solo into a duet.
 *
 * Three, not two, because that is what the sources carry: a Guitar Hero master
 * track or a harmonies source is charted as a lead and up to two harmonies
 * (`HARM1`/`HARM2`), and a chart we can read but cannot represent is a chart we
 * would have to throw away.
 */
export const MAX_PARTS = 3;

/**
 * How a note is played: a **strum** or a **hopo**. Tapping is not a note kind:
 * it is how a controller plays the note (a phone pad, a dance mat or a keyboard),
 * and it is decided by the instrument and the controller, never written into the
 * chart.
 */
export type LaneNoteKind = "strum" | "hopo";

/**
 * How an instrument looks and how its notes are played. Data, so adding an
 * instrument is an entry here and a label, never a new component.
 */
export interface InstrumentKit {
  /** How a note is drawn: a rounded bar, or an arrow for a dance mat. */
  glyph: "bar" | "arrow";
  /** What marks the hit area: a plain bar, a keyboard, or arrows. */
  hitMarker: "bar" | "keyboard" | "arrows";
  /**
   * How the instrument is **played**: strummed, or tapped by pressing its keys.
   * This is a controller behaviour, not a note kind — a guitar on a touch screen
   * still plays strum notes, with the tap supplying the strum.
   */
  play: "strum" | "tap";
}

export interface InstrumentConfig {
  /** The dictionary key for the instrument's label. */
  labelKey: MessageKey;
  kit: InstrumentKit;
}

export const INSTRUMENTS: Record<InstrumentKind, InstrumentConfig> = {
  guitar: {
    labelKey: "band.guitar",
    kit: { glyph: "bar", hitMarker: "bar", play: "strum" },
  },
  bass: {
    labelKey: "band.bass",
    kit: { glyph: "bar", hitMarker: "bar", play: "strum" },
  },
  // Drums are represented exactly as a guitar is; only the mapping of keys to
  // real pads differs, and that is a binding, not a rendering.
  drums: {
    labelKey: "band.drums",
    kit: { glyph: "bar", hitMarker: "bar", play: "strum" },
  },
  keys: {
    labelKey: "band.simpleKeys",
    kit: { glyph: "bar", hitMarker: "keyboard", play: "tap" },
  },
  dance: {
    labelKey: "band.dance",
    kit: { glyph: "arrow", hitMarker: "arrows", play: "tap" },
  },
};

export const INSTRUMENT_KINDS = Object.keys(INSTRUMENTS) as InstrumentKind[];

/** Whether an instrument is played with a strum, rather than by tapping its keys. */
export function strums(kind: InstrumentKind): boolean {
  return INSTRUMENTS[kind].kit.play === "strum";
}

/** How a note looks while it is being played. */
export type NoteState = "pending" | "live" | "hit" | "miss";

/** A note on a highway. */
export interface LaneNote {
  id: string;
  timeMs: number;
  /** How long it is held; 0 is a tap. */
  lengthMs: number;
  kind: LaneNoteKind;
  /** Which column it falls in, or null for an open note (a strum, no frets). */
  column: number | null;
  /** Worth `HERO_MULTIPLE` times as much: a note to encourage. */
  hero: boolean;
}

/**
 * The drum kit's **kick pedal** as a column: a drum highway is six columns wide,
 * and the last one is the pedal (see `sources/ghmidi.ts` and `sources/chart.ts`
 * for the pitch and the fret a source writes it with).
 *
 * It is a column like any other — the same generic highway, the same judging —
 * and the pedal is only **drawn** apart (`Highway.tsx`), because it is the one
 * pad a drummer plays with a foot rather than a hand.
 */
export const KICK_COLUMN = 5;

/** Whether a note is a drum kit's kick pedal. `false` on every other instrument. */
export function isKick(note: LaneNote, instrument: InstrumentKind): boolean {
  return instrument === "drums" && note.column === KICK_COLUMN;
}

/**
 * A span a player builds the meter in — star power, or a chart's
 * overdrive. The **source** says where it starts and ends; what it is worth is the
 * game's business. A chart that marks none simply carries none.
 */
export interface ChartPhrase {
  startMs: number;
  endMs: number;
}

/** One instrument at one difficulty. A chart owns its own column count. */
export interface LaneChart {
  instrument: InstrumentKind;
  /**
   * Which guitar part this is, when the source named one. A band seat binds to
   * the **role** as well as the instrument, so a lead and a rhythm guitar are two
   * seats with their own charts rather than one chart played twice.
   */
  role?: LaneRole;
  difficulty: Difficulty;
  /** How many columns the highway has. Never a property of the instrument. */
  columns: number;
  /**
   * The chart's tempo, when it has one: the period of the **beat grid** the highway
   * draws under its notes. A chart that does not know its tempo has no grid rather
   * than a made-up one, so `bpm` is simply absent.
   */
  bpm?: number;
  /** The energy phrases it marks, in time order, when it marks any. */
  phrases?: ChartPhrase[];
  /**
   * The chart's **drum fills**, in time order, when it marks any. A fill is a
   * freestyle window: the notes inside it are judged exactly as any other note, and
   * an extra strike that has nothing to judge is a *fill hit* rather than an error
   * (`applyTrigger` in `lanes.ts`). Only a drum chart carries them.
   */
  fills?: ChartPhrase[];
  notes: LaneNote[];
}

/** One word of the melody. */
export interface MelodyNote {
  id: string;
  timeMs: number;
  lengthMs: number;
  /** Which part sings it. */
  part: number;
  /** The pitch row, 0 at the bottom, or null for a freeform (spoken) word. */
  row: number | null;
  /** The word as it should read on screen. */
  text: string;
  hero: boolean;
}

export interface MelodyWord {
  text: string;
  timeMs: number;
  /** Worth `HERO_MULTIPLE` times as much, whichever role plays it. */
  hero: boolean;
}

/** One part's share of a line, and how far off the line's contour it sits. */
export interface MelodyPart {
  part: number;
  offset: number;
}

export interface MelodyLine {
  timeMs: number;
  endMs: number;
  words: MelodyWord[];
  /** Who sings the line: one part is a solo, two are sung together. */
  parts: MelodyPart[];
  /** Spoken or rapped: no pitch is judged on it. */
  freeform: boolean;
}

export interface MelodyChart {
  /** How many parts the melody has: 1 is a solo, 2 a duet. */
  parts: number;
  /** Whether the melody carries pitch (vocals) or is words only (lyrics). */
  hasPitch: boolean;
  /**
   * The pitch roll: how many rows it has, and the MIDI note row 0 sounds. A row is
   * a **semitone**, so a note's pitch is `rootMidi + row` — which is what makes a
   * contour drawn from nothing and a frequency measured from a microphone the same
   * thing. They are set whether or not the words carry pitch, so a chart is always
   * a whole chart.
   */
  rows: number;
  rootMidi: number;
  lines: MelodyLine[];
  notes: MelodyNote[];
}

/** A named stretch of a song: what a source writes as `[section Verse 1]`. */
export interface TrackSection {
  timeMs: number;
  name: string;
}

export interface Track {
  id: string;
  title: string;
  durationMs: number;
  melody: MelodyChart;
  /** Every instrument at every difficulty, so any player can choose. */
  charts: LaneChart[];
  /**
   * The song's own structure, when its source marked any: its sections in time
   * order. **Nothing judges on them** — they are what a practice screen, a progress
   * read-out or a "where am I" line would read, and a song that marks none carries
   * none rather than a structure invented for it.
   */
  sections?: TrackSection[];
}

/**
 * The charts one seat asks for: an instrument and, for a guitar, the **role** it
 * is bound to.
 *
 * A roleless seat on a song carrying two roles takes the **lead**; one on a song
 * carrying a single role takes that one. Answering the same way for a role the
 * song does not carry (a seat remembered from another song) is what keeps a
 * remembered band playable rather than leaving a panel with no chart.
 */
function chartsFor(
  track: Pick<Track, "charts">,
  instrument: InstrumentKind,
  role?: LaneRole,
): LaneChart[] {
  const all = track.charts.filter((chart) => chart.instrument === instrument);
  if (all.length === 0) return all;
  const roles = LANE_ROLES.filter((lane) => all.some((chart) => chart.role === lane));
  if (role !== undefined && roles.includes(role)) {
    return all.filter((chart) => chart.role === role);
  }
  // A plain guitar chart is the lead a roleless seat has always meant, so prefer
  // it over a role the song happens to list first. (A document may carry both.)
  const plain = all.filter((chart) => chart.role === undefined);
  if (plain.length > 0) return plain;
  if (roles.length > 0) return all.filter((chart) => chart.role === roles[0]);
  return all;
}

/** The difficulties a track carries for an instrument and role, easiest first. */
export function difficultiesFor(
  track: Pick<Track, "charts">,
  instrument: InstrumentKind,
  role?: LaneRole,
): Difficulty[] {
  const carried = new Set(chartsFor(track, instrument, role).map((chart) => chart.difficulty));
  return DIFFICULTIES.filter((difficulty) => carried.has(difficulty));
}

/**
 * The nearest difficulty in a set.
 *
 * Ties go to the **easier** of the two: asking for hard on a song that carries
 * easy and expert should not hand out expert. A song carries whatever its own
 * charts do, and a band is remembered across songs, so a mismatch is ordinary
 * rather than an error — this is what makes it resolve to something playable.
 *
 * Generic over the levels asked about, because the vocals' three are their own set:
 * `nearestDifficulty(VOCAL_DIFFICULTIES, …)` is a `VocalDifficulty`, which is what
 * lets the singing rules be keyed on exactly the levels a voice has.
 */
export function nearestDifficulty<T extends Difficulty>(
  available: readonly T[],
  wanted: Difficulty,
): T {
  const target = DIFFICULTIES.indexOf(wanted);
  return available.reduce((best, option) => {
    const gap = Math.abs(DIFFICULTIES.indexOf(option) - target);
    const bestGap = Math.abs(DIFFICULTIES.indexOf(best) - target);
    if (gap !== bestGap) return gap < bestGap ? option : best;
    return DIFFICULTIES.indexOf(option) < DIFFICULTIES.indexOf(best) ? option : best;
  });
}

/**
 * One part's notes, in time order: what a single singer's run has to judge. A
 * shared note (both parts on it) is in both lists, which is what two singers are.
 */
export function partNotes(
  notes: readonly MelodyNote[],
  part: number,
): MelodyNote[] {
  return notes.filter((note) => note.part === part);
}

/**
 * Fit each part's notes into their own turns: no note outlasts the next note in
 * the same part.
 *
 * A melody run walks a part's notes in order, one cursor at a time, and judges a
 * note only once its own span (and the singer's grace) has passed. A long note that
 * still had seconds to run therefore held the cursor while a short note inside it
 * came and went: that note's verdict arrived when the long one ended, by which time
 * its pitch samples had left the trail. A note now ends where the next note in its
 * **own part** begins.
 *
 * Only a length that runs long is changed: the notes keep their own starts, their
 * text and their order, and a note in another part is untouched (a harmony may sit
 * over a lead). Because each note ends at or before the next note's start, the
 * run's `judgedAt` (`run.ts`) is in time order too — the earlier note's grace can
 * never land after the later note's.
 */
export function fitMelodyTurns(notes: readonly MelodyNote[]): MelodyNote[] {
  const byPart = new Map<number, number[]>();
  notes.forEach((note, index) => {
    const indices = byPart.get(note.part);
    if (indices) indices.push(index);
    else byPart.set(note.part, [index]);
  });

  let changed = false;
  const fitted = notes.map((note) => {
    if (note.lengthMs >= 0) return note;
    changed = true;
    return { ...note, lengthMs: 0 };
  });

  for (const indices of byPart.values()) {
    indices.sort((a, b) => notes[a].timeMs - notes[b].timeMs || a - b);
    for (let i = 0; i < indices.length - 1; i += 1) {
      const note = fitted[indices[i]];
      const next = fitted[indices[i + 1]];
      const length = Math.max(0, next.timeMs - note.timeMs);
      if (note.lengthMs > length) {
        fitted[indices[i]] = { ...note, lengthMs: length };
        changed = true;
      }
    }
  }

  return changed ? fitted : notes.slice();
}

/**
 * The chart a player runs: their instrument and guitar role at their difficulty —
 * or, when the track does not carry that one, the nearest it does. What a song
 * carries is the song's own business, so this is the one place a difficulty is
 * settled.
 */
export function chartFor(
  track: Pick<Track, "charts">,
  instrument: InstrumentKind,
  difficulty: Difficulty,
  role?: LaneRole,
): LaneChart | null {
  const charts = chartsFor(track, instrument, role);
  if (charts.length === 0) return null;
  const settled = nearestDifficulty(
    charts.map((chart) => chart.difficulty),
    difficulty,
  );
  return charts.find((chart) => chart.difficulty === settled) ?? null;
}

/** An open note is strummed with no frets: it has no column and stands alone. */
export function isOpen(note: LaneNote): boolean {
  return note.column === null;
}

/** A note with a tail, held for points. */
export function isSustain(note: LaneNote): boolean {
  return note.lengthMs > 0;
}

/**
 * The run of notes that land together at the note at `index`. A chord is
 * implicit: notes sharing a moment in one chart *are* the chord.
 */
export function momentAt(
  notes: readonly LaneNote[],
  index: number,
): readonly LaneNote[] {
  const note = notes[index];
  if (!note) return [];
  let from = index;
  while (from > 0 && notes[from - 1].timeMs === note.timeMs) from -= 1;
  let to = index + 1;
  while (to < notes.length && notes[to].timeMs === note.timeMs) to += 1;
  return notes.slice(from, to);
}

/**
 * What is wrong with a list of spans: one that runs backwards, and one that starts
 * before its predecessor ends. `positive` also refuses a span of **no length** —
 * which is right for a fill (a freestyle window with no width has nothing in it)
 * and wrong for a phrase (a zero-length one is an oddity, not a contradiction).
 */
function spanProblems(
  spans: readonly ChartPhrase[],
  name: string,
  positive: boolean,
): string[] {
  const problems: string[] = [];
  let lastEnd = -Infinity;
  for (const span of spans) {
    const startsBeforeItEnds = positive
      ? span.endMs > span.startMs
      : span.endMs >= span.startMs;
    if (!startsBeforeItEnds) {
      problems.push(`a ${name} ends before it starts`);
      break;
    }
    if (span.startMs < lastEnd) {
      problems.push(`a ${name} starts before the previous one ends`);
      break;
    }
    lastEnd = span.endMs;
  }
  return problems;
}

/**
 * What is wrong with a chart, if anything. An empty list means it is playable —
 * the same rules a source parser will be held to.
 */
export function chartProblems(chart: LaneChart): string[] {
  const problems: string[] = [];
  const strummed = strums(chart.instrument);
  if (!Number.isInteger(chart.columns) || chart.columns < 1) {
    problems.push("columns must be at least 1");
  }
  // A tempo that is not a tempo would be a beat grid that never repeats.
  if (chart.bpm !== undefined && !(chart.bpm > 0)) {
    problems.push("bpm must be greater than 0");
  }
  // A phrase that ends before it starts, or overlaps the one before it, is a meter
  // that would fill twice or run backwards. A **fill** is held to the same order,
  // and to a span with time in it: a freestyle window of no length is nothing at
  // all, and would have to mean something the game does not have.
  problems.push(...spanProblems(chart.phrases ?? [], "phrase", false));
  problems.push(...spanProblems(chart.fills ?? [], "fill", true));
  const ids = new Set<string>();
  // Notes are counted per moment **once**, rather than filtering the whole note
  // list for every open note: a chart of many opens is otherwise quadratic, and the
  // only thing the loop needs is whether anything else lands at the same time.
  const notesAt = new Map<number, number>();
  for (const note of chart.notes) {
    notesAt.set(note.timeMs, (notesAt.get(note.timeMs) ?? 0) + 1);
  }
  chart.notes.forEach((note, index) => {
    if (ids.has(note.id)) problems.push(`duplicate note id ${note.id}`);
    ids.add(note.id);
    if (index > 0 && note.timeMs < chart.notes[index - 1].timeMs) {
      problems.push(`note ${note.id} is out of time order`);
    }
    if (note.column !== null && (note.column < 0 || note.column >= chart.columns)) {
      problems.push(`note ${note.id} is outside the highway`);
    }
    if (isOpen(note)) {
      if (!strummed) problems.push(`note ${note.id} is an open note on a tapped instrument`);
      if ((notesAt.get(note.timeMs) ?? 0) > 1) {
        problems.push(`open note ${note.id} shares its moment with another note`);
      }
    }
    if (note.kind === "hopo") {
      if (!strummed) problems.push(`note ${note.id} is a hopo on a tapped instrument`);
      if (index === 0) problems.push(`note ${note.id} is a hopo with nothing before it`);
    }
  });
  return problems;
}
