/**
 * The screens a session moves between, and the one place that says how.
 *
 * EverythingStar is a single island: the island's root stays mounted and a screen
 * is drawn into it, so a **fullscreen session survives moving between them**
 * (which is the same reason the sibling TypeStar build navigates in place). Only
 * the countdown and the pause are overlays over a running stage; every other
 * screen is a page of its own. That makes the screen *state*, and the shape of
 * that state belongs here — pure, so the machine is unit-tested rather than
 * scattered through effects.
 *
 * The loop is **welcome → menu → songs → band → a run → results**, with two
 * branches off the menu: **options** and **credits**, which are places to go and
 * come back from rather than steps in the loop. A *page* is not the same as a
 * *step*: `options` and `credits` can be reached from the menu and only lead back
 * to it, so nothing else has to know they exist.
 *
 * Choosing a song and choosing a band are **two screens**, in that order: a
 * jukebox picker wants the room a few hundred titles need, and a band wants the
 * room a slot per player needs. Neither wants to be half of one panel, and both
 * have a way back to the previous step.
 *
 * The screen is **session state, not a route**: the address bar does not name it,
 * and a reload starts at the welcome again. A run cannot be resumed, and a hash
 * that only half-describes a screen was more confusing than useful.
 */

export type Screen =
  | "welcome"
  | "menu"
  | "options"
  | "credits"
  | "songs"
  | "band"
  | "loading"
  | "countdown"
  | "playing"
  | "paused"
  | "results";

/**
 * Every screen, in the order a session reaches them — with the menu's two branches
 * beside it, since where a screen sits in this list is where it sits in the loop.
 */
export const SCREENS: Screen[] = [
  "welcome",
  "menu",
  "options",
  "credits",
  "songs",
  "band",
  "loading",
  "countdown",
  "playing",
  "paused",
  "results",
];

/** What a screen is asked to do. */
export type ScreenEvent =
  | "enter" // the welcome's one button, and the menu's way on to the songs
  | "options" // the menu's settings branch
  | "credits" // and its thanks branch
  | "open" // a song was chosen; on to the band
  | "play" // the band is ready
  | "start" // the band and its sound are ready, so no load screen is needed
  | "back" // back the way you came
  | "loaded" // the track is in hand
  | "go" // the countdown ran out
  | "pause"
  | "resume"
  | "restart"
  | "practice" // a practice span was chosen and the count-in begins
  | "quit"
  | "end" // the song ran out
  | "replay";

const TRANSITIONS: Record<Screen, Partial<Record<ScreenEvent, Screen>>> = {
  welcome: { enter: "menu" },
  menu: { enter: "songs", options: "options", credits: "credits", back: "welcome" },
  options: { back: "menu" },
  credits: { back: "menu" },
  songs: { open: "band", back: "menu" },
  band: { play: "loading", start: "countdown", back: "songs", quit: "songs" },
  loading: { loaded: "countdown", quit: "songs" },
  countdown: { go: "playing", quit: "songs" },
  playing: { pause: "paused", end: "results", quit: "songs" },
  paused: { resume: "playing", restart: "countdown", practice: "countdown", quit: "songs" },
  results: { replay: "countdown", quit: "songs" },
};

/** Where an event leads, or the screen it is already on if it means nothing here. */
export function screenAfter(screen: Screen, event: ScreenEvent): Screen {
  return TRANSITIONS[screen][event] ?? screen;
}

/**
 * What "back" means on each screen.
 *
 * The key a player reaches for — Escape — and the pad's B button are one rule, not
 * two: a page goes back a step, a run pauses, a pause resumes, and the results go
 * back to the songs. The welcome is the one screen with nowhere to go.
 */
export function backEventFor(screen: Screen): ScreenEvent | null {
  switch (screen) {
    case "welcome":
      return null;
    case "menu":
    case "options":
    case "credits":
    case "songs":
    case "band":
      return "back";
    case "loading":
    case "countdown":
    case "results":
      return "quit";
    case "playing":
      return "pause";
    case "paused":
      return "resume";
  }
}

/**
 * Does losing the whole screen pause the run?
 *
 * A browser takes Escape for itself in fullscreen: the keydown never reaches the
 * page, and the only thing the player gets for the pause key is the browser
 * leaving fullscreen. So a run that loses the screen has been *asked* to pause —
 * and nothing else has, because there is no run to pause on any other screen.
 */
export function pausesOnFullscreenEnd(
  screen: Screen,
  wasFullscreen: boolean,
  isFullscreen: boolean,
): boolean {
  return wasFullscreen && !isFullscreen && screen === "playing";
}

/**
 * Does hiding the tab pause the run?
 *
 * The stage's frame loop is a `requestAnimationFrame`, and a hidden tab stops one
 * — while the song's media elements keep playing. Without this the clock follows
 * the sound on return and the run has silently missed everything in between. Only
 * a **running** song is paused: the welcome, the menus, the jukebox, the band, the
 * load, the countdown, a pause already up and the results all keep their state,
 * because none of them has a transport running away unseen. Hiding a tab is not
 * the same as leaving the window (no blur here), since alt-tabbing to another
 * window is deliberately not a pause.
 */
export function pausesOnHidden(screen: Screen, hidden: boolean): boolean {
  return hidden && screen === "playing";
}

/** Is this screen part of a run? (Everything between the band and the results.) */
export function isRunScreen(screen: Screen): boolean {
  return (
    screen === "loading" ||
    screen === "countdown" ||
    screen === "playing" ||
    screen === "paused"
  );
}

/**
 * Does this transition open a **run**?
 *
 * The countdown after the load or a replay is a band walking on stage: it is the
 * moment the stage mounts and the band's own entrance sounds. The band screen can
 * also reach the countdown **directly**, once its charts and its sound are already
 * ready — that is the same entrance, not a different one. A countdown reached from
 * the pause is a restart or a practice pass — the stage is already up, and the
 * run is not being opened again — so it gets neither the entrance nor the
 * replayed mix. The rule is kept here rather than in the mixer so the screen
 * machine and the sound share one answer.
 */
export function opensRun(screen: Screen, previous: Screen | null): boolean {
  return (
    screen === "countdown" &&
    (previous === "band" || previous === "loading" || previous === "results")
  );
}

/**
 * Does this screen want the song's **charts**?
 *
 * Browsing is not playing: the jukebox reads the playlist and nothing else, and so
 * does everything before it. A run's charts start coming down while the band screen
 * is up, so that pressing Play is usually instant. **Nothing is fetched on the way
 * to the jukebox** — which is what the menu and its two branches are.
 *
 * The **results** keep the charts too. A replay is a second run of the same song,
 * and releasing the track when the results come up would make it fetch again — the
 * countdown would run against a shell track, and the entrance its real band earns
 * would arrive after the run had already started.
 */
export function wantsCharts(screen: Screen): boolean {
  return screen === "band" || screen === "results" || isRunScreen(screen);
}

/**
 * Is the **stage** up for this screen?
 *
 * Only for the part of the loop that *is* the stage: the countdown, the song, and a
 * pause in it. Everything else — the welcome, the menu and its branches, the jukebox,
 * the band screen, the load and the results — is a page of its own, with the whole
 * viewport to itself, because a menu drawn over a running song is a menu with a song
 * in the way. The countdown and the pause are the exceptions to *that*, because they
 * are things that happen **during** a song: the stage stays up and they sit on it.
 */
export function onStage(screen: Screen): boolean {
  return screen === "countdown" || screen === "playing" || screen === "paused";
}
