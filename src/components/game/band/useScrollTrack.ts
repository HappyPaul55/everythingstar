import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  axisPercent,
  nextAxisOffset,
  nextWindow,
  seatWindow,
  type MountWindow,
} from "../../../lib/game/scroll";
import { useClock } from "./StageClock";

/**
 * A scrolling layer. Notes are mounted at fixed positions along the axis and one
 * transform shifts the whole layer as the playhead moves — so a frame costs a
 * single style write, whatever the song's length.
 *
 * The mounted window slides on every few seconds. The subtlety is that the
 * transform must be measured from the window the DOM is *actually* showing, not
 * from the one about to be rendered — otherwise the notes jerk by the difference
 * the instant the window slides. So the window and its transform are committed
 * together, in a layout effect, before the browser paints.
 */
export interface ScrollTrack {
  /** Put this on the layer that holds the notes. */
  ref: RefObject<HTMLDivElement | null>;
  /** The window of song currently mounted, in ms. */
  fromMs: number;
  toMs: number;
  /** Where a moment sits along the axis, as a percentage. */
  position: (timeMs: number) => number;
}

export interface ScrollTrackOptions {
  /** Which way the layer travels. A vertical highway runs downward. */
  axis: "x" | "y";
  /** Seconds of song along the whole axis. */
  secondsAcross: number;
  /** Where the playhead sits along the axis, as a fraction. */
  anchor: number;
  /** Song to keep mounted behind the playhead, in ms. */
  beforeMs: number;
  /**
   * The run-up the view needs ahead of the playhead, in ms — the amount of song
   * that fills the screen above the hit line. The mounted window is never
   * allowed to fall short of it, so a note is always in the DOM before it can
   * be seen.
   */
  afterMs: number;
  /**
   * How far ahead of the audio clock the layer is drawn, in ms. Positive is a
   * display that lags the sound (`visualLagMs`): the picture is late, so it is
   * drawn that much earlier and a note reaches the hit line when it is heard.
   *
   * It moves **drawing only**. The playhead it is added to is a copy used for
   * `placeLayer` and `nextWindow`, so the transform and the mounted window stay
   * in one basis; judging, the clock and the lyrics keep the real playhead.
   */
  offsetMs?: number;
}

export function useScrollTrack({
  axis,
  secondsAcross,
  anchor,
  beforeMs,
  afterMs,
  offsetMs = 0,
}: ScrollTrackOptions): ScrollTrack {
  const clock = useClock();
  const ref = useRef<HTMLDivElement>(null);
  // The window the DOM currently holds. It starts at the drawing playhead rather
  // than at zero: a layer that mounts mid-song must paint the notes around the
  // playhead on its first frame instead of showing an empty neck and jumping when
  // the effect reseats it. The offset is included for the same reason as below —
  // this is the same picture clock `placeLayer` uses.
  const rendered = useRef<MountWindow>(
    seatWindow(clock.timeRef.current + offsetMs, beforeMs, afterMs),
  );
  const [window, setWindow] = useState(rendered.current);
  const reverse = axis === "y";

  /** Put the layer where the rendered window says it should be. */
  const placeLayer = () => {
    const layer = ref.current;
    if (!layer) return;
    // The drawing's playhead, not the clock's: a positive `offsetMs` shows the
    // picture ahead of the sound, which is what a late display needs. The same
    // offset is used to slide the window below, so the two cannot drift.
    const nowMs = clock.timeRef.current + offsetMs;
    const offset = nextAxisOffset(
      nowMs,
      rendered.current.fromMs,
      secondsAcross,
      reverse,
    );
    layer.style.transform = `translate${axis.toUpperCase()}(${offset}%)`;
  };

  // After any render, adopt the window that was just rendered and re-place the
  // layer against it. A layout effect runs after the DOM changes but before the
  // paint, so the notes and their transform always land together.
  // The clock subscriber below places the layer on every frame. This effect only
  // has to re-place after a **window** commit, when the notes and the transform
  // change basis together; running it with no deps re-wrote the transform after
  // every unrelated render (a pad lighting, a publish).
  const placeLatest = useRef(placeLayer);
  placeLatest.current = placeLayer;
  useLayoutEffect(() => {
    rendered.current = window;
    placeLatest.current();
  }, [window]);

  useEffect(() => {
    const apply = () => {
      placeLayer();
      // Slide the window on once what is left ahead of the playhead runs under
      // the run-up the view needs, or at once on a seek backwards. The rule,
      // and why the step is seated on top of the lookahead rather than taken
      // out of it, live in `nextWindow`. The same drawing playhead is used, so
      // the window the DOM holds is the one the transform is measured from.
      const next = nextWindow(
        clock.timeRef.current + offsetMs,
        rendered.current,
        beforeMs,
        afterMs,
      );
      if (next) setWindow(next);
    };
    apply();
    return clock.subscribe(apply);
  }, [clock, axis, secondsAcross, beforeMs, afterMs, offsetMs]);

  // The object is **stable between window steps**: a fresh `position` closure on
  // every render made every memo that depends on the track recompute on every
  // publish tick — the highway's slide links rescanned the whole chart ~25 times a
  // second for an answer that had not changed.
  const { fromMs, toMs } = window;
  const position = useCallback(
    (timeMs: number) => axisPercent(timeMs, fromMs, anchor, secondsAcross, reverse),
    [fromMs, anchor, secondsAcross, reverse],
  );

  return useMemo(
    () => ({ ref, fromMs, toMs, position }),
    [fromMs, toMs, position],
  );
}
