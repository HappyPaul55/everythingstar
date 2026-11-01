import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { withLocale } from "../../i18n/react";
import { DEFAULT_BACKDROP, DEFAULT_BACKDROP_SRCSET } from "../../lib/game/band/media";
import { readAttractConfig, type AttractConfig } from "../../lib/game/attract";
import { BackdropFlares } from "./band/BackdropFlares";
import { BandStage } from "./band/BandStage";
import { SongAudio } from "./band/SongAudio";
import { StageDirector } from "./band/StageDirector";
import { StageFullscreen } from "./band/StageFullscreen";
import { StagePause } from "./band/StagePause";
import { useCoarsePointer } from "./band/useCoarsePointer";
import { useWakeLock } from "./band/useWakeLock";
import { useAttract } from "./attract/useAttract";
import { GamepadNav } from "./ui/GamepadNav";
import { ScreenFocus } from "./ui/ScreenFocus";
import { GameProviders } from "./GameProviders";
import { useGameSession } from "./useGameSession";
import {
  ScreenPage,
  StageOverlay,
  type ScreenCredits,
} from "./screens/ScreenHost";

/**
 * EverythingStar's game island — the shell around the loop.
 *
 * It draws the room, the provider tower, the stage and its overlays, the pages,
 * the corner and the focus announcement. The **session** (`useGameSession`) owns
 * the screen, the library, the chosen song, the band and the board; the **screen
 * registry** (`screens/ScreenHost`) says what each screen renders; and the
 * **providers** (`GameProviders`) stay above both, which is what makes that safe:
 * the clock, the input route and the run board live above the stage, so a run
 * survives every screen change and the stage can come and go with the song.
 *
 * **One screen at a time, and only one of them is the stage**: the song, and the
 * countdown and the pause that happen during it. The welcome, the jukebox, the
 * band screen, the load and the results are **pages of their own**, with the whole
 * viewport to themselves — a menu drawn over a running song is a menu with a song
 * in the way. The countdown and the pause are children **inside** `BandStage`.
 *
 * Every `client:*` island is its own React root, so `withLocale` supplies the
 * page's locale at the top of the tree (see `src/i18n/react.tsx`).
 */
interface Props {
  /** The credits page's own facts, from the site's settings through the page. */
  credits: ScreenCredits;
  /**
   * This island is the arcade entry: after the idle it plays itself, and any real
   * input gives the welcome back. The query string chooses the window's own shape
   * (one player or a band, sound on or off) because the page is statically built.
   */
  attract?: boolean;
}

/**
 * The dev panel is review scaffolding and ships behind `?dev=1`, so its chunk is
 * fetched only when that flag is on. The fallback is nothing at all: the corner
 * already holds the fullscreen control, and a status line in a review-only corner
 * would be more noticeable than the panel arriving a moment late.
 */
const BandControls = lazy(() =>
  import("./band/BandControls").then((module) => ({
    default: module.BandControls,
  })),
);

/**
 * The link question is only ever shown when a `/open` link (or a native hand-off)
 * arrives, so its chunk is fetched on that press rather than with the game.
 */
const IntentDialog = lazy(() =>
  import("./screens/IntentDialog").then((module) => ({
    default: module.IntentDialog,
  })),
);

function GameApp({ credits, attract = false }: Props) {
  // The query is read after mount: `/arcade` is one static document, and only the
  // client knows which window (`players=1`) or kiosk policy (`sound=1`) it is in.
  const [attractConfig, setAttractConfig] = useState<AttractConfig | null>(null);
  const [attractActive, setAttractActive] = useState(false);
  const [attractSilent, setAttractSilent] = useState(true);
  useEffect(() => {
    if (!attract) return;
    setAttractConfig(readAttractConfig(window.location.search));
  }, [attract]);

  const session = useGameSession(
    attractActive && attractConfig
      ? {
          players: attractConfig.players,
          silent: attractSilent,
          chrome: attractConfig.chrome,
        }
      : null,
  );

  const activateAttract = useCallback((silent: boolean) => {
    setAttractSilent(silent);
    setAttractActive(true);
  }, []);
  const stopAttract = useCallback(() => setAttractActive(false), []);
  useAttract({
    session,
    config: attractConfig,
    active: attractActive,
    onActivate: activateAttract,
    onStop: stopAttract,
  });
  // A phone has no Escape key: the pause is a control on the stage for it. The
  // hook says no on the server, so the first paint matches.
  const coarse = useCoarsePointer();

  // The display, for the part of the loop that is a song. The rule is
  // `wakeLock.ts` and the asking is the hook; it is mounted here rather than in a
  // screen because the run is what it follows. Inside the native shell the app's
  // own boot already keeps the screen awake, so the hook is told not to ask.
  const native =
    typeof document !== "undefined" &&
    document.documentElement.dataset.native !== undefined;
  useWakeLock({
    enabled: session.settings.keepAwake,
    screen: session.screen,
    native,
  });

  return (
    <div className="band" ref={session.bandRef}>
      {/* The room the menus sit in: the game's own artwork. A run paints the song's
          own back over the top of it, so this is what "no song" looks like. */}
      <div className="band__backdrop" aria-hidden="true">
        {/* A native source set, not a CSS background: the browser fetches the
            width its screen actually needs, and the largest is only paid by a
            large retina display. */}
        <img
          className="band__backdrop-image"
          src={DEFAULT_BACKDROP}
          srcSet={DEFAULT_BACKDROP_SRCSET}
          sizes="100vw"
          alt=""
          width={2048}
          height={1152}
          fetchPriority="high"
          decoding="async"
        />
      </div>
      {/* The room's lights, drifting over it. Decorative, and still under
          `prefers-reduced-motion`. Set aside while a song's own video plays, and
          not drawn at all when the drifting-lights setting is off. */}
      {session.settings.flares ? (
        <BackdropFlares hidden={session.videoBackdrop} />
      ) : null}
      <GameProviders
        screen={session.screen}
        sounds={session.sounds}
        volume={session.settings.volume}
        onVolume={(level) => session.changeSettings({ volume: level })}
        levels={session.settings.levels}
        crowd={session.settings.crowd}
        setup={session.setup}
        track={session.track}
        seed={session.song?.seed ?? 0}
        doc={session.load.doc}
        perfect={session.perfect}
        audio={!session.silent}
      >
        <StageDirector
          screen={session.screen}
          onEnd={session.endRun}
          practice={session.practice}
          pendingPractice={session.pendingPractice}
          onPracticeStarted={session.practiceStarted}
          onPracticeEnd={session.pauseRun}
        />
        {/* The pad as a menu cursor, on the same frame loop as the transport. It is
            inert while a song is moving; Start is the one exception, because
            pausing must not need a mouse. */}
        {session.attract ? null : (
          <GamepadNav screen={session.screen} dispatch={session.dispatch} />
        )}
        {/* The song's own sound, and the clock's source: while there is audio, the
            music *is* the playhead. A YouTube-backed song is the same idea with the
            video as the source, and the player lives with the backdrop rather than
            here. A silent demo has neither: the frame clock is the song. */}
        {session.silent || session.youtubeAudio ? null : (
          <SongAudio
            doc={session.load.doc}
            volume={session.settings.volume}
            musicLevel={session.settings.levels.music}
            lagMs={session.settings.audioLagMs}
            sung={session.sung}
            rate={session.practice?.speed ?? 1}
            practice={session.practice !== null}
          />
        )}

        {/* The stage, for the part of the loop that is one: the song, and the
            countdown and the pause that sit on it. It comes and goes with the
            screen — the clock and the input route do not, which is what keeps a
            run intact across the change. */}
        {session.stage ? (
          <BandStage
            setup={session.setup}
            media={session.media}
            view={session.settings.view}
            noteStyle={session.settings.noteStyle}
            noteSpeed={session.settings.noteSpeed}
            visualLagMs={session.settings.visualLagMs}
            backdropDim={session.settings.backdropDim}
            tap={session.settings.tap}
            haptics={session.settings.haptics}
            youtube={session.youtubeAudio}
            practice={session.practice}
          >
            <StageOverlay session={session} />
          </BandStage>
        ) : null}

        {/* The pages, which are the game's roomy half: the board the welcome opens
            on to, its two branches, choosing a song, saying who is playing it, and
            what came of it. */}
        <ScreenPage session={session} credits={credits} />

        {/* A link's question, over whatever screen it arrived on. The press that
            answers it is the only thing that changes the library. */}
        {session.intent.request ? (
          <Suspense fallback={null}>
            <IntentDialog
              request={session.intent.request}
              onAccept={session.intent.accept}
              onDismiss={session.intent.dismiss}
            />
          </Suspense>
        ) : null}

        {/* One corner, two things that belong on top of every screen: the way back
            into the whole screen (product), and the dev panel (review scaffolding).
            They share the container so neither can sit on the other, and the panel
            is **closed** until the chip is pressed. The homepage window asks for a
            screen and nothing else, so its corner is set aside. */}
        {!session.attract || attractConfig?.chrome ? (
          <div className="stage-corner">
            <div className="stage-corner__row">
              {coarse && session.screen === "playing" ? (
                <StagePause onPause={() => session.dispatch("pause")} />
              ) : null}
              <StageFullscreen fullscreen={session.fullscreen} />
            </div>
            {session.dev ? (
              <Suspense fallback={null}>
                <BandControls
                  setup={session.setup}
                  humans={session.humans}
                  onHumans={session.setHumans}
                  video={session.settings.video}
                  onVideoChange={(wanted) => session.changeSettings({ video: wanted })}
                  view={session.settings.view}
                  onViewChange={(wanted) => session.changeSettings({ view: wanted })}
                  fullscreen={session.fullscreen}
                  screen={session.screen}
                  onGoTo={session.goTo}
                  sounds={session.sounds}
                />
              </Suspense>
            ) : null}
          </div>
        ) : null}

        {/* One island, no page loads: say the new screen to a screen reader and put
            focus where that screen starts. The homepage's window is a picture and
            must not take the page's focus, so it says nothing and places nothing. */}
        {session.focus ? (
          <ScreenFocus screen={session.screen} song={session.song} />
        ) : null}
      </GameProviders>
    </div>
  );
}

/** The island's root: the locale comes from the page, and `.band` is the stage. */
export default withLocale(GameApp);
