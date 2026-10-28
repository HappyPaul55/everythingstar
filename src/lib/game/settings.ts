/**
 * The game's settings: the few things that are a player's rather than a song's.
 *
 * There are three kinds of local state in this build and they are kept apart on
 * purpose. **The band** (`band/store.ts`) is who is playing and what they hold, and it
 * is per seat. **The board** (`scores.ts`) is what came of it, and it is per song. This
 * is how the game behaves for whoever is at the browser — the smallest of the three, and
 * the only one that is not about a particular song or player.
 *
 * None of them needs an account, and like the other two, everything here except the two
 * storage calls is pure: an unreadable store cannot put a value the game cannot use in
 * front of a player.
 */

import { AUDIBLE_FLOOR, CHANNEL_LEVEL, type ChannelLevels } from "./audio/mix";
import { clamp, clamp01 } from "./math";

const STORAGE_KEY = "everythingstar:settings";

/** One press of the lag stepper. Fine enough to feel, coarse enough to hit. */
export const LAG_STEP_MS = 5;

/** The most lag a player can ask for, either way. Past this it is not calibration. */
export const LAG_LIMIT_MS = 300;

/** The note-speed control's ends, as a multiplier on the highway's own run-up. */
export const NOTE_SPEED_MIN = 0.5;
export const NOTE_SPEED_MAX = 2;
/** One step of the speed control: a tenth, so the read-out is always one decimal. */
export const NOTE_SPEED_STEP = 0.1;

/** The backdrop dim's ends: not at all, to most of the way down. */
export const BACKDROP_DIM_MAX = 0.8;
/** One step of the dim control: a twentieth, so 0–80% reads in 5% jumps. */
export const BACKDROP_DIM_STEP = 0.05;

/**
 * How a highway is drawn. **flat** is the neck seen face-on: buttons on a fretboard,
 * in the site's own colours. **3d** tilts the same neck into perspective, so its
 * columns converge toward the song and each note sits on it as a block.
 *
 * It is a *view*, not a rule: judging, columns and difficulty are identical either
 * way, so a player can pick whichever reads better on their screen.
 */
export type HighwayView = "flat" | "3d";

/** The views, in the order the settings page offers them. */
export const HIGHWAY_VIEWS: HighwayView[] = ["3d", "flat"];

/**
 * How a highway's **notes** are drawn. **bars** is a flat button, **gems**
 * is a rounded head on a tail, and **arrows** makes the glyph the note —
 * a dance mat's four directions, or a five-panel layout on a five-column chart.
 *
 * A skin, not a rule: the chart, the clock, the hit window and the judging are
 * identical in all three, and the instrument's own glyph still rides on bars and
 * gems (a mat's arrows).
 */
export type NoteStyle = "bars" | "gems" | "arrows";

/** The note styles, in the order the settings page offers them. */
export const NOTE_STYLES: NoteStyle[] = ["bars", "gems", "arrows"];

export interface Settings {
  /**
   * How far behind the notes the **sound** arrives, in milliseconds — the audio offset
   * every rhythm game has, for the soundbars and headphones that add a delay of their
   * own. Positive is the usual direction: the player hears the song late.
   *
   * It is read where the song's own audio meets the clock (`SongAudio` hands the
   * playhead to the sound, and the lag is what the playhead is read *against*). A song
   * with no audio of its own leaves the frame loop in charge and the lag moves nothing,
   * which is the same "wired and silent" the mixer's missing files are.
   */
  audioLagMs: number;
  /**
   * How late the **picture** is relative to the sound, in milliseconds. Positive
   * means the display lags the audio — a television or a projector that shows a
   * frame a little after it is asked to. The highway and the melody roll are then
   * drawn that many milliseconds **ahead** of the audio clock, so a note reaches
   * the hit line when it is heard rather than when the screen catches up.
   *
   * It is read only where the scrolling note layers are drawn (`useScrollTrack`).
   * The clock, judging, scoring, the song progress bar and the lyrics' active-word
   * timing are untouched: a player is judged against the sound, and only the
   * picture moves to meet it.
   */
  visualLagMs: number;
  /**
   * The master fader, `AUDIBLE_FLOOR`..1. The family levels sit under it; nothing
   * sits above it. It never reaches zero — see `masterVolume`.
   */
  volume: number;
  /**
   * How loud each family sits under the master, 0..1: **music** (the menu beds and
   * the song's own stems), **ambience** (the room under a song) and **sound
   * effects** (clicks, stings and a run's feedback).
   *
   * They start at the mixer's own `CHANNEL_LEVEL`, and a player changes one family
   * without moving the others. The master is still the one fader above them; these
   * are the balance it sits on.
   */
  levels: ChannelLevels;
  /**
   * Whether the song's own vocal stem plays **even while somebody is singing it**.
   *
   * Off is the karaoke the game has always been: a singer *is* the voice, so the
   * guide vocal is held out for the whole run. On keeps it in, which is the only way
   * a singer hears their own misses — the part dropping out and coming back by the
   * song's `audioControl` rule. A typist, and Listen, always keep it.
   */
  guideVocal: boolean;
  /** Whether the stage plays a song's own backdrop when it has one. */
  video: boolean;
  /** Which way the necks are drawn: face-on buttons, or tilted into perspective. */
  view: HighwayView;
  /**
   * How the notes on the necks are drawn: flat bars, rounded gems, or arrows. It is
   * **drawing** like the view — the chart, the clock, the hit window and the judging
   * never see it — so a player can pick whichever reads best on their screen.
   */
  noteStyle: NoteStyle;
  /**
   * How fast notes travel, as a multiplier on the highway's own run-up. `1` is the
   * speed the game has always used; higher means **less song across the neck** at
   * once, so what is coming arrives sooner.
   *
   * It is a **drawing** setting. The chart, the clock and the hit window are the
   * same at every speed, so a note is judged at the same moment whether the neck
   * holds four seconds of song or two. `noteWindowSeconds` is the one place that
   * turns it into the run-up a highway draws.
   */
  noteSpeed: number;
  /**
   * How far the **backdrop** is dimmed, 0..0.8, for playing over bright footage. It
   * dims what the stage sits in front of — a song's video, its art, or the game's own
   * artwork — and never the notes or the panels, which carry their own contrast.
   */
  backdropDim: number;
  /**
   * Whether the room's drifting decorative lights are drawn. Off leaves a still
   * backdrop for anyone the movement distracts; the lights are decoration either
   * way, and reduced motion still stops them.
   */
  flares: boolean;
  /**
   * Whether the **room's crowd** plays while the run is **paused**: the murmur of a
   * venue, on the ambience channel, so a pause feels like standing in the room rather
   * than in silence. It is the pause menu's alone — never a crowd over the song, and
   * the menus and jukebox have none. Off leaves the pause silent.
   */
  crowd: boolean;
  /**
   * Whether the **hit markers are controls**. With it on, tapping a pad plays the
   * note under that column: a tap carries its own strum, so a hopo needs no thought,
   * and the taps of one chord only have to land within a moment of each other. It is
   * the way to play on a phone, where there is no strum bar; off leaves the pads as
   * markers and the keyboard or gamepad as the only way in.
   */
  tap: boolean;
  /**
   * Whether a miss and a spent star power are **felt** — a short buzz on the device,
   * and a stronger pattern on the gamepad that seat is holding where the pad can
   * rumble (`haptics.ts`). It is feedback beside the run, never a judging rule: it
   * changes no note, no score and no cue.
   *
   * A browser without `navigator.vibrate`, a pad with no actuator and an iOS
   * device that will not vibrate are all simply silent. Off is silence everywhere.
   */
  haptics: boolean;
  /**
   * Whether the game **holds the screen on** while a run is moving — the browser's
   * Screen Wake Lock, asked for on the countdown and the run and let go on the pause,
   * the results and every page (`wakeLock.ts`).
   *
   * The installed app's own boot keeps the display awake, so the hook is skipped
   * inside the native shell. A browser without the API, or one saving battery, is
   * simply a screen that sleeps as it always did.
   */
  keepAwake: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  audioLagMs: 0,
  // The picture starts with the sound until a display says otherwise.
  visualLagMs: 0,
  volume: 1,
  // The mixer's own balance, which is where a session starts. A player can move
  // one family without the others, and the master stays above all three.
  levels: { ...CHANNEL_LEVEL },
  // Karaoke unless asked otherwise: a singer is the voice, so the song's own vocal
  // is not played under them. On keeps it in, so their own misses can be heard.
  guideVocal: false,
  video: true,
  // The tilted neck is the default: it shows more of what is coming, and a player
  // who prefers the face-on board can choose it in Options.
  view: "3d",
  // Bars are the note the game has always drawn; the other two are a player's choice.
  noteStyle: "bars",
  // The neck's own run-up is the speed the game has always had. Faster is a comfort
  // choice, not a difficulty: it moves the drawing and nothing else.
  noteSpeed: 1,
  // Undimmed until somebody is playing over footage too bright to read against.
  backdropDim: 0,
  // The room drifts until a player would rather it stood still.
  flares: true,
  // A quiet venue belongs to the pause, not the song. On unless somebody would
  // rather wait in silence; only the pause asks for it.
  crowd: true,
  // Tapping is on by default: it is the only way a phone can play a highway, and it
  // changes nothing about the keys or a gamepad. A player who would rather the pads
  // stayed decorative turns it off in Options.
  tap: true,
  // A buzz is feedback a player can feel without looking away, and a device or pad
  // that cannot do it says nothing. On by default, and quiet on every device that
  // will not.
  haptics: true,
  // A four-minute song is longer than a phone's default sleep. On by default; the
  // native shell skips it because its own boot already keeps the display awake.
  keepAwake: true,
};

/**
 * A number held to whole steps between two ends. The one rule behind every control
 * whose value is a step rather than a free number, so the store, the page and the
 * drawing cannot disagree about what a legal value is.
 */
function snapStep(
  value: number,
  step: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  // A decimal step is not exact in binary: nudge a value sitting on a boundary
  // before rounding, or 1.05 / 0.1 lands at 10.4999… and steps down.
  const units = Math.round(value / step + 1e-9);
  const stepped = Number((units * step).toFixed(4));
  return clamp(stepped, min, max);
}

/** Lag, held to whole steps inside the limit. */
export function snapLag(ms: number): number {
  return snapStep(ms, LAG_STEP_MS, -LAG_LIMIT_MS, LAG_LIMIT_MS, 0);
}

/** Note speed, held to its tenths between half and double. */
export function snapNoteSpeed(speed: number): number {
  return snapStep(
    speed,
    NOTE_SPEED_STEP,
    NOTE_SPEED_MIN,
    NOTE_SPEED_MAX,
    DEFAULT_SETTINGS.noteSpeed,
  );
}

/** Backdrop dim, held to its twentieths between none and the limit. */
export function snapBackdropDim(dim: number): number {
  return snapStep(
    dim,
    BACKDROP_DIM_STEP,
    0,
    BACKDROP_DIM_MAX,
    DEFAULT_SETTINGS.backdropDim,
  );
}

/**
 * One family's level, held between silence and full. A value that is not a number
 * falls back to `fallback` — a broken store must not put `NaN` on a gain node.
 */
export function snapLevel(level: number, fallback: number): number {
  return Number.isFinite(level) ? clamp01(level) : fallback;
}

/**
 * The master fader, floored so it can never be zero.
 *
 * The song's stems are **media elements**, and an element at `volume = 0` leaves the
 * browser's audio clock and free-runs (`AUDIBLE_FLOOR` in the mixer has the
 * measurements). So a fader dragged to nothing lands on the floor instead: about
 * −60 dB, which nobody can hear and which keeps every stem on the song's clock. This
 * is the one place a fader's value is settled, so a stored zero, a live drag and a
 * patch all agree.
 */
export function masterVolume(value: number): number {
  // A broken value is silence rather than full scale: nothing about a fader that
  // cannot be read should make the game loud.
  const level = Number.isFinite(value) ? clamp01(value) : 0;
  return Math.max(AUDIBLE_FLOOR, level);
}

/**
 * A fresh copy of the defaults, **including the nested family levels**. Every early
 * return in `parseSettings` goes through this, so a caller that edits what it was
 * handed cannot change the defaults for the next caller.
 */
function defaults(): Settings {
  return { ...DEFAULT_SETTINGS, levels: { ...DEFAULT_SETTINGS.levels } };
}

/** The family levels out of stored JSON, one family at a time. */
function parseLevels(raw: unknown): ChannelLevels {
  const stored =
    typeof raw === "object" && raw !== null
      ? (raw as Partial<Record<keyof ChannelLevels, unknown>>)
      : {};
  const one = (family: keyof ChannelLevels): number => {
    const value = stored[family];
    return typeof value === "number"
      ? snapLevel(value, CHANNEL_LEVEL[family])
      : CHANNEL_LEVEL[family];
  };
  return { music: one("music"), ambience: one("ambience"), sfx: one("sfx") };
}

/** One press of the stepper: `direction` is `1` for later, `-1` for earlier. */
export function stepLag(ms: number, direction: number): number {
  return snapLag(ms + (direction < 0 ? -LAG_STEP_MS : LAG_STEP_MS));
}

/** A lag as it reads: signed, in milliseconds. `0 ms` is the sound with the notes. */
export function formatLag(ms: number): string {
  return ms > 0 ? `+${ms} ms` : `${ms} ms`;
}

/** A note speed as it reads: one decimal and a multiplier sign, `1.0×`. */
export function formatNoteSpeed(speed: number): string {
  return `${speed.toFixed(1)}×`;
}

/** Read settings out of stored JSON. Anything unreadable is the default. */
export function parseSettings(raw: string | null): Settings {
  if (!raw) return defaults();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return defaults();
    const value = parsed as Partial<Settings>;
    return {
      audioLagMs:
        typeof value.audioLagMs === "number"
          ? snapLag(value.audioLagMs)
          : DEFAULT_SETTINGS.audioLagMs,
      visualLagMs:
        typeof value.visualLagMs === "number"
          ? snapLag(value.visualLagMs)
          : DEFAULT_SETTINGS.visualLagMs,
      volume:
        typeof value.volume === "number" && Number.isFinite(value.volume)
          ? masterVolume(value.volume)
          : DEFAULT_SETTINGS.volume,
      levels: parseLevels(value.levels),
      guideVocal:
        typeof value.guideVocal === "boolean"
          ? value.guideVocal
          : DEFAULT_SETTINGS.guideVocal,
      video: typeof value.video === "boolean" ? value.video : DEFAULT_SETTINGS.video,
      view: HIGHWAY_VIEWS.includes(value.view as HighwayView)
        ? (value.view as HighwayView)
        : DEFAULT_SETTINGS.view,
      noteStyle: NOTE_STYLES.includes(value.noteStyle as NoteStyle)
        ? (value.noteStyle as NoteStyle)
        : DEFAULT_SETTINGS.noteStyle,
      noteSpeed:
        typeof value.noteSpeed === "number"
          ? snapNoteSpeed(value.noteSpeed)
          : DEFAULT_SETTINGS.noteSpeed,
      backdropDim:
        typeof value.backdropDim === "number"
          ? snapBackdropDim(value.backdropDim)
          : DEFAULT_SETTINGS.backdropDim,
      flares:
        typeof value.flares === "boolean" ? value.flares : DEFAULT_SETTINGS.flares,
      crowd:
        typeof value.crowd === "boolean" ? value.crowd : DEFAULT_SETTINGS.crowd,
      tap: typeof value.tap === "boolean" ? value.tap : DEFAULT_SETTINGS.tap,
      haptics:
        typeof value.haptics === "boolean"
          ? value.haptics
          : DEFAULT_SETTINGS.haptics,
      keepAwake:
        typeof value.keepAwake === "boolean"
          ? value.keepAwake
          : DEFAULT_SETTINGS.keepAwake,
    };
  } catch {
    return defaults();
  }
}

/** The settings this browser remembers. */
export function loadSettings(): Settings {
  try {
    return parseSettings(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaults();
  }
}

/** Remember the settings. A blocked store just means they are not kept. */
export function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage being unavailable is not worth failing a change over.
  }
}
