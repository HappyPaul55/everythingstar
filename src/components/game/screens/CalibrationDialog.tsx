import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type Ref,
} from "react";
import { useT } from "../../../i18n/react";
import type { MessageKey } from "../../../i18n";
import {
  CALIBRATION_BEATS,
  CALIBRATION_BEAT_MS,
  CALIBRATION_LEAD_IN_MS,
  CALIBRATION_TAPS,
  CALIBRATION_WINDOW_MS,
  PICTURE_CALIBRATION_BEAT_MS,
  PICTURE_CALIBRATION_CROSSINGS,
  PICTURE_CALIBRATION_LEAD_IN_MS,
  calibrationLag,
  crossingTimes,
  measureTaps,
  pictureMarkerPercent,
  type CalibrationSummary,
} from "../../../lib/game/calibration";
import { formatLag, type Settings } from "../../../lib/game/settings";
import { focusStageTarget } from "../ui/nav";
import { NativeDialog } from "../ui/NativeDialog";

/**
 * Measuring the audio lag, instead of nudging a stepper until it feels right.
 *
 * The dialog schedules a run of short clicks on **its own** `AudioContext` — not
 * the game's mixer — so the master fader cannot make the calibration silent, and
 * the clicks are scheduled ahead on the audio clock rather than by a timer. The
 * same schedule is mapped onto `performance.now()`, which is the clock a tap's
 * `event.timeStamp` lives on, and `calibration.ts` does the arithmetic.
 *
 * The stepper is still the fallback: a browser that will not start Web Audio gets a
 * plain message and the page behind this dialog still works by hand. The context is
 * closed the moment the dialog closes or a run finishes, so no oscillator is left
 * running and no second graph outlives the measurement.
 */
interface Props {
  onSettings: (patch: Partial<Settings>) => void;
  onClose: () => void;
  /** Which half to start on. The Options row that opened it decides. */
  initialMode?: CalibrationMode;
}

/**
 * The two things that can be measured: how late the sound is, and how late the
 * picture is. They share the taps, the window and the median; only the beat the
 * player follows is different.
 */
export type CalibrationMode = "sound" | "picture";

type Phase = "ready" | "listening" | "done" | "unavailable";

/**
 * What a measurement is called and what it says, in the dictionary's own words.
 *
 * Only the presentation differs between the two runs; the scheduling and the
 * arithmetic are each their own, because they are. `patch` is the setting the
 * measured value is written to, so nothing has to branch on the mode to save it.
 */
interface ModeCopy {
  title: MessageKey;
  option: MessageKey;
  intro: MessageKey;
  /** The hint at the ready screen: what the run plays, or does not. */
  cue: MessageKey;
  tapHint: MessageKey;
  tap: MessageKey;
  result: MessageKey;
  patch: (lagMs: number) => Partial<Settings>;
}

const MODE_COPY: Record<CalibrationMode, ModeCopy> = {
  sound: {
    title: "screen.calibrationTitle",
    option: "screen.calibrationModeSound",
    intro: "screen.calibrationIntro",
    cue: "screen.calibrationFixedLevel",
    tapHint: "screen.calibrationTapHint",
    tap: "screen.calibrationTap",
    result: "screen.calibrationResult",
    patch: (lagMs) => ({ audioLagMs: lagMs }),
  },
  picture: {
    title: "screen.pictureCalibrationTitle",
    option: "screen.calibrationModePicture",
    intro: "screen.pictureCalibrationIntro",
    cue: "screen.pictureCalibrationNoSound",
    tapHint: "screen.pictureCalibrationTapHint",
    tap: "screen.calibrationTap",
    result: "screen.pictureCalibrationResult",
    patch: (lagMs) => ({ visualLagMs: lagMs }),
  },
};

/** The modes in the order the ready screen offers them. */
const MODES: readonly CalibrationMode[] = ["sound", "picture"];

/** One press in a phase's footer row. */
interface FooterAction {
  label: string;
  onClick: () => void;
  sound: "select" | "back";
  primary?: boolean;
  /** The press focus lands on once its phase is up. */
  ref?: Ref<HTMLButtonElement>;
  /** The press that starts a run, which the dialog's `initialFocus` names. */
  start?: boolean;
}

/** The row of actions a phase ends on, in the order that phase names them. */
function Footer({ actions }: { actions: readonly FooterAction[] }) {
  return (
    <div className="config__actions">
      {actions.map((action) => (
        <button
          key={action.label}
          ref={action.ref}
          type="button"
          className={action.primary ? "band-btn band-btn--primary" : "band-btn"}
          data-sound={action.sound}
          data-calibration-start={action.start ? "true" : undefined}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

/** The clicks' own level. Fixed, and independent of the mixer's master fader. */
const CLICK_LEVEL = 0.22;

/** How long a resumed context gets to report that it is running. */
const RESUME_TIMEOUT_MS = 1500;

/**
 * Wait for a resumed context to say it is running.
 *
 * A browser may resume asynchronously, so reading `state` straight after
 * `resume()` is not the answer. The `statechange` event is, with a short timeout
 * so a context that never starts is still reported as unavailable rather than
 * leaving the dialog waiting on it.
 */
function waitForRunning(context: AudioContext, timeoutMs: number): Promise<boolean> {
  if (context.state === "running") return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    let timer: number | null = null;
    const done = (running: boolean) => {
      if (settled) return;
      settled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      context.removeEventListener("statechange", onChange);
      resolve(running);
    };
    const onChange = () => {
      if (context.state === "running") done(true);
      else if (context.state === "closed") done(false);
    };

    context.addEventListener("statechange", onChange);
    if (context.state === "running") {
      done(true);
      return;
    }
    if (context.state === "closed") {
      done(false);
      return;
    }
    timer = window.setTimeout(() => done(false), timeoutMs);
  });
}

export function CalibrationDialog({ onSettings, onClose, initialMode = "sound" }: Props) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("ready");
  /** Which measurement the ready screen is set to. */
  const [mode, setMode] = useState<CalibrationMode>(initialMode);
  /** How many taps have been accepted so far, for the live count. */
  const [accepted, setAccepted] = useState(0);
  /** The measured lag, or null when the run could not be trusted. */
  const [result, setResult] = useState<number | null>(null);

  const context = useRef<AudioContext | null>(null);
  const oscillators = useRef<OscillatorNode[]>([]);
  /** The beats in the tap's own domain: `performance.now()` milliseconds. */
  const beats = useRef<number[]>([]);
  const taps = useRef<number[]>([]);
  const finishTimer = useRef<number | null>(null);
  /** The picture marker's one animation frame, alive only while it is listening. */
  const frame = useRef<number | null>(null);
  const marker = useRef<HTMLSpanElement | null>(null);
  const tapButton = useRef<HTMLButtonElement | null>(null);
  const doneButton = useRef<HTMLButtonElement | null>(null);

  /**
   * Stop everything this dialog started. Idempotent, because a run can end by a
   * tap, by the last beat, by Escape, by Cancel or by the page going away.
   */
  const release = useCallback(() => {
    if (finishTimer.current !== null) {
      window.clearTimeout(finishTimer.current);
      finishTimer.current = null;
    }
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    for (const oscillator of oscillators.current) {
      try {
        oscillator.stop();
      } catch {
        // Already stopped is the ordinary case for a click that has played.
      }
      try {
        oscillator.disconnect();
      } catch {
        // A disconnected node is already gone.
      }
    }
    oscillators.current = [];
    const current = context.current;
    context.current = null;
    if (current) void current.close().catch(() => undefined);
  }, []);

  // A dialog that goes away must not leave a graph behind it.
  useEffect(() => release, [release]);

  /** The way out, whether by Cancel, Escape or the dialog's own close control. */
  const close = useCallback(() => {
    release();
    onClose();
  }, [release, onClose]);

  const copy = MODE_COPY[mode];
  const cancel: FooterAction = {
    label: t("screen.calibrationCancel"),
    onClick: close,
    sound: "back",
  };

  // The Tap button is the run's only control, so it is where a pad's cursor and
  // the keyboard's focus belong once the clicks are coming.
  useEffect(() => {
    if (phase === "listening" && tapButton.current) {
      focusStageTarget(tapButton.current, { silent: true });
    }
    if (phase === "done" && doneButton.current) {
      // The Tap button is gone, so the next thing a hand wants is the result's
      // own action rather than whatever the dialog's close control is.
      focusStageTarget(doneButton.current, { silent: true });
    }
  }, [phase]);

  const finish = useCallback(
    (summary: CalibrationSummary) => {
      release();
      setResult(calibrationLag(summary));
      setPhase("done");
    },
    [release],
  );

  /**
   * Start the picture run: seat the crossings on the same monotonic clock a tap
   * lives on, then move the marker with one animation frame for as long as the
   * dialog is listening. The run itself plays no sound — a click would tell the
   * player where the beat is, which is the thing being measured.
   */
  const startPicture = () => {
    release();
    taps.current = [];
    setAccepted(0);
    setResult(null);

    const now = performance.now();
    // The marker waits at the left edge through the lead-in, then takes half an
    // interval to reach the line: that first crossing is the first beat.
    const first =
      now + PICTURE_CALIBRATION_LEAD_IN_MS + PICTURE_CALIBRATION_BEAT_MS / 2;
    beats.current = crossingTimes(
      first,
      PICTURE_CALIBRATION_CROSSINGS,
      PICTURE_CALIBRATION_BEAT_MS,
    );
    const last = beats.current[beats.current.length - 1] ?? first;

    setPhase("listening");
    const tick = (at: number) => {
      const node = marker.current;
      if (node) {
        node.style.left = `${pictureMarkerPercent(
          at,
          first,
          PICTURE_CALIBRATION_BEAT_MS,
        )}%`;
      }
      // The run is over once the last crossing's window has passed. Finishing
      // here, rather than from a timer, means the loop's own last frame is the
      // one that closes it — there is never an orphaned animation left running.
      if (at >= last + CALIBRATION_WINDOW_MS + 120) {
        finish(measureTaps(beats.current, taps.current));
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    // A hidden tab suspends `requestAnimationFrame`, and a picture run that ended
    // only from its own frame would leave the dialog listening for ever. The
    // timer is the same end on the same clock, so whichever arrives first closes
    // the run; `release()` cancels the other.
    finishTimer.current = window.setTimeout(
      () => {
        finishTimer.current = null;
        if (frame.current === null) return;
        finish(measureTaps(beats.current, taps.current));
      },
      Math.max(0, last + CALIBRATION_WINDOW_MS + 120 - performance.now()),
    );
  };

  /**
   * Start a run: build the context inside the press, resume it, schedule every
   * click ahead, and finish when the last beat's window has passed.
   */
  const start = async () => {
    if (mode === "picture") {
      startPicture();
      return;
    }
    release();
    taps.current = [];
    setAccepted(0);
    setResult(null);

    const Ctor: typeof AudioContext | undefined = window.AudioContext;
    if (!Ctor) {
      setPhase("unavailable");
      return;
    }

    let made: AudioContext;
    try {
      made = new Ctor();
    } catch {
      setPhase("unavailable");
      return;
    }
    context.current = made;

    try {
      if (made.state === "suspended") await made.resume();
    } catch {
      release();
      setPhase("unavailable");
      return;
    }
    // The dialog can be closed while the browser is deciding whether to resume.
    if (context.current !== made) return;
    const running =
      made.state === "running" || (await waitForRunning(made, RESUME_TIMEOUT_MS));
    if (context.current !== made) return;
    if (!running) {
      release();
      setPhase("unavailable");
      return;
    }

    // The audio clock's schedule, and the same moments on the clock a tap is
    // stamped with. Sampling both together keeps the two domains aligned; the
    // mapping is why this is not a `setInterval` — a timer drifts against the
    // sound, while an oscillator starts at the time it was told to.
    const now = performance.now();
    const lead = CALIBRATION_LEAD_IN_MS / 1000;
    const firstClick = made.currentTime + lead;
    beats.current = Array.from(
      { length: CALIBRATION_BEATS },
      (_, index) => now + CALIBRATION_LEAD_IN_MS + index * CALIBRATION_BEAT_MS,
    );

    for (let index = 0; index < CALIBRATION_BEATS; index += 1) {
      const at = firstClick + (index * CALIBRATION_BEAT_MS) / 1000;
      const oscillator = made.createOscillator();
      const gain = made.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(1200, at);
      // A short, clean tick rather than a note: a click is easy to place, and a
      // tone with a tail would make the player's own tap ambiguous.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(CLICK_LEVEL, at + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
      oscillator.connect(gain).connect(made.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.05);
      oscillators.current.push(oscillator);
    }

    setPhase("listening");
    finishTimer.current = window.setTimeout(
      () => {
        if (context.current !== made) return;
        finish(measureTaps(beats.current, taps.current));
      },
      CALIBRATION_LEAD_IN_MS +
        (CALIBRATION_BEATS - 1) * CALIBRATION_BEAT_MS +
        CALIBRATION_WINDOW_MS +
        120,
    );
  };

  /**
   * One tap. `event.timeStamp` is the press's own moment on the same monotonic
   * clock as the beats, so it is the input the measurement wants; a frame's
   * playhead or a state update would be later than the hand.
   */
  const tap = (event: MouseEvent<HTMLButtonElement>) => {
    if (phase !== "listening") return;
    taps.current = [...taps.current, event.timeStamp];
    const measured = measureTaps(beats.current, taps.current);
    setAccepted(measured.accepted);
    if (measured.accepted >= CALIBRATION_TAPS) finish(measured);
  };

  return (
    <NativeDialog
      title={t(copy.title)}
      onClose={close}
      className="calibration"
      initialFocus="[data-calibration-start]"
    >
      {phase === "ready" ? (
        <>
          <div
            className="calibration__modes"
            role="group"
            aria-label={t("screen.calibrationMode")}
          >
            {MODES.map((option) => (
              <button
                key={option}
                type="button"
                className={mode === option ? "slot__option is-active" : "slot__option"}
                aria-pressed={mode === option}
                data-sound="select"
                onClick={() => {
                  setMode(option);
                  setAccepted(0);
                  setResult(null);
                }}
              >
                {t(MODE_COPY[option].option)}
              </button>
            ))}
          </div>
          <p className="config__lead">{t(copy.intro)}</p>
          <p className="config__hint">{t(copy.cue)}</p>
          <Footer
            actions={[
              {
                label: t("screen.calibrationStart"),
                onClick: () => void start(),
                sound: "select",
                primary: true,
                start: true,
              },
              cancel,
            ]}
          />
        </>
      ) : null}

      {phase === "listening" ? (
        <>
          <p className="config__lead" role="status" aria-live="polite">
            {t("screen.calibrationProgress", { count: accepted, total: CALIBRATION_TAPS })}
          </p>
          <p className="config__hint">{t(copy.tapHint)}</p>
          {mode === "picture" ? (
            // The measurement itself: a marker sweeps across and crosses the line
            // on each beat. Its shape and stripes carry it without relying on its
            // colour, and it keeps moving under reduced motion — it is the test,
            // not decoration.
            <div className="calibration__track" aria-hidden="true">
              <span className="calibration__line" />
              <span className="calibration__marker" ref={marker} />
            </div>
          ) : null}
          <button
            ref={tapButton}
            type="button"
            className="calibration__tap"
            onClick={(event) => {
              // The tap is the measurement, not a UI press: the mixer's click cue
              // would land on top of the beat the player is listening for.
              event.stopPropagation();
              tap(event);
            }}
          >
            {t(copy.tap)}
          </button>
          <Footer actions={[cancel]} />
        </>
      ) : null}

      {phase === "done" ? (
        result !== null ? (
          <>
            <p className="config__label">{t(copy.result)}</p>
            <output className="calibration__reading" aria-live="polite" aria-atomic="true">
              {formatLag(result)}
            </output>
            <Footer
              actions={[
                {
                  label: t("screen.calibrationUse"),
                  onClick: () => {
                    onSettings(copy.patch(result));
                    close();
                  },
                  sound: "select",
                  primary: true,
                  ref: doneButton,
                },
                {
                  label: t("screen.calibrationAgain"),
                  onClick: () => void start(),
                  sound: "select",
                },
                cancel,
              ]}
            />
          </>
        ) : (
          <>
            <p className="config__lead">{t("screen.calibrationTooFew")}</p>
            <Footer
              actions={[
                {
                  label: t("screen.calibrationAgain"),
                  onClick: () => void start(),
                  sound: "select",
                  primary: true,
                  ref: doneButton,
                },
                cancel,
              ]}
            />
          </>
        )
      ) : null}

      {phase === "unavailable" ? (
        <>
          <p className="config__lead">{t("screen.calibrationUnavailable")}</p>
          <Footer actions={[cancel]} />
        </>
      ) : null}
    </NativeDialog>
  );
}
