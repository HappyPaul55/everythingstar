/**
 * The band, remembered between visits.
 *
 * A jukebox should know who is on stage from one song to the next: walking back
 * to the band screen to an empty stage every time would be its own small betrayal.
 * So the plan is kept in this browser's storage — no account, and the same "local
 * for now" decision as the score board. Everything except the two storage calls is
 * pure, so an untrusted store cannot put a broken band on stage.
 */

import { DIFFICULTIES, isLaneRole, type Difficulty } from "../track";
import { isMidiHole } from "../controls/layout";
import type {
  Controller,
  KeyLayout,
  MidiControl,
  MidiLayout,
  PadControl,
  PadLayout,
} from "../controls/layout";
import { MAX_PLAYERS, PLAYER_KINDS, firstBand, type BandPlan, type BandSlot, type PlayerKind } from "./types";

const STORAGE_KEY = "everythingstar:band";

/** Read a plan out of stored JSON. Anything unreadable is the first band. */
export function parsePlan(raw: string | null): BandPlan {
  if (!raw) return firstBand();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return firstBand();
    const value = parsed as Partial<BandPlan>;
    return { slots: parseSlots(value.slots) };
  } catch {
    return firstBand();
  }
}

/** The slots a plan can be held to: known kinds, known difficulties, capped. */
function parseSlots(value: unknown): BandSlot[] {
  if (!Array.isArray(value)) return [];
  const slots: BandSlot[] = [];
  for (const entry of value.slice(0, MAX_PLAYERS)) {
    if (typeof entry !== "object" || entry === null) {
      slots.push({ kind: "guitar", difficulty: "normal", active: false });
      continue;
    }
    const slot = entry as Partial<BandSlot>;
    if (!isKind(slot.kind)) {
      slots.push({ kind: "guitar", difficulty: "normal", active: false });
      continue;
    }
    if (slot.active === false) {
      slots.push({ kind: "guitar", difficulty: "normal", active: false });
      continue;
    }
    const controller = parseController(slot.controller);
    // A role is a guitar's alone, and only one of the two the band screen offers.
    const role =
      slot.kind === "guitar" && isLaneRole(slot.role) ? slot.role : undefined;
    slots.push({
      kind: slot.kind,
      ...(role ? { role } : {}),
      difficulty: isDifficulty(slot.difficulty) ? slot.difficulty : "normal",
      ...(slot.kind === "words" && isWordsMode(slot.wordsMode)
        ? { wordsMode: slot.wordsMode }
        : {}),
      ...(controller ? { controller } : {}),
    });
  }
  return slots;
}

/**
 * A controller a player set up, held to what a controller can be. A mapping is a
 * table of key codes or button numbers, so it is parsed a field at a time and
 * dropped whole if it does not hold together — a half-learned mapping is worse
 * than none, since it would leave notes with no way to play them.
 */
function parseController(value: unknown): Controller | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const controller = value as Partial<Controller> & Record<string, unknown>;
  if (controller.on === "keyboard") {
    const layout = Number.isInteger(controller.layout) ? Number(controller.layout) : 0;
    const keys = parseKeyLayout(controller.keys);
    return keys
      ? { on: "keyboard", layout, keys }
      : { on: "keyboard", layout };
  }
  if (controller.on === "pad") {
    if (!Number.isInteger(controller.index) || Number(controller.index) < 0) return undefined;
    const buttons = parsePadLayout(controller.buttons);
    return buttons
      ? { on: "pad", index: Number(controller.index), buttons }
      : { on: "pad", index: Number(controller.index) };
  }
  if (controller.on === "midi") {
    const index =
      Number.isInteger(controller.index) && Number(controller.index) >= 0
        ? Number(controller.index)
        : undefined;
    const notes = parseMidiLayout(controller.notes);
    return {
      on: "midi",
      ...(index === undefined ? {} : { index }),
      ...(notes ? { notes } : {}),
    };
  }
  if (controller.on === "chars" || controller.on === "mic" || controller.on === "none") {
    return { on: controller.on };
  }
  return undefined;
}

function parseKeyLayout(value: unknown): KeyLayout | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const layout = value as Partial<KeyLayout>;
  const frets = codeList(layout.frets);
  const strum = codeList(layout.strum);
  if (frets.length === 0 || typeof layout.whammy !== "string" || !layout.whammy) {
    return undefined;
  }
  return { frets, strum, whammy: layout.whammy };
}

function parsePadLayout(value: unknown): PadLayout | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const layout = value as Partial<PadLayout>;
  const frets = buttonList(layout.frets);
  const strum = padControlList(layout.strum);
  if (frets.length === 0 || !buttonList([layout.whammy]).length) return undefined;
  return { frets, strum, whammy: Number(layout.whammy) };
}

/**
 * A pad's strum controls, held to what a control can be: a button index, or an
 * axis and one of its two directions. An old numeric mapping is a button, as it
 * always was; an axis with a negative index, a fractional direction or a missing
 * direction is not a control and is dropped rather than guessed at.
 */
function padControlList(value: unknown): PadControl[] {
  if (!Array.isArray(value)) return [];
  const controls: PadControl[] = [];
  for (const entry of value) {
    if (Number.isInteger(entry) && Number(entry) >= 0) {
      controls.push(Number(entry));
      continue;
    }
    if (typeof entry !== "object" || entry === null) continue;
    const axis = entry as { axis?: unknown; direction?: unknown };
    if (!Number.isInteger(axis.axis) || Number(axis.axis) < 0) continue;
    if (axis.direction !== 1 && axis.direction !== -1) continue;
    controls.push({ axis: Number(axis.axis), direction: axis.direction });
  }
  return controls;
}

/**
 * A learned MIDI mapping, held to notes and control changes. A whammy may be
 * `null` (the player skipped it, or their kit has no spare pad); it may not be a
 * control outside 0–127. A fret of `-1` is the hole a skipped column leaves, and it
 * keeps its place so the columns after it are not shifted. The frets are what make
 * a mapping usable at all, so a layout with none is dropped whole rather than
 * half-kept.
 */
function parseMidiLayout(value: unknown): MidiLayout | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const layout = value as Partial<MidiLayout>;
  const frets = midiControlList(layout.frets, true);
  if (!frets.some((control) => !isMidiHole(control))) return undefined;
  const wave = midiControlList([layout.whammy], false)[0];
  return { frets, strum: midiControlList(layout.strum, false), whammy: wave ?? null };
}

/**
 * MIDI controls are 0–127 and nothing else: a note number, or a control change
 * tagged `{ cc }`. An old numeric mapping is a note, as it always was, and a fret
 * may also be `-1`, the hole a skipped step leaves. Anything else is not a control
 * and is dropped rather than guessed at.
 */
function midiControlList(value: unknown, hole: boolean): MidiControl[] {
  if (!Array.isArray(value)) return [];
  const controls: MidiControl[] = [];
  for (const entry of value) {
    const control = midiControl(entry, hole);
    if (control !== undefined) controls.push(control);
  }
  return controls;
}

function midiControl(value: unknown, hole: boolean): MidiControl | undefined {
  if (hole && value === -1) return -1;
  if (Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 127) {
    return Number(value);
  }
  if (typeof value !== "object" || value === null) return undefined;
  const cc = (value as { cc?: unknown }).cc;
  if (Number.isInteger(cc) && Number(cc) >= 0 && Number(cc) <= 127) {
    return { cc: Number(cc) };
  }
  return undefined;
}

function codeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  // Keep a hole's **position**: a learned mapping that skipped one fret must not
  // slide every key after it one column left. Trailing holes carry nothing, so they
  // are trimmed rather than kept.
  const codes = value.map((code) => (typeof code === "string" ? code : ""));
  while (codes.length > 0 && codes[codes.length - 1] === "") codes.pop();
  return codes;
}

function buttonList(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter(
        (button): button is number => Number.isInteger(button) && Number(button) >= 0,
      )
    : [];
}

function isKind(value: unknown): value is PlayerKind {
  return PLAYER_KINDS.includes(value as PlayerKind);
}

function isDifficulty(value: unknown): value is Difficulty {
  return DIFFICULTIES.includes(value as Difficulty);
}

function isWordsMode(value: unknown): value is "sing" | "type" {
  return value === "sing" || value === "type";
}

/** The remembered band, read from this browser. */
export function loadPlan(): BandPlan {
  try {
    return parsePlan(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return firstBand();
  }
}

/** Remember the band. Storage being unavailable is not worth failing a change over. */
export function savePlan(plan: BandPlan): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  } catch {
    // A full or blocked store just means the band is not remembered.
  }
}
