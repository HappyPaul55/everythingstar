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
import { bedFor, crowdFor, type ChannelLevels } from "../../../lib/game/audio/mix";
import { ENTRANCE_LEAD_MS, hypeCues } from "../../../lib/game/audio/hype";
import type { Sound } from "../../../lib/game/audio/sounds";
import type { BandSetup } from "../../../lib/game/band/types";
import { onStage, opensRun, type Screen } from "../../../lib/game/screens";
import { controlAt, focusIsSilent } from "../ui/nav";
import { topDialog } from "../ui/modalStack";
import { createEngine, type PlayOptions, type PreviewSource } from "./engine";

/**
 * The game's ears: the mixer, and the three things that drive it.
 *
 * - **The screen** decides the bed. Every page wants a `background`; the stage wants
 *   none, because the song is what plays there. The stage's **ambience** is the
 *   pause menu's alone: a quiet room while the run waits, never a crowd over the song.
 * - **The welcome warms it, the first gesture starts it.** The graph is built while
 *   the poster is up — suspended, so it makes no sound — and the cues are decoded and
 *   the menu bed downloaded before the button becomes pressable. The press then only
 *   has to resume it: the first click is heard as a click, not as a fetch. A browser
 *   still will not let anything make a sound before that press.
 * - **Every button clicks.** One listener on the island rather than a sound prop
 *   threaded through sixty components. `select`, `back` and `open` want to be said
 *   by the component that knows which one it is; `data-sound` is how it says so.
 * - **The band opens the run.** The first countdown of a run — after the load or a
 *   replay — plays one `hype_*` entrance per unique part, panned across the band.
 *   A restart or a practice pass from the pause is not a band entrance, so it does
 *   not replay them.
 * - **Moving onto a control makes a smaller sound.** A pointer landing on a new
 *   control, or focus arriving at one by Tab or a pad, is a `move`; the game's own
 *   focus placement is silent, and a press is still the click.
 * - **A cue never turns the song down.** The engine's duck is the **menu bed's** own:
 *   a sting over `background` music, which is a graph node. A run's stems are media
 *   elements outside the graph, so a miss, a hero note or the meter is a sound
 *   *beside* the band and nothing played here can lower it.
 *
 * It sits above the screens, so the music survives every screen change — and above
 * the clock, because it does not need the playhead to know what to play.
 */
export interface AudioApi {
  /** The file the playlist dealt: `background_3`, or null when nothing plays. */
  bed: string | null;
  /**
   * The mixer has finished warming: the cues are decoded and the opening bed is
   * downloaded. The welcome's button waits for this, and a game whose sound never
   * arrives opens anyway after the cap.
   */
  ready: boolean;
  volume: number;
  setVolume: (level: number) => void;
  /** Play a one-shot, by type. `rate` pitches it and `pan` places it. */
  play: (type: string, options?: PlayOptions) => void;
  /**
   * A song's jukebox preview, replacing the bed while it plays. Null stops it and
   * hands the music channel back.
   */
  preview: (track: PreviewSource | null) => void;
}

const MixContext = createContext<AudioApi | null>(null);

/** One deadline from the welcome: a file that never arrives is silence, not a door. */
const WARM_WAIT_MS = 5000;

interface Props {
  /** The manifest's sounds: what there is to play. */
  sounds: readonly Sound[];
  /** The manifest is still being read: there is nothing to warm yet. */
  soundsLoading: boolean;
  screen: Screen;
  /** The band, for the run's per-part entrance. */
  setup: BandSetup;
  /** The song's words carry pitch, so a words player can be singing. */
  wordsPitched: boolean;
  /**
   * Whether the room's crowd plays while the run is **paused**. It is a
   * **setting**, owned above with the other behaviours, and the pause menu is its
   * only surface: the song is what plays under the run, and the menus keep no crowd.
   */
  crowd: boolean;
  /**
   * The master fader's value and its setter, **owned above**: it is a *setting*
   * (`src/lib/game/settings.ts`), and settings have a page of their own — this
   * provider is below it and cannot reach it. The family levels under it are the
   * same kind of value, handed down the same way; the master stays the one fader
   * above them.
   */
  volume: number;
  onVolume: (level: number) => void;
  /** How loud music, ambience and sound effects sit under the master. */
  levels: ChannelLevels;
  /**
   * Whether this visit wants a mixer at all. The homepage's attract window is a
   * picture, not a performance: it reads no manifest, warms nothing, and fetches no
   * song audio. The screens still get the audio API, so they need no special case.
   */
  enabled?: boolean;
  children: ReactNode;
}

/**
 * The mixer, or a quiet stand-in.
 *
 * The demo is the one visit that wants a stage with no sound at all. Splitting the
 * branch here keeps the whole live provider (and every one of its effects) off that
 * path rather than teaching each effect to check a flag.
 */
export function StageAudioProvider(props: Props) {
  return props.enabled === false ? (
    <SilentAudioProvider {...props} />
  ) : (
    <LiveStageAudioProvider {...props} />
  );
}

/** What a screen can ask of a mixer that is not there: silence, and no waiting. */
function SilentAudioProvider({ volume, onVolume, children }: Props) {
  const value = useMemo<AudioApi>(
    () => ({
      bed: null,
      ready: true,
      volume,
      setVolume: onVolume,
      play: () => {},
      preview: () => {},
    }),
    [volume, onVolume],
  );
  return <MixContext.Provider value={value}>{children}</MixContext.Provider>;
}

function LiveStageAudioProvider({
  sounds,
  soundsLoading,
  screen,
  setup,
  wordsPitched,
  crowd,
  volume,
  onVolume,
  levels,
  children,
}: Props) {
  const [bed, setBed] = useState<string | null>(null);
  /**
   * What the welcome is waiting for. Once true it stays true: a later manifest read
   * may add a file, but it must not take the button away from the player.
   */
  const [ready, setReady] = useState(false);
  // The engine tells us the file whenever it changes — including when a track
  // finishes and the bank moves on, which is not something a screen change causes.
  const engine = useMemo(() => createEngine(setBed), []);
  // The run's entrance is a fact about the band and the song, not about a render.
  // It is read through a ref in the screen effect, so a redraw can never replay it.
  const hype = useMemo(() => hypeCues(setup, wordsPitched), [setup, wordsPitched]);
  const hypeRef = useRef(hype);
  hypeRef.current = hype;

  useEffect(() => {
    engine.load(sounds);
  }, [engine, sounds]);

  // Warm what the first few presses will ask for. It has to wait for the manifest —
  // there is nothing to fetch until it has been read — and then it is the cues and
  // the opening bed, decided by `soundsToWarm`.
  useEffect(() => {
    if (soundsLoading) return;
    let alive = true;
    void engine.prepare().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [engine, sounds, soundsLoading]);

  // One deadline from the welcome, whatever is still arriving. A player is never
  // locked out of a game by a manifest or a file that did not turn up; the game
  // simply has no sound of its own until it does.
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), WARM_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // The island going away is the only thing that tears the mixer down: a screen
  // change must not, because the music outlives every screen.
  useEffect(() => () => engine.dispose(), [engine]);

  // The bed follows the screen — including the request made before the browser has
  // been given a gesture, which the engine remembers and applies when it starts.
  // Asking for what is already playing does nothing, so moving between menus does
  // not restart the track you are listening to.
  useEffect(() => {
    void engine.bed(bedFor(screen));
  }, [engine, screen]);

  // The room's own bed: the pause menu's crowd and nothing else. It is on the
  // ambience family, so this effect never touches the menu music or the song, and
  // asking for the same bed again does nothing. The run itself is the song.
  useEffect(() => {
    void engine.ambience(crowdFor(screen, crowd));
  }, [engine, screen, crowd]);

  // The sounds of *moving*: a whoosh for the move itself and the band's own
  // entrance when a run opens. There is no countdown tick any more: the stage's
  // slide and the hype are the count-in. The entrance is one cue per unique part,
  // played as a group; a type nothing can play is silence rather than an error.
  //
  // A run opening is the one move that does **not** get the whoosh: the stage
  // arrives on a quiet beat (the room and the score first), and the band's hype is
  // what says the highways and the words are coming in. So the cues wait for the
  // same lead the slide does — `hype.ts` owns the number — and the song waits for
  // the lead plus the hype.
  const seen = useRef<Screen | null>(null);
  useEffect(() => {
    const previous = seen.current;
    seen.current = screen;
    if (previous === null || previous === screen) return;
    if (opensRun(screen, previous)) {
      const cues = hypeRef.current;
      if (cues.length === 0) return;
      const timer = window.setTimeout(() => engine.playMany(cues), ENTRANCE_LEAD_MS);
      return () => window.clearTimeout(timer);
    }
    engine.play("screen");
  }, [engine, screen]);

  useEffect(() => {
    engine.volume(volume);
  }, [engine, volume]);

  // The families under the master — music, ambience, sound effects — reach the
  // mixer's three channels. The master is applied above them, so the two settings
  // multiply exactly as a player expects and neither overwrites the other.
  useEffect(() => {
    engine.setLevels(levels);
  }, [engine, levels]);

  // The first gesture anywhere starts the graph. Captured, so it is the first thing
  // that happens on the press rather than the last.
  useEffect(() => {
    const start = () => void engine.start();
    window.addEventListener("pointerdown", start, { once: true, capture: true });
    window.addEventListener("keydown", start, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", start, { capture: true });
      window.removeEventListener("keydown", start, { capture: true });
    };
  }, [engine]);

  // Every button in the island, from one listener. **A button can say what it sounds
  // like** with `data-sound` — `select`, `back`, `open` — and everything else is a
  // click, so a new control is audible without anybody wiring it. A *disabled* button
  // fires nothing at all, which is why `refuse` wants `aria-disabled`: it keeps the
  // button pressable, and the press is the point.
  useEffect(() => {
    const onClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target || !target.closest(".band")) return;
      const button = target.closest("button");
      if (!button) return;
      engine.play(button.dataset.sound ?? "click");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [engine]);

  // The sound of **moving**, as opposed to pressing: the pointer landing on a new
  // control, and focus arriving at one by Tab or a pad. One cue per control
  // entered — never one per pixel, frame or repeat — and the focus the game sets
  // itself is silent, because the `screen` whoosh or a dialog's `open` cue has
  // already said where the player is. A song in progress is the players' own
  // input, not a menu: the stage's notes and pads are buttons, and they must not
  // tick as the pointer crosses them.
  const liveStage = useRef(false);
  liveStage.current = onStage(screen);
  useEffect(() => {
    /** The control the pointer is on, so crossing its own children is not a move. */
    let hovered: HTMLElement | null = null;

    /** A run's own controls are the players' input, unless a dialog is over it. */
    const silentPlace = () => liveStage.current && !topDialog();

    const inGame = (node: EventTarget | null): node is Element =>
      node instanceof Element && node.closest(".band") !== null;

    const onOver = (event: PointerEvent) => {
      // A touch has no hover, and a tap of its own is the click.
      if (event.pointerType === "touch" || silentPlace() || !inGame(event.target)) return;
      const control = controlAt(event.target);
      if (!control || control === hovered) return;
      hovered = control;
      engine.play("move");
    };
    const onOut = (event: PointerEvent) => {
      if (!hovered || controlAt(event.target) !== hovered) return;
      const to = event.relatedTarget;
      if (!(to instanceof Node) || !hovered.contains(to)) hovered = null;
    };
    const onFocus = (event: FocusEvent) => {
      if (focusIsSilent() || silentPlace() || !inGame(event.target)) return;
      // A mouse click focuses what it presses, and the click is that sound.
      if (document.documentElement.dataset.gameInput === "pointer") return;
      if (!controlAt(event.target)) return;
      engine.play("move");
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onFocus);
    };
  }, [engine]);

  const setVolume = useCallback(
    (level: number) => {
      onVolume(Math.max(0, Math.min(1, level)));
    },
    [onVolume],
  );
  const play = useCallback(
    (type: string, options?: PlayOptions) => engine.play(type, options),
    [engine],
  );
  const preview = useCallback(
    (track: PreviewSource | null) => engine.preview(track),
    [engine],
  );

  const value = useMemo<AudioApi>(
    () => ({ bed, ready, volume, setVolume, play, preview }),
    [bed, ready, volume, setVolume, play, preview],
  );

  return (
    <MixContext.Provider value={value}>{children}</MixContext.Provider>
  );
}

export function useAudio(): AudioApi {
  const value = useContext(MixContext);
  if (!value) throw new Error("useAudio must be used inside a StageAudioProvider.");
  return value;
}
