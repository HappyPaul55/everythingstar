import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  advanceLanes,
  applyTrigger,
  emptyLaneRun,
  type LaneRun,
  type LaneTrigger,
} from "../../../lib/game/lanes";
import {
  applyAction,
  autoInput,
  emptyAuto,
  emptyInput,
  type AutoState,
  type InputState,
} from "../../../lib/game/input";
import type { LaneChart } from "../../../lib/game/track";
import { publishDue } from "../../../lib/game/publish";
import { laneBaseScore } from "../../../lib/game/scoring";
import { useRunBoard, type RunIdentity, type RunEntry } from "./RunBoard";
import { useRunMode } from "./RunMode";
import { useStageControls } from "./StageControls";
import { useClock } from "./StageClock";

/** A chart with nothing in it, so a panel with no chart still has a shape. */
const NO_CHART: LaneChart = {
  instrument: "guitar",
  difficulty: "normal",
  columns: 1,
  notes: [],
};

export interface LaneOptions {
  chart: LaneChart | null;
  seed: number;
  /** The player's place in the band: whose controller is theirs. */
  seat: number;
  /** Played by the machine, for review, rather than by a person. */
  auto: boolean;
  /** Who this run is on the board: its name, seat and difficulty. */
  identity: RunIdentity;
}

/** What a lane panel is drawn from: the run, and the frets under the fingers. */
export interface LaneView {
  /** The run as last published. */
  run: LaneRun;
  /**
   * Which columns are held down right now — the player's own fingers, or the
   * simulator's — so the pads can light as they are pressed. Published with the run
   * and never read back into judging: it is a read-out, not an input.
   */
  held: boolean[];
  /**
   * A finger on a hit marker. A tap is a fret **and** a strum, so it plays any note
   * under that column; holding the pad holds a sustain. It goes straight to this
   * panel's own run, because a pad belongs to the panel and there is nobody to route
   * it to. `eventTimeMs` is a DOM event's own `timeStamp` — a wall time, not song
   * time — and is projected onto the clock here, exactly as a keypress or a MIDI
   * note is; without one the tap falls back to the current playhead. Inert when the
   * machine is playing, and while the stage is standing still.
   */
  tapDown: (column: number, eventTimeMs?: number) => void;
  /** The finger left the pad; that column is no longer held by a tap. */
  tapUp: (column: number) => void;
}

/** One panel's judging state, kept in a ref so a frame is not a render. */
interface RunState {
  run: LaneRun;
  input: InputState;
  auto: AutoState;
  published: number;
  /** Whether the run has changed since it was last handed to React. */
  dirty: boolean;
  /** The frets last seen, so a finger moving is a change even between notes. */
  viewHeld: boolean[];
  /** The columns a finger is on, kept apart from the keys so releasing one cannot let the other go. */
  touched: boolean[];
  /** Taps waiting for the next frame, in the order they landed. */
  taps: LaneTrigger[];
}

function freshState(chart: LaneChart, fromMs = 0): RunState {
  return {
    run: emptyLaneRun(chart, fromMs),
    input: emptyInput(chart.columns),
    auto: emptyAuto(chart, fromMs),
    published: 0,
    dirty: false,
    viewHeld: Array.from({ length: chart.columns }, () => false),
    touched: Array.from({ length: chart.columns }, () => false),
    taps: [],
  };
}

/** The frets a player has down: the keys and the pads, either one enough. */
function mergeHeld(keys: readonly boolean[], pads: readonly boolean[]): boolean[] {
  return keys.map((down, column) => down || pads[column] === true);
}

/**
 * Whether a frame's run says anything new.
 *
 * `advanceLanes` hands back a fresh object every call — it spreads the cursor in
 * before it drains — so identity alone would call every paused frame a change and
 * publish for ever. The numbers and arrays the panel draws are what matter, and
 * the arrays keep their identity unless a note was actually judged.
 */
function runChanged(before: LaneRun, after: LaneRun): boolean {
  return (
    before.score !== after.score ||
    before.combo !== after.combo ||
    before.bestCombo !== after.bestCombo ||
    before.hits !== after.hits ||
    before.misses !== after.misses ||
    before.errors !== after.errors ||
    before.judged !== after.judged ||
    before.meter !== after.meter ||
    before.atMs !== after.atMs ||
    before.cursor !== after.cursor ||
    before.starUntilMs !== after.starUntilMs ||
    before.starActive !== after.starActive ||
    before.fillHits !== after.fillHits ||
    before.outcomes !== after.outcomes ||
    before.holding !== after.holding ||
    before.hitTimes !== after.hitTimes ||
    before.tapTimes !== after.tapTimes ||
    before.tapMultipliers !== after.tapMultipliers
  );
}

/** Whether the fingers on the line have moved, for the pads to light and go out. */
function heldChanged(before: readonly boolean[], after: readonly boolean[]): boolean {
  if (before.length !== after.length) return true;
  return before.some((down, column) => down !== after[column]);
}

/**
 * One player's run.
 *
 * Judging happens in a ref on every frame — a frame therefore costs one object
 * walk, not a re-render — and the result is published to the view on a throttle
 * for the notes to light up and the rails to read. Input is whatever the stage
 * route sent this seat, or the simulator for `auto`, and both arrive as the same
 * actions, so the simulator exercises the real rules rather than skipping them.
 */
export function useLaneRun({ chart, seed, seat, auto, identity }: LaneOptions): LaneView {
  const clock = useClock();
  const { timeRef: clockTimeRef, seekSerialRef } = clock;
  const { ports } = useStageControls();
  const board = useRunBoard();
  const { perfect } = useRunMode();
  const clean = chart ?? NO_CHART;
  const baseScore = useMemo(() => laneBaseScore(clean), [clean]);
  const [view, setView] = useState<Pick<LaneView, "run" | "held">>(() => {
    const fresh = freshState(clean, clockTimeRef.current);
    return { run: fresh.run, held: fresh.input.held };
  });
  const state = useRef<RunState | null>(null);
  if (state.current === null) state.current = freshState(clean, clockTimeRef.current);
  /**
   * The seek serial this run was last reset for. Initialised **during render**
   * rather than in an effect, so a seek `StageDirector` makes between this render
   * and the first frame is still seen as a change.
   */
  const lastSeek = useRef(seekSerialRef.current);
  /**
   * The board entry for the run as it stands. Rebuilt every render so a label or a
   * difficulty follows the slot, and read through a ref by the flush so a changed
   * callback never re-registers anything.
   */
  const reportRef = useRef<(run: LaneRun) => void>(() => {});
  reportRef.current = (run) => {
    const entry: RunEntry = {
      ...identity,
      score: run.score,
      baseScore,
      total: clean.notes.length,
      combo: run.combo,
      bestCombo: run.bestCombo,
      hits: run.hits,
      misses: run.misses,
      judged: run.judged,
      heroHits: run.heroHits,
      fillHits: run.fillHits,
    };
    board.report(entry);
  };
  /**
   * The last frame, asked for by `RunBoard.flush` just before the screen changes.
   * It publishes the view too — the stage draws its own final state — but the board
   * write is the point: it happens now, not after a render that may never come.
   */
  const publishNow = useCallback(() => {
    const current = state.current;
    if (!current) return;
    if (current.dirty) {
      current.published = clockTimeRef.current;
      current.dirty = false;
      setView({ run: current.run, held: current.viewHeld });
    }
    reportRef.current(current.run);
  }, [clockTimeRef]);

  useEffect(() => board.register(publishNow), [board, publishNow]);

  // A finger on a pad. The tap is queued rather than judged here, so it lands in
  // the same place on the same frame as everything else the player did; the column
  // stays held (and lights its pad) until the finger leaves, which is what holds a
  // sustain. A tap outside a run is a hand finding the screen, not a note.
  const tapDown = useCallback(
    (column: number, eventTimeMs?: number) => {
      const current = state.current;
      if (!current || auto || !clock.playing) return;
      if (!Number.isInteger(column) || column < 0 || column >= current.touched.length) {
        return;
      }
      const touched = current.touched.slice();
      touched[column] = true;
      current.touched = touched;
      current.taps.push({
        // The event carries the moment the finger landed, on the page's own time
        // origin; the clock is what turns it into song time. Without a projection
        // a tap is judged against the wall clock and never lands.
        timeMs: eventTimeMs === undefined ? clock.timeRef.current : clock.timeOf(eventTimeMs),
        signal: "touch",
        frets: mergeHeld(current.input.held, touched),
        column,
      });
    },
    [auto, clock],
  );

  const tapUp = useCallback((column: number) => {
    const current = state.current;
    if (!current || !Number.isInteger(column)) return;
    if (column < 0 || column >= current.touched.length || !current.touched[column]) return;
    const touched = current.touched.slice();
    touched[column] = false;
    current.touched = touched;
  }, []);

  // A window blur, a hidden tab or an unplugged pad gets no pointerup either, so
  // the stage route says when a hand has been let go. The keys and MIDI controls
  // arrive as ordinary releases; what is only this panel's — a finger on a hit
  // marker — has to be cleared here, or the pad holds a sustain for the rest of
  // the run.
  useEffect(
    () =>
      ports.onFingersUp(() => {
        const current = state.current;
        if (!current) return;
        current.touched = current.touched.map(() => false);
      }),
    [ports],
  );

  // A different chart, difficulty or player starts the run over. The tap handlers
  // are not a reason to: they change when the transport starts or stops, and a run
  // that restarted every time the song was paused is not a run. The run is seeded
  // where the clock stands, because a practice count-in has already seeked to its
  // section by the time the stage mounts.
  useEffect(() => {
    const fresh = freshState(clean, clockTimeRef.current);
    state.current = fresh;
    lastSeek.current = seekSerialRef.current;
    setView({ run: fresh.run, held: fresh.input.held });
    // A reset is a run's new starting point, so the board is told about it rather
    // than keeping whatever the last attempt last published.
    reportRef.current(fresh.run);
  }, [clean, seed, auto, clockTimeRef, seekSerialRef]);

  useEffect(() => {
    return clock.subscribe(() => {
      const now = clockTimeRef.current;
      let current = state.current;
      if (!current) return;

      // A deliberate move of the playhead starts the run over, seeded where the
      // clock now stands, before this frame's input is judged. That is what makes
      // a practice count-in (a seek to its section) and a loop (a seek back to it)
      // begin at the right note instead of judging everything before it.
      if (seekSerialRef.current !== lastSeek.current) {
        lastSeek.current = seekSerialRef.current;
        const fresh = freshState(clean, now);
        // The keys a player is physically holding stay down; the pads and the
        // queued taps do not survive a reset.
        const shown = mergeHeld(current.input.held, fresh.touched);
        current = { ...fresh, input: current.input, viewHeld: shown };
        state.current = current;
        setView({
          run: fresh.run,
          held: shown,
        });
        // The board follows the reset at once: a flush here must never write the
        // previous attempt back over a run that has just started again.
        reportRef.current(fresh.run);
      }

      let held = current.input.held;
      const triggers: LaneTrigger[] = [];

      if (auto) {
        // The machine is a player, and a player does not play a stage that is
        // standing still. While the count-in runs or the song is paused its
        // state is left where it was and nothing is emitted — a trigger stamped
        // at a frozen playhead would judge a note before it is due.
        if (clock.playing) {
          const simulated = autoInput(clean, seed, current.auto, now, perfect ? 1 : undefined);
          current.auto = simulated.state;
          held = simulated.held;
          triggers.push(...simulated.triggers);
        } else {
          // Its sustained frets stay down for the run, so a pause costs the
          // machine no hold it already had; the pads below are drawn clear.
          held = current.auto.holding;
        }
      } else {
        // Taps landed since the last frame, then everything the stage route sent
        // this seat. Both are the player's own, and both are judged by the same
        // rules; a tap carries its own strum, so order within a frame cannot take
        // a fret away from it.
        if (current.taps.length > 0) {
          triggers.push(...current.taps);
          current.taps = [];
        }
        for (const event of ports.take(seat)) {
          const result = applyAction(current.input, event);
          current.input = result.state;
          triggers.push(...result.triggers);
        }
        held = mergeHeld(current.input.held, current.touched);
      }

      let next = current.run;
      for (const trigger of triggers) next = applyTrigger(next, clean, trigger);
      // The pads are separate from the keys: an open note's "no frets" is a finger
      // on the line, and a tapped open sustain must not drop the moment it starts.
      next = advanceLanes(next, clean, now, held, auto ? undefined : current.touched);
      // A paused machine has no fingers on the pads, whatever the run remembers.
      const shown = auto && !clock.playing ? held.map(() => false) : held;
      // A frame that judged nothing leaves the run where it was; a frame that did
      // is one the results screen must not lose at the end of the song. The pads
      // are part of what is published, so a finger moving is a change too.
      if (runChanged(current.run, next) || heldChanged(current.viewHeld, shown)) {
        current.dirty = true;
      }
      current.run = next;
      current.viewHeld = shown;

      if (
        publishDue({
          now,
          published: current.published,
          durationMs: clock.durationMs,
          playing: clock.playing,
          dirty: current.dirty,
        })
      ) {
        current.published = now;
        current.dirty = false;
        setView({ run: next, held: shown });
        // The board is a report, not a render: it takes the same throttled state
        // the panel is about to draw, so a run's last write is never a frame behind.
        reportRef.current(next);
      }
    });
  }, [clock, clean, seed, auto, perfect, ports, seat, clockTimeRef, seekSerialRef]);

  return { ...view, tapDown, tapUp };
}
