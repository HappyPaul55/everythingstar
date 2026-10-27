/**
 * Backdrop media helpers — pure, so they can be unit-tested.
 */

import type { Song } from "../song";

/**
 * What a backdrop can be.
 *
 * A **blank** stage is still possible, but nothing asks for it: the menus sit in the
 * game's own room and a run paints the song's back, so a song with nothing of its own
 * falls back rather than going black.
 */
export type StageMedia =
  | { kind: "blank" }
  | { kind: "image"; src: string; blur?: boolean }
  | { kind: "video"; src: string; poster?: string }
  | { kind: "youtube"; id: string };

/**
 * The backdrop the **menus** sit in: the game's own artwork.
 *
 * It is the room, not the subject — the songs are the subject — so it is the same every
 * time, and a run paints its own over the top of it.
 */
export const DEFAULT_BACKDROP = "/images/background_1.jpg";

/**
 * The backdrop a **run** plays against: the song's own video, or its art, or ours.
 *
 * `video` is the dev switch: off means "do not use this song's video", and the ladder
 * carries on to the art rather than falling to nothing. `art` is the song's cover
 * **already resolved** — a folder's art is a file the browser cannot fetch by URL, so
 * the caller hands in a URL it can load and this stays pure.
 */
export function backdropFor(
  song: Song | null,
  video: boolean,
  art: string | null,
): StageMedia {
  if (video && song?.video) {
    return song.video.kind === "youtube"
      ? { kind: "youtube", id: song.video.id }
      : { kind: "video", src: song.video.url };
  }
  // A cover is square and often small: blurred and covered, it is a back rather than a
  // picture pulled out of shape.
  return art
    ? { kind: "image", src: art, blur: true }
    : { kind: "image", src: DEFAULT_BACKDROP };
}

/**
 * An autoplaying, muted, chrome-free YouTube embed that loops one video, for use
 * as the stage backdrop. Muting is what lets the browser autoplay it, and a
 * single video only loops when it is also named as the playlist.
 */
export function youtubeEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    loop: "1",
    playlist: videoId,
    playsinline: "1",
    modestbranding: "1",
    rel: "0",
    iv_load_policy: "3",
    disablekb: "1",
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}
