import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionEvent } from "../../lib/game/input";
import type { Controller } from "../../lib/game/controls/layout";
import type { SeatControl } from "../../lib/game/controls/plan";
import {
  midiAction,
  padAction,
  padAxisAction,
} from "../../lib/game/controls/plan";
import {
  droppedKeys,
  padAxisEdges,
  padAxisState,
  padEdges,
  retainConnected,
} from "../../lib/game/controls/pad";
import { keyAction } from "../../lib/game/controls/plan";
import type { InstrumentKind } from "../../lib/game/track";
import { useClock } from "../game/band/StageClock";
import { useMidiInput, type MidiMessage } from "../game/band/useMidiInput";

export interface CharterRecord {
  recording: boolean;
  events: readonly ActionEvent[];
  controller: Controller;
  setController: (controller: Controller) => void;
  start: (startMs: number) => void;
  /** Stop and hand back everything the take heard. */
  stop: () => ActionEvent[];
  midi: ReturnType<typeof useMidiInput>;
  /** Ask for MIDI access, which only a press may do. */
  requestMidi: () => Promise<boolean>;
  pads: number;
}

/**
 * The charter's recording input.
 *
 * It is a **take**, not a run: the same actions a seat's hands make (`fret`,
 * `strum`, `whammy`) are stamped on the song clock and handed to `takeNotes`.
 * Keyboard, gamepad and MIDI share the game's own layouts, so a charter can record
 * with the controller they will play with. Nothing is judged and no state is read
 * from a band.
 */
export function useCharterRecord(
  instrument: InstrumentKind | null,
  columns: number | null,
): CharterRecord {
  const clock = useClock();
  const midi = useMidiInput();
  const [recording, setRecording] = useState(false);
  const [events, setEvents] = useState<ActionEvent[]>([]);
  const [pads, setPads] = useState(0);
  const [controller, setControllerState] = useState<Controller>({
    on: "keyboard",
    layout: 0,
  });
  const recordingRef = useRef(false);
  const eventsRef = useRef<ActionEvent[]>([]);
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  const seat = useMemo<SeatControl | null>(() => {
    if (!instrument || columns === null) return null;
    return {
      seat: 0,
      kind: instrument,
      channel: "lanes",
      columns,
      controller,
    };
  }, [instrument, columns, controller]);
  const seatRef = useRef(seat);
  seatRef.current = seat;

  const push = useCallback((event: ActionEvent) => {
    if (!recordingRef.current) return;
    eventsRef.current.push(event);
    // A take is a few dozen events; publishing a copy per press is how the panel
    // can draw the notes arriving without a second frame loop.
    setEvents(eventsRef.current.slice());
  }, []);

  const start = useCallback((startMs: number) => {
    eventsRef.current = [];
    setEvents([]);
    setRecording(true);
    recordingRef.current = true;
    // A click in the take belongs to the take, not to the page's transport.
    void startMs;
  }, []);

  const stop = useCallback((): ActionEvent[] => {
    recordingRef.current = false;
    setRecording(false);
    return eventsRef.current.slice();
  }, []);

  // Keyboard: one listener while a take is armed. A press is a note, so the page
  // must not scroll or a focused button must not fire.
  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      const current = seatRef.current;
      if (!current) return;
      const down = event.type === "keydown";
      // A take owns the keyboard's page keys even when the key is not a control:
      // Space must not scroll the charter while a fret hand is on the keys.
      if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
      }
      const action = keyAction(current, event.code);
      if (!action) return;
      if (down && event.repeat) {
        event.preventDefault();
        return;
      }
      push({
        action,
        down,
        repeat: event.repeat,
        timeMs: clock.timeOf(event.timeStamp),
      });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [recording, clock, push]);

  // Gamepads are polled on the stage's one frame loop, exactly as a run reads them.
  useEffect(() => {
    if (!recording || controller.on !== "pad") return;
    const buttons = new Map<number, boolean[]>();
    const axes = new Map<number, readonly (0 | 1 | -1)[]>();
    return clock.subscribe(() => {
      const live = navigator.getGamepads?.() ?? [];
      const found: Gamepad[] = [];
      for (const pad of live) if (pad) found.push(pad);
      setPads((current) => (current === found.length ? current : found.length));
      const connected = found.map((pad) => pad.index);
      const gone = [...droppedKeys(buttons, connected), ...droppedKeys(axes, connected)];
      retainConnected(buttons, connected);
      retainConnected(axes, connected);
      if (gone.length > 0) {
        for (const seatNow of seatRef.current ? [seatRef.current] : []) {
          if (seatNow.columns === null) continue;
          for (let column = 0; column < seatNow.columns; column += 1) {
            push({
              action: { type: "fret", column },
              down: false,
              repeat: false,
              timeMs: clock.timeRef.current,
            });
          }
        }
      }
      for (const pad of found) {
        const pressed = pad.buttons.map((button) => button.pressed);
        const before = buttons.get(pad.index);
        const current = seatRef.current;
        if (current) {
          for (const edge of padEdges(pressed, before)) {
            const action = padAction(current, pad.index, edge.button);
            if (!action) continue;
            push({
              action,
              down: edge.down,
              repeat: false,
              timeMs: clock.timeRef.current,
            });
          }
        }
        buttons.set(pad.index, pressed);
        const heldAxes = axes.get(pad.index);
        if (current) {
          for (const edge of padAxisEdges(pad.axes, heldAxes)) {
            const action = padAxisAction(current, pad.index, edge.axis, edge.direction);
            if (!action) continue;
            push({
              action,
              down: edge.down,
              repeat: false,
              timeMs: clock.timeRef.current,
            });
          }
        }
        axes.set(pad.index, padAxisState(pad.axes, heldAxes));
      }
    });
  }, [recording, controller, clock, push]);

  // MIDI is an event with its own timestamp, projected on the clock exactly as a
  // keypress is.
  useEffect(() => {
    if (!recording || controller.on !== "midi") return;
    return midi.listen((message: MidiMessage) => {
      const current = seatRef.current;
      if (!current) return;
      const data = message.data;
      if (data.length < 3) return;
      const status = data[0] ?? 0;
      const command = status & 0xf0;
      const number = data[1] ?? 0;
      const value = data[2] ?? 0;
      if (command === 0xb0) {
        const action = midiAction(current, { cc: number });
        if (!action) return;
        const down = value >= 64;
        push({
          action,
          down,
          repeat: false,
          timeMs: clock.timeOf(message.timeStamp),
        });
        return;
      }
      if (command !== 0x90 && command !== 0x80) return;
      const down = command === 0x90 && value > 0;
      const action = midiAction(current, number);
      if (!action) return;
      push({
        action,
        down,
        repeat: false,
        timeMs: clock.timeOf(message.timeStamp),
      });
    });
  }, [recording, controller, midi, clock, push]);

  const requestMidi = useCallback(async () => {
    const ok = await midi.requestAccess();
    if (ok) setControllerState({ on: "midi" });
    return ok;
  }, [midi]);

  return {
    recording,
    events,
    controller,
    setController: setControllerState,
    start,
    stop,
    midi,
    requestMidi,
    pads,
  };
}
