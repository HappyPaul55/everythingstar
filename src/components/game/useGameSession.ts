import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { devToolsEnabled } from "../../lib/game/dev";
import { DEFAULT_PLAYLIST } from "../../lib/game/defaultPlaylist";
import {
  firstBand,
  makeBand,
  type BandPlan,
  type BandSetup,
} from "../../lib/game/band/types";
import { loadPlan, savePlan } from "../../lib/game/band/store";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  masterVolume,
  saveSettings,
  type Settings,
} from "../../lib/game/settings";
import { songArt, songForId, type Song } from "../../lib/game/song";
import { EMPTY_MELODY } from "../../lib/game/source";
import { loadBoard, type SavedRun } from "../../lib/game/scores";
import {
  clampPractice,
  practiceSections,
  type PracticePlan,
  type PracticeSection,
} from "../../lib/game/practice";
import type { Track } from "../../lib/game/track";
import { hypeCues, hypeEntranceMs } from "../../lib/game/audio/hype";
import { attractBand, type AttractPlayers } from "../../lib/game/attract";
import {
  backEventFor,
  onStage,
  opensRun,
  pausesOnFullscreenEnd,
  pausesOnHidden,
  screenAfter,
  wantsCharts,
  type Screen,
  type ScreenEvent,
} from "../../lib/game/screens";
import { loadYouTubeApi } from "./band/youtube";
import { useIntent, type IntentController } from "./intent/useIntent";
import { useArtUrl } from "./library/useArtUrl";
import { isEditable } from "./ui/nav";
import { topDialog } from "./ui/modalStack";
import { backdropFor, type StageMedia } from "../../lib/game/band/media";
import { useFullscreen, type FullscreenState } from "./band/useFullscreen";
import { watchInstall } from "./pwa/install";
import { useLibrary, type Library } from "./library/useLibrary";
import { DEFAULT_SOUNDS, useSounds, type Sounds } from "./audio/useSounds";
import {
  useSongTrack,
  type Seat,
  type SongLoad,
} from "./library/useSongTrack";

/**
 * How long a settings change waits before it is written down. The state is
 * immediate; this only keeps a dragged slider from writing localStorage on every
 * input event.
 */
const SETTINGS_SAVE_MS = 200;

/**
 * What the attract demo asks of a session.
 *
 * It is passed only while the demo is running. Leaving it null restores the
 * player's own remembered band, their guide-vocal choice, their sound and their
 * score board — the demo borrows the session, it does not own it.
 */
export interface AttractSession {
  /** One player (the home window) or a band (the arcade). */
  players: AttractPlayers;
  /** Run on the frame clock, with no sound manifest, mixer or song audio. */
  silent: boolean;
  /** Keep the stage corner. The home window sets this false. */
  chrome: boolean;
}

/**
 * Everything the island's screens share, and the effects that keep it true.
 *
 * This is **state and effects only** — no screen is rendered here. The island's
 * shell hands the object to the provider tower and the screen registry, so the
 * loop's decisions live in one place rather than in the component that happens
 * to draw them.
 *
 * It owns the **screen** (welcome, songs, band, a run, the results), the **library**
 * the songs come from, the song that is chosen and the band playing it. **One screen
 * at a time, and only one of them is the stage**: the song, and the stage entrance
 * and the pause that happen around it. The welcome, the jukebox, the band screen, the
 * load and the results are **pages of their own**, with the whole viewport to
 * themselves — a menu drawn over a running song is a menu with a song in the way.
 *
 * A song is **fetched**, not built: the library reads the playlists, picking a song
 * starts its charts coming, and the loading screen waits for exactly as long as they
 * take. Until they arrive the stage runs on an **empty track** of the right length,
 * so a panel with nothing to play is what a panel says rather than a crash.
 */
export interface GameSession {
  /** The screen the loop is on, and the two ways to move it. */
  screen: Screen;
  dispatch: (event: ScreenEvent) => void;
  /**
   * Begin a run with everything already in hand. The band screen uses this when
   * its charts and its sound are ready, so the load page is skipped entirely.
   */
  startRun: () => void;
  goTo: (next: Screen) => void;
  endRun: () => void;
  /** This session is the attract demo. */
  attract: boolean;
  /** The demo's machine players hit every note. */
  perfect: boolean;
  /** No audio is read or played. */
  silent: boolean;
  /**
   * May the island move focus on a screen change? The homepage's window says no:
   * it is a picture, and a programmatic focus inside its iframe would take the
   * marketing page's keyboard with it.
   */
  focus: boolean;
  /** A phone gets the jukebox's own one-column layout and no default song. */
  phoneLayout: boolean;
  /** The jukebox was entered from a run, so the song is one already played. */
  returningToSongs: boolean;
  /** The song the URL or the jukebox asked for, resolved against the library. */
  wantedId: string;
  setWantedId: Dispatch<SetStateAction<string>>;
  plan: BandPlan;
  changePlan: (next: BandPlan) => void;
  /** How many lane players take a keyboard; the rest are played by the machine. */
  humans: number;
  setHumans: Dispatch<SetStateAction<number>>;
  board: SavedRun[];
  setBoard: Dispatch<SetStateAction<SavedRun[]>>;
  settings: Settings;
  changeSettings: (patch: Partial<Settings>) => void;
  dev: boolean;
  /**
   * The practice plan for this run, or null. It is **not** a screen: practice
   * moves the pause to the stage entrance and the ordinary stage plays it.
   */
  practice: PracticePlan | null;
  /** The plan waiting for the stage entrance to seat it on the clock. */
  pendingPractice: PracticePlan | null;
  /** What a practice dialog offers for the loaded track. */
  practiceSections: PracticeSection[];
  startPractice: (plan: PracticePlan) => void;
  /** Leave practice and put the run back at the top, at the record's speed. */
  stopPractice: () => void;
  /** The pending plan has been seated; it must not be applied twice. */
  practiceStarted: () => void;
  /** Pause the transport, for the single-pass practice end. */
  pauseRun: () => void;
  fullscreen: FullscreenState;
  /** The persistent fullscreen target: `.band`, the island's own root. */
  bandRef: RefObject<HTMLDivElement | null>;
  library: Library;
  /** A link waiting for an answer, or the answer it got. */
  intent: IntentController;
  song: Song | null;
  sounds: Sounds;
  setup: BandSetup;
  seats: Seat[];
  load: SongLoad;
  track: Track;
  /** Somebody is singing, so the guide vocal is held out of the mix. */
  sung: boolean;
  stageArt: string | null;
  youtubeAudio: {
    videoId: string;
    volume: number;
    musicLevel: number;
    lagMs: number;
    rate: number;
    practice: boolean;
  } | null;
  media: StageMedia;
  /** Is the stage up? The entrance, the song and a pause in it. */
  stage: boolean;
  /** A song's own video paints the room, so the drifting lights stand aside. */
  videoBackdrop: boolean;
}

export function useGameSession(attract: AttractSession | null = null): GameSession {
  const attractActive = attract !== null;
  const attractPlayers = attract?.players ?? null;
  const silent = attract?.silent ?? false;
  const [screen, setScreen] = useState<Screen>("welcome");
  const [phoneLayout, setPhoneLayout] = useState(false);
  /** The jukebox is being entered from a run, not from the menu. */
  const [returnedToSongs, setReturnedToSongs] = useState(false);
  const [wantedId, setWantedId] = useState("");
  const [plan, setPlan] = useState<BandPlan>(firstBand);
  const [humans, setHumans] = useState(1);
  const [board, setBoard] = useState<SavedRun[]>([]);
  // The settings: how the game behaves for whoever is at this browser. Read after
  // mount with the rest of the local state — the server has no storage and no
  // address bar, so the first render has to be what the server sent.
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // The latest settings, for a merge that two patches in one batch can share, and
  // the pending write that keeps them from costing a localStorage write per input.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const settingsSave = useRef<number | null>(null);
  // The dev tools are **off unless asked for** (`?dev=1`), so the deployed preview is
  // what a player sees. Read after mount, so the first render matches what the server
  // sent — which is no dev UI at all.
  const [dev, setDev] = useState(false);
  // Practice is session state too: the plan a run plays, and the one waiting for
  // the countdown to seat it on the clock. Neither is written down — a practice
  // run is a thing happening now, not a setting.
  const [practice, setPractice] = useState<PracticePlan | null>(null);
  const [pendingPractice, setPendingPractice] = useState<PracticePlan | null>(null);
  const bandRef = useRef<HTMLDivElement | null>(null);
  // The game's fullscreen state, watched here so it is known whatever put it
  // there — the dev button today, a product button or a shortcut later.
  const fullscreen = useFullscreen(bandRef);

  // The songs. Read after mount (the server has no storage and no address bar), by
  // the one hook that fetches anything.
  const library = useLibrary(DEFAULT_PLAYLIST);
  // A link this page was opened with — or one the native shell handed over — is a
  // question, not an instruction; the dialog answers it.
  const intent = useIntent(library, screen);
  // The home window pretends to be a phone whatever the iframe's width settles at;
  // the rest of the session follows the real breakpoint.
  const compact = attractPlayers === 1 || phoneLayout;
  const song = useMemo(
    () =>
      songForId(library.songs, wantedId) ??
      // The phone's jukebox asks for a song rather than assuming one; every other
      // screen keeps the first song, so crossing the breakpoint mid-screen cannot
      // take the band's song away.
      (compact && screen === "songs" ? null : (library.songs[0] ?? null)),
    [library.songs, wantedId, compact, screen],
  );

  // The sounds: one small manifest, read like everything else. Nothing plays yet —
  // this is what the mixer will read, and the dev panel's tally of what is still to
  // come. A silent demo has no mixer, so it reads nothing at all.
  const sounds = useSounds(DEFAULT_SOUNDS, !silent);

  /**
   * The band the demo puts on stage, when it is the demo.
   *
   * Derived from the song rather than written down: the attract pass may look at
   * several songs, and only the one it settles on reaches the band screen. The
   * player's remembered plan is untouched and comes back the moment the demo ends.
   */
  const attractPlan = useMemo(
    () =>
      attractActive && song
        ? attractBand(song, attractPlayers ?? "band", song.seed)
        : null,
    [attractActive, attractPlayers, song],
  );
  const activePlan = attractPlan ?? plan;
  // The band the run will be played by, and the seats its charts are fetched for.
  const setup: BandSetup = useMemo(
    () => makeBand(activePlan, attractActive ? 0 : humans),
    [activePlan, attractActive, humans],
  );
  // Only the band's own seats are requested here. Listen has no seat, so the
  // loader asks the song's document for its voice chart itself.
  const seats: Seat[] = useMemo(
    () =>
      setup.players.map((player) => ({
        kind: player.kind,
        difficulty: player.difficulty,
        ...(player.role ? { role: player.role } : {}),
      })),
    [setup],
  );
  // Nothing is fetched while the jukebox is up: browsing is not playing. Once a
  // song is picked its charts come down behind the band screen, so pressing Play
  // is usually instant — and nothing is fetched on the way *to* the jukebox either,
  // which is what the menu and its two branches are.
  const load = useSongTrack(song, seats, wantsCharts(screen));
  const track: Track = useMemo(
    () => load.track ?? shellTrack(song),
    [load.track, song],
  );

  /**
   * The stage's entrance: one hype per unique part, and a song that does not begin
   * until it has played out.
   *
   * The hype is warmed with the mixer, so the timing is the measured file length,
   * not a guess. A band with a guitar gets the amp and chord; Listen gets only the
   * slide. The screen stays the `countdown` screen so practice and restart still
   * seat their playhead on it, but a restart is already on a mounted stage — there
   * is no entrance to replay, so it does not wait.
   */
  const entranceHype = useMemo(
    () => hypeCues(setup, track.melody.hasPitch),
    [setup, track.melody.hasPitch],
  );
  const entranceMs = useMemo(() => hypeEntranceMs(entranceHype), [entranceHype]);
  const previousScreen = useRef<Screen | null>(null);
  /**
   * A run's entrance is scheduled once per countdown entry, against the track the
   * run will actually play. The real charts can arrive after the countdown is up,
   * and their melody changes `entranceMs`; that must not read as a second entry.
   */
  const entranceTimer = useRef<number | null>(null);
  const entrancePending = useRef(false);
  /**
   * Somebody is singing and the guide vocal is held out of the mix. The `guideVocal`
   * setting keeps the song's own voice in instead, which is how a singer hears their
   * own misses; the karaoke default is a singer *is* the voice. A typist, or Listen
   * with no words player, keeps it either way.
   */
  const sung = useMemo(
    () =>
      // The demo has no real singer, so the song's own voice stays in: a bot
      // "singing" a karaoke track is exactly the track somebody wants to hear.
      attractActive
        ? false
        : !settings.guideVocal &&
          (track.melody?.hasPitch ?? false) &&
          setup.players.some(
            (player) => player.kind === "words" && player.wordsMode !== "type",
          ),
    [attractActive, setup, track.melody, settings.guideVocal],
  );

  // What a run plays against: the song's own video, or its art, or the game's own
  // artwork — the same ladder the menus fall back on. Whether the song's own is
  // *wanted* is a setting, not a song's property. `useArtUrl` is what makes a cover
  // read from a folder loadable at all.
  const stageArt = useArtUrl(song ? (load.doc?.art ?? songArt(song)) : null);
  /**
   * A song whose **video is the music**: no stems, and the official player supplies
   * both the sound and the backdrop. Null for every ordinary song, so nothing else
   * changes. The video setting may hide it — the player still runs behind the art.
   */
  const youtubeAudio = useMemo(() => {
    const doc = load.doc;
    if (
      silent ||
      !doc ||
      doc.audio.source !== "youtube" ||
      doc.video?.kind !== "youtube"
    ) {
      return null;
    }
    return {
      videoId: doc.video.id,
      volume: settings.volume,
      musicLevel: settings.levels.music,
      lagMs: settings.audioLagMs,
      rate: practice?.speed ?? 1,
      practice: practice !== null,
    };
  }, [
    silent,
    load.doc,
    settings.volume,
    settings.levels.music,
    settings.audioLagMs,
    practice,
  ]);
  const media = useMemo<StageMedia>(
    () =>
      // The song document's video is the truth for a YouTube-backed song; the
      // playlist entry is a summary and may not carry it. A silent demo never
      // streams a video, even a song that names one.
      youtubeAudio && settings.video
        ? { kind: "youtube", id: youtubeAudio.videoId }
        : backdropFor(song, settings.video && !silent, stageArt),
    [youtubeAudio, settings.video, silent, song, stageArt],
  );
  // The API script is worth fetching as soon as the song is known to need it:
  // the player itself is created on the countdown, and a script that is already
  // there is a countdown that is not waiting for YouTube.
  useEffect(() => {
    if (youtubeAudio) void loadYouTubeApi().catch(() => undefined);
  }, [youtubeAudio?.videoId]);

  useEffect(() => {
    // The game no longer puts its screen in the address bar. An old link may still
    // carry one, so take it off rather than leaving a hash that means nothing.
    if (window.location.hash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
    setDev(devToolsEnabled(window.location.search));
    // The install prompt fires once, early; watch from here rather than from the
    // Options row somebody may open several screens later.
    watchInstall();
    setBoard(loadBoard());
    // The band is remembered, so coming back to it is not starting again.
    setPlan(loadPlan());
    // The settings are read, not written: reading the defaults is not a change.
    const remembered = loadSettings();
    settingsRef.current = remembered;
    setSettings(remembered);
  }, []);

  // A change still waiting when the island goes is written on the way out, so the
  // debounce never loses the last value. Nothing pending means nothing to write.
  useEffect(
    () => () => {
      if (settingsSave.current === null) return;
      window.clearTimeout(settingsSave.current);
      settingsSave.current = null;
      saveSettings(settingsRef.current);
    },
    [],
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 40rem)");
    const update = () => setPhoneLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  /**
   * Move on to wherever an event leads. Stable on purpose: screens hang timers
   * and effects off it, and a new identity would restart them.
   */
  const dispatch = useCallback((event: ScreenEvent) => {
    setScreen((current) => screenAfter(current, event));
    // Practice belongs to one run. A normal start or leaving the stage puts it
    // down; `restart` keeps it, because starting the section again is practice.
    if (event === "play" || event === "start" || event === "replay" || event === "quit") {
      setPractice(null);
      setPendingPractice(null);
    }
  }, []);
  /**
   * The band has everything it needs — its charts and every stem the run will
   * play — so it goes straight to the entrance rather than through the load page.
   * The band screen itself is the loader; this is the one move it makes when the
   * wait is over.
   */
  const startRun = useCallback(() => dispatch("start"), [dispatch]);
  const endRun = useCallback(() => dispatch("end"), [dispatch]);
  const pauseRun = useCallback(() => dispatch("pause"), [dispatch]);
  const goTo = useCallback((next: Screen) => setScreen(next), []);

  // The stage enters before the song does. A new run (from the load or a replay)
  // waits for the longest hype cue and the slide; a restart or practice pass from
  // the pause is already on the stage, so it has nothing to replay and starts at
  // once. `previousScreen` is the only place the session needs to know where the
  // countdown came from.
  //
  // The entrance is scheduled **once per countdown entry**, not whenever
  // `entranceMs` changes: the track behind it can still be a shell until the
  // charts land, and cancelling the timer when the real entrance arrives would
  // look like a second entry and skip the entrance altogether. Waiting for a load
  // in progress is what makes the one schedule use the band's real length.
  useEffect(() => {
    const previous = previousScreen.current;
    previousScreen.current = screen;
    // Coming back to the jukebox from a run is returning to a song already chosen;
    // arriving from the menu is arriving at the top. A phone uses this to reopen the
    // now-playing panel for the song it just played instead of looking unselected.
    setReturnedToSongs(
      screen === "songs" &&
        (previous === "band" ||
          previous === "results" ||
          previous === "loading" ||
          previous === "countdown" ||
          previous === "playing" ||
          previous === "paused"),
    );
    if (screen !== "countdown") return;
    if (!opensRun(screen, previous)) {
      dispatch("go");
      return;
    }
    entrancePending.current = true;
    return () => {
      entrancePending.current = false;
      if (entranceTimer.current !== null) {
        window.clearTimeout(entranceTimer.current);
        entranceTimer.current = null;
      }
    };
  }, [screen, dispatch]);

  // Schedule the one entrance once the song is in hand. A load still in progress
  // has not settled the melody the hype is made of, so it waits rather than
  // counting down against a shell track.
  useEffect(() => {
    if (screen !== "countdown" || !entrancePending.current) return;
    if (load.status === "loading") return;
    entrancePending.current = false;
    entranceTimer.current = window.setTimeout(() => {
      entranceTimer.current = null;
      dispatch("go");
    }, entranceMs);
  }, [screen, dispatch, entranceMs, load.status]);
  const changePlan = useCallback(
    (next: BandPlan) => {
      // The demo's band is generated for the song in front of it, never the
      // player's memory. A stray press while it is playing must not rewrite it.
      if (attractActive) return;
      setPlan(next);
      savePlan(next);
    },
    [attractActive],
  );
  /**
   * Begin a practice run. The plan is clamped against the loaded track rather
   * than trusted from the dialog, and the stage's entrance is the run's count-in —
   * the same one every run gets.
   */
  const startPractice = useCallback(
    (plan: PracticePlan) => {
      const next = clampPractice(plan, track.durationMs);
      setPractice(next);
      setPendingPractice(next);
      dispatch("practice");
    },
    [dispatch, track.durationMs],
  );
  /**
   * Leave practice: the plan goes, and the run starts again from the top at the
   * record's speed. Restarting rather than resuming is deliberate — a partial
   * practice pass must never turn into a scoreable run from the middle.
   */
  const stopPractice = useCallback(() => {
    setPractice(null);
    setPendingPractice(null);
    dispatch("restart");
  }, [dispatch]);
  const practiceStarted = useCallback(() => setPendingPractice(null), []);
  const practiceChoices = useMemo(() => practiceSections(track), [track]);
  /**
   * A setting changed: hold it at once, and write it down for the next visit.
   *
   * The merge reads the latest value rather than the render's, so two patches in
   * one batch both land. The write is debounced because a dragged slider fires an
   * `input` event per step, and a synchronous localStorage write per step is work
   * nobody asked for; a pending change is flushed when the island unmounts.
   */
  const changeSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    // The master fader never reaches zero, whatever the patch said: a song's stems
    // are media elements and a silent one leaves the audio clock (`masterVolume`).
    next.volume = masterVolume(next.volume);
    settingsRef.current = next;
    setSettings(next);
    if (settingsSave.current !== null) window.clearTimeout(settingsSave.current);
    settingsSave.current = window.setTimeout(() => {
      settingsSave.current = null;
      saveSettings(settingsRef.current);
    }, SETTINGS_SAVE_MS);
  }, []);

  // The screen is also a read-out on the document. The native shell uses it for
  // the things the page cannot ask for by itself — keeping the display awake
  // while a run is on rather than while a menu is open — and a future embedder
  // gets the same fact without reaching into React state. It is never an input:
  // nothing in the game reads it back.
  useEffect(() => {
    document.documentElement.dataset.screen = screen;
    return () => {
      delete document.documentElement.dataset.screen;
    };
  }, [screen]);

  // Escape is the key a player reaches for: a pause during a song, and "back" on the
  // screens that are only places to be. A dialog gets first refusal: its own cancel
  // closes it, and the screen behind it must not move as well. The **top** dialog is
  // the one that matters — a Practice dialog over a pause is the one Escape closes.
  //
  // A text field keeps its own Escape too: a search clears itself rather than
  // leaving the screen, which is what the browser does and what a player expects.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (topDialog()) return;
      if (isEditable(document.activeElement)) return;
      const next = backEventFor(screen);
      if (next) {
        // Opening the pause from this press must not let the same press reach the
        // dialog that appears: a `<dialog>` opened mid-keydown gets the Escape's
        // default action and cancels itself at once, which read as "Esc does
        // nothing". Our handler has already done what the key means.
        event.preventDefault();
        dispatch(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, dispatch]);

  // A browser takes Escape for itself while an element is fullscreen, so the page
  // never sees the pause key there. Leaving the whole screen *is* that press: a
  // run in progress pauses, rather than carrying on out of view.
  const wasFullscreen = useRef(false);
  useEffect(() => {
    const was = wasFullscreen.current;
    wasFullscreen.current = fullscreen.active;
    if (pausesOnFullscreenEnd(screen, was, fullscreen.active)) dispatch("pause");
  }, [fullscreen.active, screen, dispatch]);

  // A hidden tab stops the frame loop but not the song's media elements, so a run
  // left playing would come back to a clock that jumped with the sound and missed
  // everything in between. Hiding the tab while a song is running is a pause — the
  // ordinary one, which stops the transport and closes the microphone. Nothing
  // else is disturbed: a pause already up, and a dialog over the stage, keep their
  // own state.
  useEffect(() => {
    const onVisibility = () => {
      if (topDialog()) return;
      if (pausesOnHidden(screen, document.hidden)) dispatch("pause");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [screen, dispatch]);

  const stage = onStage(screen);
  // A song's own video paints the whole room. The drifting lights are the game's
  // own, and over footage they read as smudges on somebody's film — so they are set
  // aside while one plays. The menus, which sit in the game's own artwork, keep them.
  const videoBackdrop =
    stage && (media.kind === "video" || media.kind === "youtube");

  return {
    screen,
    dispatch,
    startRun,
    goTo,
    endRun,
    attract: attractActive,
    perfect: attractActive,
    silent,
    focus: attractActive ? (attract?.chrome ?? true) : true,
    phoneLayout: compact,
    returningToSongs: returnedToSongs,
    wantedId,
    setWantedId,
    plan: activePlan,
    changePlan,
    humans,
    setHumans,
    board,
    setBoard,
    settings,
    changeSettings,
    dev,
    practice,
    pendingPractice,
    practiceSections: practiceChoices,
    startPractice,
    stopPractice,
    practiceStarted,
    pauseRun,
    fullscreen,
    bandRef,
    library,
    intent,
    song,
    sounds,
    setup,
    seats,
    load,
    track,
    sung,
    stageArt,
    youtubeAudio,
    media,
    stage,
    videoBackdrop,
  };
}

/**
 * The stage before a song's charts arrive: the song's own name and length with
 * nothing on any highway. A panel then says it has nothing to play, which is what
 * is true, rather than the stage waiting to exist.
 */
function shellTrack(song: Song | null): Track {
  return {
    id: song?.id ?? "none",
    title: song?.title ?? "",
    durationMs: song?.durationMs ?? 0,
    melody: EMPTY_MELODY,
    charts: [],
  };
}
