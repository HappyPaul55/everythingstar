import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPitchDetector } from "../../../lib/game/pitch";
import { clearTrail, createTrail, pushPitch, type PitchTrail } from "../../../lib/game/singing";
import { useClock } from "./StageClock";

/**
 * The microphone, as a controller.
 *
 * **Permission is asked at the Vocals selection**, because that is the player's
 * gesture; this hook only opens a granted stream while a run that has a singer is
 * **moving** — `enabled` is that, and the provider stays mounted across every
 * screen — so a menu, the band screen, the countdown, a pause, the results and a
 * song of only words cost nothing, and the browser's microphone indicator goes out
 * with the song. A run never prompts. The samples never leave the device: they are
 * analysed here and dropped, and what the game keeps is a pitch, not a recording.
 *
 * Detection runs on the stage's own frame loop rather than a loop of its own, and
 * the detector reuses its buffers (`pitch.ts`), so a frame costs a fraction of a
 * millisecond. What it produces goes into a **trail** — the last few seconds of
 * pitch — because a note is judged from the samples across its own span, so a
 * long note can be scored on how much of it was held, not on whatever is in hand
 * when the run's cursor reaches it. The **cursor** holds the last pitch through
 * a consonant or a single unvoiced frame, but that hold is display only: the
 * trail still records only what was actually heard.
 */

export type MicStatus =
  | "idle"
  | "requesting"
  | "listening"
  /** The player said no. Not an error: the singers simply play themselves. */
  | "refused"
  | "unsupported"
  | "error";

/** Whether the browser has been asked, and what the player said. */
export type MicPermission = "unknown" | "granted" | "denied";

/** Frames of pitch kept for the display's own stability. */
const SMOOTH_FRAMES = 5;
/**
 * How long the cursor keeps the last pitch after the signal drops, in ms. A
 * consonant, a breath or one unvoiced frame is not the singer leaving the note;
 * the trail still records only what was actually heard, so this is display only.
 */
const CURSOR_HOLD_MS = 120;
/** The analyser window. 2048 samples is ~43ms at 48kHz. */
const FFT_SIZE = 2048;
/** Decimate before detection: a voice carries nothing useful above ~1kHz. */
const DECIMATE = 3;
const MIN_FREQUENCY = 65;
const MAX_FREQUENCY = 1500;

export interface MicInput {
  /** Whether this browser can offer a microphone at all. */
  supported: boolean;
  status: MicStatus;
  /** Whether the player has been asked, and the answer. */
  permission: MicPermission;
  /** The recent pitch, for whoever is singing from it. */
  trail: PitchTrail;
  /** What is being heard right now, for the roll's cursor. */
  midiRef: { readonly current: number | null };
  /**
   * Ask the browser for the microphone **at the player's gesture**, then let it
   * go: this is permission, not listening. `retry` asks again after a refusal,
   * which only an explicit selection should do.
   */
  requestPermission: (retry?: boolean) => Promise<boolean>;
  /** Open the microphone, once permission has been granted. */
  start: () => Promise<boolean>;
  stop: () => void;
}

/** The constraints voice detection wants: no call processing on a sustained note. */
const VOICE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

export interface MicOptions {
  /**
   * Whether a stream should be open **now**: somebody is singing and the run is
   * moving. Permission is kept across it, so leaving and re-entering a run opens
   * the microphone again without asking.
   */
  enabled: boolean;
}

/** The middle of the last few frames, so the cursor does not jitter. */
function median(history: number[], value: number): number {
  history.push(value);
  if (history.length > SMOOTH_FRAMES) history.shift();
  if (history.length < 3) return value;
  const sorted = [...history].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? value;
}

export function useMicInput({ enabled }: MicOptions): MicInput {
  const clock = useClock();
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<MicStatus>("idle");
  const [permission, setPermission] = useState<MicPermission>("unknown");
  const permissionRef = useRef<MicPermission>("unknown");
  const pendingPermission = useRef<Promise<boolean> | null>(null);
  // Built on the first render and kept: the trail is a buffer, and making a new
  // one on every render only to throw it away is work nobody asked for.
  const trailRef = useRef<PitchTrail | null>(null);
  trailRef.current ??= createTrail();
  const trail = trailRef.current;
  /**
   * The seek serial this trail was last cleared for, initialised **during
   * render** rather than in an effect, so a seek made between the render and the
   * first frame is still seen as a change.
   */
  const lastSeek = useRef(clock.seekSerialRef.current);
  const midiRef = useRef<number | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const context = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  /**
   * A serial for the open stream: `stop` bumps it, so a `getUserMedia` that
   * answers **after** the run has paused knows its stream is no longer wanted and
   * closes it instead of leaving the microphone on. Without it, a pause during a
   * pending request is a stream that opens on the results screen.
   */
  const serial = useRef(0);
  const buffer = useRef<Float32Array<ArrayBuffer> | null>(null);
  const history = useRef<number[]>([]);
  /** The last pitch actually heard, and when: what the cursor may hold. */
  const lastHeard = useRef<{ midi: number; atMs: number } | null>(null);
  // The frame loop is installed once, so it reads whether to listen from a ref.
  const playing = useRef(false);
  playing.current = clock.playing;

  const detector = useMemo(
    () =>
      createPitchDetector({
        minFrequency: MIN_FREQUENCY,
        maxFrequency: MAX_FREQUENCY,
        decimate: DECIMATE,
      }),
    [],
  );

  // Feature detection after mount, so the first render matches the server's.
  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        typeof navigator.mediaDevices?.getUserMedia === "function" &&
        window.isSecureContext,
    );
  }, []);

  const stop = useCallback(() => {
    // A request still in flight is now stale: whatever it opens is closed below.
    serial.current += 1;
    try {
      analyser.current?.disconnect();
    } catch {
      // Already disconnected.
    }
    analyser.current = null;
    buffer.current = null;
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    if (context.current) {
      void context.current.close().catch(() => {});
      context.current = null;
    }
    history.current = [];
    lastHeard.current = null;
    midiRef.current = null;
    detector.reset();
    setStatus((current) =>
      current === "listening" || current === "requesting" ? "idle" : current,
    );
  }, [detector]);

  /** Ask at the player's gesture; keep the permission, not the open stream. */
  const requestPermission = useCallback(
    async (retry = false): Promise<boolean> => {
      if (permissionRef.current === "granted") return true;
      if (permissionRef.current === "denied" && !retry) return false;
      if (pendingPermission.current) return pendingPermission.current;

      const media =
        typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
      if (!media?.getUserMedia || typeof window === "undefined" || !window.isSecureContext) {
        permissionRef.current = "denied";
        setPermission("denied");
        setStatus("unsupported");
        return false;
      }

      setStatus("requesting");
      const attempt = (async (): Promise<boolean> => {
        try {
          const opened = await media.getUserMedia({ audio: VOICE_CONSTRAINTS });
          // Permission is the point; do not hold the microphone open across the
          // menus. The run asks for a stream again when it is actually playing.
          for (const track of opened.getTracks()) track.stop();
          permissionRef.current = "granted";
          setPermission("granted");
          setSupported(true);
          setStatus("idle");
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
          pendingPermission.current = null;
        }
      })();
      pendingPermission.current = attempt;
      return attempt;
    },
    [],
  );

  const start = useCallback(async (): Promise<boolean> => {
    // The run never asks. It opens only a permission the player already gave at
    // the Vocals control; without it the singers play themselves.
    if (permissionRef.current !== "granted") {
      setStatus(permissionRef.current === "denied" ? "refused" : "idle");
      return false;
    }
    if (!supported) {
      setStatus("unsupported");
      return false;
    }
    stop();
    // This attempt's own serial: a `stop` after this point (a pause, the results
    // screen, the island going) means the stream is no longer wanted.
    const mine = serial.current;
    setStatus("requesting");
    try {
      const opened = await navigator.mediaDevices.getUserMedia({
        audio: VOICE_CONSTRAINTS,
      });
      // Paused while the browser was answering: close what it handed back rather
      // than leave a microphone open on a screen that has no singer on it.
      if (serial.current !== mine) {
        for (const track of opened.getTracks()) track.stop();
        return false;
      }
      stream.current = opened;
      // A track can end without anybody pressing anything: a headset unplugged, the
      // system revoking the device, another application taking it. No `stop` comes
      // from this hook, and the analyser would go silently on — the status would
      // still say listening and every note would be a miss. Let the stream go, so
      // the seat falls back to the machine instead of playing a dead microphone.
      const lost = () => {
        if (serial.current !== mine) return;
        stop();
      };
      for (const track of opened.getTracks()) track.addEventListener("ended", lost);
      const audio = new AudioContext();
      context.current = audio;
      if (audio.state === "suspended") await audio.resume();
      if (serial.current !== mine) {
        stop();
        return false;
      }
      const source = audio.createMediaStreamSource(opened);
      const node = audio.createAnalyser();
      node.fftSize = FFT_SIZE;
      source.connect(node);
      analyser.current = node;
      buffer.current = new Float32Array(node.fftSize);
      history.current = [];
      lastHeard.current = null;
      midiRef.current = null;
      // A new listening run starts with an empty trail: the previous run's voice
      // must not judge this one's first notes.
      clearTrail(trail);
      setStatus("listening");
      return true;
    } catch (cause) {
      // A stop while the request was pending is the pause, not a failure to say.
      const stale = serial.current !== mine;
      stop();
      if (stale) return false;
      const refused =
        cause instanceof DOMException &&
        (cause.name === "NotAllowedError" || cause.name === "SecurityError");
      setStatus(refused ? "refused" : "error");
      return false;
    }
  }, [supported, stop, trail]);

  // Listening rides the stage's frame loop: one frame, one look at the signal.
  useEffect(() => {
    return clock.subscribe(() => {
      // A deliberate move of the playhead starts the voice over: the trail is
      // stamped in **song** time, so a practice loop back into a section — or a
      // run started again — would otherwise judge this pass's notes from the
      // previous pass's voice. An ordinary pause is not a seek and clears nothing.
      if (clock.seekSerialRef.current !== lastSeek.current) {
        lastSeek.current = clock.seekSerialRef.current;
        clearTrail(trail);
        history.current = [];
        lastHeard.current = null;
        midiRef.current = null;
      }
      const node = analyser.current;
      const audio = context.current;
      const samples = buffer.current;
      if (!playing.current || !node || !audio || !samples) {
        // Nothing is held across a pause: a note sung before it is over.
        history.current = [];
        lastHeard.current = null;
        midiRef.current = null;
        return;
      }
      node.getFloatTimeDomainData(samples);
      // The detector refuses silence and an unconfident analysis itself, so a
      // frame with no note in it records nothing.
      const { midi } = detector.detectMidi(samples, audio.sampleRate);
      const now = clock.timeRef.current;
      if (midi === null) {
        // A consonant or one unvoiced frame is not the singer leaving the note.
        // Hold the cursor for a moment, but never invent a sample for judging:
        // the trail records only what was actually heard.
        history.current = [];
        const last = lastHeard.current;
        if (last && now - last.atMs <= CURSOR_HOLD_MS) {
          midiRef.current = last.midi;
        } else {
          lastHeard.current = null;
          midiRef.current = null;
        }
        return;
      }
      const heard = median(history.current, midi);
      lastHeard.current = { midi: heard, atMs: now };
      midiRef.current = heard;
      pushPitch(trail, now, heard);
    });
  }, [clock, detector, trail]);

  // `enabled` is "listening is wanted **now**": somebody is singing and the run
  // is moving. The provider stays mounted across every screen, so this effect is
  // what closes the stream on a pause, on the results and on the menus. The
  // stream is reopened — permission already granted — when the song moves again.
  useEffect(() => {
    if (!enabled) {
      // Nothing should be open; a request still in flight is stale from here.
      stop();
      return;
    }
    return stop;
  }, [enabled, stop]);

  return useMemo(
    () => ({
      supported,
      status,
      permission,
      trail,
      midiRef,
      requestPermission,
      start,
      stop,
    }),
    [supported, status, permission, trail, requestPermission, start, stop],
  );
}
