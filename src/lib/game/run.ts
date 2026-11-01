import { HIT_WINDOW_MS, noteValue, type RunSummary } from "./scoring";
import { SING_GRACE_MS } from "./singing";
import type { MelodyNote } from "./track";
import { drainMeter, fillMeter, missMeter } from "./meter";
import { clamp01 } from "./math";

/**
 * The melody's run: what the singers have sung so far, advanced as the clock
 * moves. Pure and incremental — a cursor walks the chart, so the cost is
 * proportional to the words judged, never to the length of the song.
 *
 * A melody player's words are what they score. Typists run their own engine
 * (`typing.ts`); singers are still played by the simulator (`simulate.ts`)
 * until a microphone drives them, and both keep their own score.
 *
 * A note is judged once its **own span** and the microphone's grace have passed,
 * not at its onset: a long note is sung across its whole length, so its verdict
 * cannot be known until it is over. `judgedAt` is that moment, and `stateOf` in
 * the roll reads the note as live until then.
 *
 * Also here: the playhead helpers the lyric views share, and the rules for when
 * a word is lit and when a line fades up.
 */

/** How much past its own end a word stays lit, in ms. */
export const WORD_BREATH_MS = 140;

/** How long a line takes to fade up before it starts, in ms. */
export const LINE_INTRO_MS = 2500;

export interface RunState extends RunSummary {
  /** The index of the next word to judge. */
  cursor: number;
  /** The moment the state was last advanced to. */
  atMs: number;
  judged: number;
  hits: number;
  misses: number;
  /** How many hero words were hit. A read-out for their cue, never a judging rule. */
  heroHits: number;
  bestCombo: number;
}

/**
 * A run that starts at `fromMs` rather than at the top of the song.
 *
 * A practice count-in seeks to the section the player chose, so a run seeded at
 * zero would judge every word before the section on its first advance. The
 * cursor starts at the first note **at or after** `fromMs`; the earlier notes
 * are left behind the cursor and are never judged, so they count as neither hits
 * nor misses. `fromMs` is also the run's own clock.
 */
export function emptyRunFrom(
  notes: readonly MelodyNote[],
  fromMs = 0,
): RunState {
  const atMs = Math.max(0, fromMs);
  const start = notes.findIndex((note) => note.timeMs >= atMs);
  return {
    cursor: start < 0 ? notes.length : start,
    atMs,
    judged: 0,
    hits: 0,
    misses: 0,
    heroHits: 0,
    combo: 0,
    bestCombo: 0,
    score: 0,
    meter: 0,
  };
}

/** A run at the top of the song. */
export function emptyRun(): RunState {
  return emptyRunFrom([], 0);
}

/**
 * Advance the run to `upToMs`, judging whatever has passed. Asking for a time
 * before the state's own means the run was rewound (a seek), so it replays from
 * the top. A time at or before zero is simply the beginning — it must not recurse
 * back into itself.
 */
export function advanceRun(
  state: RunState,
  notes: readonly MelodyNote[],
  upToMs: number,
  verdict: (note: MelodyNote) => { hit: boolean; offsetMs: number; share?: number },
): RunState {
  if (upToMs < state.atMs) {
    if (upToMs <= 0) return emptyRun();
    return advanceRun(emptyRun(), notes, upToMs, verdict);
  }
  if (upToMs === state.atMs) return state;

  let next = state;
  while (next.cursor < notes.length && judgedAt(notes[next.cursor]) <= upToMs) {
    const note = notes[next.cursor];
    next = judge(next, note, verdict(note));
  }
  return drained(next, upToMs);
}

/**
 * When a note's verdict can be taken: after its own length and the grace the
 * microphone needs to report its last frames. A very short note is still given
 * the highway's little window, so a tap is not judged before the detector has
 * had a frame to hear it.
 */
export function judgedAt(note: Pick<MelodyNote, "timeMs" | "lengthMs">): number {
  return note.timeMs + Math.max(note.lengthMs + SING_GRACE_MS, HIT_WINDOW_MS);
}

function judge(
  state: RunState,
  note: MelodyNote,
  verdict: { hit: boolean; offsetMs: number; share?: number },
): RunState {
  // The verdict is taken at the note's onset, but the run's clock never moves
  // backwards: a note with a length is judged after it has ended, and rewinding
  // `atMs` to its head would make the next drain cover the same gap a second time.
  // A singer's gauge would then *fall* on a hit.
  const before = drained(state, Math.max(state.atMs, note.timeMs));
  const base = { ...before, cursor: before.cursor + 1, judged: before.judged + 1 };

  if (!verdict.hit) {
    return {
      ...base,
      misses: before.misses + 1,
      combo: 0,
      meter: missMeter(before.meter),
    };
  }

  const combo = before.combo + 1;
  return {
    ...base,
    hits: before.hits + 1,
    heroHits: before.heroHits + (note.hero ? 1 : 0),
    combo,
    bestCombo: Math.max(before.bestCombo, combo),
    score:
      before.score + noteValue(note.hero, combo - 1),
    meter: fillMeter(before.meter),
  };
}

/** Let the meter fall as time passes with nothing played. */
function drained(state: RunState, toMs: number): RunState {
  const gap = Math.max(0, toMs - state.atMs);
  if (gap === 0) return state;
  return {
    ...state,
    atMs: toMs,
    meter: drainMeter(state.meter, gap),
  };
}

/**
 * Is a word still going at `nowMs`? A word is lit for as long as it lasts — its
 * own length plus a breath — and then it stops, even if the next word of its
 * line is a while off. Once a word is over the eye should be on what comes
 * next, not on a highlight left behind.
 */
export function isSounding(timeMs: number, lengthMs: number, nowMs: number): boolean {
  return nowMs >= timeMs && nowMs < timeMs + lengthMs + WORD_BREATH_MS;
}

/**
 * How far into its run-up a moment is: 0 while it is still well off, 1 as it
 * arrives. A view scales its "you are next" fade-in by this, so a singer can see
 * their own line coming without a timer of its own.
 */
export function introProgress(atMs: number, nowMs: number, introMs = LINE_INTRO_MS): number {
  if (nowMs >= atMs) return 1;
  return clamp01(1 - (atMs - nowMs) / introMs);
}

/** The line being sung at `timeMs`, or -1 before the song starts. A line stays
 * active until the next one begins. */
export function activeLineIndex(
  lines: readonly { timeMs: number }[],
  timeMs: number,
): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].timeMs <= timeMs) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/**
 * The word being sung inside a line, or -1 — and -1 again once that word is
 * over, so a highlight does not sit on the last word until the next line starts.
 */
export function activeWordIndex(
  line: { endMs: number; words: readonly { timeMs: number }[] } | undefined,
  timeMs: number,
): number {
  if (!line) return -1;
  let found = -1;
  for (const [index, word] of line.words.entries()) {
    if (word.timeMs > timeMs) break;
    found = index;
  }
  if (found < 0) return -1;
  const word = line.words[found];
  const next = line.words[found + 1];
  const lengthMs = (next ? next.timeMs : line.endMs) - word.timeMs;
  return isSounding(word.timeMs, lengthMs, timeMs) ? found : -1;
}
