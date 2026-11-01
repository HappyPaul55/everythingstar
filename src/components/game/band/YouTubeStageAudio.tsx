import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceYouTubeClock,
  startYouTubeClock,
  type YouTubeClockState,
} from "../../../lib/game/band/youtubeClock";
import { familyVolume } from "../../../lib/game/audio/mix";
import { useClock } from "./StageClock";
import { loadYouTubeApi, YOUTUBE_STATE, type YouTubePlayer } from "./youtube";

/**
 * The music when a song ships no stems and names a YouTube video.
 *
 * The official IFrame Player API is the playback path: the video is both the
 * sound and the backdrop, and **its playhead is the stage's clock** — registered
 * through `clock.followSource`, exactly as an audio element is. The API reports
 * time coarsely, so `advanceYouTubeClock` runs on the stage's one frame loop and
 * keeps the scroll smooth between reports.
 *
 * The player hosts itself **outside React's children** (the API replaces the node
 * it is given), so a re-render cannot pull the iframe out from under it. The
 * outer container stays and carries the diagnostics.
 */
interface Props {
  videoId: string;
  /** The master fader, 0..1; a YouTube stream is outside the Web Audio graph. */
  volume: number;
  /**
   * The music family's level under the master. A video used as the song is music,
   * like any other, so its volume is the same product a stem element uses.
   */
  musicLevel: number;
  /** How far behind the sound the playhead reads. */
  lagMs: number;
  /** The transport's speed (a practice plan), or 1 for the record. */
  rate: number;
  /** A practice run owns its own end; the video ending is not the run ending. */
  practice: boolean;
}

/** How long after a seek the old reports are ignored, in ms. */
const SEEK_GUARD_MS = 300;

export function YouTubeStageAudio({
  videoId,
  volume,
  musicLevel,
  lagMs,
  rate,
  practice,
}: Props) {
  const clock = useClock();
  const clockRef = useRef(clock);
  clockRef.current = clock;

  const box = useRef<HTMLDivElement | null>(null);
  const player = useRef<YouTubePlayer | null>(null);
  const ready = useRef(false);
  const [started, setStarted] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** The last problem, for the clock's stale-read predicate (state is async). */
  const problemRef = useRef<string | null>(null);
  problemRef.current = problem;
  const smoother = useRef<YouTubeClockState>(startYouTubeClock(0, 0));
  const seekGuard = useRef(0);
  const lag = useRef(lagMs);
  lag.current = lagMs;
  const speed = useRef(rate);
  speed.current = rate;
  const inPractice = useRef(practice);
  inPractice.current = practice;
  /** A player without a rate API is a plain note in the console, once per player. */
  const rateNote = useRef(false);

  /**
   * Practice slows the video itself, because its clock is `getCurrentTime()`: a
   * stage clock slowed without the video would simply be corrected back by the
   * next report. The API exposes this as `setPlaybackRate`; a player that does
   * not (or refuses it) keeps playing at 1× and says so once, rather than
   * pretending the run is slower.
   */
  const applyRate = useCallback((one: YouTubePlayer) => {
    const wanted = speed.current;
    if (!one.setPlaybackRate) {
      if (wanted !== 1 && !rateNote.current) {
        rateNote.current = true;
        console.warn(
          "YouTubeStageAudio: this player has no playback rate; practice plays at 1×.",
        );
      }
      return;
    }
    try {
      one.setPlaybackRate(wanted, true);
    } catch {
      if (wanted !== 1 && !rateNote.current) {
        rateNote.current = true;
        console.warn(
          "YouTubeStageAudio: the player refused the practice rate; it plays at 1×.",
        );
      }
    }
  }, []);

  /** The stage's clock reads the video, with the lag the player has set. */
  const read = useCallback((): number | null => {
    const one = player.current;
    if (!one || !ready.current) return null;
    // A buffering or paused player has no time to give: the stage waits rather
    // than inventing one.
    if (one.getPlayerState() !== YOUTUBE_STATE.playing) return null;
    const now = performance.now();
    if (now < seekGuard.current) {
      return Math.max(0, smoother.current.outputMs - lag.current);
    }
    smoother.current = advanceYouTubeClock(
      smoother.current,
      Math.max(0, one.getCurrentTime() * 1000),
      now,
    );
    return Math.max(0, smoother.current.outputMs - lag.current);
  }, []);

  /** Moving the stage moves the video, never only the playhead. */
  const seek = useCallback((timeMs: number) => {
    const at = Math.max(0, timeMs + lag.current);
    smoother.current = startYouTubeClock(at, performance.now());
    seekGuard.current = performance.now() + SEEK_GUARD_MS;
    try {
      player.current?.seekTo(at / 1000, true);
      // A loop may seek a video that has just ended; if the transport is still
      // moving, start it again rather than leaving it on the last frame.
      const one = player.current;
      if (
        clockRef.current.playing &&
        one &&
        one.getPlayerState() === YOUTUBE_STATE.ended
      ) {
        one.playVideo();
      }
    } catch {
      // Not ready yet: the next report settles it.
    }
  }, []);

  // Register before the player exists: the clock must wait for the video rather
  // than count frames while it loads. `read` is null until it is playing.
  //
  // The effect deliberately does **not** depend on the clock: its value changes
  // whenever the clock plays, pauses, ends or declares a loss, and re-registering
  // on each of those would clear the loss it just declared (the playhead would
  // advance one frame per stall, and the notice would flicker). The reader is a
  // stable callback and `clockRef` is current.
  useEffect(() => {
    const live = clockRef.current;
    live.followSource(read, seek, () => problemRef.current !== null);
    return () => live.followSource(null);
  }, [read, seek]);

  useEffect(() => {
    let alive = true;
    let host: HTMLDivElement | null = null;
    // A different video starts from "not ready" again, so the transport and the
    // fader re-apply themselves to the new player.
    setStarted(false);
    setProblem(null);
    void (async () => {
      try {
        const api = await loadYouTubeApi();
        if (!alive || !box.current) return;
        // The API replaces the element it is given, so it is made here rather
        // than rendered: React never has to reconcile an iframe it did not make.
        host = document.createElement("div");
        box.current.appendChild(host);
        player.current = new api.Player(host, {
          videoId,
          playerVars: {
            autoplay: 0,
            cc_load_policy: 0,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            origin: window.location.origin,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: () => {
              if (!alive) return;
              const one = player.current;
              if (!one) return;
              ready.current = true;
              // The API's iframe is a player, not a control: keep it out of the
              // stage's focus order, exactly as the muted backdrop embed is.
              const frame = one.getIframe?.();
              if (frame) {
                frame.tabIndex = -1;
                frame.setAttribute("aria-hidden", "true");
                frame.setAttribute("title", "");
              }
              // The player may arrive after the transport has already moved: a
              // practice count-in seeks before the video exists, and starting at 0
              // would undo it. Seek to where the stage is, through the transport's
              // own helper — it adds the lag, seats the smoother on the target and
              // arms the seek guard.
              seek(clockRef.current.timeRef.current);
              applyRate(one);
              try {
                // The video's own captions are not the game's lyrics; two sets of
                // words at once is worse than one. This is best-effort on a legacy
                // API module, so a refusal is harmless.
                one.setOption?.("captions", "track", {});
                one.unloadModule?.("captions");
              } catch {
                // Best effort only.
              }
              setStarted(true);
            },
            onStateChange: (event) => {
              if (!alive) return;
              const one = player.current;
              if (event.data === YOUTUBE_STATE.ended) {
                if (!inPractice.current) clockRef.current.finish();
                return;
              }
              if (event.data === YOUTUBE_STATE.playing && one) {
                smoother.current = startYouTubeClock(
                  Math.max(0, one.getCurrentTime() * 1000),
                  performance.now(),
                );
                seekGuard.current = 0;
              }
            },
            onError: (event) => {
              if (!alive) return;
              setProblem(`The video could not be played (${event.data}).`);
            },
          },
        });
      } catch {
        if (alive) setProblem("The YouTube player could not be loaded.");
      }
    })();

    return () => {
      alive = false;
      ready.current = false;
      // The registration effect owns `followSource`; it clears on unmount. A
      // `videoId` change keeps the same reader and simply points it at the new
      // player, so clearing here would leave the stage with no clock source.
      player.current?.destroy();
      player.current = null;
      host?.remove();
    };
  }, [videoId]);

  // The transport moves the video: the stage playing is the video playing.
  useEffect(() => {
    const one = player.current;
    if (!started || !one) return;
    applyRate(one);
    if (clock.playing) {
      smoother.current = startYouTubeClock(
        Math.max(0, one.getCurrentTime() * 1000),
        performance.now(),
      );
      one.playVideo();
      // A start that raced the player's own readiness is worth one more ask; a
      // browser that refuses unmuted playback will refuse this too, and the
      // stage's clock simply waits for a request that never comes.
      const retry = setTimeout(() => {
        const current = player.current;
        if (!current) return;
        const state = current.getPlayerState();
        if (state !== YOUTUBE_STATE.playing && state !== YOUTUBE_STATE.buffering) {
          current.playVideo();
        }
      }, 1200);
      return () => clearTimeout(retry);
    }
    one.pauseVideo();
  }, [clock.playing, started, applyRate]);

  // A rate change during a run (starting practice, or leaving it) reaches the
  // player without waiting for a transport change.
  useEffect(() => {
    const one = player.current;
    if (!started || !one) return;
    applyRate(one);
  }, [rate, started, applyRate]);

  // The master fader and the music family under it are the player's own volume.
  // Nothing else in the mixer owns this stream, so there is no gain node to set
  // instead — the one product is what a stem element uses too.
  useEffect(() => {
    const one = player.current;
    if (!started || !one) return;
    const level = Math.round(familyVolume(volume, musicLevel) * 100);
    one.setVolume(level);
    if (level === 0) one.mute();
    else one.unMute();
  }, [volume, musicLevel, started]);

  useEffect(() => {
    if (problem) console.warn("YouTubeStageAudio:", problem);
  }, [problem]);

  return (
    <div
      ref={box}
      className="stage-bg__host"
      data-youtube-ready={started ? "true" : "false"}
      data-youtube-problem={problem ?? undefined}
    />
  );
}
