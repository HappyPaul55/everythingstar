import { useState, lazy, Suspense, type ReactNode } from "react";
import { useT } from "../../../i18n/react";
import type { MessageKey, Translate } from "../../../i18n";
import { isMelodyKind, patchSlot, type BandPlan, type BandSlot, type PlayerKind } from "../../../lib/game/band/types";
import type { Controller } from "../../../lib/game/controls/layout";
import {
  BACKDROP_DIM_MAX,
  BACKDROP_DIM_STEP,
  formatLag,
  HIGHWAY_VIEWS,
  LAG_LIMIT_MS,
  NOTE_SPEED_MAX,
  NOTE_SPEED_MIN,
  NOTE_SPEED_STEP,
  NOTE_STYLES,
  snapBackdropDim,
  snapLevel,
  snapNoteSpeed,
  stepLag,
  type NoteStyle,
  type Settings,
} from "../../../lib/game/settings";
import { GearButton, kindLabel, kindTone } from "./playerBits";
import { SlotSettings } from "./SlotSettings";
import { ScreenBackButton } from "./ScreenBackButton";
import { useInstall } from "../pwa/useInstall";
import type { CalibrationMode } from "./CalibrationDialog";

/**
 * The dictionary key each skin reads by, in the order the settings page offers
 * them. Kept beside the buttons rather than in `settings.ts`, which knows nothing
 * about the interface.
 */
const NOTE_STYLE_LABELS: Record<NoteStyle, MessageKey> = {
  bars: "screen.noteStyleBars",
  gems: "screen.noteStyleGems",
  arrows: "screen.noteStyleArrows",
};

/**
 * The measured-lag dialog is reached from one row on this page, so its chunk is
 * fetched on the press rather than with Options. The row keeps its
 * `aria-haspopup="dialog"`, and the dialog still mounts as a native `<dialog>` with
 * `useModal`, so Escape and focus return behave exactly as they did when it was
 * imported eagerly.
 */
const CalibrationDialog = lazy(() =>
  import("./CalibrationDialog").then((module) => ({
    default: module.CalibrationDialog,
  })),
);

/**
 * Options: the handful of things that are a player's rather than a song's.
 *
 * They are kept in this browser (`src/lib/game/settings.ts`), and every one of them is
 * a *behaviour* rather than a piece of the game: how far the sound trails the notes,
 * how far the picture trails the sound, how loud it is, what the stage sits in front
 * of, how the necks are drawn and what the notes on them look like, and what each of
 * them plays with. The last is the odd
 * one out — it is about a player, not about the game — but it is the same memory
 * (`band/store.ts`) the band screen writes,
 * so a controller set up here is the one that seat has on stage, and vice versa.
 *
 * **What a player takes** is not set here: that is a question about the song, and the
 * song screen is where it is asked. This page only says what they hold.
 */
interface Props {
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  plan: BandPlan;
  onPlan: (plan: BandPlan) => void;
  onBack: () => void;
}

export function Options({ settings, onSettings, plan, onPlan, onBack }: Props) {
  const t = useT();
  /** Which player's controller is being set up, if any. */
  const [setting, setSetting] = useState<number | null>(null);
  /** Which measured calibration is open over the page, if any. */
  const [calibrating, setCalibrating] = useState<CalibrationMode | null>(null);
  const install = useInstall();
  const lag = settings.audioLagMs;
  const pictureLag = settings.visualLagMs;

  const setSlot = (index: number, patch: Partial<BandSlot>) =>
    onPlan(patchSlot(plan, index, patch));

  return (
    <div className="screen screen--options">
      <div className="screen__panel screen__panel--page">
        <ScreenBackButton label={t("screen.backToMenu")} onBack={onBack} />
        <h2 className="screen__title">{t("screen.options")}</h2>
        <p className="screen__lede">{t("screen.optionsLede")}</p>

        <div className="options">
          {/* How late the sound arrives. A stepper rather than a slider: it is a
              calibration, and the two directions are what a player wants to press.
              Beside it is the measured version, which writes the same setting —
              the stepper stays for the fine adjustment and as the fallback. */}
          <LagOption
            name={t("screen.audioLag")}
            hints={[t("screen.audioLagHint"), t("screen.audioLagCalibrateHint")]}
            value={lag}
            limit={LAG_LIMIT_MS}
            format={formatLag}
            defaultFocus
            onStep={(direction) => onSettings({ audioLagMs: stepLag(lag, direction) })}
            onCalibrate={() => setCalibrating("sound")}
          />

          {/* How late the picture is against the sound. The same stepper, the same
              limit and the same measured dialog, but this one writes `visualLagMs`
              and the dialog starts on its Picture mode. Positive means the display
              lags, so the notes are drawn ahead to meet the sound. */}
          <LagOption
            name={t("screen.pictureLag")}
            hints={[t("screen.pictureLagHint"), t("screen.pictureLagCalibrateHint")]}
            value={pictureLag}
            limit={LAG_LIMIT_MS}
            format={formatLag}
            calibrateLabel={t("screen.calibratePicture")}
            onStep={(direction) => onSettings({ visualLagMs: stepLag(pictureLag, direction) })}
            onCalibrate={() => setCalibrating("picture")}
          />

          {/* The master fader. The three family levels below it are the balance it
              sits on; nothing here is mixed at the master itself. */}
          <RangeOption
            id="option-volume"
            name={t("screen.volume")}
            hints={[t("screen.volumeHint")]}
            min={0}
            max={100}
            step={1}
            value={Math.round(settings.volume * 100)}
            format={formatPercent}
            onChange={(percent) => onSettings({ volume: percent / 100 })}
          />

          {/* The families under the master: the song and the menu beds, the room
              beneath a song, and the cues. Each is its own level, so a player can
              keep the music while turning the feedback down — or the other way. */}
          <RangeOption
            id="option-music-level"
            name={t("screen.musicLevel")}
            hints={[t("screen.musicLevelHint")]}
            min={0}
            max={100}
            step={1}
            value={Math.round(settings.levels.music * 100)}
            format={formatPercent}
            onChange={(percent) =>
              onSettings({
                levels: {
                  ...settings.levels,
                  music: snapLevel(percent / 100, settings.levels.music),
                },
              })
            }
          />

          <RangeOption
            id="option-ambience-level"
            name={t("screen.ambienceLevel")}
            hints={[t("screen.ambienceLevelHint")]}
            min={0}
            max={100}
            step={1}
            value={Math.round(settings.levels.ambience * 100)}
            format={formatPercent}
            onChange={(percent) =>
              onSettings({
                levels: {
                  ...settings.levels,
                  ambience: snapLevel(percent / 100, settings.levels.ambience),
                },
              })
            }
          />

          <RangeOption
            id="option-sfx-level"
            name={t("screen.sfxLevel")}
            hints={[t("screen.sfxLevelHint")]}
            min={0}
            max={100}
            step={1}
            value={Math.round(settings.levels.sfx * 100)}
            format={formatPercent}
            onChange={(percent) =>
              onSettings({
                levels: {
                  ...settings.levels,
                  sfx: snapLevel(percent / 100, settings.levels.sfx),
                },
              })
            }
          />

          {/* Whether the song's own voice stays in under a singer. Off is karaoke:
              they are the voice. On is the only way a singer hears their own part
              drop out on a miss and come back by the song's own rule. */}
          <ToggleOption
            name={t("screen.guideVocal")}
            hints={[t("screen.guideVocalHint")]}
            choices={[
              {
                key: "on",
                label: t("screen.guideVocalOn"),
                active: settings.guideVocal,
                onSelect: () => onSettings({ guideVocal: true }),
              },
              {
                key: "off",
                label: t("screen.guideVocalOff"),
                active: !settings.guideVocal,
                onSelect: () => onSettings({ guideVocal: false }),
              },
            ]}
          />

          {/* What the stage sits in front of, when the song has something of its own. */}
          <ToggleOption
            name={t("screen.backdrop")}
            hints={[t("screen.backdropHint")]}
            choices={[
              {
                key: "song",
                label: t("screen.backdropSong"),
                active: settings.video,
                onSelect: () => onSettings({ video: true }),
              },
              {
                key: "ours",
                label: t("screen.backdropOurs"),
                active: !settings.video,
                onSelect: () => onSettings({ video: false }),
              },
            ]}
          />

          {/* Bright footage can swallow the notes, so the backdrop has a dim of its
              own. It dims only what the stage sits in front of — never the notes or
              the panels — and is a range because 5% steps are finer than a stepper
              wants to be pressed. */}
          <RangeOption
            id="option-backdrop-dim"
            name={t("screen.backdropDim")}
            hints={[t("screen.backdropDimHint")]}
            min={0}
            max={Math.round(BACKDROP_DIM_MAX * 100)}
            step={Math.round(BACKDROP_DIM_STEP * 100)}
            value={Math.round(settings.backdropDim * 100)}
            format={formatPercent}
            onChange={(percent) => onSettings({ backdropDim: snapBackdropDim(percent / 100) })}
          />

          {/* The room's drifting lights. Decorative, so this is a plain on/off rather
              than a strength: the lights are either part of the room or they are not. */}
          <ToggleOption
            name={t("screen.flares")}
            hints={[t("screen.flaresHint")]}
            choices={[
              {
                key: "on",
                label: t("screen.flaresOn"),
                active: settings.flares,
                onSelect: () => onSettings({ flares: true }),
              },
              {
                key: "off",
                label: t("screen.flaresOff"),
                active: !settings.flares,
                onSelect: () => onSettings({ flares: false }),
              },
            ]}
          />

          {/* The room while the run waits. Its own ambience channel, so it sits
              beneath the pause rather than over the song — and the pause menu is the
              only screen that wants one. */}
          <ToggleOption
            name={t("screen.crowd")}
            hints={[t("screen.crowdHint")]}
            choices={[
              {
                key: "on",
                label: t("screen.crowdOn"),
                active: settings.crowd,
                onSelect: () => onSettings({ crowd: true }),
              },
              {
                key: "off",
                label: t("screen.crowdOff"),
                active: !settings.crowd,
                onSelect: () => onSettings({ crowd: false }),
              },
            ]}
          />

          {/* How a highway is played. With tap on, a hit marker is also a control:
              a tap carries its own strum and any note under it plays, so a phone —
              which has no strum bar — can play. A key or a gamepad changes not at
              all, and a player who wants the pads decorative can say so here. */}
          <ToggleOption
            name={t("screen.tap")}
            hints={[t("screen.tapHint")]}
            choices={[
              {
                key: "on",
                label: t("screen.tapOn"),
                active: settings.tap,
                onSelect: () => onSettings({ tap: true }),
              },
              {
                key: "off",
                label: t("screen.tapOff"),
                active: !settings.tap,
                onSelect: () => onSettings({ tap: false }),
              },
            ]}
          />

          {/* How the necks are drawn. A *view*, not a rule: judging, columns and
              difficulty are the same either way, so this only changes the look — and
              the tilted neck shows more of the song before it arrives. */}
          <ToggleOption
            name={t("screen.view")}
            hints={[t("screen.viewHint")]}
            choices={HIGHWAY_VIEWS.map((option) => ({
              key: option,
              label: option === "flat" ? t("screen.viewFlat") : t("screen.view3d"),
              active: settings.view === option,
              onSelect: () => onSettings({ view: option }),
            }))}
          />

          {/* How a note is drawn. A *skin*, not a rule: the chart, the clock and the
              judging are the same bars, gems or arrows, so this only changes the look —
              and the instrument's own glyph still rides on bars and gems. */}
          <ToggleOption
            name={t("screen.noteStyle")}
            hints={[t("screen.noteStyleHint")]}
            choices={NOTE_STYLES.map((option) => ({
              key: option,
              label: t(NOTE_STYLE_LABELS[option]),
              active: settings.noteStyle === option,
              onSelect: () => onSettings({ noteStyle: option }),
            }))}
          />

          {/* How fast the neck moves. A range rather than a stepper: it is a feel
              across fifteen steps, and left/right on a focused range steps it —
              while the read-out says exactly what speed is chosen. Drawing only:
              the chart, the clock and the judging are the same at every speed. */}
          <RangeOption
            id="option-note-speed"
            name={t("screen.noteSpeed")}
            hints={[t("screen.noteSpeedHint")]}
            min={NOTE_SPEED_MIN}
            max={NOTE_SPEED_MAX}
            step={NOTE_SPEED_STEP}
            value={settings.noteSpeed}
            format={formatSpeed}
            onChange={(speed) => onSettings({ noteSpeed: snapNoteSpeed(speed) })}
          />

          {/* Who is playing with what. A player takes an instrument on the band
              screen; what they hold in their hands is theirs, and is remembered. */}
          <OptionRow
            className="option--players"
            name={t("screen.players")}
            hints={[t("screen.playersHint")]}
          >
            <ul className="seats">
              {plan.slots.map((slot, index) => (
                <li className="seat" key={index}>
                  <span className="seat__who">{t("band.player", { n: index + 1 })}</span>
                  <span
                    className={`seat__kind${
                      kindTone(slot.kind, slot.wordsMode) === "vocals" ? " is-vocals" : ""
                    }`}
                  >
                    {slot.active === false
                      ? t("screen.seatEmpty")
                      : isMelodyKind(slot.kind)
                      ? t("screen.seatWords")
                      : kindLabel(t, slot.kind, true, slot.role)}
                  </span>
                  {slot.active === false ? null : (
                    <span className="seat__device">
                      {deviceLabel(t, slot.kind, slot.controller)}
                    </span>
                  )}
                  {slot.active === false || isMelodyKind(slot.kind) ? null : (
                    <GearButton
                      label={t("screen.controllerFor", { n: index + 1 })}
                      onClick={() => setSetting(index)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </OptionRow>

          {/* The one row that is about the game as an app rather than a setting:
              keep it on this device. Hidden inside the native shell, which is
              already installed; iOS has instructions instead of a prompt. */}
          {install.status === "native" ? null : (
            <OptionRow
              className="option--install"
              name={t("screen.install")}
              hints={[
                install.status === "installed"
                  ? t("screen.installInstalled")
                  : install.status === "ios"
                    ? t("screen.installIos")
                    : install.status === "unsupported"
                      ? t("screen.installMenu")
                      : t("screen.installHint"),
                ...(install.message === "dismissed" ? [t("screen.installDismissed")] : []),
                ...(install.message === "failed" ? [t("screen.installFailed")] : []),
              ]}
            >
              {install.status === "available" ? (
                <div className="option__control">
                  <button
                    type="button"
                    className="band-btn band-btn--primary"
                    disabled={install.busy}
                    data-sound="select"
                    onClick={() => void install.prompt()}
                  >
                    {install.busy
                      ? t("screen.installOpening")
                      : t("screen.installAction")}
                  </button>
                </div>
              ) : install.status === "installed" ? (
                <output className="option__value" aria-label={t("screen.installInstalled")}>
                  ✓
                </output>
              ) : null}
            </OptionRow>
          )}
        </div>
      </div>

      {/* One player's controller, over the page — the same dialog the band screen
          uses, so a mapping learned in either place is the same mapping. */}
      {setting !== null && plan.slots[setting] && plan.slots[setting].active !== false ? (
        <SlotSettings
          plan={plan}
          index={setting}
          slot={plan.slots[setting]}
          /* No song is on stage here, so there are no columns to hold a mapping to:
             the preset's own count is what a learn session asks for. */
          columns={null}
          /* And nothing is being sung — the words are the song's to decide, which is
             why a words seat has no gear to open. */
          hasPitch={false}
          onController={(controller) => setSlot(setting, { controller })}
          onClose={() => setSetting(null)}
        />
      ) : null}

      {/* The measured lag, over the page. The row that opened it decides whether it
          starts on Sound or Picture; each writes its own setting, and the dialog's
          own graph or animation is closed when it goes. */}
      {calibrating ? (
        <Suspense fallback={null}>
          <CalibrationDialog
            initialMode={calibrating}
            onSettings={onSettings}
            onClose={() => setCalibrating(null)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

/**
 * One row of the options page: the name and hints on one side, the control on the
 * other. The control is whatever the row is — a stepper, a pair of buttons, a
 * range — so the row only draws the section around it.
 */
function OptionRow({
  name,
  hints = [],
  className,
  children,
}: {
  /** The row's name; a `<label>` when the control is a field. */
  name: ReactNode;
  hints?: string[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className ? `option ${className}` : "option"}>
      <div className="option__text">
        <h3 className="option__name">{name}</h3>
        {hints.map((hint) => (
          <p className="option__hint" key={hint}>
            {hint}
          </p>
        ))}
      </div>
      {children}
    </section>
  );
}

/**
 * The measured-lag stepper: earlier and later around the value, with the measured
 * Calibrate beside it. Both lag rows are this, because both are one setting with two
 * ways in — the stepper and the dialog — and the limit is the same on each.
 */
function LagOption({
  name,
  hints,
  value,
  limit,
  format,
  calibrateLabel,
  defaultFocus = false,
  onStep,
  onCalibrate,
}: {
  name: string;
  hints: string[];
  value: number;
  /** How far the setting may go either way. */
  limit: number;
  format: (value: number) => string;
  /** The Calibrate button's accessible name, when the visible word is not enough. */
  calibrateLabel?: string;
  /** Put the screen's default focus on the "earlier" step. */
  defaultFocus?: boolean;
  onStep: (direction: -1 | 1) => void;
  onCalibrate: () => void;
}) {
  const t = useT();
  const earliest = value <= -limit;
  const latest = value >= limit;
  return (
    <OptionRow name={name} hints={hints}>
      <div className="option__control option__control--lag" role="group" aria-label={name}>
        <LagStep
          direction={-1}
          blocked={earliest}
          label={t("screen.lagEarlier")}
          defaultFocus={defaultFocus}
          onStep={onStep}
        />
        <output className="option__value" aria-live="polite" aria-atomic="true">
          {format(value)}
        </output>
        <LagStep
          direction={1}
          blocked={latest}
          label={t("screen.lagLater")}
          onStep={onStep}
        />
        <button
          type="button"
          className="option__calibrate band-btn"
          aria-label={calibrateLabel}
          aria-haspopup="dialog"
          data-sound="open"
          onClick={onCalibrate}
        >
          {t("screen.calibrate")}
        </button>
      </div>
    </OptionRow>
  );
}

/** One direction of a lag stepper. At the limit it refuses rather than vanishes. */
function LagStep({
  direction,
  blocked,
  label,
  defaultFocus = false,
  onStep,
}: {
  direction: -1 | 1;
  blocked: boolean;
  label: string;
  defaultFocus?: boolean;
  onStep: (direction: -1 | 1) => void;
}) {
  return (
    <button
      type="button"
      className="option__step"
      aria-label={label}
      aria-disabled={blocked}
      data-nav-default={defaultFocus ? "true" : undefined}
      data-sound={blocked ? "refuse" : "select"}
      onClick={() => {
        if (!blocked) onStep(direction);
      }}
    >
      {direction === -1 ? "−" : "+"}
    </button>
  );
}

/** One choice in a segmented group. */
interface ToggleChoice {
  key: string;
  label: string;
  active: boolean;
  onSelect: () => void;
}

/**
 * A segmented row: one button per choice, the active one carrying `is-active`.
 * Pairs and longer groups are the same control, because they are the same question —
 * which of these is on — with more than two answers.
 */
function ToggleOption({
  name,
  hints,
  choices,
}: {
  name: string;
  hints: string[];
  choices: ToggleChoice[];
}) {
  return (
    <OptionRow name={name} hints={hints}>
      <div className="option__control" role="group" aria-label={name}>
        {choices.map((choice) => (
          <button
            key={choice.key}
            type="button"
            className={choice.active ? "slot__option is-active" : "slot__option"}
            aria-pressed={choice.active}
            data-sound="select"
            onClick={choice.onSelect}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </OptionRow>
  );
}

/** A labelled range with the value beside it: the same read-out in both places. */
function RangeOption({
  id,
  name,
  hints,
  min,
  max,
  step,
  value,
  format,
  onChange,
}: {
  id: string;
  name: string;
  hints: string[];
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <OptionRow name={<label htmlFor={id}>{name}</label>} hints={hints}>
      <div className="option__control">
        <input
          id={id}
          className="option__range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-valuetext={format(value)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="option__value">{format(value)}</span>
      </div>
    </OptionRow>
  );
}

/** A percentage as it reads, `80%`. */
function formatPercent(value: number): string {
  return `${value}%`;
}

/** A note speed as it reads: one decimal and a multiplier sign, `1.0×`. */
function formatSpeed(speed: number): string {
  return `${speed.toFixed(1)}×`;
}

/** What a seat holds, in the words of the screen. */
function deviceLabel(t: Translate, kind: PlayerKind, controller: Controller | undefined): string {
  if (isMelodyKind(kind)) return t("screen.seatWordsDevice");
  // Nothing chosen is not the machine: it is the preset for their place, which is
  // what the input route falls back on.
  if (!controller) return t("screen.mappingPreset");
  if (controller.on === "pad") return t("band.padOn", { n: controller.index + 1 });
  if (controller.on === "midi") return t("screen.deviceMidi");
  if (controller.on === "keyboard") return t("screen.deviceKeyboard");
  return t("screen.deviceMachine");
}
