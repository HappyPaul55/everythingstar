import { useT } from "../../../i18n/react";
import { songChips } from "../../../lib/game/jukebox";
import type { Song } from "../../../lib/game/song";

/**
 * What a song offers, as chips — shared by the jukebox's rows and its now-playing
 * slot so the two can never describe a song differently. `songChips` owns the
 * list; this only draws it.
 */
interface Props {
  song: Song;
  className: string;
}

export function SongChips({ song, className }: Props) {
  const t = useT();
  const chips = songChips(song);
  let compactCount = Math.min(3, chips.length);
  const compactLength = (count: number) =>
    chips
      .slice(0, count)
      .map((key) => t(key))
      .join(" ").length +
    (chips.length > count ? ` +${chips.length - count}`.length : 0);
  while (compactCount > 1 && compactLength(compactCount) > 16) compactCount -= 1;
  const compact = chips.slice(0, compactCount);

  return (
    <>
      <span className={`${className} jukebox__chips--full`}>
        {chips.map((key) => (
          <span
            className={key === "song.vocals" ? "song-chip song-chip--vocals" : "song-chip"}
            key={key}
          >
            {t(key)}
          </span>
        ))}
      </span>
      <span
        className={`${className} jukebox__chips--compact`}
        role="group"
        aria-label={chips.map((key) => t(key)).join(", ")}
      >
        {compact.map((key) => (
          <span
            className={key === "song.vocals" ? "song-chip song-chip--vocals" : "song-chip"}
            key={key}
          >
            {t(key)}
          </span>
        ))}
        {chips.length > compact.length ? (
          <span className="song-chip song-chip--more">+{chips.length - compact.length}</span>
        ) : null}
      </span>
    </>
  );
}
