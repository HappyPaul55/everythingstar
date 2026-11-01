/**
 * Vocal geometry — pure, so it can be unit-tested.
 *
 * `rowCentre` places a pitch row down the roll and `barSpanMs` says how long a
 * note's bar is drawn: a note is held for as long as it lasts, but a bar never
 * runs into the next note of its part, because two bars that overlap read as one
 * wide bar. `nextOnsets` is what tells a bar where the next one starts, and
 * `rollNotes` is what the roll draws — each note once, however many parts are on
 * it. `sungNotesByPlace` is the note a bar's verdict comes from, built once so
 * the roll can read it by place rather than scanning the melody per bar.
 * `lineSpanMs` is the words' twin of a note's own bar: how long a lyric line is
 * drawn for, stopping short of the next line the same part reads, so two quick
 * lines are two lines rather than one run. `linePlace` names a line's strip on
 * one part's row, `mountedLines` builds every strip's span, and `linesInWindow`
 * is the words' own mounted slice — the words ride the pitch layer, so their
 * geometry belongs beside the notes'.
 *
 * Everything here is a percentage of the box: x of its width, y of its height.
 * Only the voice has a roll. A note highway is buttons — a note is hit where it
 * lands — so it carries no bars at all.
 */

import type { MelodyLine, MelodyNote, NoteState } from "../track";

/** The shortest a bar is drawn, so a quick word still reads as a note. */
export const MIN_BAR_MS = 280;

/** The gap left between two bars, so they read as two rather than as one. */
export const BAR_GAP_MS = 40;

/**
 * The shortest a bar is drawn even when the next note leaves it no gap at all.
 *
 * Two notes closer together than `BAR_GAP_MS` leave the clamp with nothing, and a
 * bar of zero width is a dot nobody can read as a note. It is only a floor for a
 * bar that is drawn: it never reaches the next note's own onset.
 */
export const MIN_DRAWN_MS = 8;

/**
 * Where the roll's playhead column sits across it, as a share of its width.
 *
 * The stage and the stylesheet read this one number: `KeysView` publishes it as a
 * custom property and `band.css` places the playhead and the pitch cursor from it,
 * so a playhead drawn ahead of the notes is the same playhead the roll scrolls
 * toward.
 */
export const ROLL_ANCHOR = 0.3;

/** The band of a melody box the roll occupies; the words ride the rest. */
export const ROLL_SHARE = 0.6;

/**
 * Where a pitch row's centre sits down the box, as a percentage from the top.
 * `share` is how much of the box's height the roll itself takes, since the rest
 * of it carries the words. Row 0 is the lowest pitch, so it sits lowest.
 */
export function rowCentre(row: number, rows: number, share = 1): number {
  return share * 100 * (1 - (row + 0.5) / rows);
}

/**
 * How long a bar is drawn, in ms.
 *
 * A note is drawn for as long as it is held, with a floor so a very quick word
 * still reads as a bar. The floor is only used while there is room for it: the
 * bar stops short of the next note in its part, so two quick notes are two bars
 * with a gap rather than one long bar with no join. Two notes closer together than
 * that gap leave no room at all, and a bar is still drawn at `MIN_DRAWN_MS` —
 * never past the next note, because a bar that runs into it is one bar again.
 */
export function barSpanMs(
  note: Pick<MelodyNote, "timeMs" | "lengthMs">,
  nextTimeMs: number | null,
): number {
  const held = Math.max(note.lengthMs, MIN_BAR_MS);
  if (nextTimeMs === null) return held;
  const room = nextTimeMs - note.timeMs;
  const span = Math.max(0, Math.min(held, room - BAR_GAP_MS));
  return Math.min(Math.max(span, MIN_DRAWN_MS), Math.max(0, room));
}

/**
 * The onset of the next note in each part, keyed by `part:time`.
 *
 * A bar can be shared by two parts singing the same moment, so the view takes
 * the earliest of their next onsets: neither voice's bar may run into the next
 * note of the other.
 */
export function nextOnsets(notes: readonly MelodyNote[]): Map<string, number> {
  const streams = new Map<number, MelodyNote[]>();
  for (const note of notes) {
    const stream = streams.get(note.part);
    if (stream) stream.push(note);
    else streams.set(note.part, [note]);
  }
  const out = new Map<string, number>();
  for (const stream of streams.values()) {
    const ordered = stream.every(
      (note, index) => index === 0 || note.timeMs >= stream[index - 1].timeMs,
    )
      ? stream
      : [...stream].sort((a, b) => a.timeMs - b.timeMs);
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const note = ordered[index];
      out.set(`${note.part}:${note.timeMs}`, ordered[index + 1].timeMs);
    }
  }
  return out;
}

/** A note the roll draws, and the parts on it. */
export interface RollNote {
  note: MelodyNote;
  /** More than one where the parts sing the same note together. */
  parts: number[];
}

/**
 * The place a bar occupies: one moment on one pitch row. Two parts singing the
 * same note share it, which is what makes a shared note one bar.
 */
export function notePlace(note: Pick<MelodyNote, "timeMs" | "row">): string {
  return `${note.timeMs}:${note.row}`;
}

/**
 * The notes a bar's verdict belongs to, keyed by place (`notePlace`).
 *
 * A shared note has one entry per part, and only the parts somebody is actually
 * singing have a verdict — the others must read as neutral rather than missed.
 * **Every** sung entry at a place is kept, because two singers on one bar can get
 * two different verdicts; the roll shows that rather than picking a winner. Built
 * once for a whole melody so the roll can read a bar by place instead of scanning
 * every note for each bar it draws.
 */
export function sungNotesByPlace(
  notes: readonly MelodyNote[],
  sungParts: ReadonlySet<number>,
): Map<string, MelodyNote[]> {
  const out = new Map<string, MelodyNote[]>();
  for (const note of notes) {
    if (!sungParts.has(note.part)) continue;
    const place = notePlace(note);
    const already = out.get(place);
    if (already) already.push(note);
    else out.set(place, [note]);
  }
  return out;
}

/**
 * What the roll draws, each note once. Two parts on the same row at the same
 * moment are on **the same note**, so they come back as one entry carrying both,
 * and the roll can show that they are singing together. Freeform words carry no
 * note at all.
 */
export function rollNotes(notes: readonly MelodyNote[]): RollNote[] {
  const drawn = new Map<string, RollNote>();
  const out: RollNote[] = [];
  for (const note of notes) {
    if (note.row === null) continue;
    const key = notePlace(note);
    const already = drawn.get(key);
    if (already) {
      // A part can appear twice on one place when a chart has more voices than the
      // roll has colours; the bar is shared by **parts**, so it is listed once.
      if (!already.parts.includes(note.part)) already.parts.push(note.part);
      continue;
    }
    const entry: RollNote = { note, parts: [note.part] };
    drawn.set(key, entry);
    out.push(entry);
  }
  return out;
}

/**
 * The verdict of one bar, from every singer on it.
 *
 * A shared note has one entry per part, and each singer gets their own verdict: a
 * bar is a hit only when every voice hit, and a miss only when every voice missed.
 * One of each is `mixed`. A part can appear twice on one place (a chart with more
 * voices than the roll has colours collapses the extra parts onto the last one), so
 * the verdict is taken **per part** — that is one singer with one verdict, not a
 * duet with two.
 */
export function placeVerdict(
  sung: readonly MelodyNote[] | undefined,
  nowMs: number,
  verdicts: ReadonlyMap<string, { hit: boolean }>,
  judged: (note: MelodyNote) => number,
): NoteState {
  if (!sung || sung.length === 0) return "pending";
  const byPart = new Map(sung.map((note) => [note.part, note]));
  const voices = [...byPart.values()];
  if (voices.some((note) => nowMs <= judged(note))) return "live";
  const hits = voices.filter((note) => verdicts.get(note.id)?.hit).length;
  if (hits === voices.length) return "hit";
  if (hits === 0) return "miss";
  return "mixed";
}

/**
 * The span a lyric line is drawn for, the words' twin of a note's own bar.
 *
 * A line runs to its own end, but a floor keeps a quick line readable, and it
 * stops short of the next line **in the same part** the same way a bar stops
 * short of the next note — two quick lines are two lines, not one long run.
 *
 * `nextTimeMs` is the onset of the next line the part reads, or `null` for the
 * last, so two quick lines leave the gap between them and a last line runs to
 * its own end.
 */
export function lineSpanMs(
  timeMs: number,
  endMs: number,
  nextTimeMs: number | null,
): number {
  const held = Math.max(endMs - timeMs, MIN_BAR_MS);
  if (nextTimeMs === null) return held;
  const room = nextTimeMs - timeMs;
  const span = Math.max(0, Math.min(held, room - BAR_GAP_MS));
  return Math.min(Math.max(span, MIN_DRAWN_MS), Math.max(0, room));
}

/** The place a line's words sit: one moment, on one part's own row. */
export function linePlace(line: { timeMs: number }, part: number): string {
  return `${part}:${line.timeMs}`;
}

/**
 * How the roll's words are mounted, by part — the words' twin of `rollNotes`.
 *
 * A lyric line's words ride the pitch's own layer, so they need the same
 * questions a note does: which lines are on screen, and how long each one's
 * strip is drawn. This is the whole answer, kept here with the notes so the
 * view cannot grow its own.
 *
 * The lines are split by **part** first, the same rule the lyric view always
 * used: a solo song reads every line in one row, and a duet's two rows each
 * read only the lines their part sings (a line both sing appears in both).
 * Within a part, each line's strip stops short of the next one the same part
 * reads (`lineSpanMs`), over the whole chart rather than the mounted window —
 * a line at the window's edge still has to know where the next begins.
 */
export function mountedLines(
  lines: readonly MelodyLine[],
  parts: number,
): Map<string, { line: MelodyLine; spanMs: number }> {
  const out = new Map<string, { line: MelodyLine; spanMs: number }>();
  const count = Math.max(1, parts);
  const byPart: MelodyLine[][] = [];
  for (let part = 0; part < count; part += 1) {
    byPart.push(
      part === 0 && count === 1
        ? lines.slice()
        : lines.filter((line) => line.parts.some((sung) => sung.part === part)),
    );
  }
  byPart.forEach((own, part) => {
    own.forEach((line, index) => {
      const nextTimeMs = index < own.length - 1 ? own[index + 1].timeMs : null;
      out.set(linePlace(line, part), {
        line,
        spanMs: lineSpanMs(line.timeMs, line.endMs, nextTimeMs),
      });
    });
  });
  return out;
}

/**
 * The window a reader has at a glance: a little before the anchor, a little
 * after, so a line still to start is on screen and fading up when it should
 * be, and one that has run out has scrolled away rather than sitting on the
 * strip it was on. It is the pitch roll's window with wider margins, and the
 * words' own question — not the notes'.
 */
export function linesInWindow(
  lines: readonly MelodyLine[],
  fromMs: number,
  toMs: number,
  anchor: number,
  beforeMs: number,
  afterMs: number,
): readonly MelodyLine[] {
  const anchorMs = fromMs + (toMs - fromMs) * anchor;
  const from = anchorMs - beforeMs;
  const to = anchorMs + afterMs;
  return lines.filter((line) => line.timeMs < to && line.endMs > from);
}
