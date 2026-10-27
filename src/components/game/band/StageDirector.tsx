import { useEffect, useRef } from "react";
import { practiceEnded, type PracticePlan } from "../../../lib/game/practice";
import { isRunScreen, opensRun, type Screen } from "../../../lib/game/screens";
import { useRunBoard } from "./RunBoard";
import { useSongAudioProgress } from "./SongAudioStatus";
import { useClock } from "./StageClock";

/**
 * The bridge between the screens and the clock — the only place that decides
 * when the stage runs. It renders nothing.
 *
 * It has to live *below* `StageClockProvider`, because it drives the clock and
 * the island that owns the screens renders that provider itself.
 *
 * **Practice** is a plan the session hands down, not a screen: a pending plan is
 * applied when the countdown starts (seek to its start, set its rate), and while
 * the run plays the same effect watches for its end. A loop seeks back — which
 * the runs already read as a fresh attempt — and a single pass pauses exactly on
 * the end. A practice run never reports `onEnd`: its results screen must never
 * open and its score must never reach the board.
 */
interface Props {
  screen: Screen;
  /** The song ran out. */
  onEnd: () => void;
  /** The active practice plan, or null for an ordinary run at the record's speed. */
  practice?: PracticePlan | null;
  /**
   * A plan waiting for the run to start, set by the pause menu's Practice
   * dialog. It is applied once and then cleared by the session.
   */
  pendingPractice?: PracticePlan | null;
  /** The pending plan has been applied (its count-in seated and its speed set). */
  onPracticeStarted?: () => void;
  /** A single practice pass reached its end and the transport paused on it. */
  onPracticeEnd?: () => void;
}

export function StageDirector({
  screen,
  onEnd,
  practice = null,
  pendingPractice = null,
  onPracticeStarted,
  onPracticeEnd,
}: Props) {
  const clock = useClock();
  const board = useRunBoard();
  // The sound's own readiness. It is the run's **start** gate: the band has already
  // waited for it, and the clock must not begin counting if a path that skipped the
  // band (the attract demo, a replay) reaches the stage before a stem can play.
  const audio = useSongAudioProgress();
  // The clock's value changes whenever it plays, pauses or ends, so the effects
  // that move the transport must not depend on its identity: a dev pause would
  // otherwise update the clock, re-run "the playing screen must play", and resume
  // itself. They read the latest methods through this ref instead.
  const clockRef = useRef(clock);
  clockRef.current = clock;
  // The callbacks are read through refs for the same reason: a new arrow from the
  // session on a render must not tear down and rebuild the practice watcher.
  const started = useRef(onPracticeStarted);
  started.current = onPracticeStarted;
  const ended = useRef(onPracticeEnd);
  ended.current = onPracticeEnd;
  // The plans are read through refs too: the count-in position is owned by the
  // screen effect below, and that must not seek again when the session clears
  // the pending plan (which lands on the same start anyway).
  const practiceRef = useRef(practice);
  practiceRef.current = practice;
  const pendingPracticeRef = useRef(pendingPractice);
  pendingPracticeRef.current = pendingPractice;

  // A new run: the playhead goes back to the top and the last song's scores are
  // forgotten, so the results screen can never show somebody else's run. A band
  // that is already loaded goes straight to the countdown, so the reset belongs to
  // a countdown that **opens** a run, not only to the load page.
  useEffect(() => {
    if (screen === "loading") clockRef.current.seek(0);
  }, [screen]);

  const previous = useRef<Screen | null>(null);
  useEffect(() => {
    const from = previous.current;
    previous.current = screen;
    if (screen === "countdown" && opensRun(screen, from)) board.clear();
  }, [screen, board]);

  // This is the **one** effect that seats the count-in. A practice countdown
  // stands at the section the player chose; every page outside a run sits at the
  // top. The screen alone moves it: the pending plan clearing afterwards must not
  // seek again, and the run screens in between keep the playhead where it is.
  useEffect(() => {
    if (screen === "countdown") {
      const plan = pendingPracticeRef.current ?? practiceRef.current;
      clockRef.current.seek(plan?.startMs ?? 0);
      return;
    }
    if (!isRunScreen(screen)) clockRef.current.seek(0);
  }, [screen]);

  // The run has begun with a plan waiting: apply its speed and tell the session.
  // The count-in position is already the screen effect's above — this never
  // moves the playhead a second time.
  useEffect(() => {
    if (!pendingPractice) return;
    if (screen !== "countdown" && screen !== "playing") return;
    clockRef.current.setRate(pendingPractice.speed);
    started.current?.();
  }, [screen, pendingPractice]);

  // The rate belongs to the plan. Leaving practice (a plan of null) puts the
  // transport back at the record, including a normal run after a stop.
  useEffect(() => {
    clockRef.current.setRate(practice?.speed ?? 1);
  }, [practice]);

  // Only a playing stage moves. Everything else stands still, which is what
  // makes a pause a pause rather than a slower song. The screen is the only
  // trigger: the clock's own play/pause state must not re-issue this command.
  //
  // The song's stems are the other condition on **starting**. The band has already
  // waited for them, but a path that skipped the band (the attract demo, a replay)
  // still must not count down against silence. Once the run is moving, a stem that
  // stalls is the source rule's job; this is a start gate, not a mid-run brake.
  useEffect(() => {
    if (screen !== "playing") {
      clockRef.current.pause();
      return;
    }
    if (audio.ready || clockRef.current.playing) clockRef.current.play();
    else clockRef.current.pause();
  }, [screen, audio.ready]);

  // Practice owns its end: loop back to the section's start (a backward seek,
  // which resets every run), or pause exactly on the end for a single pass.
  useEffect(() => {
    if (!practice) return;
    return clock.subscribe(() => {
      if (!clock.playing) return;
      if (!practiceEnded(practice, clock.timeRef.current)) return;
      if (practice.loop) {
        clockRef.current.seek(practice.startMs);
        // A whole-song loop lands on the clock's own end at the same instant: the
        // seek clears `ended`, and this keeps the transport moving.
        clockRef.current.play();
      } else {
        clockRef.current.seek(practice.endMs);
        clockRef.current.pause();
        ended.current?.();
      }
    });
  }, [clock, practice]);

  // The song running out ends the run — never a practice run, whose own end is
  // above and whose results must not exist. The flush is the guarantee: each
  // mounted run writes its latest ref state to the board **before** the screen
  // changes, because a stage can unmount before the next animation frame and the
  // results screen must not read a frame behind the judging.
  useEffect(() => {
    if (!practice && screen === "playing" && clock.ended) {
      board.flush();
      onEnd();
    }
  }, [screen, clock.ended, onEnd, practice, board]);

  return null;
}
