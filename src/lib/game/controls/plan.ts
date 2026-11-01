import { isLaneKind, type BandSetup } from "../band/types";
import type { BandPlan, PlayerKind } from "../band/types";
import { chartFor, type InstrumentKind, type Track } from "../track";
import {
  MIDI_LAYOUT,
  PAD_LAYOUT,
  codeLabel,
  isMidiHole,
  isPadAxis,
  keyCode,
  keysFor,
  keysLabel,
  layoutFamily,
  midiControlKey,
  midiControlLabel,
  midiFrets,
  midiLabel,
  padAxisLabel,
  padButtonLabel,
  padControlKey,
  padFrets,
  padLabel,
  padStrums,
  strumLabel,
} from "./layout";
import type {
  Action,
  Controller,
  KeyLayout,
  LayoutFamily,
  MidiControl,
  MidiLayout,
  PadControl,
  PadLayout,
} from "./layout";
import type { MessageKey, Translate } from "../../../i18n";

/**
 * Who plays with what.
 *
 * A player's **controller** is what they hold: their own keys on the keyboard, a
 * gamepad, a MIDI keyboard or kit, the microphone, or **the machine** — a player
 * nobody is playing, which is a controller like any other and not a special case.
 * The **plan** says which
 * seat takes which, and the plan is derived and remembered nowhere: it is worked
 * out from the band, the song and how many pads are plugged in, so a pad arriving
 * mid-run re-seats rather than restarts.
 *
 * **A controller belongs to a seat; a seat belongs to a player.** The two are
 * deliberately different things: a gamepad's batteries dying or a pad being
 * swapped does not end anybody's run, because the run was never the pad's.
 *
 * One keyboard cannot serve two people the same keys — the browser gives a
 * keypress no device to name it by — so this does not pretend otherwise. Two seats
 * that land on the same control are **reported** (`conflictsOf`) and then simply
 * both receive it, because a band that has one keyboard between them is better off
 * playing than being told no. A MIDI note or control change is reported the same
 * way, because every input is one bus.
 */

/** What a controller has to send the game. */
export type Channel =
  /** Fret, strum and whammy. */
  | "lanes"
  /** Characters, for a typist. */
  | "chars"
  /** A continuous pitch, for a singer. */
  | "pitch";

export interface SeatControl {
  /** The player's place in the band, which is their box on the band screen. */
  seat: number;
  kind: PlayerKind;
  channel: Channel;
  /** The chart's columns for a lane seat; `null` when the song has no chart. */
  columns: number | null;
  controller: Controller;
}

export interface ControlPlan {
  seats: SeatControl[];
}

/**
 * The seats a lost pad was playing.
 *
 * A pad unplugged mid-hold sends no release, so the poll has to let that hand go
 * — and **only** that hand: releasing every seat drops a sustain on a keyboard or
 * another pad, and the next poll re-presses whatever a surviving pad still holds.
 */
export function seatsOnLostPads(
  seats: readonly SeatControl[],
  lost: readonly number[],
): SeatControl[] {
  return seats.filter(
    (seat) =>
      seat.channel === "lanes" &&
      seat.controller.on === "pad" &&
      lost.includes(seat.controller.index),
  );
}

/**
 * The controller a seat can actually use, or `undefined` when the one it names is
 * not a controller for what it plays.
 *
 * A lane is played with hands — the keyboard, a pad or a MIDI kit, or the machine —
 * and a words seat with a microphone or with characters, or the machine. A setting
 * can outlive the box it was made in: a singer's microphone left on a box that has
 * become a guitar is a seat with no channel and no claims at all, so it would never
 * play a note. **Anything else is unset**, which falls back to the plan's own choice
 * for that seat rather than keeping a controller nothing can route.
 */
export function normalisedController(
  kind: PlayerKind,
  controller: Controller | undefined,
): Controller | undefined {
  if (!controller) return undefined;
  if (isLaneKind(kind)) {
    return controller.on === "keyboard" ||
      controller.on === "pad" ||
      controller.on === "midi" ||
      controller.on === "none"
      ? controller
      : undefined;
  }
  return controller.on === "mic" || controller.on === "chars" || controller.on === "none"
    ? controller
    : undefined;
}

/**
 * What each seat of this band plays with.
 *
 * `pads` is how many gamepads are connected: the first ones go to the players a
 * person is playing, in band order, and the keyboard covers the rest — so the
 * keyboard's own layouts are handed out **in the order they are needed** rather
 * than by seat, and a lone keyboard player always gets the left-hand five.
 *
 * A words player on a pitched song chooses to sing or type. Lyrics-only songs are
 * always typed. The first typist gets the keyboard; additional typists are simulated,
 * since a second typist on the same keyboard would be typing the same letters.
 */
export function controlPlan(track: Track, setup: BandSetup, pads = 0): ControlPlan {
  let keyboard = 0;
  let pad = 0;
  let typist = 0;

  // Every explicit choice is reserved before the automatic ones are handed out:
  // two seats must never land on one pad or one keyboard layout because the
  // allocator did not know a player had already chosen it. Only a controller the
  // seat can play with is reserved: a microphone on a lane box is nobody's.
  const takenPads = new Set<number>();
  const takenLayouts = new Set<number>();
  for (const player of setup.players) {
    if (!isLaneKind(player.kind)) continue;
    const controller = normalisedController(player.kind, player.controller);
    if (controller?.on === "pad") takenPads.add(controller.index);
    if (controller?.on === "keyboard") takenLayouts.add(controller.layout);
  }

  const seats: SeatControl[] = setup.players.map((player) => {
    const seat = player.seat;
    const chosen = normalisedController(player.kind, player.controller);
    if (isLaneKind(player.kind)) {
      const columns =
        chartFor(track, player.kind, player.difficulty, player.role)?.columns ?? null;
      // **A player who has said what they play with keeps it.** Nothing below
      // overrules them — not a pad arriving, not the order they are standing in,
      // and not the dev panel's own idea of how many are playing.
      if (chosen && chosen.on !== "none") {
        return {
          seat,
          kind: player.kind,
          channel: "lanes" as const,
          columns,
          controller: chosen,
        };
      }
      // The machine: said by the player themselves, or by the dev panel's count.
      if (chosen?.on === "none" || player.auto || columns === null) {
        return {
          seat,
          kind: player.kind,
          channel: "lanes" as const,
          columns,
          controller: { on: "none" as const },
        };
      }
      // A pad another player already chose is not this seat's to take: with no
      // other pad connected the keyboard covers them instead.
      while (pad < pads && takenPads.has(pad)) pad += 1;
      if (pad < pads) {
        const index = pad;
        pad += 1;
        return {
          seat,
          kind: player.kind,
          channel: "lanes" as const,
          columns,
          controller: { on: "pad" as const, index },
        };
      }
      let layout = keyboard;
      while (takenLayouts.has(layout)) layout += 1;
      keyboard = layout + 1;
      return {
        seat,
        kind: player.kind,
        channel: "lanes" as const,
        columns,
        controller: { on: "keyboard" as const, layout },
      };
    }
    // A pitched song can be sung or typed; a lyrics-only song is always typed.
    // A words seat's channel is the song's, and its controller says only whether
    // anybody is playing it: `none` is the machine, and the device it names is
    // otherwise the one that role is played with.
    const bowedOut = chosen?.on === "none";
    const sings = track.melody.hasPitch && player.wordsMode !== "type";
    if (sings) {
      return {
        seat,
        kind: player.kind,
        channel: "pitch" as const,
        columns: null,
        controller: { on: bowedOut ? ("none" as const) : ("mic" as const) },
      };
    }
    // A typist types characters on the one keyboard. Only a typist a person is
    // playing takes that slot: a machine typist stays `none` and leaves it for
    // the next one, or nobody would be typing at all.
    const first = typist === 0 && !bowedOut;
    if (!bowedOut) typist += 1;
    return {
      seat,
      kind: player.kind,
      channel: "chars" as const,
      columns: null,
      controller: { on: first ? ("chars" as const) : ("none" as const) },
    };
  });

  return { seats };
}

/**
 * The one typist who has the keyboard, as the **seat** they sit in.
 *
 * A machine typist stays `none` and leaves the slot for the next one, so the
 * keyboard's typist is a fact of the plan rather than whichever typist comes first
 * in band order: reading the first typist by position would hand a real player's
 * letters to a machine seat whenever the machine's box was the lower one. `null`
 * when nobody is typing — a band of singers, or a typist the song has no part for.
 */
export function keyboardTypistSeat(plan: ControlPlan): number | null {
  const seat = plan.seats.find(
    (entry) => entry.channel === "chars" && entry.controller.on === "chars",
  );
  return seat?.seat ?? null;
}

/** One control a seat needs, and which device it is on. */
export interface Claim {
  seat: number;
  on: "keyboard" | "pad" | "midi";
  /**
   * A key code, a pad button, a pad axis, a MIDI note or control change, or `"*"`
   * for every character typed. A pad axis carries its direction, because a learn
   * prompt asks for one way at a time; the claim's key is the axis itself.
   */
  control: string | PadControl | MidiControl;
  /** Which gamepad, when it is one: two seats on two pads never share. */
  device?: number;
}

/** Every character a typist might type. */
const WILDCARD = "*";

/** What each seat of a plan is asking for. */
export function claimsOf(plan: ControlPlan): Claim[] {
  const claims: Claim[] = [];
  for (const seat of plan.seats) {
    for (const code of keyboardControlsOf(seat)) {
      claims.push({ seat: seat.seat, on: "keyboard", control: code });
    }
    const controller = seat.controller;
    if (controller.on === "pad") {
      for (const control of padControlsOf(seat)) {
        claims.push({ seat: seat.seat, on: "pad", control, device: controller.index });
      }
    }
    if (controller.on === "midi") {
      for (const control of midiControlsOf(seat)) {
        claims.push({ seat: seat.seat, on: "midi", control });
      }
    }
    if (controller.on === "chars") {
      claims.push({ seat: seat.seat, on: "keyboard", control: WILDCARD });
    }
  }
  return claims;
}

/**
 * Which keyboard layout a player takes when they choose the keyboard themselves:
 * the lowest one no **other** player has already chosen, so two people on one
 * keyboard still get the left-hand five and the right-hand five rather than both
 * fighting over one. Reading only the boxes before them would give two seats the
 * same layout whenever the later box chose first.
 */
export function keyboardOrdinal(plan: BandPlan, index: number): number {
  const taken = new Set<number>();
  plan.slots.forEach((slot, at) => {
    if (at === index) return;
    if (slot.controller?.on === "keyboard") taken.add(slot.controller.layout);
  });
  let layout = 0;
  while (taken.has(layout)) layout += 1;
  return layout;
}

/**
 * Fill the columns a learned mapping did not reach from the preset's own controls.
 *
 * A player is asked to set up the frets of the song in front of them, so a later
 * song with more columns would leave the extra ones with no control at all. Falling
 * back to the preset for exactly those columns keeps a mapping from ever making a
 * note unplayable — the one thing a setting must not do. The preset control is
 * taken from those the merged map does **not** already use, so a learned `S D F`
 * on a three-column chart becomes `S D F A G` on a five-column one rather than
 * `S D F F G`: a column nobody can play, and a chord across two of them impossible.
 * Walking the preset's remaining entries keeps the fill in the family the preset
 * belongs to. A hole stays a hole only when every preset control is spoken for.
 */
function fillColumns<T>(
  learned: readonly T[],
  preset: readonly T[],
  isHole: (control: T | undefined) => boolean,
  same: (a: T, b: T) => boolean,
  hole: T,
): T[] {
  const used = learned.filter((control) => !isHole(control));
  const free = preset.filter((control) => !used.some((entry) => same(entry, control)));
  let next = 0;
  return preset.map((_control, column) => {
    const own = learned[column];
    if (own !== undefined && !isHole(own)) return own;
    const filler = free[next];
    if (filler === undefined) return own ?? hole;
    next += 1;
    return filler;
  });
}

/**
 * The keys a seat actually plays with: what they **learned**, extended by the
 * preset's own reach.
 */
function seatKeys(
  kind: InstrumentKind,
  controller: { layout: number; keys?: KeyLayout },
  columns: number | null,
): KeyLayout {
  const preset = keysFor(kind, controller.layout, columns);
  const learned = controller.keys;
  if (!learned) return preset;
  return {
    // A learned layout can carry a hole where a fret was skipped (`""`): the preset
    // fills that column, and the columns after it keep the keys they were given.
    frets: fillColumns(
      learned.frets,
      preset.frets,
      (key) => key === undefined || key === "",
      (a, b) => a === b,
      "",
    ),
    strum: learned.strum.length > 0 ? learned.strum : preset.strum,
    whammy: learned.whammy || preset.whammy,
  };
}

/** The buttons a seat's pad plays with: what they learned, or the standard set. */
function seatButtons(controller: { buttons?: PadLayout }, columns: number | null): PadLayout {
  const preset = { ...PAD_LAYOUT, frets: padFrets(columns) };
  const learned = controller.buttons;
  if (!learned) return preset;
  return {
    // `-1` is a hole: a button nobody pressed. Button `0` is A, so the test is a
    // range rather than falsiness.
    frets: fillColumns(
      learned.frets,
      preset.frets,
      (button) => button === undefined || button < 0,
      (a, b) => a === b,
      -1,
    ),
    strum: seatStrum(learned.strum, preset.strum),
    whammy: learned.whammy ?? preset.whammy,
  };
}

/**
 * The strum a seat plays with: what they learned, or the preset's two ways.
 *
 * A learned strum **replaces** the preset rather than joining it, because a strum
 * is one bar: half of a learned mapping and half of the preset's is a bar with two
 * controls nobody chose. A learned axis arrives as both directions (a spring-return
 * bar has one axis and two ways), so nothing here has to expand it again.
 */
function seatStrum(learned: PadControl[] | undefined, preset: PadControl[]): PadControl[] {
  return learned && learned.length > 0 ? padStrums(learned) : preset;
}

/**
 * The notes and control changes a seat's MIDI input plays with: what they
 * **learned**, extended by the preset's own reach, column by column.
 *
 * The same rule as the keyboard's and the pad's, for the same reason: a mapping
 * learned on a three-column chart must not leave a five-column chart with controls
 * nobody can play. A learned column wins; a column it does not reach takes a preset
 * control the map does not already use, so two columns can never share a note. A
 * skipped whammy falls back to the preset's, because a control a player did not
 * answer is not a control they said they had none of.
 */
function seatNotes(
  controller: { notes?: MidiLayout },
  columns: number | null,
): MidiLayout {
  const preset: MidiLayout = { ...MIDI_LAYOUT, frets: midiFrets(columns) };
  const learned = controller.notes;
  if (!learned) return preset;
  return {
    frets: fillColumns(
      learned.frets,
      preset.frets,
      (control) => control === undefined || isMidiHole(control),
      (a, b) => midiControlKey(a) === midiControlKey(b),
      -1,
    ),
    strum: learned.strum.length > 0 ? learned.strum : preset.strum,
    whammy: learned.whammy ?? preset.whammy,
  };
}

/**
 * The controls a seat's MIDI input asks for: the frets, the strum, then the
 * whammy. A seat the song gives nothing to play asks for nothing — its controls
 * stay free for whoever else wants them. A physical control is claimed once: a
 * note and a control change with the same number are different controls, and a
 * mapping that names one of them twice is still one claim.
 */
function midiControlsOf(seat: SeatControl): MidiControl[] {
  const controller = seat.controller;
  if (seat.columns === null || controller.on !== "midi" || !isLaneKind(seat.kind)) {
    return [];
  }
  const notes = seatNotes(controller, seat.columns);
  const controls = [
    ...notes.frets.filter((control) => !isMidiHole(control)),
    ...notes.strum,
    ...(notes.whammy === null ? [] : [notes.whammy]),
  ];
  const unique = new Map<string, MidiControl>();
  for (const control of controls) {
    const key = midiControlKey(control);
    if (!unique.has(key)) unique.set(key, control);
  }
  return [...unique.values()];
}


/**
 * The keys a seat's layout asks for: the frets, the strum, then the whammy. A seat
 * the song gives nothing to play **asks for nothing**: its keys stay free for
 * whoever else wants them rather than being swallowed by a panel that cannot use
 * them.
 */
function keyboardControlsOf(seat: SeatControl): string[] {
  const controller = seat.controller;
  if (seat.columns === null || controller.on !== "keyboard" || !isLaneKind(seat.kind)) {
    return [];
  }
  const keys = seatKeys(seat.kind, controller, seat.columns);
  return [...keys.frets, ...keys.strum, keys.whammy];
}

/**
 * The controls a seat's pad asks for, in the same order.
 *
 * A physical control is claimed once: both directions of a strum bar's axis are
 * the same axis, so the claim list names `Axis 2` once however many ways the
 * player learned it.
 */
function padControlsOf(seat: SeatControl): PadControl[] {
  const controller = seat.controller;
  if (seat.columns === null || controller.on !== "pad") return [];
  const pad = seatButtons(controller, seat.columns);
  const controls: PadControl[] = [...pad.frets, ...pad.strum, pad.whammy];
  const unique = new Map<string | number, PadControl>();
  for (const control of controls) {
    const key = padControlKey(control);
    if (!unique.has(key)) unique.set(key, control);
  }
  return [...unique.values()];
}

/**
 * What this seat makes of a key press, or `null` when the key is not theirs. The
 * code is folded first (`keyCode`), so a layout can say "Shift" once and mean both.
 */
export function keyAction(seat: SeatControl, code: string): Action | null {
  const controller = seat.controller;
  if (controller.on !== "keyboard" || !isLaneKind(seat.kind)) return null;
  // Nothing to play is nothing to press: the keys are free for someone else.
  if (seat.columns === null) return null;
  const keys = seatKeys(seat.kind, controller, seat.columns);
  const folded = keyCode(code);
  const fret = keys.frets.indexOf(folded);
  if (fret >= 0) return { type: "fret", column: fret };
  if (keys.strum.includes(folded)) return { type: "strum" };
  if (keys.whammy === folded) return { type: "whammy" };
  return null;
}

/** What this seat makes of a gamepad button, or `null` when it is another pad's. */
export function padAction(seat: SeatControl, pad: number, button: number): Action | null {
  const controller = seat.controller;
  if (controller.on !== "pad" || controller.index !== pad) return null;
  if (seat.columns === null) return null;
  const buttons = seatButtons(controller, seat.columns);
  const fret = buttons.frets.indexOf(button);
  if (fret >= 0) return { type: "fret", column: fret };
  if (buttons.strum.includes(button)) return { type: "strum" };
  if (buttons.whammy === button) return { type: "whammy" };
  return null;
}

/**
 * What this seat makes of a **strum bar's axis**, or `null` when it is another
 * pad's, another seat's, or a way they did not learn.
 *
 * An axis is only ever a strum: a fret and a wave bar are buttons, so a direction
 * that happens to cross while a player is holding a fret is not a note. Both ways
 * of the bar are kept once it is learned, so either crossing strums.
 */
export function padAxisAction(
  seat: SeatControl,
  pad: number,
  axis: number,
  direction: 1 | -1,
): Action | null {
  const controller = seat.controller;
  if (controller.on !== "pad" || controller.index !== pad) return null;
  if (seat.columns === null) return null;
  const strum = seatButtons(controller, seat.columns).strum;
  const owned = strum.some(
    (control) =>
      isPadAxis(control) && control.axis === axis && control.direction === direction,
  );
  return owned ? { type: "strum" } : null;
}

/**
 * What this seat makes of a MIDI note or control change, or `null` when it is not
 * theirs.
 *
 * Every connected input is one bus, so the seat's `index` does not filter here: a
 * message carries a control, and the layout is what says whether it means a fret, a
 * strum or the whammy. A note and a control change with the same number are
 * different controls, so the comparison is by tagged identity rather than by
 * number. A control the layout does not name is not the seat's.
 */
export function midiAction(seat: SeatControl, control: MidiControl): Action | null {
  const controller = seat.controller;
  if (controller.on !== "midi" || !isLaneKind(seat.kind)) return null;
  if (seat.columns === null || isMidiHole(control)) return null;
  const notes = seatNotes(controller, seat.columns);
  const wanted = midiControlKey(control);
  const fret = notes.frets.findIndex((entry) => midiControlKey(entry) === wanted);
  if (fret >= 0) return { type: "fret", column: fret };
  if (notes.strum.some((entry) => midiControlKey(entry) === wanted)) {
    return { type: "strum" };
  }
  if (notes.whammy !== null && midiControlKey(notes.whammy) === wanted) {
    return { type: "whammy" };
  }
  return null;
}

/**
 * What each column of a seat's chart asks for, in its own controller's words.
 *
 * The highway's first-run labels are per **column**, not per controller line:
 * player 1 is `A S D F G`, player 2 is `H J K L ;`, a pad is its buttons, a MIDI
 * kit is note names, and a chart with a hole in its mapping has a `null` column.
 * `family` is carried beside them because a tapped instrument has no strum even
 * when the controller has a bar, and a dance mat's arrows are the controls
 * themselves.
 */
export interface ControllerLabels {
  /** One label per chart column, in column order; `null` where there is no control. */
  frets: (string | null)[];
  /** The strum bar, phrased for this controller, or `null` when there is none. */
  strum: string | null;
  /** How this instrument is played: strummed, tapped or stepped on. */
  family: LayoutFamily;
}

/**
 * The per-column controls a seat's highway can label.
 *
 * It reads the **resolved** mapping — the one `keyAction`/`padAction`/`midiAction`
 * use, including what the player learned — so a hint cannot name a preset control
 * the player does not have. A seat with no chart, a microphone, a typist or the
 * machine has no highway labels.
 */
export function controllerLabels(seat: SeatControl): ControllerLabels | null {
  const controller = seat.controller;
  if (seat.columns === null || !isLaneKind(seat.kind)) return null;
  const family = layoutFamily(seat.kind);
  if (controller.on === "keyboard") {
    const keys = seatKeys(seat.kind, controller, seat.columns);
    return {
      family,
      frets: keys.frets.map((key) => (key ? codeLabel(key) : null)),
      strum:
        family === "strum" && keys.strum.length > 0
          ? keys.strum.map(codeLabel).join(" ")
          : null,
    };
  }
  if (controller.on === "pad") {
    const buttons = seatButtons(controller, seat.columns);
    return {
      family,
      frets: buttons.frets.map((button) => (button >= 0 ? padButtonLabel(button) : null)),
      strum:
        family === "strum" && buttons.strum.length > 0
          ? strumLabel(buttons.strum)
          : null,
    };
  }
  if (controller.on === "midi") {
    const notes = seatNotes(controller, seat.columns);
    return {
      family,
      frets: notes.frets.map((control) =>
        isMidiHole(control) ? null : midiControlLabel(control),
      ),
      strum:
        family === "strum" && notes.strum.length > 0
          ? notes.strum.map(midiControlLabel).join(" ")
          : null,
    };
  }
  return null;
}

/**
 * What a player has to press, as one line — or `null` when there are no keys to
 * press, because the controller is a voice, a keyboard's worth of characters, or
 * the machine.
 */
export function controllerKeys(seat: SeatControl): string | null {
  const controller = seat.controller;
  if (controller.on === "keyboard" && isLaneKind(seat.kind)) {
    return keysLabel(seatKeys(seat.kind, controller, seat.columns));
  }
  if (controller.on === "pad") {
    const buttons = seatButtons(controller, seat.columns);
    // A pad's line names the whole pad, so it reads the same whether or not the
    // player has set one up.
    return padLabel(buttons);
  }
  if (controller.on === "midi" && isLaneKind(seat.kind)) {
    return midiLabel(seatNotes(controller, seat.columns));
  }
  return null;
}

/** What to call a controller that has no keys to list. The machine is the caller's
 *  to name, since only it knows whether the player is watching or playing. */
function controllerLabelKey(seat: SeatControl): MessageKey | null {
  if (controllerKeys(seat) !== null) return null;
  if (seat.controller.on === "mic") return "band.mic";
  if (seat.controller.on === "chars") return "band.type";
  return null;
}

/**
 * What a seat plays with, as one line: the keys it lists, the name of a controller
 * that lists none, the machine when nobody is holding it, or a dash for a seat the
 * plan does not have.
 *
 * The countdown and the dev panel both say this, and they must say it the same way:
 * a seat is one player, so what their hands do reads the same wherever it is shown.
 */
export function seatControlReadout(
  t: Translate,
  seats: readonly SeatControl[],
  at: number,
  auto: boolean,
): string {
  const seat = seats.find((entry) => entry.seat === at);
  const keys = seat ? controllerKeys(seat) : null;
  const named = seat ? controllerLabelKey(seat) : null;
  return keys ?? (named ? t(named) : auto ? t("band.auto") : "—");
}

/** Two seats asking for the same control. */
export interface Conflict {
  seats: [number, number];
  /** What they both ask for, as a player reads it, in the first seat's order. */
  controls: string[];
}

/**
 * A claim's identity. A pad control is prefixed with its device and, for an axis,
 * its `axis:` kind — so `pad:0:axis:2` can never be mistaken for `pad:0:2`, the
 * second button.
 */
function conflictKey(claim: Claim): string {
  if (claim.on === "pad") {
    return `pad:${claim.device ?? 0}:${padControlKey(claim.control as PadControl)}`;
  }
  return claim.on === "midi"
    ? `midi:${midiControlKey(claim.control as MidiControl)}`
    : `key:${claim.control}`;
}

/** How a claim reads beside a warning: a button's name, an axis's number, a key. */
function conflictLabel(claim: Claim): string {
  if (claim.on === "pad") {
    const control = claim.control as PadControl;
    return isPadAxis(control) ? padAxisLabel(control.axis) : padButtonLabel(control);
  }
  return claim.on === "midi"
    ? midiControlLabel(claim.control as MidiControl)
    : codeLabel(claim.control as string);
}

/**
 * Which seats are fighting over one control.
 *
 * The common one is a player on the keys and a typist on the words: a typist
 * types **characters**, so every letter they type is also whatever the instruments
 * have bound to that key. That is worth saying out loud — it is not a bug to fix,
 * it is what one keyboard between two people is.
 */
export function conflictsOf(plan: ControlPlan): Conflict[] {
  const bySeat = new Map<number, SeatClaims>();
  for (const claim of claimsOf(plan)) {
    let entry = bySeat.get(claim.seat);
    if (!entry) {
      entry = { controls: [], wildcard: false };
      bySeat.set(claim.seat, entry);
    }
    if (claim.control === WILDCARD) {
      entry.wildcard = true;
      continue;
    }
    entry.controls.push({
      key: conflictKey(claim),
      label: conflictLabel(claim),
      on: claim.on,
    });
  }

  const seats = [...bySeat.keys()].sort((a, b) => a - b);
  const conflicts: Conflict[] = [];
  for (let i = 0; i < seats.length; i += 1) {
    for (let j = i + 1; j < seats.length; j += 1) {
      const first = bySeat.get(seats[i]);
      const second = bySeat.get(seats[j]);
      if (!first || !second) continue;
      const shared = sharedControls(first, second);
      if (shared.length > 0) conflicts.push({ seats: [seats[i], seats[j]], controls: shared });
    }
  }
  return conflicts;
}

/** One seat's claims, with the label a player would read beside the key. */
interface SeatClaims {
  controls: { key: string; label: string; on: "keyboard" | "pad" | "midi" }[];
  /** True for a typist, whose claim is every character there is. */
  wildcard: boolean;
}

/**
 * What two seats both ask for, in the first seat's own order.
 *
 * A **wildcard** is a typist, and a typist types **characters** — so they share
 * whatever the other seat has on the *keyboard*, and nothing a gamepad has. A pad
 * can be in the same band without anybody fighting over a key.
 */
function sharedControls(first: SeatClaims, second: SeatClaims): string[] {
  const onKeyboard = (claims: SeatClaims["controls"]) =>
    claims.filter((control) => control.on === "keyboard").map((control) => control.label);
  if (first.wildcard) return second.wildcard ? [] : onKeyboard(second.controls);
  if (second.wildcard) return onKeyboard(first.controls);
  const mine = new Set(second.controls.map((control) => control.key));
  return first.controls.filter((control) => mine.has(control.key)).map((c) => c.label);
}
