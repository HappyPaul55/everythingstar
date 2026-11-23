import type { Song } from "../../../lib/game/song";
import { SongCover } from "../library/SongCover";

/**
 * The Jukebox's record: a vinyl disc whose label is the song's cover.
 *
 * The cover is the label rather than a tiny thumbnail somewhere beside the disc:
 * it is the song's own picture, and a record is the one shape that makes that
 * picture feel like the thing that is playing. A song with no art keeps the
 * drawn tile `SongCover` falls back to, so the disc is never blank.
 *
 * The spin is CSS, and only while the transport is moving; a paused song is a
 * still record. `prefers-reduced-motion` stops it altogether (the global
 * stylesheet's rule does the same for the rest of the site). The whole thing is
 * decorative: the title and artist are read as text beside it.
 */
interface Props {
  song: Song | null;
  /** The document's own cover, when it has one; `undefined` uses the song's ladder. */
  art?: string | null;
  playing: boolean;
  size?: "main" | "small";
}

export function Vinyl({ song, art, playing, size = "main" }: Props) {
  return (
    <div
      className={`jukebox__record jukebox__record--${size}${playing ? " is-playing" : ""}`}
      aria-hidden="true"
    >
      <div className="jukebox__disc">
        <div className="jukebox__label">
          {song ? <SongCover song={song} size="panel" art={art} /> : null}
          <span className="jukebox__spindle" />
        </div>
      </div>
    </div>
  );
}
