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
      className={`song-art song-art--${size}`}
      aria-hidden="true"
      ref={ref}
      style={song.accent ? ({ "--art-accent": song.accent } as CSSProperties) : undefined}
    >
      {art ? (
        <img
          className="song-art__img"
          src={art}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(source)}
        />
      ) : (
        <span className="song-art__tile">{songInitials(song.title)}</span>
      )}
    </span>
  );
}
