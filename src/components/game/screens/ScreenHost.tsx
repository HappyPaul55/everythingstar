import type { ReactNode } from "react";
import type { Screen } from "../../../lib/game/screens";
import type { GameSession } from "../useGameSession";
import { Band } from "./Band";
import { Credits } from "./Credits";
import { Loading } from "./Loading";
import { Menu } from "./Menu";
import { Options } from "./Options";
import { PauseMenu } from "./PauseMenu";
import { Results } from "./Results";
import { Songs } from "./Songs";
import { Welcome } from "./Welcome";

/**
 * What the credits page names — the author, the source and the licence. It comes
 * from the site's own settings through the page, so the game names its author in
 * one place rather than in a dictionary that would drift from it.
 */
export interface ScreenCredits {
  author: string;
  authorUrl: string;
  repo: string;
  license: string;
  licenseUrl: string;
}

type PageView = (session: GameSession, credits: ScreenCredits) => ReactNode;
type OverlayView = (session: GameSession) => ReactNode;

/**
 * The stage's screens: the entrance, the song, and a pause in it. These are the
 * only screens whose content sits **inside** `BandStage`, because they are things
 * that happen during a song.
 */
type StageScreen = "countdown" | "playing" | "paused";
type PageScreen = Exclude<Screen, StageScreen>;

function isStageScreen(screen: Screen): screen is StageScreen {
  return screen === "countdown" || screen === "playing" || screen === "paused";
}

/**
 * The pages: the welcome, the menu and its two branches, the jukebox, the band
 * screen, the load and the results. Each is a screen of its own with the whole
 * viewport to itself — a page is not the stage, and the stage must not mount
 * behind one.
 *
 * This is the **one** place a screen is mapped to what it renders. Adding a screen
 * is one entry here (and one in `screens.ts`); later, a lazy-loaded screen is the
 * same entry wrapped in `lazy`/`Suspense`, with no change to the shell.
 */
const PAGES: Record<PageScreen, PageView> = {
  welcome: (session) => (
    <Welcome
      focus={session.focus}
      onEnter={() => {
        // Straight to the whole screen: entering the stage *is* the ask, and a
        // browser that refuses simply leaves the page.
        session.fullscreen.enter();
        session.dispatch("enter");
      }}
    />
  ),
  menu: (session) => (
    <Menu
      onQuickPlay={() => session.dispatch("enter")}
      onOptions={() => session.dispatch("options")}
      onCredits={() => session.dispatch("credits")}
      onBack={() => session.dispatch("back")}
    />
  ),
  options: (session) => (
    <Options
      settings={session.settings}
      onSettings={session.changeSettings}
      plan={session.plan}
      onPlan={session.changePlan}
      onBack={() => session.dispatch("back")}
    />
  ),
  credits: (session, credits) => (
    <Credits
      sounds={session.sounds.sounds}
      site={credits}
      onBack={() => session.dispatch("back")}
    />
  ),
  songs: (session) => (
    <Songs
      song={session.song}
      phone={session.phoneLayout}
      returning={session.returningToSongs}
      library={session.library}
      onSong={session.setWantedId}
      onNext={() => session.dispatch("open")}
      onBack={() => session.dispatch("back")}
      board={session.board}
      attract={session.attract}
    />
  ),
  band: (session) =>
    session.song ? (
      <Band
        song={session.song}
        doc={session.load.doc}
        problems={session.load.problems}
        chartsReady={session.load.status === "ready"}
        plan={session.plan}
        onPlan={session.changePlan}
        onPlay={session.startRun}
        onBack={() => session.dispatch("back")}
        fullscreen={session.fullscreen}
        phone={session.phoneLayout}
      />
    ) : null,
  loading: (session) => (
    <Loading
      ready={session.load.status === "ready"}
      problems={session.load.problems}
      onLoaded={() => session.dispatch("loaded")}
    />
  ),
  results: (session) =>
    session.song ? (
      <Results
        song={session.song}
        setup={session.setup}
        saved={session.board}
        onSaved={session.setBoard}
        onReplay={() => session.dispatch("replay")}
        onMenu={() => session.dispatch("quit")}
        save={!session.attract}
      />
    ) : null,
};

/**
 * The overlay that sits **inside** `BandStage`: the pause. The countdown screen has
 * no overlay at all — its entrance is the stage's own slide and the band's hype —
 * and `playing` is the stage itself. The map keeps all three stage screens in one
 * place.
 */
const STAGE_OVERLAYS: Record<StageScreen, OverlayView | null> = {
  countdown: null,
  playing: null,
  paused: (session) =>
    session.song ? (
      <PauseMenu
        song={session.song}
        onResume={() => session.dispatch("resume")}
        onRestart={() => session.dispatch("restart")}
        onQuit={() => session.dispatch("quit")}
        practice={session.practice}
        sections={session.practiceSections}
        durationMs={session.track.durationMs}
        onStartPractice={session.startPractice}
        onStopPractice={session.stopPractice}
        settings={session.settings}
        onSettings={session.changeSettings}
        setup={session.setup}
      />
    ) : null,
};

/** The page the current screen is, or nothing when the stage is up. */
export function ScreenPage({
  session,
  credits,
}: {
  session: GameSession;
  credits: ScreenCredits;
}) {
  if (isStageScreen(session.screen)) return null;
  return PAGES[session.screen](session, credits);
}

/** The pause, for the stage's overlay slot. */
export function StageOverlay({ session }: { session: GameSession }) {
  if (!isStageScreen(session.screen)) return null;
  const view = STAGE_OVERLAYS[session.screen];
  return view ? view(session) : null;
}
