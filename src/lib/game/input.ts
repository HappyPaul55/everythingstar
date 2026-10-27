import type { Action } from "./controls/layout";
import type { LaneTrigger } from "./lanes";
import { HIT_WINDOW_MS } from "./scoring";
import { AUTO_ACCURACY, autoVerdict } from "./simulate";
import { momentAt, type LaneChart } from "./track";

/**
 * Turning what a player does into triggers, and nothing else.
 *
 * The game speaks **actions** — put a fret down, strum, wave the whammy — and
 * knows nothing about what produced one. Which key, which gamepad button or whose
 * phone is a **layout** (`controls/layout.ts`), so a real controller is another
 * table rather than more code here, and the simulator below arrives as the same
 * triggers as a person's hands.
 *
 * A **fret** press is what a tapped instrument plays with, and what hammers a
 * hopo on a strummed one; the **strum** takes the chord at a moment; the
 * **whammy** waves while a note is held. A press is a press: a repeat never counts,
 * which is what stops the whammy being a score fountain.
 */

export interface InputState {
  /** Which columns are held down. */
  held: boolean[];
}

export function emptyInput(columns: number): InputState {
  return { held: Array.from({ length: Math.max(1, Math.trunc(columns) || 1) }, () => false) };
}

/** One action, with when it happened and whether it was held down or let go. */
export interface ActionEvent {
  action: Action;
  down: boolean;
  /** True for a keyboard auto-repeat, which never counts as a press. */
  repeat: boolean;
  timeMs: number;
}

export interface InputResult {
  state: InputState;
  triggers: LaneTrigger[];
}

/** Apply one action. Pure: the same state and event always give the same result. */
export function applyAction(state: InputState, event: ActionEvent): InputResult {
  const triggers: LaneTrigger[] = [];
  const press = event.down && !event.repeat;

  if (event.action.type === "fret") {
    const column = event.action.column;
    // A key beyond the chart's columns has nothing to play: a layout can reach
    // further than the song asks for, and the song is what decides.
    if (column < 0 || column >= state.held.length) return { state, triggers };
    const held = state.held.slice();
    held[column] = event.down;
    const next = { ...state, held };
    if (press) {
      triggers.push({
        timeMs: event.timeMs,
        signal: "fret",
        frets: next.held,
        column,
      });
    }
    return { state: next, triggers };
  }

  if (event.action.type === "strum") {
    if (press) {
      triggers.push({
        timeMs: event.timeMs,
        signal: "strum",
        frets: state.held,
        column: null,
      });
    }
    return { state, triggers };
  }

  if (press) {
    triggers.push({
      timeMs: event.timeMs,
      signal: "whammy",
      frets: state.held,
      column: null,
    });
  }
  return { state, triggers };
}

/* ------------------------------------------------------------ auto player */

/**
 * The simulated player, as input rather than as verdicts: it presses the frets
 * and strums at the moment the chart says, and simply does not press when it is
 * going to miss. It therefore exercises the real rules — chords, hopos, opens,
 * holds and all — instead of bypassing them.
 *
 * It does **not** wave the whammy, so it never spends a full meter on star power:
 * holding a sustain is as far as it goes with a held note. That is an omission,
 * not a shortcut — nothing here touches the judging, and a whammy the machine does
 * not send is simply points it does not earn.
 */
export interface AutoState {
  /** The next note of the chart it has yet to play. */
  next: number;
  /** The columns it is holding, and until when, for a sustain. */
  holding: boolean[];
  holdingUntilMs: number;
}

/**
 * The simulator's state, starting at the first note **at or after** `fromMs`.
 *
 * A practice run is seeked to its section before it starts, and the simulator
 * must not then play the notes before it: they are not part of this run, and
 * stamping their old times into a trigger would judge them all at once. Notes
 * before the seed point are behind `next`, so `autoInput` never reaches them.
 */
export function emptyAuto(
  chart: Pick<LaneChart, "columns" | "notes">,
  fromMs = 0,
): AutoState {
  const atMs = Math.max(0, fromMs);
  const start = chart.notes.findIndex((note) => note.timeMs >= atMs);
  return {
    next: start < 0 ? chart.notes.length : start,
    holding: Array.from({ length: chart.columns }, () => false),
    holdingUntilMs: 0,
  };
}

export interface AutoResult {
  state: AutoState;
  triggers: LaneTrigger[];
  /** The frets the simulated player has down right now. */
  held: boolean[];
}

export function autoInput(
  chart: LaneChart,
  seed: number,
  state: AutoState,
  nowMs: number,
  accuracy = AUTO_ACCURACY,
): AutoResult {
  const triggers: LaneTrigger[] = [];
  let next = state.next;
  let holding = state.holding;
  let holdingUntilMs = state.holdingUntilMs;

  while (
    next < chart.notes.length &&
    chart.notes[next].timeMs - HIT_WINDOW_MS <= nowMs
  ) {
    const first = chart.notes[next];
    // A chord is one gesture, not one gesture per note: the whole moment is
    // played together — or, when a note is going to be missed, not played at all
    // rather than strummed short. It is judged by the same rules as a person's.
    const moment = momentAt(chart.notes, next);
    const verdicts = moment.map((note) => autoVerdict(note, seed, accuracy));
    if (!verdicts.every((verdict) => verdict.hit)) {
      next += moment.length;
      continue;
    }

    const at = first.timeMs + verdicts[0].offsetMs;
    if (at > nowMs) {
      // Not due yet: come back to it next frame.
      return { state: { next, holding, holdingUntilMs }, triggers, held: heldNow(holding, holdingUntilMs, nowMs) };
    }

    // Every fret of the chord is held for the gesture, whoever is playing it.
    const columns = Array.from({ length: chart.columns }, () => false);
    for (const note of moment) {
      if (note.column !== null) columns[note.column] = true;
    }
    if (chart.instrument === "keys" || chart.instrument === "dance") {
      // A tapped instrument plays a chord as one fret per note.
      for (const note of moment) {
        triggers.push({ timeMs: at, signal: "fret", frets: columns, column: note.column });
      }
    } else {
      triggers.push({ timeMs: at, signal: "strum", frets: columns, column: null });
    }

    const longest = Math.max(...moment.map((note) => note.lengthMs));
    if (longest > 0) {
      holding = columns;
      holdingUntilMs = first.timeMs + longest;
    }
    next += moment.length;
  }

  return {
    state: { next, holding, holdingUntilMs },
    triggers,
    held: heldNow(holding, holdingUntilMs, nowMs),
  };
}

function heldNow(holding: boolean[], untilMs: number, nowMs: number): boolean[] {
  if (nowMs > untilMs) return holding.map(() => false);
  return holding;
}
