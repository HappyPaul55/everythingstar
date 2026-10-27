import { KICK_COLUMN, strums, type InstrumentKind } from "../track";

/**
 * Controllers as data.
 *
 * A **layout** is one controller's controls and what each of them means: which
 * control is which fret, which is the strum, and which waves the whammy. Layouts
 * are tables, so a machine is an entry rather than a branch — and a player's own
 * mapping is the same shape as the preset, so nothing downstream knows the
 * difference.
 *
 * Keys bind by **code** (`"KeyA"`) and not by the character they type. A fret is
 * where the finger is, so an AZERTY player gets the same physical five as
 * everybody else; a typist types **characters**, which is the other way round and
 * lives in `typing.ts`. `keyCode` folds the left and right of a pair into one key,
 * so a layout can say "Shift" once. A **MIDI** control binds by **note number**
 * (`60`) or by **controller number** (`{ cc: 64 }`), because that is what a message
 * carries, and neither is a key code.
 *
 * A fret layout **reaches** further than the five a guitar needs, and a chart
 * decides how much of it is used: `keysFor` cuts the layout to the chart's
 * columns (and `midiFrets` does the same for a note map). That is the same rule as
 * everywhere else — **the lane count comes from the chart** — so a three-column
 * chart is three keys, and nothing here knows how many a song has.
 */

/** What one control means to the game, once a layout has named it. */
export type Action =
  | { type: "fret"; column: number }
  | { type: "strum" }
  | { type: "whammy" };

/** One keyboard's controls, by `KeyboardEvent.code`. */
export interface KeyLayout {
  /** The fret keys, left to right, as far as the hand reaches. */
  frets: string[];
  /** The strum keys. Empty on an instrument whose notes are tapped. */
  strum: string[];
  /** The key that waves while a note is held. */
  whammy: string;
}

/**
 * One way of moving a gamepad's axis: the axis index and which way is pressed.
 * A spring-return strum bar reports the same axis both ways, so a direction is
 * part of the control rather than a second axis.
 */
export interface PadAxis {
  axis: number;
  direction: 1 | -1;
}

/**
 * One gamepad control: a **button** by the standard mapping's index, or an
 * **axis** and a direction. It is tagged rather than a bare number because axis 0
 * and button 0 are different controls, and a mapping that confused them would
 * bind the left stick to a fret.
 */
export type PadControl = number | PadAxis;

/** Whether a control is an axis rather than a button. */
export function isPadAxis(control: PadControl): control is PadAxis {
  return typeof control !== "number";
}

/** One gamepad's controls, by the standard mapping's button index. */
export interface PadLayout {
  frets: number[];
  /** The strum bar: two buttons, or one axis's two directions. */
  strum: PadControl[];
  whammy: number;
}

/**
 * One MIDI control: a **note** by number (0–127), or a **control change** by
 * controller number (0–127).
 *
 * It is tagged rather than a bare number because note 64 and CC 64 are different
 * controls, and a mapping that confused them would bind a hi-hat pedal to a fret
 * nobody pressed. A plain number is a note, which is what every map written before
 * control changes were playable says.
 */
export type MidiControl = number | { cc: number };

/**
 * One MIDI input's controls, by **note** or **control change**.
 *
 * A MIDI message carries a note or a controller and a channel, not a key code or a
 * button, so the layout is those numbers themselves. `whammy` may be `null`: a drum
 * kit has no wave bar, and a control nobody assigned is a control that does not
 * exist rather than a made-up one. A fret of `-1` is a hole the player skipped.
 */
export interface MidiLayout {
  frets: MidiControl[];
  strum: MidiControl[];
  whammy: MidiControl | null;
}

/**
 * What a player plays with.
 *
 * A controller is a **device** and, when the player has set one up, the
 * **mapping** they learned for it: their own keys, their own buttons, or their own
 * notes. Without a mapping the device's own preset is used — the left- or
 * right-hand five for the keyboard, the standard mapping for a pad, the chromatic
 * run for MIDI — so a player who never opens the settings plays exactly as they
 * did before there was one.
 */
export type Controller =
  /** The one keyboard: their own keys, or the preset for their place. */
  | { on: "keyboard"; layout: number; keys?: KeyLayout }
  /** A gamepad by its index: the standard buttons, or the ones they learned. */
  | { on: "pad"; index: number; buttons?: PadLayout }
  /**
   * A MIDI input: every connected input is one bus, and `index` is the input the
   * seat was set up on (for the gear's own read-out), not a filter. `notes` is the
   * mapping they learned.
   */
  | { on: "midi"; index?: number; notes?: MidiLayout }
  /** Every character that is typed, whichever keys they are — a typist. */
  | { on: "chars" }
  /** The microphone, one between every singer. */
  | { on: "mic" }
  /** Played by the machine: a controller like any other, and nobody's hands. */
  | { on: "none" };

/**
 * Which family of controls an instrument is played with. The instrument's own kit
 * already says whether its notes are strummed (`strums`), so only the dance mat
 * is a special case: it is tapped like a keyboard, but it is played with arrows.
 */
export type LayoutFamily = "strum" | "tap" | "dance";

export function layoutFamily(kind: InstrumentKind): LayoutFamily {
  if (kind === "dance") return "dance";
  return strums(kind) ? "strum" : "tap";
}

/**
 * Two players can share one keyboard if they take different keys, so every family
 * carries a layout per player place: the left hand's five and its strum, then the
 * right hand's. A third player of the same instrument takes the first layout
 * again — one keyboard cannot tell two people apart, and `plan.ts` says so out
 * loud rather than pretending otherwise.
 */
export const KEY_LAYOUTS: Record<LayoutFamily, KeyLayout[]> = {
  // A guitar, a bass or a drum kit: frets under one hand, a strum under the other.
  strum: [
    {
      frets: ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyT", "KeyY"],
      strum: ["ArrowUp", "ArrowDown"],
      whammy: "ShiftLeft",
    },
    {
      frets: ["KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "KeyU", "KeyI"],
      strum: ["ArrowLeft", "ArrowRight"],
      whammy: "ControlLeft",
    },
  ],
  // Keys: the same row of notes, tapped rather than strummed.
  tap: [
    {
      frets: ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyT", "KeyY"],
      strum: [],
      whammy: "ShiftLeft",
    },
    {
      frets: ["KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "KeyU", "KeyI"],
      strum: [],
      whammy: "ControlLeft",
    },
  ],
  // A mat: four directions, and four is all a mat has.
  dance: [
    { frets: ["ArrowLeft", "ArrowUp", "ArrowDown", "ArrowRight"], strum: [], whammy: "ShiftLeft" },
    { frets: ["KeyA", "KeyW", "KeyS", "KeyD"], strum: [], whammy: "ControlLeft" },
  ],
};

/**
 * A gamepad, in the standard mapping: the five frets across the shoulder and face
 * buttons, the D-pad's up and down as the two ways of a strum bar, and the right
 * trigger as the whammy. A real guitar or drum kit presents itself as a gamepad
 * too, so this is the layout a plastic instrument lands on — and where its own
 * buttons differ, a remapping is another entry here.
 *
 * The **sixth fret** (the left trigger) is the drum kit's **kick pedal**. A
 * five-column chart never reaches it — `padFrets` slices to the chart's own
 * columns — so a guitar is exactly what it was, and a drum kit has a button for
 * the column under the foot.
 */
export const PAD_LAYOUT: PadLayout = {
  frets: [4, 2, 0, 1, 5, 6],
  strum: [12, 13],
  whammy: 7,
};

/**
 * A MIDI controller, unlearned: **middle C and the six notes above it**.
 *
 * The preset is a chromatic run rather than General MIDI's drum map on purpose.
 * A MIDI note is a *note*, and the one thing every keyboard sends without being
 * configured is C4 and the notes beside it; a drum kit's pads are not standard —
 * GM says which *sound* a note makes, not which of a song's four columns a pad
 * means — and a kit is set up control by control in the same learn flow as a
 * plastic guitar. So a MIDI keyboard plays out of the box, and a kit that does
 * not follow GM is not left silent by a preset that guessed.
 *
 * The seven frets are the C-major scale (C4–B4), so a five-column chart lands on
 * white keys; C5 and D5 are the two strums, and E5 is the whammy. `midiFrets`
 * cuts the frets to the chart's columns, exactly as `keysFor` and `padFrets` do.
 */
export const MIDI_LAYOUT: MidiLayout = {
  frets: [60, 62, 64, 65, 67, 69, 71],
  strum: [72, 74],
  whammy: 76,
};

/** The MIDI frets for a chart of `columns`; `null` leaves the preset whole. */
export function midiFrets(columns: number | null): MidiControl[] {
  return columns === null
    ? MIDI_LAYOUT.frets
    : MIDI_LAYOUT.frets.slice(0, Math.max(1, columns));
}

/** The layouts a kind of instrument is played with. */
function keyLayouts(kind: InstrumentKind): KeyLayout[] {
  return KEY_LAYOUTS[layoutFamily(kind)];
}

/**
 * The keys the `index`th player of `kind` takes, cut to the chart's `columns`.
 * `null` columns mean there is no chart to play, so the layout is left whole —
 * the panel says there is nothing to play, and the keys press nothing.
 */
export function keysFor(
  kind: InstrumentKind,
  index: number,
  columns: number | null,
): KeyLayout {
  const layouts = keyLayouts(kind);
  const layout = layouts[index % layouts.length] ?? layouts[0];
  const frets =
    columns === null ? layout.frets : layout.frets.slice(0, Math.max(1, columns));
  return { ...layout, frets };
}

/** The frets a gamepad takes for a chart of `columns`. */
export function padFrets(columns: number | null): number[] {
  const frets = PAD_LAYOUT.frets;
  return columns === null ? frets : frets.slice(0, Math.max(1, columns));
}

/** The code a layout is written in: the left and right of a pair are one key. */
export function keyCode(code: string): string {
  if (code === "ShiftRight") return "ShiftLeft";
  if (code === "ControlRight") return "ControlLeft";
  if (code === "AltRight") return "AltLeft";
  return code;
}

/**
 * The part of a `KeyboardEvent` that decides whether a typist takes it. A
 * structural shape rather than the DOM type, so the rule stays pure and testable.
 */
export interface TypingKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
}

/**
 * Whether a keypress is a character a typist types. It must be **one character** —
 * `F5`, `Escape`, an arrow and `Backspace` are the browser's or the engine's, not a
 * character — and it must not be a command: `Ctrl+R` reloads, `Cmd+L` is the
 * address bar, and an IME composition has not arrived yet. Shift is allowed,
 * because typing is case-insensitive and a capital is the same letter.
 */
export function isTypingKey(event: TypingKeyEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
    return false;
  }
  return Array.from(event.key).length === 1;
}

/** How a key code reads on screen, for a player who has to look for it. */
const NAMED_KEYS: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "⌫",
  ShiftLeft: "Shift",
  ControlLeft: "Ctrl",
  AltLeft: "Alt",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
};

export function codeLabel(code: string): string {
  const named = NAMED_KEYS[keyCode(code)];
  if (named) return named;
  if (code.startsWith("Key")) return code.slice("Key".length);
  if (code.startsWith("Digit")) return code.slice("Digit".length);
  if (code.startsWith("Numpad")) return `Num ${code.slice("Numpad".length)}`;
  return code;
}

/** How a gamepad's button reads on screen. Standard mapping, 0 = A. */
const PAD_BUTTONS: Record<number, string> = {
  0: "A",
  1: "B",
  2: "X",
  3: "Y",
  4: "LB",
  5: "RB",
  6: "LT",
  7: "RT",
  8: "Back",
  9: "Start",
  10: "LS",
  11: "RS",
  12: "D↑",
  13: "D↓",
  14: "D←",
  15: "D→",
};

export function padButtonLabel(button: number): string {
  return PAD_BUTTONS[button] ?? `#${button}`;
}

/** How a gamepad's axis reads on screen: the axis a player can count to. */
export function padAxisLabel(axis: number): string {
  return `Axis ${axis}`;
}

/**
 * How one pad control reads: a button by its name, an axis by its number and the
 * way it was moved. The direction is part of the read-out because a learn step
 * asks for one way of the strum bar at a time.
 */
export function padControlLabel(control: PadControl): string {
  if (!isPadAxis(control)) return padButtonLabel(control);
  return `${padAxisLabel(control.axis)} ${control.direction === 1 ? "+" : "−"}`;
}

/**
 * The identity of a physical pad control: a button index, or one axis. The two
 * directions of a strum bar are **one** control, so they share a key — which is
 * what lets a claim list an axis once however many ways it is played.
 */
export function padControlKey(control: PadControl): string | number {
  return isPadAxis(control) ? `axis:${control.axis}` : control;
}

/** The twelve names of a MIDI note, from C. */
const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/**
 * A MIDI note as a player reads it: `C4` is middle C, and the octave is the
 * scientific one every keyboard's own labels use. Note 0 is C-1 and 127 is G9.
 */
export function midiNoteLabel(note: number): string {
  const value = Math.max(0, Math.min(127, Math.trunc(note) || 0));
  return `${NOTE_NAMES[value % 12]}${Math.floor(value / 12) - 1}`;
}

/** Whether a fret slot is a hole nobody answered (`-1`) rather than a control. */
export function isMidiHole(control: MidiControl): boolean {
  return typeof control === "number" && control < 0;
}

/**
 * How one MIDI control reads: a note by name, a control change by its number.
 * `CC 64` is how a player knows which pedal their kit's own manual calls 64.
 */
export function midiControlLabel(control: MidiControl): string {
  return typeof control === "number" ? midiNoteLabel(control) : `CC ${control.cc}`;
}

/**
 * The identity of a MIDI control. A note and a control change with the same
 * number are **different** controls, so the key is tagged: `note:64` and `cc:64`
 * can never be mistaken for each other in a claim or a conflict.
 */
export function midiControlKey(control: MidiControl): string {
  return typeof control === "number" ? `note:${control}` : `cc:${control.cc}`;
}

/**
 * What a control change must reach to press, and to let go. A pedal is a switch
 * held by a foot, and every kit sends its own idea of "down": a value at or above
 * `MIDI_CC_DOWN` is down, at or below `MIDI_CC_UP` is up, and the band between is
 * left where it was so a pedal resting near its edge does not chatter.
 */
export const MIDI_CC_DOWN = 64;
export const MIDI_CC_UP = 48;

/**
 * Whether a control change holds its control down, with hysteresis. `undefined`
 * means nobody has seen the control yet, which reads as up — so its first message
 * can press it.
 */
export function midiCcDown(previous: boolean | undefined, value: number): boolean {
  if (value >= MIDI_CC_DOWN) return true;
  if (value <= MIDI_CC_UP) return false;
  return previous ?? false;
}

/**
 * What a MIDI player has to hit, as one line: the frets, the two strums, then the
 * whammy — or nothing where the mapping has no whammy.
 */
export function midiLabel(layout: MidiLayout): string {
  const frets = layout.frets
    .map((control) => (isMidiHole(control) ? NO_CONTROL : midiControlLabel(control)))
    .join(" ");
  const strum =
    layout.strum.length > 0 ? ` · ${layout.strum.map(midiControlLabel).join(" ")}` : "";
  const whammy = layout.whammy === null ? "" : ` · ${midiControlLabel(layout.whammy)}`;
  return `${frets}${strum}${whammy}`;
}

/** The keys a player has to reach for, as one line: `A S D F G · ↑ ↓ · Shift`. */
export function keysLabel(layout: KeyLayout): string {
  const frets = layout.frets.map((key) => (key ? codeLabel(key) : NO_CONTROL)).join(" ");
  const strum = layout.strum.length > 0 ? ` · ${layout.strum.map(codeLabel).join(" ")}` : "";
  return `${frets}${strum} · ${codeLabel(layout.whammy)}`;
}

/**
 * What a player on a gamepad has to press, as one line.
 *
 * The **whole pad** is the input, not only its frets: a mapping a player learned can
 * put the strum and the whammy on any buttons they have, and a read-out that named the
 * preset's would send them looking for controls that are not theirs. A hole (`-1`) is a
 * control nobody set, and reads as a dash.
 */
export function padLabel(layout: PadLayout): string {
  const button = (value: number) => (value >= 0 ? padButtonLabel(value) : NO_CONTROL);
  const frets = layout.frets.map(button).join(" ");
  const strum = layout.strum.length > 0 ? ` · ${strumLabel(layout.strum)}` : "";
  return `${frets}${strum} · ${button(layout.whammy)}`;
}

/**
 * A strum bar as one phrase. A spring-return bar's two directions are one axis,
 * so it reads `Axis 2 ±` rather than naming the same axis twice; a single way of
 * it keeps its direction, because that is what the player was asked for.
 */
export function strumLabel(controls: readonly PadControl[]): string {
  const labels: string[] = [];
  const named = new Set<number>();
  for (const control of controls) {
    if (!isPadAxis(control)) {
      labels.push(padButtonLabel(control));
      continue;
    }
    if (named.has(control.axis)) continue;
    named.add(control.axis);
    const directions = controls.filter(
      (entry): entry is PadAxis => isPadAxis(entry) && entry.axis === control.axis,
    );
    const forward = directions.some((entry) => entry.direction === 1);
    const back = directions.some((entry) => entry.direction === -1);
    labels.push(`${padAxisLabel(control.axis)} ${forward && back ? "±" : forward ? "+" : "−"}`);
  }
  return labels.join(" ");
}

/* ------------------------------------------------------ setting one up */

/**
 * The order a player sets their own controller up in: the frets left to right, then
 * the strum **both ways** (a strum bar is played both ways — that is what it is
 * for), then the whammy. A tapped instrument has nothing to strum, so it is asked
 * for nothing.
 */
export type LearnStep =
  | { on: "fret"; column: number }
  | { on: "strum"; direction: number }
  | { on: "whammy" };

/** How many frets a controller of this kind is normally set up with. */
export function fretCount(kind: InstrumentKind): number {
  if (kind === "dance") return 4;
  // A drum kit is five pads and a **kick pedal**: six columns, and the last one is
  // the pedal (`KICK_COLUMN` in `track.ts`).
  if (kind === "drums") return 6;
  return 5;
}

/**
 * What a fret **is**, in the instrument's own words: a mat's arrows, a drum kit's
 * kick pedal, or one of the five colours a hand plays. The learn flow asks for a
 * control by what it is, so this is the rule behind the words it uses.
 */
export type FretFace = "colour" | "arrow" | "kick";

export function fretFace(kind: InstrumentKind, column: number): FretFace {
  if (kind === "dance") return "arrow";
  if (kind === "drums" && column === KICK_COLUMN) return "kick";
  return "colour";
}

/**
 * What to ask a player for. The chart decides how many frets — the same rule as
 * everywhere else — and a song with no chart for them still gets a controller set
 * up, at the count their instrument normally has.
 */
export function learnSteps(kind: InstrumentKind, columns: number | null): LearnStep[] {
  const frets = Math.max(1, columns ?? fretCount(kind));
  const steps: LearnStep[] = Array.from({ length: frets }, (_, column) => ({
    on: "fret" as const,
    column,
  }));
  if (layoutFamily(kind) === "strum") {
    steps.push({ on: "strum", direction: 0 }, { on: "strum", direction: 1 });
  }
  steps.push({ on: "whammy" });
  return steps;
}

/** Whether a step may be left unset — the second way of a strum bar may not exist. */
export function stepIsOptional(step: LearnStep): boolean {
  return step.on === "strum" && step.direction === 1;
}

/** What a hole in a learned mapping reads as: a control nobody answered. */
const NO_CONTROL = "–";

/**
 * Drop the trailing slots nobody answered, and **keep a hole before them**.
 *
 * A skipped middle fret is a column with no control, not one less column: compacting
 * the array would move every fret after it one column to the left, so the player's
 * fourth fret would play the third note.
 */
function trimTrailing<T>(slots: T[], missing: T): T[] {
  let end = slots.length;
  while (end > 0 && slots[end - 1] === missing) end -= 1;
  return slots.slice(0, end);
}

/**
 * A keyboard's layout from what was captured, one control per step. A step nobody
 * answered is left as **an empty slot in its own column** rather than invented or
 * removed: a missing fret is a column with no key, which `plan.ts` extends with the
 * preset's own reach, and the frets after it keep their positions. Trailing holes
 * are trimmed, because they are beyond the reach that was set up.
 */
export function keyLayoutFromSteps(
  steps: readonly LearnStep[],
  controls: readonly (string | null)[],
): KeyLayout {
  const frets = trimTrailing(
    steps.flatMap((step, index) =>
      step.on === "fret" ? [controls[index] ?? ""] : [],
    ),
    "",
  );
  const strum = steps.flatMap((step, index) =>
    step.on === "strum" && controls[index] ? [controls[index] as string] : [],
  );
  const whammy = steps.findIndex((step) => step.on === "whammy");
  return {
    frets,
    strum,
    whammy: (whammy >= 0 ? controls[whammy] : null) ?? "ShiftLeft",
  };
}

/** A gamepad's layout from what was captured, one control per step. */
export function padLayoutFromSteps(
  steps: readonly LearnStep[],
  controls: readonly (PadControl | null)[],
): PadLayout {
  const frets = trimTrailing(
    steps.flatMap((step, index) => {
      if (step.on !== "fret") return [];
      const control = controls[index];
      // Frets stay buttons: an axis is a strum bar, and an axis captured during a
      // fret step is a control nobody meant as that fret.
      return [typeof control === "number" ? control : -1];
    }),
    -1,
  );
  const strum = padStrums(
    steps.flatMap((step, index) => {
      if (step.on !== "strum") return [];
      const control = controls[index];
      return control === null || control === undefined ? [] : [control];
    }),
  );
  const whammy = steps.findIndex((step) => step.on === "whammy");
  const wave = whammy >= 0 ? controls[whammy] : null;
  return {
    frets,
    strum,
    // The whammy is a button: an axis is never a wave bar.
    whammy: typeof wave === "number" ? wave : PAD_LAYOUT.whammy,
  };
}

/**
 * A strum bar's controls, with each axis's **two directions** made explicit.
 *
 * A spring-return bar reports one axis and both ways, so a mapping that learned
 * one crossing still has the other — and a stored mapping that names only one way
 * is repaired here rather than leaving half a bar silent. A repeated way is
 * dropped rather than read as two controls; a button is a way of its own.
 */
export function padStrums(controls: readonly PadControl[]): PadControl[] {
  const out: PadControl[] = [];
  // One **way** of a control, not one physical control: both directions of an
  // axis are kept, while a repeated button is dropped.
  const way = (control: PadControl) =>
    isPadAxis(control) ? `axis:${control.axis}:${control.direction}` : `button:${control}`;
  const seen = new Set<string>();
  for (const control of controls) {
    const key = way(control);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(control);
    }
    if (isPadAxis(control)) {
      const other: PadControl = {
        axis: control.axis,
        direction: control.direction === 1 ? -1 : 1,
      };
      const otherKey = way(other);
      if (!seen.has(otherKey)) {
        seen.add(otherKey);
        out.push(other);
      }
    }
  }
  return out;
}

/**
 * A MIDI input's layout from what was pressed, one control per step. A step nobody
 * answered is kept as **a hole in its own column** (`-1`), so the controls after it
 * keep their positions; `plan.ts` fills the hole with the preset's own control, and
 * the whammy falls back to the preset when it was skipped.
 */
export function midiLayoutFromSteps(
  steps: readonly LearnStep[],
  controls: readonly (MidiControl | null)[],
): MidiLayout {
  const frets = trimTrailing(
    steps.flatMap((step, index) =>
      step.on === "fret" ? [controls[index] ?? -1] : [],
    ),
    -1,
  );
  const strum = steps.flatMap((step, index) => {
    if (step.on !== "strum") return [];
    const note = controls[index];
    return note === null || note === undefined ? [] : [note];
  });
  const whammy = steps.findIndex((step) => step.on === "whammy");
  const wave = whammy >= 0 ? controls[whammy] : null;
  return { frets, strum, whammy: wave ?? null };
}
