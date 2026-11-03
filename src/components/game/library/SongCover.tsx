import { useState, type CSSProperties } from "react";
import { songArt, songInitials, type Song } from "../../../lib/game/song";
import { useArtThumb } from "./useArtUrl";

/**
 * A song's artwork, or the tile that stands in for it.
 *
 * Art is optional in a playlist and may be somewhere the browser cannot reach, so
 * nothing depends on it: the **tile** — the title's initials over the song's own
 * accent — is what a song looks like with no art at all, and what it falls back to
 * when the art does not arrive. It is `aria-hidden` either way: the title sits
 * beside it, said in full, and a screen reader does not need it twice.
 */
interface Props {
  song: Song;
  /** A row's small cover, or the now-playing display's own. */
  size?: "row" | "panel";
  /**
   * An already-resolved cover, for a package whose art was only read when the song
   * was selected. `undefined` means the song's own ladder; `null` means no cover.
   */
  art?: string | null;
}

/**
 * The tile is the same shape either way: the base is the frame, and the two sizes
 * add the one thing that differs — a row's square is its column's width, and the
 * now-playing cover is a square that fills its column. The jukebox's grid overrides
 * the panel's size and margin where it draws the compact row.
 */
const ART = [
  "song-art block relative flex-none overflow-hidden rounded-inner",
  "border border-[rgba(250,250,244,0.16)] bg-[rgba(12,13,10,0.7)]",
].join(" ");

const ART_ROW = [
  "song-art--row [grid-area:art]",
  "w-[var(--song-art-size,1.9rem)] h-[var(--song-art-size,1.9rem)]",
].join(" ");

/* The now-playing cover is **square** — it is an album cover, and the art we are
   given is drawn square: a wide crop cuts the picture rather than framing it. The
   cover's width is its column's; the jukebox's grid overrides the size and margin
   where it draws the compact row. */
const ART_PANEL = "song-art--panel w-full aspect-square mb-[0.35rem]";

const TILE = [
  "song-art__tile flex h-full w-full items-center justify-center font-display",
  "text-cream tracking-[0.04em]",
  /* The accent wash is one background: the diagonal band and the ink under it. */
  "[background:linear-gradient(135deg,var(--art-accent,var(--color-yellow))_0_18%,transparent_18%_100%),rgba(20,21,17,0.9)]",
].join(" ");

export function SongCover({ song, size = "row", art: supplied }: Props) {
  // A row can be reused for another song; a failure on the last cover is not a
  // failure on this one. Comparing the failed `src` with the current one settles it
  // during the render, rather than an effect a frame later.
  const [failed, setFailed] = useState<string | null>(null);
  // A cover read from a folder has to be handed to the element as an object URL; one
  // a playlist points at is fetched by URL like any other picture. Either way it is
  // **not read until it is near the viewport** — a list of two thousand songs must
  // not read two thousand pictures to draw the first screenful.
  const source = supplied === undefined ? songArt(song) : supplied;
  const broken = source !== null && failed === source;
  const { url: art, ref } = useArtThumb(broken ? null : source);

  return (
    <span
      className={`${ART} ${size === "row" ? ART_ROW : ART_PANEL}`}
      aria-hidden="true"
      ref={ref}
      style={song.accent ? ({ "--art-accent": song.accent } as CSSProperties) : undefined}
    >
      {art ? (
        <img
          className="song-art__img block h-full w-full object-cover"
          src={art}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(source)}
        />
      ) : (
        <span
          className={`${TILE} ${
            /* A row's initials are sized off the tile, so one rule draws a 30px
               tile and a 54px one at the same proportion. The now-playing cover's
               size is the jukebox's own rule. */
            size === "row" ? "text-[calc(var(--song-art-size,1.9rem)*0.42)]" : "text-[0.8rem]"
          }`}
        >
          {songInitials(song.title)}
        </span>
      )}
    </span>
  );
}
