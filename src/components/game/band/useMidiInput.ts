import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * MIDI, as a controller.
 *
 * **Permission is asked at the player's gesture** — choosing MIDI in a seat's gear,
 * or starting a learn session — and never on page load. The Web MIDI API has no way
 * to ask "may I?" without requesting access, so a run cannot quietly open it; a
 * seat that was remembered as MIDI stays silent until somebody presses one of those
 * two controls. A refusal is not an error: the gear says so in a sentence and the
 * seat keeps the controller it already had.
 *
 * **One access object is reused** for the life of the stage. Every connected input
 * is one bus: a note is routed by the seat's layout, not by which socket it came
 * from, so a kit plugged in after the fact participates without re-seating anyone.
 * `onstatechange` is what makes that true, and it is also where the gear's list of
 * input names is kept current.
 *
 * Nothing is kept after the stage unmounts: the message listeners and the
 * state-change listener are removed, and an implementation that offers `close()`
 * is asked to let the access object go. This is a read of note and control-change
 * messages only — `sysex: false`, no outputs touched, and nothing leaves the device.
 */

export type MidiStatus =
  | "idle"
  | "requesting"
  /** Access is granted and the inputs are being read. */
  | "ready"
  /** This browser has no Web MIDI, or the page is not a secure context. */
  | "unsupported"
  /** The player (or their browser's policy) said no. Not an error. */
  | "refused"
  | "error";

/** Whether the browser has been asked, and what the player said. */
export type MidiPermission = "unknown" | "granted" | "denied";

/** One input the gear can name, so a player can see their kit was found. */
export interface MidiPort {
  id: string;
  name: string;
  /** Position in the connected list, for a stored `controller.index`. */
  index: number;
}

/** One MIDI message, with the event's own time rather than the frame's. */
export interface MidiMessage {
  data: Uint8Array;
  timeStamp: number;
}

export interface MidiInput {
  /** Whether this browser can offer MIDI at all. Detected after mount. */
  supported: boolean;
  status: MidiStatus;
  permission: MidiPermission;
  /** The connected inputs, by name, newest list first. */
  ports: MidiPort[];
  /**
   * Ask the browser for MIDI **at the player's gesture**. A refusal, a missing API
   * or a browser that throws all come back as `false`, never as an exception.
   * `retry` asks again after a refusal, which only an explicit press should do.
   */
  requestAccess: (retry?: boolean) => Promise<boolean>;
  /**
   * Read note and control-change messages from every connected input, including
   * inputs that arrive later. One handler for the whole stage; returns the way to
   * stop listening.
   *
   * `onLost` is told when an input disappears while it was being read. A kit that
   * is unplugged mid-hold sends no release — it has nothing left to send — so the
   * stage has to let that hand go itself, exactly as it does for a gamepad.
   */
  listen: (
    handler: (message: MidiMessage) => void,
    onLost?: () => void,
  ) => () => void;
}

/** The browser's own Web MIDI, or nothing at all. */
function canMidi(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.requestMIDIAccess === "function" &&
    typeof window !== "undefined" &&
    window.isSecureContext
  );
}

/** How one input is named when its driver does not give it a name. */
const UNNAMED = "MIDI input";

function samePorts(a: readonly MidiPort[], b: readonly MidiPort[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (port, index) =>
      port.id === b[index]?.id &&
      port.name === b[index]?.name &&
      port.index === b[index]?.index,
  );
}

export function useMidiInput(): MidiInput {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<MidiStatus>("idle");
  const [permission, setPermission] = useState<MidiPermission>("unknown");
  const [ports, setPorts] = useState<MidiPort[]>([]);
  const permissionRef = useRef<MidiPermission>("unknown");
  const pending = useRef<Promise<boolean> | null>(null);
  const access = useRef<MIDIAccess | null>(null);
  /** The one message handler the stage installed, if any. */
  const handler = useRef<((message: MidiMessage) => void) | null>(null);
  /** What to tell the stage when an input it was reading disappears. */
  const lost = useRef<(() => void) | null>(null);
  /** The inputs we have attached to, so a re-attach is not a second listener. */
  const attached = useRef(new Set<MIDIInput>());

  const syncPorts = useCallback((next: MIDIAccess) => {
    const found = [...next.inputs.values()]
      .filter((input) => input.state !== "disconnected")
      .map((input) => ({ id: input.id, name: input.name?.trim() || UNNAMED }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .map((input, index) => ({ ...input, index }));
    setPorts((current) => (samePorts(current, found) ? current : found));
  }, []);

  /**
   * The one function every input points at. It only hands the message on; who is
   * listening is whatever the stage installed, and that can change without
   * touching the devices.
   */
  const forward = useCallback((event: MIDIMessageEvent) => {
    handler.current?.({
      data: event.data ?? new Uint8Array(),
      timeStamp: event.timeStamp,
    });
  }, []);

  const detachAll = useCallback(() => {
    for (const input of attached.current) {
      if (input.onmidimessage === forward) input.onmidimessage = null;
    }
    attached.current.clear();
  }, [forward]);

  const attach = useCallback(() => {
    const next = access.current;
    if (!next || !handler.current) return;
    for (const input of next.inputs.values()) {
      input.onmidimessage = forward;
      attached.current.add(input);
    }
    // An input that has gone away is no longer in the map; let its listener go.
    const gone: MIDIInput[] = [];
    for (const input of attached.current) {
      if (next.inputs.get(input.id) !== input) gone.push(input);
    }
    for (const input of gone) {
      if (input.onmidimessage === forward) input.onmidimessage = null;
      attached.current.delete(input);
    }
    // Only the *going* is news: an input arriving is not a hand to let go of.
    if (gone.length > 0) lost.current?.();
  }, [forward]);

  /** Keep the gear's names true and every input listening. */
  const onStateChange = useCallback(() => {
    const next = access.current;
    if (!next) return;
    syncPorts(next);
    attach();
  }, [attach, syncPorts]);

  // Feature detection after mount, so the first render matches the server's. A
  // browser with no Web MIDI says so in the gear before anybody presses anything;
  // that is a fact about the browser, not a permission request.
  useEffect(() => {
    const can = canMidi();
    setSupported(can);
    if (!can) setStatus((current) => (current === "idle" ? "unsupported" : current));
  }, []);

  const requestAccess = useCallback(
    async (retry = false): Promise<boolean> => {
      if (access.current) return true;
      if (permissionRef.current === "denied" && !retry) return false;
      if (pending.current) return pending.current;
      if (!canMidi()) {
        permissionRef.current = "denied";
        setPermission("denied");
        setStatus("unsupported");
        return false;
      }

      setStatus("requesting");
      const attempt = (async (): Promise<boolean> => {
        try {
          const next = await navigator.requestMIDIAccess({ sysex: false });
          access.current = next;
          next.onstatechange = onStateChange;
          syncPorts(next);
          attach();
          permissionRef.current = "granted";
          setPermission("granted");
          setSupported(true);
          setStatus("ready");
          return true;
        } catch (cause) {
          const refused =
            cause instanceof DOMException &&
            (cause.name === "NotAllowedError" || cause.name === "SecurityError");
          permissionRef.current = "denied";
          setPermission("denied");
          setStatus(refused ? "refused" : "error");
          return false;
        } finally {
          pending.current = null;
        }
      })();
      pending.current = attempt;
      return attempt;
    },
    [attach, onStateChange, syncPorts],
  );

  const listen = useCallback(
    (next: (message: MidiMessage) => void, onLost?: () => void) => {
      handler.current = next;
      lost.current = onLost ?? null;
      attach();
      return () => {
        if (handler.current === next) handler.current = null;
        lost.current = null;
        detachAll();
      };
    },
    [attach, detachAll],
  );

  // A stage that goes away takes its access object with it, when the browser lets
  // it. `close()` is not in the spec, so it is asked for rather than assumed.
  useEffect(() => {
    return () => {
      detachAll();
      const next = access.current;
      if (next) {
        next.onstatechange = null;
        const close = (next as MIDIAccess & { close?: () => void }).close;
        if (typeof close === "function") {
          try {
            close.call(next);
          } catch {
            // Already closed, or an implementation that does not allow it.
          }
        }
      }
      access.current = null;
    };
  }, [detachAll]);

  return useMemo(
    () => ({ supported, status, permission, ports, requestAccess, listen }),
    [supported, status, permission, ports, requestAccess, listen],
  );
}
