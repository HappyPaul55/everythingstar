import type { CSSProperties } from "react";
import { youtubeEmbedUrl, type StageMedia } from "../../../lib/game/band/media";
import { YouTubeStageAudio } from "./YouTubeStageAudio";

/**
 * The stage backdrop: the song's own video, its art, or the game's own artwork — with a
 * scrim so the regions stay readable over bright footage.
 *
 * When `youtube` is set, the video is also the **music**, so the backdrop is the
 * one API-controlled player instead of a muted embed. If the song's video setting
 * is off, the same player still runs, invisibly, over the artwork: turning off a
 * backdrop must not take the song's sound with it.
 */
interface Props {
  media: StageMedia;
  youtube?: {
    videoId: string;
    volume: number;
    musicLevel: number;
    lagMs: number;
    rate: number;
    practice: boolean;
  } | null;
  /**
   * How far the backdrop is dimmed, 0..0.8. It is handed to the backdrop's own
   * layer as `--backdrop-dim`, and the dim overlay is the last thing drawn inside
   * it — above the video or art and its scrim, below the stage's panels and notes,
   * which keep their own contrast.
   */
  dim?: number;
}

/**
 * A YouTube backdrop has to cover the stage and lose its player chrome, so it is
 * sized from the viewport (the stage is 100dvh) and nudged up in scale. The rules
 * are on the wrapper's descendants because the IFrame API replaces the element it
 * is given: its own iframe is built inside the host, at the same depth.
 */
const EMBED =
  "stage-bg__embed absolute inset-0 overflow-hidden [&_iframe]:pointer-events-none [&_iframe]:absolute [&_iframe]:left-1/2 [&_iframe]:top-1/2 [&_iframe]:h-[56.25vw] [&_iframe]:w-screen [&_iframe]:min-h-dvh [&_iframe]:min-w-[177.78dvh] [&_iframe]:border-0 [&_iframe]:[transform:translate(-50%,-50%)_scale(1.15)]";

/**
 * A still back: the game's artwork, or a song's cover stretched past its size. A
 * cover is square and often small, so it is blurred into a back rather than pulled
 * out of shape: an atmosphere, not a picture.
 */
const STILL = "stage-bg__image absolute inset-0 bg-cover bg-center bg-no-repeat";
const STILL_BLUR =
  "stage-bg__image stage-bg__image--blur absolute -inset-[6%] bg-cover bg-center bg-no-repeat blur-[28px] saturate-[1.1]";

export function StageBackground({ media, youtube, dim = 0 }: Props) {
  return (
    <div
      className="stage-bg absolute inset-0 z-0"
      aria-hidden="true"
      style={{ "--backdrop-dim": dim } as CSSProperties}
    >
      {media.kind === "image" ? (
        <div
          className={media.blur ? STILL_BLUR : STILL}
          style={{ backgroundImage: `url(${media.src})` }}
        />
      ) : null}
      {media.kind === "video" ? (
        <video
          className="stage-bg__video h-full w-full object-cover"
          src={media.src}
          poster={media.poster}
          muted
          loop
          playsInline
          autoPlay
        />
      ) : null}
      {youtube ? (
        <div
          className={
            // The player is the truth: if the song's video is on, it is the
            // picture as well as the sound. A stale id in the playlist summary
            // must not put a second, muted embed behind it. A player told not to
            // show its video keeps running and audible, and lets the stage's own
            // artwork be the picture.
            media.kind === "youtube" ? EMBED : `${EMBED} is-audio-only opacity-0`
          }
        >
          <YouTubeStageAudio
            videoId={youtube.videoId}
            volume={youtube.volume}
            musicLevel={youtube.musicLevel}
            lagMs={youtube.lagMs}
            rate={youtube.rate}
            practice={youtube.practice}
          />
        </div>
      ) : media.kind === "youtube" ? (
        <div className={EMBED}>
          <iframe
            src={youtubeEmbedUrl(media.id)}
            title=""
            tabIndex={-1}
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : null}
      <div className="stage-bg__scrim absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(12,13,10,0.12),rgba(12,13,10,0.58)_72%),linear-gradient(to_bottom,rgba(12,13,10,0.28),rgba(12,13,10,0.46))]" />
      {/* The dim is the backdrop's own: it sits over the video or art and its
          scrim, and under every panel and note the stage draws. */}
      <div className="stage-bg__dim pointer-events-none absolute inset-0 bg-ink opacity-[var(--backdrop-dim,0)]" />
    </div>
  );
}
