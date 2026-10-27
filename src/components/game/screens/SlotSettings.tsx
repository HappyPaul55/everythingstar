import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../../i18n/react";
import type { MessageKey, Translate } from "../../../i18n";
import type { BandPlan, BandSlot, PlayerKind } from "../../../lib/game/band/types";
import { isMelodyKind } from "../../../lib/game/band/types";
import {
  codeLabel,
  fretCount,
  fretFace,
  keyLayoutFromSteps,
  learnSteps,
  midiControlKey,
  midiLayoutFromSteps,
  padControlKey,
  padControlLabel,
  padLayoutFromSteps,
  stepIsOptional,
  type Controller,
  type LearnStep,
  type MidiControl,
  type PadControl,
} from "../../../lib/game/controls/layout";
import { controllerKeys, keyboardOrdinal } from "../../../lib/game/controls/plan";
import { INSTRUMENTS } from "../../../lib/game/track";
import { useStageControls, type LearnControl, type LearnDevice } from "../band/StageControls";
import { NativeDialog } from "../ui/NativeDialog";
import { focusStageTarget } from "../ui/nav";

/**
 * One player's controller, and how they set it up.
 *
 * A player says **what they hold** — their own keys on the one keyboard, a gamepad,
 * the machine — and, if they want, **what each control is**, by pressing it when
 * asked. The learn flow is the answer to the thing a preset cannot know: a plastic
 * guitar, a drum kit and a pad all present themselves as gamepads, and only the
 * person holding one can say which button is which.
 *
 * What comes out is a **mapping**, which is the same shape as the preset a player
 * would otherwise get — so nothing downstream knows the difference, and a player
 * who never opens this is unaffected.
 */
interface Props {
  plan: BandPlan;
  index: number;
  slot: BandSlot;
  /** The chart's columns for this player, or `null` when the song has no chart. */
  columns: number | null;
  /** Whether the song's words carry pitch: whether a singer sings or a typist types. */
  hasPitch: boolean;
  onController: (controller: Controller | undefined) => void;
  onClose: () => void;
}

/** A control a learn step captured: a key code, a pad control, a MIDI control. */
type LearnValue = string | PadControl | MidiControl | null;

/** What is being set up, and how far through. Held in a ref: the capture callback
 *  is called from the input route's listener, so it cannot close over state. */
interface Session {
  device: LearnDevice;
  steps: LearnStep[];
  /** One control per step, `null` where a step was skipped. */
  controls: LearnValue[];
  /** The channel each MIDI note arrived on, for the step list's own words. */
  channels: (number | null)[];
  /** The last press was a control already spoken for, so it was not taken. */
  taken: boolean;
}

export function SlotSettings({
  plan,
  index,
  slot,
  columns,
  hasPitch,
  onController,
  onClose,
}: Props) {
  const t = useT();
  const { pads, learn, midi } = useStageControls();
  const [, bump] = useState(0);
  const session = useRef<Session | null>(null);
  const controller = slot.controller;
  const learning = session.current;
  /**
   * The capture callback is called from the input route's listener, so it closes
   * over the render that started the session. What a finished mapping is written
   * with — the plan's keyboard order, the seat, the device it replaced — is read
   * from here instead, so a plan change mid-session cannot write a stale mapping.
   */
  const latest = useRef({ plan, index, controller, onController });
  latest.current = { plan, index, controller, onController };
  // Focus is the game's own placement on the way in and out of a session: the
  // device list is replaced by the step list, and the session's own controls by
  // the Learn button. Without this, both directions leave focus on `<body>`.
  const learnButton = useRef<HTMLButtonElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement | null>(null);
  const stepsList = useRef<HTMLOListElement | null>(null);
  const actions = useRef<HTMLDivElement | null>(null);
  const wasLearning = useRef(false);

  useEffect(() => {
    const now = session.current !== null;
    if (now === wasLearning.current) return;
    wasLearning.current = now;
    // Entering a session puts focus on the step list, not on Cancel: a session is
    // answered by pressing controls, and a bumped Space or Enter on Cancel would
    // end the very thing the player opened. Leaving it goes back to Learn.
    const target = now
      ? (stepsList.current ?? actions.current)
      : learnButton.current;
    if (target) focusStageTarget(target, { silent: true });
  }, [learning]);

  /** Redraw after the session (which lives in a ref) has moved on. */
  const redraw = () => bump((version) => version + 1);

  const devices = useMemo(() => {
    if (isMelodyKind(slot.kind)) {
      // The song decides how the words are played, so there is no mapping to
      // learn: all a player can say is that they are sitting this one out.
      const own: Controller = hasPitch ? { on: "mic" } : { on: "chars" };
      return [
        {
          key: "own",
          controller: own,
          label: t(hasPitch ? "band.mic" : "screen.deviceTyping"),
        },
        {
          key: "none",
          controller: { on: "none" } as Controller,
          label: t("screen.deviceMachine"),
        },
      ];
    }
    const list: { key: string; controller: Controller; label: string }[] = [
      {
        key: "keyboard",
        controller: { on: "keyboard", layout: keyboardOrdinal(plan, index) },
        label: t("screen.deviceKeyboard"),
      },
      ...pads.map((pad) => ({
        key: `pad-${pad.index}`,
        controller: { on: "pad", index: pad.index } as Controller,
        label: t("band.padOn", { n: pad.index + 1 }),
      })),
      {
        key: "midi",
        controller: { on: "midi" } as Controller,
        label: t("screen.deviceMidi"),
      },
      { key: "none", controller: { on: "none" }, label: t("screen.deviceMachine") },
    ];
    return list;
  }, [plan, index, pads, slot.kind, hasPitch, t]);

  /** What a box is actually played with: what they set, or what the song gives them. */
  const effective: Controller | undefined = isMelodyKind(slot.kind)
    ? (controller ?? { on: hasPitch ? "mic" : "chars" })
    : controller;
  /**
   * A pad the player chose that the browser no longer reports. The choice is kept
   * rather than silently re-seating them on the keyboard — they meant that pad —
   * but a seat that routes nothing has to say why, or the read-out is the only
   * thing that would ever look wrong.
   */
  const missingPad =
    controller?.on === "pad" && !pads.some((pad) => pad.index === controller.index)
      ? controller.index + 1
      : null;

  /**
   * MIDI is the one device that has to ask the browser first, and a press here is
   * the gesture. A refusal changes nothing: the seat keeps whatever it already had
   * rather than quietly becoming the machine.
   */
  const withMidi = (then: () => void) => {
    void midi.requestAccess(true).then((granted) => {
      if (granted) then();
    });
  };

  const chooseDevice = (next: Controller) => {
    if (next.on !== "midi") {
      // A different device starts from its own preset: half of one mapping and half
      // of another would be nobody's.
      onController(next);
      return;
    }
    if (controller?.on === "midi") {
      // Already this seat's controller — the press is only permission for this
      // visit, and the mapping it learned stays.
      void midi.requestAccess(true);
      return;
    }
    withMidi(() => onController({ on: "midi" }));
  };

  /** The device a learn session listens to, and what it is for. A words player has
   *  no mapping to learn — the song decides how their words are played. */
  const steps = useMemo(
    () => (isMelodyKind(slot.kind) ? [] : learnSteps(slot.kind, columns)),
    [slot.kind, columns],
  );

  const capture = (control: LearnControl) => {
    const current = session.current;
    if (!current) return;
    const at = current.controls.length;
    const step = current.steps[at];
    if (!step) return;
    // An axis is a strum bar and nothing else. A bar that happens to move while
    // the frets are being asked for is not a fret, so it is not an answer.
    if (control.on === "padAxis" && step.on !== "strum") return;

    const value: LearnValue =
      control.on === "keyboard"
        ? control.code
        : control.on === "pad"
          ? control.button
          : control.on === "padAxis"
            ? { axis: control.axis, direction: control.direction }
            : control.control;
    // The same control cannot be two things: a mapping with one button on two
    // frets is worse than no mapping, so a repeat is refused rather than taken.
    // The tagged key is what keeps axis 0 and button 0 apart; the two directions
    // of one axis are one bar, so they share a key, and a note and a control
    // change with the same number are different controls.
    if (
      value !== null &&
      current.controls.some(
        (entry) =>
          entry !== null &&
          controlKey(entry, current.device) === controlKey(value, current.device),
      )
    ) {
      current.taken = true;
      redraw();
      return;
    }
    current.taken = false;
    // One axis is both ways of a strum bar: when the next step is the other way,
    // the same crossing answers it — the other direction of the same axis — and
    // the player is not asked again.
    const answers: { value: LearnValue; channel: number | null }[] = [];
    if (control.on === "padAxis") {
      answers.push({
        value: { axis: control.axis, direction: control.direction },
        channel: null,
      });
      if (current.steps[at + 1]?.on === "strum") {
        answers.push({
          value: {
            axis: control.axis,
            direction: control.direction === 1 ? -1 : 1,
          },
          channel: null,
        });
      }
    } else {
      answers.push({ value, channel: control.on === "midi" ? control.channel : null });
    }
    current.controls = [...current.controls, ...answers.map((answer) => answer.value)];
    current.channels = [...current.channels, ...answers.map((answer) => answer.channel)];
    if (current.controls.length >= current.steps.length) finish(current);
    else redraw();
  };

  const startSession = (device: LearnDevice) => {
    session.current = { device, steps, controls: [], channels: [], taken: false };
    learn.start(device, capture);
    redraw();
  };

  /**
   * A MIDI learn session asks the browser for access first, because the player's
   * press that started it is the gesture the permission needs. A refusal leaves the
   * gear open with its sentence, and nothing on stage changes.
   */
  const begin = (device: LearnDevice) => {
    if (device.on !== "midi") {
      startSession(device);
      return;
    }
    withMidi(() => startSession(device));
  };

  const skip = () => {
    const current = session.current;
    if (!current) return;
    // Skipping past the repeat warning answers it: the next press is a new one.
    current.taken = false;
    current.controls = [...current.controls, null];
    current.channels = [...current.channels, null];
    if (current.controls.length >= current.steps.length) finish(current);
    else redraw();
  };

  const cancel = () => {
    learn.stop();
    session.current = null;
    redraw();
  };

  /** The dialog's one way out: a learn session must not outlive its panel. */
  const close = () => {
    cancel();
    onClose();
  };

  // Unmounting is another way out — the band screen can change underneath it.
  useEffect(() => () => learn.stop(), [learn]);

  /** Turn what was pressed into the mapping the game plays with. */
  const finish = (current: Session) => {
    learn.stop();
    session.current = null;
    const device = current.device;
    // The latest of everything the mapping is written with, not the render that
    // started the session: the listener's callback outlives that render.
    const {
      plan: latestPlan,
      index: latestIndex,
      controller: latestController,
      onController: write,
    } = latest.current;
    if (device.on === "keyboard") {
      const keys = keyLayoutFromSteps(current.steps, current.controls as (string | null)[]);
      write({
        on: "keyboard",
        layout: keyboardOrdinal(latestPlan, latestIndex),
        keys,
      });
    } else if (device.on === "pad") {
      const buttons = padLayoutFromSteps(
        current.steps,
        current.controls.map((control) =>
          typeof control === "string" ? null : (control as PadControl),
        ),
      );
      write({
        on: "pad",
        index: device.index,
        buttons,
      });
    } else {
      const notes = midiLayoutFromSteps(
        current.steps,
        current.controls as (MidiControl | null)[],
      );
      // The input it was learned on is kept; every input is one bus, so an index is
      // the gear's read-out rather than a filter.
      const index =
        latestController?.on === "midi" ? latestController.index : undefined;
      write({
        on: "midi",
        ...(index === undefined ? {} : { index }),
        notes,
      });
    }
    // Back to the device view, with the new mapping visible, rather than leaving
    // the completed learn list on screen after the session has stopped.
    redraw();
  };

  const step = learning ? learning.steps[learning.controls.length] : undefined;
  const seatKeys = controller
    ? controllerKeys({
        seat: index,
        kind: slot.kind,
        channel: "lanes",
        columns,
        controller,
      })
    : null;
  /**
   * What the gear says about MIDI, in one plain sentence: whether this browser can
   * do it at all, what the player answered, and which inputs are connected.
   */
  const midiHint: MessageKey | null =
    midi.status === "requesting"
      ? "screen.midiAsking"
      : midi.status === "unsupported"
        ? "screen.midiUnavailable"
        : midi.status === "refused"
          ? "screen.midiRefused"
          : midi.status === "error"
            ? "screen.midiError"
            : midi.permission === "granted"
              ? midi.ports.length > 0
                ? "screen.midiInputs"
                : "screen.midiNoInputs"
              : controller?.on === "midi"
                ? "screen.midiNotConnected"
                : null;

  return (
    <NativeDialog
      title={`${t("band.player", { n: index + 1 })} · ${t(
        isMelodyKind(slot.kind) ? "band.vocals" : INSTRUMENTS[slot.kind].labelKey,
      )}`}
      onClose={close}
    >
      {learning ? (
        <>
          {/* One step at a time, in the words of the thing being pressed for. */}
          <p className="config__lead" role="status" aria-live="polite">
            {stepLabel(t, step, slot.kind)}
          </p>
          <p className={learning.taken ? "config__hint is-warn" : "config__hint"}>
            {learning.taken
              ? t("screen.learnTaken")
              : learning.device.on === "keyboard"
                ? t("screen.learnKeyboard")
                : learning.device.on === "midi"
                  ? t("screen.learnMidi")
                  : t("screen.learnPad")}
          </p>
          <ol className="config__steps" ref={stepsList} tabIndex={-1}>
            {learning.steps.map((entry, at) => (
              <li
                key={stepKey(entry)}
                className={
                  at < learning.controls.length ? "config__step is-done" : "config__step"
                }
              >
                <span className="config__step-name">{stepLabel(t, entry, slot.kind)}</span>
                <span className="config__step-value">
                  {at < learning.controls.length
                    ? controlLabel(
                        t,
                        learning.controls[at],
                        learning.device,
                        learning.channels[at],
                      )
                    : at === learning.controls.length
                      ? t("screen.learnNow")
                      : "—"}
                </span>
              </li>
            ))}
          </ol>
          <div className="config__actions" ref={actions} tabIndex={-1}>
            {step && stepIsOptional(step) ? (
              <button type="button" className="band-btn" onClick={skip}>
                {t("screen.learnSkip")}
              </button>
            ) : null}
            <button
              type="button"
              className="band-btn"
              data-sound="back"
              ref={cancelButton}
              onClick={cancel}
            >
              {t("screen.learnCancel")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="config__label">{t("screen.device")}</p>
          <div className="config__devices" role="group" aria-label={t("screen.device")}>
            {devices.map((entry, at) => (
              <button
                key={entry.key}
                type="button"
                className={
                  sameDevice(effective, entry.controller)
                    ? "slot__option is-active"
                    : "slot__option"
                }
                aria-pressed={sameDevice(effective, entry.controller)}
                data-sound="select"
                // The dialog opens on the first device, not its close ×: this gear
                // is a list of what they play with, and choosing one is the point.
                data-dialog-focus={at === 0 ? true : undefined}
                onClick={() => chooseDevice(entry.controller)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          {!isMelodyKind(slot.kind) && midiHint ? (
            <p
              className={
                midiHint === "screen.midiInputs" || midiHint === "screen.midiAsking"
                  ? "config__hint"
                  : "config__hint is-warn"
              }
            >
              {midiHint === "screen.midiInputs"
                ? t("screen.midiInputs", {
                    names: midi.ports.map((port) => port.name).join(", "),
                  })
                : t(midiHint)}
            </p>
          ) : null}
          {!isMelodyKind(slot.kind) && missingPad !== null ? (
            <p className="config__hint is-warn">
              {t("screen.padNotConnected", { n: missingPad })}
            </p>
          ) : null}

          {isMelodyKind(slot.kind) ? (
            <p className="config__hint">{t("screen.deviceWords")}</p>
          ) : (
            <>
              <p className="config__label">{t("screen.mapping")}</p>
              <p className="config__keys">
                {controller?.on === "none"
                  ? t("screen.mappingNone")
                  : (seatKeys ?? t("screen.mappingPreset"))}
              </p>
              <div className="config__actions">
                <button
                  type="button"
                  className="band-btn band-btn--primary"
                  data-sound="select"
                  ref={learnButton}
                  onClick={() => begin(learnDevice(controller))}
                >
                  {t("screen.learn")}
                </button>
                {controller && "keys" in controller && controller.keys ? (
                  <button
                    type="button"
                    className="band-btn"
                    data-sound="back"
                    onClick={() =>
                      onController({ on: "keyboard", layout: keyboardOrdinal(plan, index) })
                    }
                  >
                    {t("screen.learnReset")}
                  </button>
                ) : null}
                {controller && controller.on === "pad" && controller.buttons ? (
                  <button
                    type="button"
                    className="band-btn"
                    data-sound="back"
                    onClick={() => onController({ on: "pad", index: controller.index })}
                  >
                    {t("screen.learnReset")}
                  </button>
                ) : null}
                {controller && controller.on === "midi" && controller.notes ? (
                  <button
                    type="button"
                    className="band-btn"
                    data-sound="back"
                    onClick={() =>
                      onController({
                        on: "midi",
                        ...(controller.index === undefined ? {} : { index: controller.index }),
                      })
                    }
                  >
                    {t("screen.learnReset")}
                  </button>
                ) : null}
              </div>
              <p className="config__hint">
                {t("screen.learnHint", { count: columns ?? fretCount(slot.kind) })}
              </p>
            </>
          )}
        </>
      )}
    </NativeDialog>
  );
}

/** Which device a learn session listens to: theirs, or any pad if none is chosen. */
function learnDevice(controller: Controller | undefined): LearnDevice {
  if (controller?.on === "pad") return { on: "pad", index: controller.index };
  if (controller?.on === "midi") return { on: "midi" };
  if (controller?.on === "keyboard") return { on: "keyboard" };
  // No device chosen yet: a keyboard is what is always there, so that is what is
  // listened to; a pad player picks their pad before learning.
  return { on: "keyboard" };
}

function sameDevice(a: Controller | undefined, b: Controller): boolean {
  if (!a) return false;
  return a.on === b.on && (a.on !== "pad" || b.on !== "pad" || a.index === b.index);
}

function stepKey(step: LearnStep): string {
  if (step.on === "fret") return `fret-${step.column}`;
  if (step.on === "strum") return `strum-${step.direction}`;
  return "whammy";
}

/** What to press, in the words of the thing: a fret is a colour, not a number. */
function stepLabel(t: Translate, step: LearnStep | undefined, kind: PlayerKind): string {
  if (!step) return t("screen.learnDone");
  if (step.on === "fret") {
    // A mat has arrows where an instrument has colours, and its kit already says so.
    if (isMelodyKind(kind)) {
      return t("screen.learnFret", {
        n: step.column + 1,
        colour: t(`screen.fretColour${(step.column % 5) + 1}` as "screen.fretColour1"),
      });
    }
    const face = fretFace(kind, step.column);
    if (face === "arrow") return t("screen.learnArrow", { n: step.column + 1 });
    if (face === "kick") return t("screen.learnKick");
    return t("screen.learnFret", {
      n: step.column + 1,
      colour: t(`screen.fretColour${(step.column % 5) + 1}` as "screen.fretColour1"),
    });
  }
  if (step.on === "strum") {
    return step.direction === 0 ? t("screen.learnStrum") : t("screen.learnStrumBack");
  }
  return t("screen.learnWhammy");
}

/** How a captured control reads: a key for a keyboard, a button or an axis for a
 *  pad, and a note or control change with its channel for MIDI — the two things a
 *  player needs to recognise it. An axis keeps the direction the step was answered
 *  with. */
function controlLabel(
  t: Translate,
  control: LearnValue,
  device: LearnDevice,
  channel: number | null,
): string {
  if (control === null) return "—";
  if (device.on === "midi") {
    const midi = control as MidiControl;
    return typeof midi === "number"
      ? t("screen.midiNote", {
          note: String(midi),
          channel: String(channel ?? 1),
        })
      : t("screen.midiCc", {
          cc: String(midi.cc),
          channel: String(channel ?? 1),
        });
  }
  return typeof control === "string"
    ? codeLabel(control)
    : padControlLabel(control as PadControl);
}

/**
 * The identity of a captured control, for "a control already spoken for".
 * A pad's **axis 0** and **button 0** are different controls, and one axis's two
 * directions are the same bar — so the key is tagged, and a direction is not part
 * of it. A MIDI note and a control change with the same number are different
 * controls too, which is what `midiControlKey` says.
 */
function controlKey(value: string | PadControl | MidiControl, device: LearnDevice): string {
  if (typeof value === "string") return `key:${value}`;
  if (device.on === "midi") return `midi:${midiControlKey(value as MidiControl)}`;
  return `pad:${padControlKey(value as PadControl)}`;
}
