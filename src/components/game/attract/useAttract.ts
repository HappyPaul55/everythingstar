import { useEffect, useRef } from "react";
import {
  ATTRACT_BAND_MS,
  ATTRACT_CHOOSE_MS,
  ATTRACT_HOP_MS,
  ATTRACT_IDLE_MS,
  ATTRACT_LIBRARY_LIMIT_MS,
  ATTRACT_LOAD_LIMIT_MS,
  ATTRACT_RESULTS_MS,
  ATTRACT_SETTLE_MS,
  attractCycle,
  attractSoundOn,
  playableAttractSongs,
  type AttractConfig,
} from "../../../lib/game/attract";
import type { GameSession } from "../useGameSession";

/**
 * The attract demo's driver: idle, timers and the one thing that ends it.
 *
 * The decisions — which songs, which band, how long — are pure and live in
 * `attract.ts`. This hook is the clock around them: it arms the thirty-second idle
 * on the welcome, walks the existing screens in order, and gives the page back the
 * moment somebody touches it. It never introduces a screen of its own.
 *
 * The demo is **one-way per visit** once it has started: any real input returns to
 * the welcome, and the player's own session resumes. A `demo` window (the homepage
 * preview) has no input to receive, so it simply loops.
 */
interface Props {
  session: GameSession;
  config: AttractConfig | null;
  active: boolean;
  /** Start the demo. `silent` says whether it takes the frame-clock path. */
  onActivate: (silent: boolean) => void;
  /** The player has taken over; go back to being an ordinary session. */
  onStop: () => void;
}

export function useAttract({ session, config, active, onActivate, onStop }: Props) {
  const { screen, library, setWantedId, dispatch, goTo, dev } = session;
  const songs = library.songs;
  const players = config?.players ?? "band";
  /** The pass the demo is on: it changes which songs are looked at next time. */
  const cycle = useRef(0);
  /** A demo window starts once; a player ending it must not be pulled back in. */
  const demoStarted = useRef(false);

  // A window that wants to start immediately (the homepage preview) does so after
  // the first paint, when the query string has been read.
  useEffect(() => {
    if (!config || !config.demo || demoStarted.current) return;
    demoStarted.current = true;
    onActivate(!attractSoundOn(config, hasUserActivation()));
  }, [config, onActivate]);

  // The idle. It only runs on the welcome, and any press restarts it: "left alone"
  // means a player has not touched the page, not that a page has been open a while.
  useEffect(() => {
    if (!config || active || config.demo || dev || screen !== "welcome") return;
    let timer = 0;
    let stopped = false;
    const arm = () => {
      if (stopped) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!stopped) onActivate(!attractSoundOn(config, hasUserActivation()));
      }, ATTRACT_IDLE_MS);
    };
    arm();
    const onInput = () => arm();
    window.addEventListener("pointerdown", onInput, true);
    window.addEventListener("keydown", onInput, true);
    const pads = window.setInterval(() => {
      if (anyPadPressed()) arm();
    }, 250);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearInterval(pads);
      window.removeEventListener("pointerdown", onInput, true);
      window.removeEventListener("keydown", onInput, true);
    };
  }, [config, active, dev, screen, onActivate]);

  // The way out. The capture listener runs before the game's own Escape and run
  // controls, because this press is the one that says "I am here", not a note.
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const stop = (event?: Event) => {
      if (stopped) return;
      stopped = true;
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      goTo("welcome");
      onStop();
    };
    const onPointer = (event: PointerEvent) => stop(event);
    const onKey = (event: KeyboardEvent) => stop(event);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    const pads = window.setInterval(() => {
      if (anyPadPressed()) stop();
    }, 250);
    return () => {
      stopped = true;
      window.clearInterval(pads);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [active, goTo, onStop]);

  // The demo only ever sits on the loop's screens. If anything else is reached
  // (a resized page, a dev jump), put it back on the jukebox.
  useEffect(() => {
    if (!active) return;
    if (
      screen === "welcome" ||
      screen === "menu" ||
      screen === "options" ||
      screen === "credits"
    ) {
      goTo("songs");
    }
  }, [active, screen, goTo]);

  // The jukebox pass: look at a couple of songs, settle on one, open its band.
  useEffect(() => {
    if (!active || screen !== "songs") return;
    const playable = playableAttractSongs(songs);
    if (playable.length === 0) {
      // A library that never arrives is not a demo. Say nothing on screen; just
      // give the welcome back and let the idle try again later.
      const timer = window.setTimeout(() => {
        if (!library.loading) {
          goTo("welcome");
          onStop();
        }
      }, ATTRACT_LIBRARY_LIMIT_MS);
      return () => window.clearTimeout(timer);
    }

    const pass = attractCycle(playable, cycle.current, players);

    if (!pass) return;
    const timers: number[] = [];
    let at = ATTRACT_SETTLE_MS;
    for (const hop of pass.hops) {
      const id = hop.id;
      timers.push(window.setTimeout(() => setWantedId(id), at));
      at += ATTRACT_HOP_MS;
    }
    const chosen = pass.chosen.id;
    timers.push(window.setTimeout(() => setWantedId(chosen), at));
    timers.push(window.setTimeout(() => dispatch("open"), at + ATTRACT_CHOOSE_MS));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [
    active,
    screen,
    songs,
    players,
    library.loading,
    setWantedId,
    dispatch,
    goTo,
    onStop,
  ]);

  // The band is already filled in and Play has nothing to ask: a beat is enough.
  useEffect(() => {
    if (!active || screen !== "band") return;
    const timer = window.setTimeout(() => dispatch("play"), ATTRACT_BAND_MS);
    return () => window.clearTimeout(timer);
  }, [active, screen, dispatch]);

  // A load that never finishes is a demo stuck on a spinner. Give that song up and
  // choose again rather than taking the whole page down with it.
  useEffect(() => {
    if (!active || screen !== "loading") return;
    const timer = window.setTimeout(() => {
      cycle.current += 1;
      goTo("songs");
    }, ATTRACT_LOAD_LIMIT_MS);
    return () => window.clearTimeout(timer);
  }, [active, screen, goTo]);

  // The results are a read-out, not the end: show them, then find another song.
  useEffect(() => {
    if (!active || screen !== "results") return;
    const timer = window.setTimeout(() => {
      cycle.current += 1;
      goTo("songs");
    }, ATTRACT_RESULTS_MS);
    return () => window.clearTimeout(timer);
  }, [active, screen, goTo]);

  // A hidden tab pauses the run. Nobody asked for a paused demo, so it carries on
  // when it is looked at again.
  useEffect(() => {
    if (!active || screen !== "paused") return;
    const timer = window.setTimeout(() => dispatch("resume"), 1_500);
    return () => window.clearTimeout(timer);
  }, [active, screen, dispatch]);
}

/**
 * Has this document been given a gesture? A browser will not let a fresh
 * navigation make sound, so the demo stays visual until somebody has touched it.
 */
function hasUserActivation(): boolean {
  if (typeof navigator === "undefined") return false;
  const activation = (
    navigator as Navigator & {
      userActivation?: { hasBeenActive?: boolean };
    }
  ).userActivation;
  return activation?.hasBeenActive === true;
}

/** Any button down or stick pushed, on any connected pad. */
function anyPadPressed(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
    return false;
  }
  for (const pad of navigator.getGamepads()) {
    if (!pad) continue;
    if (pad.buttons.some((button) => button.pressed)) return true;
    if (pad.axes.some((axis) => Math.abs(axis) > 0.5)) return true;
  }
  return false;
}
