import { useEffect, useMemo, useState } from "react";
import { useT } from "../../../i18n/react";
import type { Translate } from "../../../i18n";
import { audioFacts, audioLine, autoplayPolicy } from "../../../lib/game/audio/diagnostics";
import type { BandSetup } from "../../../lib/game/band/types";
import { lanePlayers } from "../../../lib/game/band/types";
import { HIGHWAY_VIEWS, type HighwayView } from "../../../lib/game/settings";
import { seatControlReadout } from "../../../lib/game/controls/plan";
import type { Screen } from "../../../lib/game/screens";
import { SCREENS } from "../../../lib/game/screens";
import { Stepper } from "../Stepper";
import { useAudio } from "../audio/StageAudio";
import { useReducedMotion } from "./useReducedMotion";
import type { Sounds } from "../audio/useSounds";
import { useSong } from "./SongContext";
import { useStageControls } from "./StageControls";
import type { MicStatus } from "./useMicInput";
import { useClock, useClockMs, useFps, formatClock } from "./StageClock";
import type { FullscreenState } from "./useFullscreen";

/**
 * TEMPORARY preview controls. **Dev tools, not the product** — see
 * `src/lib/game/dev.ts` for the flag and the removal list: the transport, the
 * frame-rate and note-count read-outs, the screen jumper, how many players take a
 * keyboard, and the video switch. `?dev=1` shows them and nothing else does.
 *
 * Choosing a song and choosing a band are the product's own screens now, so this
 * panel no longer sets a band up — it only looks at one.
 */
interface Props {
  /** The band as built, for the key map. */
  setup: BandSetup;
  /** How many lane players take a keyboard; the rest play themselves. */
  humans: number;
  onHumans: (humans: number) => void;
  video: boolean;
  onVideoChange: (video: boolean) => void;
  /** Which way the necks are drawn; a setting the options page also owns. */
  view: HighwayView;
  onViewChange: (view: HighwayView) => void;
  fullscreen: FullscreenState;
  /** The screen the game is on, and a way to jump to any of them. */
  screen: Screen;
  onGoTo: (screen: Screen) => void;
  /** What the game can play, and what it is still waiting for. */
  sounds: Sounds;
}

export function BandControls({
  setup,
  humans,
  onHumans,
  video,
  onVideoChange,
  view,
  onViewChange,
  fullscreen,
  screen,
  onGoTo,
  sounds,
}: Props) {
  const t = useT();
  const clock = useClock();
  const audio = useAudio();
  const reducedMotion = useReducedMotion();
  const { plan, conflicts, pads, mic } = useStageControls();
  const timeMs = useClockMs(250);
  const fps = useFps();
  const { track } = useSong();
  const lanes = lanePlayers(setup);
  // **Closed to begin with.** The chip is the door; a panel that is already open is
  // a panel somebody has to close before they can see the thing they came to review.
  const [open, setOpen] = useState(false);

  const noteCount = useMemo(
    () =>
      track.charts.reduce((total, chart) => total + chart.notes.length, 0) +
      track.melody.notes.length,
    [track],
  );

  return (
    <div className="band-controls">
      {/* The way in: one chip, and **everything** behind it — the transport included,
          so a look at the stage is a look at the stage. */}
      <button
        type="button"
        className="band-controls__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t("band.devPanel")}
      </button>

      {open ? (
        <div className="band-controls__row">
          {/* Marked, loudly and on purpose: none of this is the product. See
              `src/lib/game/dev.ts` for what comes out before release. */}
          <span className="band-controls__dev">{t("band.dev")}</span>
          <button type="button" className="band-controls__button" onClick={clock.toggle}>
            {clock.playing ? t("band.pause") : t("band.play")}
          </button>
          <button type="button" className="band-controls__button" onClick={clock.restart}>
            {t("band.restart")}
          </button>
          <input
            className="band-scrub"
            type="range"
            min={0}
            max={clock.durationMs}
            step={1000}
            value={Math.round(timeMs)}
            aria-label={t("band.seek")}
            onChange={(event) => clock.seek(Number(event.target.value))}
          />
          <span className="band-controls__stat">{formatClock(timeMs)}</span>
          <span className="band-controls__stat">{t("band.fps", { fps })}</span>
          <span className="band-controls__stat">
            {t("band.noteCount", { count: noteCount })}
          </span>
        </div>
      ) : null}

      {open ? (
        <div className="band-controls__bar">
          {/* Every screen, reachable without playing the song before it — the
              whole point of the jumper. */}
          <div className="band-step" role="group" aria-label={t("band.screenLabel")}>
            <span className="band-step__label">{t("band.screenLabel")}</span>
            {SCREENS.map((entry) => (
              <button
                key={entry}
                type="button"
                className={
                  entry === screen ? "band-step__option is-active" : "band-step__option"
                }
                aria-pressed={entry === screen}
                onClick={() => onGoTo(entry)}
              >
                {t(`band.screen.${entry}` as "band.screen.songs")}
              </button>
            ))}
          </div>

          {/* How many of them take a keyboard. The rest are played by the
              machine, which is review scaffolding like the rest of this panel. */}
          {lanes.length > 0 ? (
            <Stepper
              label={t("band.humansLabel")}
              value={humans}
              max={lanes.length}
              onChange={onHumans}
            />
          ) : null}
          <div className="band-step" role="group" aria-label={t("band.video")}>
            <span className="band-step__label">{t("band.video")}</span>
            {[1, 0].map((option) => (
              <button
                key={option}
                type="button"
                className={
                  (video ? 1 : 0) === option
                    ? "band-step__option is-active"
                    : "band-step__option"
                }
                aria-pressed={(video ? 1 : 0) === option}
                onClick={() => onVideoChange(option === 1)}
              >
                {option === 1 ? t("band.on") : t("band.off")}
              </button>
            ))}
          </div>
          {/* Which way the necks are drawn. The same setting the options page owns,
              so the review surface and the product surface cannot disagree. */}
          <div className="band-step" role="group" aria-label={t("screen.view")}>
            <span className="band-step__label">{t("screen.view")}</span>
            {HIGHWAY_VIEWS.map((option) => (
              <button
                key={option}
                type="button"
                className={
                  view === option ? "band-step__option is-active" : "band-step__option"
                }
                aria-pressed={view === option}
                onClick={() => onViewChange(option)}
              >
                {option === "flat" ? t("screen.viewFlat") : t("screen.view3d")}
              </button>
            ))}
          </div>
          {fullscreen.supported ? (
            <button
              type="button"
              className="band-controls__button"
              aria-pressed={fullscreen.active}
              onClick={fullscreen.toggle}
            >
              {fullscreen.active ? t("band.exitFullscreen") : t("band.fullscreen")}
            </button>
          ) : null}
          {/* The volume, and which bed the bag dealt. A game with four backgrounds
              and no way to turn them down is a game somebody closes. */}
          <div className="band-step band-step--volume" role="group" aria-label={t("band.volume")}>
            <label className="band-step__label" htmlFor="band-volume">
              {t("band.volume")}
            </label>
            <input
              id="band-volume"
              className="band-scrub"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.volume}
              onChange={(event) => audio.setVolume(Number(event.target.value))}
            />
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="band-controls__keys">
          {lanes.map((player) => (
            <span key={player.id} className="band-key">
              <span className="band-key__who">{t("band.player", { n: player.seat + 1 })}</span>
              <span className="band-key__map">
                {seatControlReadout(t, plan.seats, player.seat, player.auto)}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      {/* What is plugged in, and where two seats want the same control. The
          warning is the point: one keyboard cannot tell two people apart, so the
          game says so instead of quietly double-judging. */}
      {open ? (
        <div className="band-controls__notes">
          <p className="band-controls__note">{t("band.controllers")}</p>
          {pads.length === 0 ? (
            <p className="band-controls__note band-controls__note--dim">{t("band.noPads")}</p>
          ) : (
            pads.map((pad) => (
              <p key={pad.index} className="band-controls__note band-controls__note--dim">
                {pad.mapping === "standard"
                  ? t("band.padOn", { n: pad.index + 1 })
                  : t("band.padOdd", { n: pad.index + 1 })}
              </p>
            ))
          )}
          {conflicts.map((conflict) => (
            <p
              key={conflict.seats.join("-")}
              className="band-controls__note band-controls__note--warn"
              role="note"
            >
              {t("band.share", {
                a: conflict.seats[0] + 1,
                b: conflict.seats[1] + 1,
                keys: conflict.controls.join(" "),
              })}
            </p>
          ))}
          {conflicts.length > 0 ? (
            <p className="band-controls__note band-controls__note--dim">{t("band.shareWhy")}</p>
          ) : null}
          {/* The microphone has a status worth seeing: a refusal is not an error,
              it is a band that plays itself, and the read-out says which it is. */}
          {mic.supported ? (
            <p className="band-controls__note band-controls__note--dim">{micLine(t, mic.status)}</p>
          ) : null}
          {/* What the game can play: the sound manifest's own tally, so the count of
              what is still to come is read from the file rather than remembered.
              Reload is for a sound dropped in while the game is running. */}
          <p className="band-controls__note">
            {t("band.sounds")}: {sounds.loading
              ? t("band.soundsLoading")
              : t("band.soundsCount", {
                  have: sounds.sounds.length,
                  total: sounds.sounds.length + sounds.missing.length,
                  types: sounds.types.length,
                })}
            {sounds.loading ? null : (
              <button
                type="button"
                className="band-controls__mini"
                onClick={sounds.reload}
              >
                {t("band.reload")}
              </button>
            )}
          </p>
          {/* What the mixer is actually playing, so a silent game can be told from a
              game with nothing to play. */}
          <p className="band-controls__note band-controls__note--dim">
            {t("band.music")}: {audio.bed ?? t("band.musicOff")}
          </p>
          {/* The song's own sound, asked of the elements themselves: the line above is
              the mixer's beds, and this is the music a run is played against. */}
          <SongAudioReadout t={t} />
          {/* Whether the browser is asking for reduced motion. If the backdrop flares
              look frozen, it is almost always this rather than a bug. */}
          <p className="band-controls__note band-controls__note--dim">
            {t("band.motion")}: {t(reducedMotion ? "band.motionReduced" : "band.motionFull")}
          </p>
          {sounds.problems.slice(0, 3).map((problem) => (
            <p key={problem} className="band-controls__note band-controls__note--warn" role="note">
              {problem}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** What the microphone is doing, in one line, for the dev read-out. */
function micLine(t: Translate, status: MicStatus): string {
  const keys: Record<MicStatus, "band.micOff" | "band.micOn" | "band.micAsked" | "band.micRefused" | "band.micFailed"> = {
    idle: "band.micOff",
    requesting: "band.micAsked",
    listening: "band.micOn",
    refused: "band.micRefused",
    unsupported: "band.micFailed",
    error: "band.micFailed",
  };
  return `${t("band.mic")}: ${t(keys[status])}`;
}

/**
 * What the song's own sound is doing — the read-out for "I hear nothing".
 *
 * The mixer's line above says what a **bed** is playing; this says what the *song* is,
 * and it asks the elements themselves rather than describing what they were told to do.
 * A silent run is one of a dozen things — no elements at all (the song never loaded), a
 * file the browser refused, an element that never started, a fader at zero, a page the
 * autoplay policy will not let start a sound — and each of them leaves a different mark
 * here. It polls, because a song loads while the panel is open.
 */
function SongAudioReadout({ t }: { t: Translate }) {
  const [read, setRead] = useState<{
    lines: string[];
    play: string | null;
    stems: number;
    sources: number;
    unreadable: number;
    failed: number;
    spread: number | null;
  }>({ lines: [], play: null, stems: 0, sources: 0, unreadable: 0, failed: 0, spread: null });

  useEffect(() => {
    const look = () => {
      const line = document.querySelector(".song-audio");
      const elements = [
        ...document.querySelectorAll<HTMLAudioElement>(".song-audio audio"),
      ];
      setRead({
        lines: elements.map((element) =>
          audioLine(audioFacts(element), mediaName(element)),
        ),
        play: line?.getAttribute("data-play-error") ?? null,
        // The counts the player itself wrote down: what this run plays, what the
        // browser got, and how many of them it could not read or load at all.
        stems: attributeCount(line?.getAttribute("data-stems")),
        sources: attributeCount(line?.getAttribute("data-sources")),
        unreadable: attributeCount(line?.getAttribute("data-unreadable")),
        failed: elements.filter((element) => element.error !== null).length,
        // What the alignment last left the stems at: the distance between the
        // earliest and latest element, which is the number an echo is heard as.
        spread: attributeNumber(line?.getAttribute("data-stem-spread")),
      });
    };
    look();
    const timer = window.setInterval(look, 700);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
      <p className="band-controls__note">
        {t("band.songAudio")}:{" "}
        {read.stems === 0
          ? t("band.noStems")
          : t("band.stems", { have: read.sources, total: read.stems })}{" "}
        {read.spread !== null ? `· ${t("band.stemSpread")}: ${read.spread} ms ` : null}
        · {t("band.autoplay")}: {autoplayPolicy(navigator)}
      </p>
      {read.unreadable > 0 ? (
        <p className="band-controls__note band-controls__note--warn" role="note">
          {t("band.stemsUnread", { count: read.unreadable })}
        </p>
      ) : null}
      {read.failed > 0 ? (
        <p className="band-controls__note band-controls__note--warn" role="note">
          {t("band.stemsFailed", { count: read.failed })}
        </p>
      ) : null}
      {read.lines.map((line, index) => (
        <p key={index} className="band-controls__note band-controls__note--dim">
          {line}
        </p>
      ))}
      {read.play ? (
        <p className="band-controls__note band-controls__note--warn" role="note">
          {t("band.playRefused")}: {read.play}
        </p>
      ) : null}
    </>
  );
}

/** A count attribute the read-out wants, or 0 when it is missing or not a number. */
function attributeCount(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * What to call one media element in the read-out.
 *
 * `SongAudio` writes the original file name onto the element (`data-file`), because
 * an object URL has lost it. Older elements or a hand-built one fall back to the
 * URL's last path segment, which is better than no name at all.
 */
function mediaName(element: HTMLAudioElement): string {
  const named = element.dataset.file;
  if (named) return named;
  const src = element.currentSrc || element.src;
  try {
    const path = new URL(src).pathname;
    const last = path.slice(path.lastIndexOf("/") + 1);
    return decodeURIComponent(last) || "audio";
  } catch {
    return "audio";
  }
}

/** An optional count: null when the player has not written one at all. */
function attributeNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
