import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { projectEventTime } from "../../../lib/game/eventTime";
import {
  clampPlayhead,
  playheadEnded,
} from "../../../lib/game/band/clockRange";
import { SEEK_GUARD_MS, sourcePlayhead } from "../../../lib/game/band/playhead";
import { sourceStalled } from "../../../lib/game/band/stall";

/**
 * The stage clock: one animation frame loop for the whole stage, and the
 * playhead everyone else reads.
 *
 * The point of it being one loop is cost: a component that only needs to follow
 * the playhead subscribes here and writes to the DOM itself, so nothing
 * re-renders on a frame. Components that show something discrete (a number, a
 * word) ask for a throttled value instead.
 *
 * The loop runs whether or not the song is playing, which is what lets a seek
 * repaint and a gamepad be polled while the stage stands still. Judging is what
 * checks the clock is moving.
 *
 * Judging uses **event time**, not the previous frame's playhead: `timeOf`
 * projects a DOM event's own timestamp onto the song clock from the last sample,
 * so a press is stamped when it happened rather than up to a frame earlier. A
 * gamepad has no event to stamp, so it is read at the frame.
 *
 * Throwaway alongside the mock: the real engine will drive this from a track.
 */
export interface StageClock {
  durationMs: number;
  playing: boolean;
  /**
   * The song ran out. Set when the playhead reaches a **known** end, or by
   * `finish()` from the sound, and cleared by a rewind — the one signal a screen
   * machine needs to move to the results. A song that does not know its length is
   * ended by its own sound rather than by the playhead.
   */
  ended: boolean;
  /** The live playhead, in ms. Read it inside a frame callback. */
  timeRef: RefObject<number>;
  /**
   * The song time a DOM event happened, from its own `event.timeStamp`.
   *
   * `timeRef` is only sampled once a frame, so stamping input with it puts a
   * press up to a frame in the past. This projects the event's timestamp from the
   * last sample instead; a paused stage returns the playhead it holds.
   */
  timeOf: (eventTimeStamp: number) => number;
  /**
   * Frames per second, measured by this **one** loop. Read it inside a frame
   * callback — the read-out is a counter kept here rather than a second frame
   * loop of its own, because watching the loop should not cost another loop.
   */
  fpsRef: RefObject<number>;
  /**
   * A counter bumped on every **deliberate** move of the playhead — a seek, a
   * restart, or a play from the end that rewinds to zero — and never by an
   * ordinary play or pause.
   *
   * The runs watch it so they know when to start over: a reset is a decision
   * somebody made, not a millisecond of jitter on the clock. It is a ref rather
   * than state because a frame reads it and no render should follow from it.
   */
  seekSerialRef: RefObject<number>;
  /** Run `fn` on every frame. Returns an unsubscribe. */
  subscribe: (fn: () => void) => () => void;
  /** The transport's speed: 0.5–1.0. The audio paths apply it to their own media. */
  rate: number;
  /** Slow the fallback frame clock down (or bring it back to the record). */
  setRate: (rate: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  seek: (timeMs: number) => void;
  /**
   * Follow a **running source** — a song's own audio — rather than counting frames.
   *
   * A rhythm game's clock *is* the music: counting milliseconds off a frame loop
   * drifts against the sound, and nothing judges against wall time. A player whose
   * song has audio registers `read` here and the playhead becomes whatever the sound
   * says; a song with none leaves the frame loop in charge, which is why this is a
   * source rather than a rewrite.
   */
  followSource: (
    read: (() => number | null) | null,
    seek?: ((timeMs: number) => void) | null,
  ) => void;
  /** The song ran out, said by the **sound** rather than by the playhead's reach. */
  finish: () => void;
  /**
   * A registered source has stopped answering: no stem can play, the video was
   * refused, or the stream never arrived. The playhead has fallen back to the
   * frame clock so the run can still finish; the stage says so.
   */
  sourceLost: boolean;
}

const ClockContext = createContext<StageClock | null>(null);

interface ProviderProps {
  durationMs: number;
  children: ReactNode;
}

export function StageClockProvider({ durationMs, children }: ProviderProps) {
  const timeRef = useRef(0);
  /**
   * The `performance.now()` at which `timeRef` was last sampled. An event's own
   * timestamp is projected from here (`timeOf`), rather than from the next frame.
   */
  const sampledAtRef = useRef(performance.now());
  /** The frame counter behind `useFps`, measured by the loop below. */
  const fpsRef = useRef(0);
  /** Bumped by every deliberate move of the playhead; see `seekSerialRef`. */
  const seekSerialRef = useRef(0);
  // It starts standing still: the screen machine says when a run begins, so the
  // stage does not play behind the welcome and the menu.
  const playingRef = useRef(false);
  /**
   * The transport's speed. Practice slows the song down; an ordinary run is the
   * record. It is a ref because the frame loop reads it every frame, and state so
   * the clock's own value says what it is.
   */
  const rateRef = useRef(1);
  /** A song's own audio, when it has any: whatever the sound says, the playhead is. */
  const sourceRef = useRef<(() => number | null) | null>(null);
  /** How to move that sound when the transport is seeked. */
  const sourceSeekRef = useRef<((timeMs: number) => void) | null>(null);
  /**
   * When the playhead was last moved **deliberately** (a seek, a restart, a play
   * from the end), as a `performance.now()` moment. The source read is guarded for
   * `SEEK_GUARD_MS` after it, because the elements are moved asynchronously and
   * can report their old position for a frame or two. Wall time is used only to
   * measure that guard — never to advance the song.
   */
  const seekedAtRef = useRef(Number.NEGATIVE_INFINITY);
  const subscribers = useRef(new Set<() => void>());
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);
  const [ended, setEnded] = useState(false);
  /**
   * When the registered source first answered `null` this run, and whether the
   * stage has given up waiting for it. Refs, because the frame loop reads them
   * every frame and only the flip to `true` should render.
   */
  const stalledSinceRef = useRef<number | null>(null);
  const sourceLostRef = useRef(false);
  const [sourceLost, setSourceLost] = useState(false);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let frames = 0;
    let countedFrom = last;

    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      // The clock only ever moves forward: a background tab should not teleport
      // the song, and a frame timestamp may land a hair before the last one.
      const elapsed = Math.max(0, Math.min(64, now - last));
      last = now;
      frames += 1;
      const span = now - countedFrom;
      if (span >= 1000) {
        // A hidden tab stops the loop, and the gap on return is not a frame rate.
        if (span < 2000) fpsRef.current = Math.round((frames * 1000) / span);
        frames = 0;
        countedFrom = now;
      }
      if (playingRef.current) {
        const source = sourceRef.current;
        if (source) {
          // The sound is the clock. `null` means it is not in a state to be read —
          // still loading, or not started yet — and the playhead waits rather than
          // running ahead of a song nobody can hear.
          const at = source();
          if (at !== null) {
            stalledSinceRef.current = null;
            if (sourceLostRef.current) {
              sourceLostRef.current = false;
              setSourceLost(false);
            }
            const next = clampPlayhead(at, durationMs);
            // The stem the clock is read from can change mid-run, and the new one
            // can be tens of milliseconds behind the old. Assigned directly that
            // steps the playhead back, which every run reads as a rewind — so the
            // source is read monotonically (`sourcePlayhead`). A deliberate seek
            // is the exception, and its guard keeps the elements' old positions
            // from jumping the clock while they catch up.
            const guard = SEEK_GUARD_MS - (now - seekedAtRef.current);
            timeRef.current = sourcePlayhead(next, timeRef.current, guard);
          } else {
            // A source that never answers would hold the run at 0:00 for ever: no
            // music, no notes, no results. A file still loading has a reason to be
            // quiet for a moment; after the stall limit the frame clock takes
            // over, and the stage says the sound is gone. The source stays
            // registered, so a stem that does arrive resumes being the clock.
            const stall = sourceStalled(stalledSinceRef.current, now);
            stalledSinceRef.current = stall.since;
            if (stall.stalled) {
              if (!sourceLostRef.current) {
                sourceLostRef.current = true;
                setSourceLost(true);
              }
              timeRef.current = clampPlayhead(
                timeRef.current + elapsed * rateRef.current,
                durationMs,
              );
            }
          }
        } else {
          // The frame clock advances in **song** time: a practice run at 80%
          // covers 80% of the wall time between two frames. A song of unknown
          // length is not clamped — only the sound can say when it is over.
          timeRef.current = clampPlayhead(
            timeRef.current + elapsed * rateRef.current,
            durationMs,
          );
        }
        if (playheadEnded(timeRef.current, durationMs)) {
          playingRef.current = false;
          setPlaying(false);
          setEnded(true);
        }
      }
      // Subscribers run whether or not it is playing, so a seek while paused
      // still repaints. The playhead has just been read: remember when, so
      // `timeOf` can carry an event's own timestamp on from here.
      sampledAtRef.current = now;
      for (const subscriber of subscribers.current) subscriber();
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [durationMs]);

  /**
   * Begin playing. A play from the end is a rewind to zero, and a restart always
   * is one — either way the runs start over (`seekSerialRef`) and the sound is
   * moved with the playhead, so the next frame cannot read it back where it was.
   */
  const start = (rewind: boolean) => {
    if (rewind || playheadEnded(timeRef.current, durationMs)) {
      timeRef.current = 0;
      sourceSeekRef.current?.(0);
      seekedAtRef.current = performance.now();
      seekSerialRef.current += 1;
    }
    // A new start is a new chance for the sound: the stall window begins again.
    stalledSinceRef.current = null;
    if (sourceLostRef.current) {
      sourceLostRef.current = false;
      setSourceLost(false);
    }
    setEnded(false);
    playingRef.current = true;
    setPlaying(true);
    sampledAtRef.current = performance.now();
  };

  const value = useMemo<StageClock>(
    () => ({
      durationMs,
      playing,
      ended,
      timeRef,
      timeOf: (eventTimeStamp) =>
        projectEventTime(
          eventTimeStamp,
          { timeMs: timeRef.current, atMs: sampledAtRef.current },
          playingRef.current,
          durationMs,
          performance.now(),
          rateRef.current,
        ),
      fpsRef,
      seekSerialRef,
      subscribe: (fn) => {
        subscribers.current.add(fn);
        return () => {
          subscribers.current.delete(fn);
        };
      },
      rate,
      setRate: (next) => {
        // The practice range is the transport's range. A broken value is the
        // record rather than a stopped song.
        const speed = Number.isFinite(next)
          ? Math.max(0.5, Math.min(1, next))
          : 1;
        rateRef.current = speed;
        setRateState(speed);
      },
      play: () => start(false),
      pause: () => {
        playingRef.current = false;
        setPlaying(false);
        // The playhead has not moved; forgetting when it was sampled would make
        // the first press after a resume look like it happened during the pause.
        sampledAtRef.current = performance.now();
      },
      toggle: () => {
        if (playingRef.current) {
          playingRef.current = false;
          setPlaying(false);
          sampledAtRef.current = performance.now();
          return;
        }
        start(false);
      },
      restart: () => start(true),
      seek: (timeMs) => {
        timeRef.current = clampPlayhead(timeMs, durationMs);
        // A deliberate seek is the signal the runs reset on, even when it lands
        // where the playhead already was.
        seekSerialRef.current += 1;
        // The source read is guarded for a moment: the elements are moved below
        // but report their old position until they get there.
        seekedAtRef.current = performance.now();
        sampledAtRef.current = performance.now();
        // A rewind is not the song running out, however it got there.
        if (!playheadEnded(timeRef.current, durationMs)) setEnded(false);
        // The sound is the clock when there is any: moving only the playhead
        // would be undone by the next frame's read from the audio element.
        sourceSeekRef.current?.(timeRef.current);
      },
      followSource: (read, seek) => {
        // Pointing at a different reader is pointing at different sound: the
        // stall it was given belongs to the old one. Registering the same reader
        // again (which a re-render does) changes nothing.
        if (sourceRef.current !== read) {
          stalledSinceRef.current = null;
          if (sourceLostRef.current) {
            sourceLostRef.current = false;
            setSourceLost(false);
          }
        }
        sourceRef.current = read;
        sourceSeekRef.current = seek ?? null;
      },
      finish: () => {
        playingRef.current = false;
        setPlaying(false);
        setEnded(true);
        sampledAtRef.current = performance.now();
      },
      sourceLost,
    }),
    [durationMs, playing, ended, rate, sourceLost],
  );

  return <ClockContext.Provider value={value}>{children}</ClockContext.Provider>;
}

export function useClock(): StageClock {
  const clock = useContext(ClockContext);
  if (!clock) throw new Error("useClock must be used inside a StageClockProvider.");
  return clock;
}

/**
 * The playhead, re-rendering the caller about every `everyMs`. For anything that
 * shows a number or a word rather than a moving layer.
 */
export function useClockMs(everyMs = 100): number {
  const clock = useClock();
  const [timeMs, setTimeMs] = useState(() => clock.timeRef.current);

  useEffect(() => {
    let last = Number.NEGATIVE_INFINITY;
    return clock.subscribe(() => {
      const now = clock.timeRef.current;
      // A seek backwards always updates, however soon after the last one.
      if (now >= last && now - last < everyMs) return;
      last = now;
      setTimeMs(now);
    });
  }, [clock, everyMs]);

  return timeMs;
}

/**
 * Frames per second, for the performance read-out.
 *
 * The count is kept by the stage's **one** loop (`fpsRef`), not by a second
 * `requestAnimationFrame` established here: a read-out that starts a frame loop to
 * watch the frame loop pays for the thing it is measuring. This subscribes to that
 * loop and re-renders only when the rounded number actually changes.
 */
export function useFps(): number {
  const clock = useClock();
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let last = -1;
    return clock.subscribe(() => {
      const next = clock.fpsRef.current;
      if (next === last) return;
      last = next;
      setFps(next);
    });
  }, [clock]);

  return fps;
}

/** Format a playhead as `m:ss`. */
export function formatClock(timeMs: number): string {
  const total = Math.max(0, Math.round(timeMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
