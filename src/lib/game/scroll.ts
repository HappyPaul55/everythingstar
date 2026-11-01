/**
 * Where things sit on a scrolling axis — pure, so it can be unit-tested.
 *
 * Both highways scroll the same way: a track holds its notes at fixed positions,
 * and a single transform shifts it as the playhead moves. Positions are
 * percentages of the axis, so nothing has to be measured.
 */

/**
 * A moment's position along the axis, as a percentage. `secondsAcross` is how
 * much song fits along the whole axis, and `anchor` is where the playhead sits
 * on it (the hit line, say). `reverse` is for an axis that runs the other way —
 * a vertical highway, where later notes sit higher up.
 */
export function axisPercent(
  timeMs: number,
  fromMs: number,
  anchor: number,
  secondsAcross: number,
  reverse = false,
): number {
  const sign = reverse ? -1 : 1;
  return (anchor + (sign * (timeMs - fromMs)) / 1000 / secondsAcross) * 100;
}

/**
 * The layer's own offset for a playhead, which is the same maths with the
 * opposite sign: the notes stay where they are and the layer moves past them.
 */
export function nextAxisOffset(
  nowMs: number,
  fromMs: number,
  secondsAcross: number,
  reverse = false,
): number {
  const sign = reverse ? -1 : 1;
  return ((-sign * (nowMs - fromMs)) / 1000 / secondsAcross) * 100;
}

/** Anything with a moment in the song: what the mounted window needs. */
export interface Timed {
  timeMs: number;
  /**
   * How long it lasts, when it is a span rather than an instant (a sustain). A
   * note's head can leave the window long before its tail does, and the tail is
   * still a thing to draw — and, on a highway, still a thing being held.
   */
  lengthMs?: number;
}

/**
 * The beats inside a window, in time order, plus which beat of the bar each is.
 *
 * The beat grid under a highway's notes is drawn from this: `bpm` gives the period,
 * and anchoring the lines to **song time** (rather than to the window) is what keeps
 * them in step with the music as the window slides. Pure, so it is unit-tested.
 *
 * `beatsPerBar` is only used to mark the bar lines; it is not part of the maths.
 */
export function beatsInWindow(
  beatMs: number,
  fromMs: number,
  toMs: number,
  beatsPerBar = 4,
): { timeMs: number; bar: boolean }[] {
  if (!(beatMs > 0) || !Number.isFinite(beatMs) || toMs < fromMs) return [];
  const first = Math.max(0, Math.ceil(fromMs / beatMs));
  const last = Math.floor(toMs / beatMs);
  const beats: { timeMs: number; bar: boolean }[] = [];
  for (let index = first; index <= last; index += 1) {
    beats.push({ timeMs: index * beatMs, bar: index % beatsPerBar === 0 });
  }
  return beats;
}

/**
 * The notes to mount for a window, plus one either side: the neighbours let a
 * glide ribbon at the window's edge still be drawn.
 *
 * A **sustain** is mounted for as long as any part of it is in the window, not
 * only while its head is. The window keeps little of the past — the head is
 * meant to scroll away below the hit line — so a long note would otherwise
 * vanish part-way through its own tail, which a player holding it reads as the
 * note disconnecting. Its head may be well before `fromMs`; only its end matters.
 * Pure, and tested with a note whose head is long gone.
 */
export function notesInWindow<T extends Timed>(
  notes: readonly T[],
  fromMs: number,
  toMs: number,
): T[] {
  if (notes.length === 0) return [];
  let first = Math.max(0, firstAtOrAfter(notes, fromMs) - 1);
  let last = Math.min(notes.length, firstAtOrAfter(notes, toMs) + 2);
  // A neighbour is a **moment**, not a note. Notes sharing a moment are a chord,
  // and keeping only whichever member the index landed on makes one of them
  // vanish while the others remain — a chord that comes apart on screen.
  while (first > 0 && notes[first - 1].timeMs === notes[first].timeMs) first -= 1;
  while (last < notes.length && notes[last].timeMs === notes[last - 1].timeMs) last += 1;
  // A long sustain may start well before `first`. Walk back only as far as the
  // chart's longest note can reach, not the whole chart; the max is cached per
  // array so a window step does not rescan a 10k chart.
  const longest = longestNote(notes);
  let start = first;
  while (start > 0 && notes[start - 1].timeMs + longest >= fromMs) start -= 1;
  const mounted: T[] = [];
  for (let index = start; index < last; index += 1) {
    const note = notes[index]!;
    // The neighbourhood the view has always kept, and any span still crossing
    // the window however early it began.
    if ((index >= first && index < last) || overlapsWindow(note, fromMs, toMs)) {
      mounted.push(note);
    }
  }
  return mounted;
}

const LONGEST = new WeakMap<readonly Timed[], number>();

/** The longest note in an array, cached per chart. */
function longestNote(notes: readonly Timed[]): number {
  const cached = LONGEST.get(notes);
  if (cached !== undefined) return cached;
  let longest = 0;
  for (const note of notes) longest = Math.max(longest, Math.max(0, note.lengthMs ?? 0));
  LONGEST.set(notes, longest);
  return longest;
}

/** Whether any part of a note — its head or its tail — is inside the window. */
function overlapsWindow(note: Timed, fromMs: number, toMs: number): boolean {
  const endMs = note.timeMs + Math.max(0, note.lengthMs ?? 0);
  return note.timeMs <= toMs && endMs >= fromMs;
}

/** How far a window steps on when it is refreshed, in ms. */
export const WINDOW_STEP_MS = 2000;

/** The stretch of song mounted in the DOM. */
export interface MountWindow {
  fromMs: number;
  toMs: number;
}

/**
 * Seat a window for a playhead: `beforeMs` of song behind it and `afterMs` of
 * run-up ahead, plus a step so it is not stale the moment it is mounted.
 */
export function seatWindow(
  nowMs: number,
  beforeMs: number,
  afterMs: number,
  stepMs = WINDOW_STEP_MS,
): MountWindow {
  return { fromMs: nowMs - beforeMs, toMs: nowMs + afterMs + stepMs };
}

/**
 * The window to mount next, or null to keep the one already mounted.
 *
 * The caller's `afterMs` is the run-up the view needs to fill its screen, so the
 * window is refreshed only once what is left ahead of the playhead falls under
 * it — and it is then seated a whole step *beyond* it. Counting the step out of
 * the lookahead instead (halving it, say) would let the mounted future shrink
 * below what the view shows, and notes would mount already on screen: the notes
 * appear at once rather than scrolling on, which is what a ribbon, being long,
 * makes obvious.
 */
export function nextWindow(
  nowMs: number,
  mounted: MountWindow,
  beforeMs: number,
  afterMs: number,
  stepMs = WINDOW_STEP_MS,
): MountWindow | null {
  // Still covering the run-up the view needs, and no seek backwards.
  if (nowMs >= mounted.fromMs && mounted.toMs - nowMs >= afterMs) return null;
  return seatWindow(nowMs, beforeMs, afterMs, stepMs);
}

/** The index of the first note at or after `timeMs`. */
function firstAtOrAfter(notes: readonly Timed[], timeMs: number): number {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (notes[mid].timeMs < timeMs) low = mid + 1;
    else high = mid;
  }
  return low;
}
