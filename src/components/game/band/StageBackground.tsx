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

export function StageBackground({ media, youtube, dim = 0 }: Props) {
  return (
    <div
      className="stage-bg"
      aria-hidden="true"
      style={{ "--backdrop-dim": dim } as CSSProperties}
    >
      {media.kind === "image" ? (
        <div
          className={
            media.blur ? "stage-bg__image stage-bg__image--blur" : "stage-bg__image"
          }
          style={{ backgroundImage: `url(${media.src})` }}
        />
      ) : null}
      {media.kind === "video" ? (
        <video
          className="stage-bg__video"
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
            // must not put a second, muted embed behind it.
            media.kind === "youtube" ? "stage-bg__embed" : "stage-bg__embed is-audio-only"
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
        <div className="stage-bg__embed">
          <iframe
            src={youtubeEmbedUrl(media.id)}
            title=""
            tabIndex={-1}
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : null}
      <div className="stage-bg__scrim" />
      {/* The dim is the backdrop's own: it sits over the video or art and its
          scrim, and under every panel and note the stage draws. */}
      <div className="stage-bg__dim" />
    </div>
  );
}
