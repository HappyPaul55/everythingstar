import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BandSetup } from "../../../lib/game/band/types";
import type { ActionEvent } from "../../../lib/game/input";
import { isTypingKey, keyCode, midiCcDown, type MidiControl } from "../../../lib/game/controls/layout";
import {
  droppedKeys,
  padAxisEdges,
  padAxisState,
  padEdges,
  retainConnected,
} from "../../../lib/game/controls/pad";
import {
  conflictsOf,
  controlPlan,
  keyAction,
  midiAction,
  padAction,
  padAxisAction,
  type Conflict,
  type ControlPlan,
} from "../../../lib/game/controls/plan";
import type { Track } from "../../../lib/game/track";
import { useMicInput, type MicInput } from "./useMicInput";
import { useMidiInput, type MidiInput, type MidiMessage } from "./useMidiInput";
import { useClock } from "./StageClock";

/**
 * Stage controls: the one place input comes in, and who it belongs to.
 *
 * Every controller — a keyboard, a gamepad, and later a microphone — is read
 * here, in **one** listener and **one** frame poll, and routed to the seat whose
 * plan claims it. Before this, each player's panel put its own listener on the
 * window and filtered by its own keys, which meant two players with the same keys
 * both received every press. Now the plan decides, and what the plan cannot decide
 * it says out loud (`conflicts`).
 *
 * Two rules stay exactly where they were, and there is now one copy of them: a
 * **press only means something while the stage is moving**, so the menus keep the
 * keyboard to themselves; and a **release always lands**, so a fret held across a
 * pause is still let go.
 *
 * Judging is untouched by any of it. A lane player still drains its own queue on
 * its own frame and applies the same actions through the same pure function, so
 * the rule that nothing reads another player's state still holds.
 */

/** One character a typist typed, with when they typed it. */
export interface RoutedChar {
  char: string;
  atMs: number;
}

/** A gamepad the browser will talk about. */
export interface PadInfo {
  index: number;
  id: string;
  /** `"standard"` when the pad reports the standard layout. */
  mapping: string;
}

/**
 * A device somebody is setting up. A pad is named by the index the browser reports,
 * because that is the pad the player chose in the gear; the button pressed on it is
 * the answer to *what* each control is, not *which* pad. MIDI needs no index — every
 * input is one bus, and a note is the answer.
 */
export type LearnDevice =
  | { on: "keyboard" }
  | { on: "pad"; index: number }
  | { on: "midi" };

/** One control pressed while a controller is being set up. */
export type LearnControl =
  | { on: "keyboard"; code: string }
  | { on: "pad"; index: number; button: number }
  /** A gamepad axis crossing its threshold, with the way it moved. */
  | { on: "padAxis"; index: number; axis: number; direction: 1 | -1 }
  /**
   * A MIDI note or control change, with the channel it arrived on so the gear can
   * say both. A control change is a pedal or a switch, so only its **downward**
   * crossing is captured.
   */
  | { on: "midi"; control: MidiControl; channel: number };

/** Listening for the next control on a device, so a player can set one up. */
export interface Learn {
  start: (device: LearnDevice, onCapture: (control: LearnControl) => void) => void;
  stop: () => void;
}

/**
 * The keys a browser uses to move the *page* rather than the song. Space and the
 * arrow keys scroll the document by default; on a moving stage the keyboard is the
 * players' — Space is often a strum — so the page must not move under them.
 */
const PAGE_KEYS = new Set([
  " ",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

/**
 * The handles a player's own code holds. Stable for the life of the stage, so a
 * run never re-subscribes to the clock because a pad was plugged in.
 */
export interface ControlPorts {
  /** Everything routed to this seat since the last call. */
  take: (seat: number) => ActionEvent[];
  /**
   * Characters for a typist, delivered **as they are typed** rather than on the
   * next frame: a keystroke is the one input where waiting a frame is the
   * difference between typing and catching up.
   */
  onChars: (seat: number, handler: (char: RoutedChar) => void) => () => void;
  /**
   * A hand the browser has stopped reporting on: a blurred window, a hidden tab,
   * a pad unplugged mid-hold. The queued releases let go of the keys; this is told
   * too, so a panel can clear what it was holding itself — a finger on a hit marker.
   */
  onFingersUp: (handler: () => void) => () => void;
}

export interface StageControls {
  ports: ControlPorts;
  /** Who plays with what, for the key map and the read-out. */
  plan: ControlPlan;
  /** Seats fighting over one control, worst first — the warning. */
  conflicts: Conflict[];
  /** The gamepads the browser knows about. */
  pads: PadInfo[];
  /** The microphone, one between every singer. */
  mic: MicInput;
  /** MIDI: the connected inputs, permission, and the learn flow's notes. */
  midi: MidiInput;
  /** Setting a player's controller up: what to listen to, and for what. */
  learn: Learn;
  /**
   * A learn session is in progress. It is the UI navigation's own off switch: the
   * first button pressed is the answer to the question, never a menu press.
   */
  learning: boolean;
}

const StageControlsContext = createContext<StageControls | null>(null);

interface Props {
  setup: BandSetup;
  track: Track;
  children: ReactNode;
}

export function StageControlsProvider({ setup, track, children }: Props) {
  const clock = useClock();
  const [pads, setPads] = useState<PadInfo[]>([]);
  const [learning, setLearning] = useState(false);
  const plan = useMemo(
    () => controlPlan(track, setup, pads.length),
    [track, setup, pads.length],
  );
  const conflicts = useMemo(() => conflictsOf(plan), [plan]);
  // Anybody singing means the microphone is wanted. A singer the machine is
  // covering is not anybody: they never ask for it. And a wanted microphone is
  // only opened **while the song moves** — the provider lives across every
  // screen, so `sings` alone would leave the stream (and the browser's own
  // indicator) open on the results and the menus.
  const sings = plan.seats.some(
    (seat) => seat.channel === "pitch" && seat.controller.on !== "none",
  );
  const mic = useMicInput({ enabled: sings && clock.playing });
  // MIDI is only asked for at a gesture (`requestAccess`), so building this hook
  // opens nothing. The listener below is installed once and stays quiet until
  // access exists and a note arrives.
  const midi = useMidiInput();

  // Queues and handlers live outside React: an input event is not a render.
  const queues = useRef(new Map<number, ActionEvent[]>());
  const charHandlers = useRef(new Map<number, Set<(char: RoutedChar) => void>>());
  /** Panels told to let go of their own fingers, because no release is coming. */
  const fingersUp = useRef(new Set<() => void>());
  const padButtons = useRef(new Map<number, boolean[]>());
  /** Which way each pad's axes were held at the last look, for hysteresis. */
  const padAxes = useRef(new Map<number, readonly (0 | 1 | -1)[]>());
  /** Whether each MIDI control change is down, keyed by channel and controller. */
  const ccHeld = useRef(new Map<string, boolean>());
  // The listener is installed once, so it reads the plan through a ref rather
  // than being torn down and put back whenever the band changes.
  const planRef = useRef(plan);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);
  // The MIDI listener is installed once with the access object, so it reads the
  // clock through a ref rather than re-attaching whenever the song starts or stops.
  const clockRef = useRef(clock);
  clockRef.current = clock;

  const push = useCallback((seat: number, event: ActionEvent) => {
    const queue = queues.current.get(seat);
    if (queue) queue.push(event);
    else queues.current.set(seat, [event]);
  }, []);

  /**
   * Let every hand go, because the browser has stopped reporting on it.
   *
   * **A release always lands**, and this is the one release no device ever sends:
   * a window losing focus, a tab being hidden and a pad unplugged mid-hold all
   * mean the same thing — whatever was down is not down any more. Every lane seat
   * gets a fret up for each of its columns (fed through the same queue, so judging
   * and the clock see an ordinary release), the pad and MIDI hold maps start clean
   * so the next press is a press rather than a stale hold, and each panel clears the
   * fingers it was keeping for itself — a tap on a hit marker.
   */
  const releaseAll = useCallback(() => {
    const atMs = clockRef.current.timeRef.current;
    for (const seat of planRef.current.seats) {
      if (seat.channel !== "lanes" || seat.columns === null) continue;
      for (let column = 0; column < seat.columns; column += 1) {
        push(seat.seat, {
          action: { type: "fret", column },
          down: false,
          repeat: false,
          timeMs: atMs,
        });
      }
    }
    padButtons.current.clear();
    padAxes.current.clear();
    ccHeld.current.clear();
    for (const handler of fingersUp.current) handler();
  }, [push]);

  const portsRef = useRef<ControlPorts | null>(null);
  if (!portsRef.current) {
    portsRef.current = {
      take: (seat) => {
        const queue = queues.current.get(seat);
        if (!queue || queue.length === 0) return [];
        queues.current.set(seat, []);
        return queue;
      },
      onChars: (seat, handler) => {
        let handlers = charHandlers.current.get(seat);
        if (!handlers) {
          handlers = new Set();
          charHandlers.current.set(seat, handlers);
        }
        handlers.add(handler);
        return () => {
          handlers.delete(handler);
        };
      },
      onFingersUp: (handler) => {
        fingersUp.current.add(handler);
        return () => {
          fingersUp.current.delete(handler);
        };
      },
    };
  }
  const ports = portsRef.current;

  // While somebody is setting a controller up they are listening to one device,
  // and nothing they press is the game's. It sits before every other rule in the
  // listener because that is what it means: this press is a *setting*, not a note.
  const learningRef = useRef<{
    device: LearnDevice;
    onCapture: (control: LearnControl) => void;
  } | null>(null);
  const learn = useMemo(
    () => ({
      start: (device: LearnDevice, onCapture: (control: LearnControl) => void) => {
        learningRef.current = { device, onCapture };
        setLearning(true);
      },
      stop: () => {
        learningRef.current = null;
        setLearning(false);
      },
    }),
    [],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const down = event.type === "keydown";
      // Setting a controller up is not playing, so it is not gated on the clock
      // and it does not reach a seat: the first key pressed is the one they mean.
      const setting = learningRef.current;
      if (setting) {
        // Escape is the modal's way out, not another control to learn.
        if (event.key === "Escape") return;
        // A repeat is the same press the operating system is sending again, not an
        // answer: taking it would fill the next step with the key still held.
        if (setting.device.on === "keyboard" && down && !event.repeat) {
          setting.onCapture({ on: "keyboard", code: keyCode(event.code) });
        }
        // A session listens to one device, but the keyboard is still not the game's
        // while it is open: no page scroll, and no focused button pressing itself —
        // whatever device is being learned. On a keyboard session, every key is the
        // answer and the browser must not act on it.
        if (
          setting.device.on === "keyboard" ||
          PAGE_KEYS.has(event.key) ||
          event.key === "Enter"
        ) {
          event.preventDefault();
        }
        return;
      }
      // A press only means something while the stage is moving; a release always
      // lands.
      if (down && !clock.playing) return;

      // While the stage is moving the keyboard belongs to the players: take the
      // browser's page-movement keys away, or a strum on Space or an arrow pages
      // the document out from under the song. What a seat has bound is taken
      // anyway, further down.
      if (down && PAGE_KEYS.has(event.key)) event.preventDefault();

      // The event's own time on the song clock. `timeRef` is only sampled once a
      // frame, so stamping with it would judge the press up to a frame early.
      const atMs = clock.timeOf(event.timeStamp);
      let claimed = false;

      for (const seat of planRef.current.seats) {
        const action = keyAction(seat, event.code);
        if (!action) continue;
        claimed = true;
        push(seat.seat, { action, down, repeat: event.repeat, timeMs: atMs });
      }

      // A typist types whatever is typed — the letters an instrument has bound
      // included. That is what the conflict warning is about, and it is left to
      // work rather than prevented. A command is not a character, though: Ctrl+R
      // reloads and Cmd+L is the address bar, so neither is the typist's to take.
      // An auto-repeat is one held key, not more typing: the OS sends it at its
      // own rate, and a held letter must not type `aaaa…`.
      if (down && !event.repeat) {
        const typing = isTypingKey(event);
        // Backspace is the typist's own editing key and the engine takes it, but
        // it is not a character, so it is delivered without being claimed.
        const editing =
          event.key === "Backspace" &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.isComposing;
        if (typing || editing) {
          for (const seat of planRef.current.seats) {
            if (seat.controller.on !== "chars") continue;
            const handlers = charHandlers.current.get(seat.seat);
            if (!handlers || handlers.size === 0) continue;
            if (typing) claimed = true;
            for (const handler of handlers) handler({ char: event.key, atMs });
          }
        }
      }

      // Only what somebody has bound: the rest of the keyboard still belongs to
      // the browser and to whatever button has focus.
      if (claimed) event.preventDefault();
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [clock, push, learn]);

  // A window that loses focus or a tab that is hidden gets no keyups: the browser
  // has stopped sending them, and a held fret would stay down for the rest of the
  // run. Let every hand go rather than trust a release that will never come.
  useEffect(() => {
    const onBlur = () => releaseAll();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") releaseAll();
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [releaseAll]);

  // Gamepads have no events to subscribe to: the browser hands their whole state
  // to whoever asks, so the frame the stage already runs is where they are read.
  useEffect(() => {
    return clock.subscribe(() => {
      const gamepads = navigator.getGamepads?.() ?? [];
      const live: Gamepad[] = [];
      const found: PadInfo[] = [];
      for (const pad of gamepads) {
        if (!pad) continue;
        live.push(pad);
        found.push({ index: pad.index, id: pad.id, mapping: pad.mapping });
      }
      // A pad that went away is forgotten before the ones still here are read, so
      // a pad that reconnects at the same index is not diffed against the old
      // pad's last look. An empty poll therefore forgets every pad.
      const connected = live.map((pad) => pad.index);
      const gone = [
        ...droppedKeys(padButtons.current, connected),
        ...droppedKeys(padAxes.current, connected),
      ];
      retainConnected(padButtons.current, connected);
      retainConnected(padAxes.current, connected);
      // A pad unplugged mid-hold sends no release — it has nothing left to send —
      // and a fret left down is a free sustain and a hopo chain that never closes.
      // The poll sees it go, so the poll is where the hand is let go.
      if (gone.length > 0) releaseAll();
      for (const pad of live) {
        const buttons = pad.buttons.map((button) => button.pressed);
        const before = padButtons.current.get(pad.index);
        for (const edge of padEdges(buttons, before)) {
          const setting = learningRef.current;
          // A pad being set up: a button pressed on the pad the player chose is the
          // answer. It is that pad and no other, because the gear names one.
          if (
            setting &&
            setting.device.on === "pad" &&
            setting.device.index === pad.index
          ) {
            if (edge.down) {
              setting.onCapture({ on: "pad", index: pad.index, button: edge.button });
            }
            continue;
          }
          if (edge.down && !clock.playing) continue;
          for (const seat of planRef.current.seats) {
            const action = padAction(seat, pad.index, edge.button);
            if (action) {
              // A pad has no event to stamp: its state is polled, so the frame's
              // playhead is the most precise time it has.
              push(seat.seat, {
                action,
                down: edge.down,
                repeat: false,
                timeMs: clock.timeRef.current,
              });
            }
          }
        }
        padButtons.current.set(pad.index, buttons);

        // The axes are read **in the same poll** and with the same rules. A strum
        // bar reports one axis and both ways, so an axis crossing is a strum; the
        // state is kept per pad because hysteresis needs where it was last look.
        const axes = pad.axes;
        const heldAxes = padAxes.current.get(pad.index);
        for (const edge of padAxisEdges(axes, heldAxes)) {
          const setting = learningRef.current;
          if (
            setting &&
            setting.device.on === "pad" &&
            setting.device.index === pad.index
          ) {
            if (edge.down) {
              setting.onCapture({
                on: "padAxis",
                index: pad.index,
                axis: edge.axis,
                direction: edge.direction,
              });
            }
            continue;
          }
          // A press only means something while the stage is moving; a release
          // always lands, exactly as it does for a button.
          if (edge.down && !clock.playing) continue;
          for (const seat of planRef.current.seats) {
            const action = padAxisAction(seat, pad.index, edge.axis, edge.direction);
            if (action) {
              push(seat.seat, {
                action,
                down: edge.down,
                repeat: false,
                timeMs: clock.timeRef.current,
              });
            }
          }
        }
        // Latched even while learning, so a bar moved while answering a question
        // does not fire a strum the moment the question is over.
        padAxes.current.set(pad.index, padAxisState(axes, heldAxes));
      }
      setPads((current) => (samePads(current, found) ? current : found));
    });
  }, [clock, push, releaseAll]);

  // MIDI is an **event**, not a poll: a message has its own `timeStamp`, and it is
  // projected onto the song clock exactly as a keypress is. The handler is the
  // stage's one MIDI listener; `midi.listen` attaches it to every input, including
  // ones connected later, and detaches it when the stage goes.
  useEffect(() => {
    return midi.listen((message: MidiMessage) => {
      const data = message.data;
      if (data.length < 3) return;
      const status = data[0] ?? 0;
      const command = status & 0xf0;
      const channel = (status & 0x0f) + 1;
      const number = data[1] ?? 0;
      const value = data[2] ?? 0;

      // A **control change** is a pedal or a switch, not a note: it is held, so it
      // is read as a binary press/release with hysteresis. A pedal streams its
      // value continuously, and only the **downward** crossing may become an
      // action — otherwise a held hi-hat would strum on every message.
      if (command === 0xb0) {
        const key = `${channel}:${number}`;
        const was = ccHeld.current.get(key);
        const down = midiCcDown(was, value);
        if (down === (was ?? false)) return;
        ccHeld.current.set(key, down);
        const control: MidiControl = { cc: number };
        // A learn session sits before every other rule: the pedal pressed is the
        // answer to the question, not a note. Releasing it answers nothing.
        const setting = learningRef.current;
        if (setting) {
          if (setting.device.on === "midi" && down) {
            setting.onCapture({ on: "midi", control, channel });
          }
          return;
        }
        // A press only means something while the stage is moving; a release always
        // lands. Every channel is read, because a layout names controls, not
        // channels.
        if (down && !clockRef.current.playing) return;
        const atMs = clockRef.current.timeOf(message.timeStamp);
        for (const seat of planRef.current.seats) {
          const action = midiAction(seat, control);
          if (!action) continue;
          push(seat.seat, { action, down, repeat: false, timeMs: atMs });
        }
        return;
      }

      // A note-on or note-off is three bytes. Clock, aftertouch and sysex are not
      // commands this game has any use for, and are ignored by their status byte.
      if (command !== 0x90 && command !== 0x80) return;
      // Velocity 0 on a note-on is a release: some kits never send note-off.
      const down = command === 0x90 && value > 0;

      // A learn session sits before every other rule: the note pressed is the
      // answer to the question, not a note. Note-offs answer nothing.
      const setting = learningRef.current;
      if (setting) {
        if (setting.device.on === "midi" && down) {
          setting.onCapture({ on: "midi", control: number, channel });
        }
        return;
      }

      // A press only means something while the stage is moving; a release always
      // lands. Every channel is read, because a layout names notes, not channels.
      if (down && !clockRef.current.playing) return;
      const atMs = clockRef.current.timeOf(message.timeStamp);
      for (const seat of planRef.current.seats) {
        const action = midiAction(seat, number);
        if (!action) continue;
        push(seat.seat, { action, down, repeat: false, timeMs: atMs });
      }
    });
  }, [midi.listen, push]);

  // Permission is asked at the Vocals control, not here. The run only opens a
  // stream the player has already allowed; without it the singers play themselves.
  useEffect(() => {
    if (
      sings &&
      clock.playing &&
      mic.permission === "granted" &&
      mic.status === "idle"
    ) {
      void mic.start();
    }
  }, [sings, clock.playing, mic]);

  const value = useMemo<StageControls>(
    () => ({ ports, plan, conflicts, pads, mic, midi, learn, learning }),
    [ports, plan, conflicts, pads, mic, midi, learn, learning],
  );

  return (
    <StageControlsContext.Provider value={value}>{children}</StageControlsContext.Provider>
  );
}

/** Whether the same pads are on the other end, so the read-out settles. */
function samePads(a: readonly PadInfo[], b: readonly PadInfo[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (pad, index) =>
      pad.index === b[index].index &&
      pad.id === b[index].id &&
      pad.mapping === b[index].mapping,
  );
}

export function useStageControls(): StageControls {
  const controls = useContext(StageControlsContext);
  if (!controls) throw new Error("useStageControls must be used inside a StageControlsProvider.");
  return controls;
}
