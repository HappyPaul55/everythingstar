import {
  INSTRUMENTS,
  isSustain,
  type InstrumentKind,
  type LaneNote,
  type NoteState,
} from "../track";
import {
  NOTE_SPEED_MAX,
  NOTE_SPEED_MIN,
  type HighwayView,
  type NoteStyle,
} from "../settings";

/**
 * How a note is drawn, as pure rules, so every treatment is testable and a
 * regression shows up in a test rather than on a player's screen.
 *
 * A note is a **span** — its head, its tail and the time between them — and a
 * **face** on it, and the skin decides what the face looks like (see `NoteStyle`):
 *
 * - **bars** is the flat button the game has always drawn,
 * - **gems** is a rounded head with a tail behind it,
 * - **arrows** makes the glyph the note itself.
 *
 * Everything else is a channel of its own, and never colour or shape alone:
 *
 * - **open** spans the whole highway and is strummed with no frets,
 * - **sustain** is a note with a tail,
 * - **hero** wears a thick cream border and a glow,
 * - **hopo** flips its face to solid white inside its own coloured edge *while
 *   it can be tapped* — the cue goes the moment its chain breaks, so "you must
 *   strum this one" is visible.
 *
 * A note that has been **hit** is not a treatment of its own: it is taken off the
 * neck, and the panel draws a burst above the pad it landed on (`hitBursts`). A
 * miss keeps its red note travelling past the line, because that is what a dropped
 * note looks like.
 *
 * The instrument's kit decides the small glyph a bar or gem carries (a mat's
 * arrows) and the marker on the hit line; that is the only place an instrument
 * changes the look.
 */

/**
 * One arrow of a note face. Compass names rather than characters: the drawing
 * turns a name into a shape, so no part of the game depends on a font carrying
 * the right glyph.
 */
export type ArrowGlyph =
  | "left"
  | "right"
  | "up"
  | "down"
  | "up-left"
  | "up-right"
  | "down-left"
  | "down-right"
  | "dot";

/**
 * The directions a chart's columns use, in column order.
 *
 * **Four is the dance mat's** — left, up, down, right, which is also the order the dance
 * kit's keys are bound in. **Five is a five-panel dance layout** — down-left,
 * up-left, the centre, up-right, down-right — because a five-column chart has a
 * middle column and four diagonals, and repeating one of four arrows across five
 * columns would read as two lefts. Three takes the horizontal row and a point up,
 * two is the horizontal pair, and one is the centre.
 */
const ARROW_SETS: Record<number, readonly ArrowGlyph[]> = {
  1: ["dot"],
  2: ["left", "right"],
  3: ["left", "up", "right"],
  4: ["left", "up", "down", "right"],
  5: ["down-left", "up-left", "dot", "up-right", "down-right"],
};

/** The four directions the dance mat uses, which every other count falls back to. */
const FOUR: readonly ArrowGlyph[] = ARROW_SETS[4];

/**
 * The arrows a chart of `columns` columns uses. A chart outside the sets above
 * (a six-column import, say) cycles the mat's four rather than inventing a
 * direction; the column's position still says which note it is.
 */
export function arrowSet(columns: number): readonly ArrowGlyph[] {
  return ARROW_SETS[columns] ?? FOUR;
}

/** The arrow a column shows. Out-of-range columns wrap rather than fail. */
export function arrowFor(column: number, columns: number): ArrowGlyph {
  const set = arrowSet(columns);
  const index = ((Math.trunc(column) % set.length) + set.length) % set.length;
  return set[index];
}

/** The centre x (%) of a column. */
export function columnCentre(column: number, columns: number): number {
  return (column + 0.5) * (100 / columns);
}

/** How wide a note is drawn, as a share of its column. */
export const NOTE_SHARE = 0.68;

/**
 * The box a note occupies across its highway, as percentages of the axis.
 *
 * A note takes `NOTE_SHARE` of its column, centred on the column's own centre, so
 * the two notes of a chord stand side by side with a gap rather than touching. An
 * **open** note has no column — it spans the whole highway — so the column may be
 * `null`. Drawing only; nothing here is read into judging.
 */
export function noteColumnBox(
  column: number | null,
  columns: number,
): { left: number; width: number } {
  if (column === null) return { left: 0, width: 100 };
  const width = (100 / columns) * NOTE_SHARE;
  return { left: columnCentre(column, columns) - width / 2, width };
}

/**
 * The box a note occupies on a highway's axis, in percentages of the axis.
 *
 * The **bottom is the head** — the end that meets the hit line at the note's own
 * time — and the body is drawn above it, up the neck, where the song is going. A
 * note with no length still needs a height of its own, so `minHeight` is the floor;
 * a sustain is as tall as its own span. This is the one anchor behind every skin,
 * which is what keeps a plain note and the head of a sustain at the same moment on
 * the same line: anchor the body to the top instead and the two are a note's height
 * apart.
 */
export function noteBox(
  head: number,
  tail: number,
  minHeight: number,
): { top: number; height: number } {
  const height = Math.max(minHeight, head - tail);
  return { top: head - height, height };
}

/**
 * Seconds of song along the whole height of a highway at **1×**, face-on and tilted.
 * The tilted neck is longer on purpose: perspective compresses its far half, so the
 * same run-up holds more of the song — which is the whole reason to tilt it.
 */
export const SECONDS_FLAT = 4.3;
export const SECONDS_3D = 6.6;

/**
 * The run-up a highway draws, in seconds of song across the neck, at a given
 * **note speed** (`Settings.noteSpeed`). It is the drawing's own rule and the only
 * thing the speed setting moves: the chart, the clock and the hit window are the
 * same at every speed, so the mounted window follows this and the judging does not.
 *
 * Speed applies the same way to both views — a multiplier on the view's own run-up —
 * and is clamped here as well as in the settings, so a value from somewhere else can
 * never give a highway an infinite or empty window.
 */
export function noteWindowSeconds(view: HighwayView, speed = 1): number {
  const base = view === "3d" ? SECONDS_3D : SECONDS_FLAT;
  const held = Number.isFinite(speed)
    ? Math.max(NOTE_SPEED_MIN, Math.min(NOTE_SPEED_MAX, speed))
    : 1;
  return base / held;
}

/**
 * The glyph a note shows, if any.
 *
 * The **arrows** skin makes it the note, so every instrument carries one. The other
 * two skins keep the instrument's own: a dance mat still draws its arrows on the
 * bar or the gem. An open note has no column, so it has no direction and no glyph.
 */
export function noteGlyph(
  style: NoteStyle,
  instrument: InstrumentKind,
  column: number | null,
  columns: number,
): ArrowGlyph | null {
  if (column === null) return null;
  if (style === "arrows") return arrowFor(column, columns);
  return INSTRUMENTS[instrument].kit.glyph === "arrow"
    ? arrowFor(column, columns)
    : null;
}

export interface NoteLook {
  state: NoteState;
  /** Whether a hopo may be tapped right now, so its ring can be shown. */
  hammered: boolean;
  /**
   * Whether this note is the one being **held** — a sustain with its fret down. A
   * held note is brighter and a little larger, so "I have it" is something the
   * player can see rather than only read off the score.
   */
  held?: boolean;
  /**
   * Whether this is a drum kit's **kick pedal** (`KICK_COLUMN`). The pedal is a
   * column like any other but the one played with a foot, so it is drawn apart from
   * the five hands' colours rather than given a sixth fret colour.
   */
  kick?: boolean;
}

/**
 * The classes a note carries. Every treatment the game has is one of these, and
 * `noteLook` tests assert each one appears.
 */
export function noteClasses(note: LaneNote, look: NoteLook): string[] {
  const classes = ["highway__note", `is-${look.state}`];
  if (note.column === null) classes.push("is-open");
  // The fret colour. A glyph can say a column's direction too, but nothing here
  // depends on colour alone: position always says which note it is. A drum kit's
  // pedal has no fret colour of its own — it is the column under the foot.
  else if (look.kick) classes.push("is-kick");
  else classes.push(`is-column-${note.column % 5}`);
  if (isSustain(note)) classes.push("is-sustain");
  if (note.hero) classes.push("is-hero");
  // The ring is only there while the hopo can actually be hammered on.
  if (note.kind === "hopo" && look.hammered) classes.push("is-hopo");
  if (look.held) classes.push("is-held");
  return classes;
}

/**
 * Which columns the player is **holding down**, one flag per column.
 *
 * A pad is also the fret under it: pressing and holding a colour fills that pad
 * with its own colour, instantly, so a player can see their own fingers on the
 * line. It is **the only thing that lights a pad** — a note landing or being
 * struck is drawn on the note itself, because a pad that came up on its own
 * would say the game had pressed a key for the player.
 *
 * Clamped to the chart's own columns: a layout can reach past what the song asks
 * for, and the song is what decides. Pure and tested; nothing here is ever read
 * into judging.
 */
export function heldColumns(held: readonly boolean[], columns: number): boolean[] {
  const down = Array.from({ length: Math.max(0, columns) }, () => false);
  for (let column = 0; column < Math.min(down.length, held.length); column++) {
    down[column] = held[column] === true;
  }
  return down;
}

/**
 * How long a landed note's burst stays on the line, in ms. The animation in
 * `band.css` is this long too, so the element lives exactly as long as the burst it
 * draws; change the two together.
 */
export const HIT_BURST_MS = 300;

/** A note that landed recently enough for its burst to still be on the line. */
export interface HitBurst {
  /** The note's index in the chart. */
  index: number;
  /** The moment it landed, in song time. */
  atMs: number;
}

/**
 * The notes whose hit burst is still on the line at `nowMs`.
 *
 * Only a hit has a time, and only a hit **now** does: one that landed before the
 * window is old news, and one stamped ahead of the playhead cannot come from a run
 * that never rewinds — dropping it is what stops a seek lighting a burst for a note
 * nobody has played. Pure; the panel draws what this returns, and nothing here is
 * ever read into judging.
 *
 * Hit times are indexed by note, and a chart's notes are in song order, so the
 * recent ones are nearest the end. The scan walks back from there and stops at the
 * first hit older than the window rather than checking a whole song's notes on
 * every publish tick; the answer is returned in note order, as it always was.
 *
 * A caller that knows how far the run has got passes `startIndex` (the last judged
 * note, `run.cursor - 1`): the notes after it are the song's **future**, still null,
 * and walking a long chart's unplayed tail on every tick is the cost this parameter
 * removes. It is clamped to the array, and its default keeps the old whole-array
 * behaviour for a caller with no cursor to offer.
 */
export function hitBursts(
  hitTimes: readonly (number | null)[],
  nowMs: number,
  windowMs = HIT_BURST_MS,
  startIndex = hitTimes.length - 1,
): HitBurst[] {
  const bursts: HitBurst[] = [];
  const last = hitTimes.length - 1;
  const start = Number.isFinite(startIndex)
    ? Math.min(Math.max(Math.trunc(startIndex), -1), last)
    : last;
  for (let index = start; index >= 0; index -= 1) {
    const atMs = hitTimes[index];
    if (atMs === null) continue;
    const age = nowMs - atMs;
    // `!(age >= 0)` also drops a time that is not a number rather than keeping it.
    // It is a hole in the history, not the end of it, so the walk carries on.
    if (!(age >= 0)) continue;
    if (age > windowMs) break;
    bursts.push({ index, atMs });
  }
  return bursts.reverse();
}
