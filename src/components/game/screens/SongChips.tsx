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

/**
 * A chip's base look, written once: the same pill on a row and in the
 * now-playing slot. Only the words' place wears the accent; every instrument and
 * a typed-only song stay in the default scheme.
 */
const CHIP =
  "song-chip px-[0.4rem] py-[0.1rem] font-mono text-[0.56rem] font-bold tracking-[0.1em] uppercase text-[rgba(250,250,244,0.76)] border border-[rgba(250,250,244,0.28)] rounded-pill";
const CHIP_VOCALS = `${CHIP} song-chip--vocals text-accent border-accent`;

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
      <span
        className={`${className} jukebox__chips--full flex flex-wrap mt-[0.4rem] gap-[0.25rem]`}
      >
        {chips.map((key) => (
          <span
            className={key === "song.vocals" ? CHIP_VOCALS : CHIP}
            key={key}
          >
            {t(key)}
          </span>
        ))}
      </span>
      <span
        className={`${className} jukebox__chips--compact hidden mt-[0.4rem] gap-[0.25rem]`}
        role="group"
        aria-label={chips.map((key) => t(key)).join(", ")}
      >
        {compact.map((key) => (
          <span
            className={key === "song.vocals" ? CHIP_VOCALS : CHIP}
            key={key}
          >
            {t(key)}
          </span>
        ))}
        {chips.length > compact.length ? (
          <span className={`${CHIP} song-chip--more`}>
            +{chips.length - compact.length}
          </span>
        ) : null}
      </span>
    </>
  );
}
