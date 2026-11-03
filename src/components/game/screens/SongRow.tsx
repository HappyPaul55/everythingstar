import { useT } from "../../../i18n/react";
import { songChips } from "../../../lib/game/jukebox";
import type { Song } from "../../../lib/game/song";
import { SongCover } from "../library/SongCover";
import { formatClock } from "../band/StageClock";

/**
 * One song in the jukebox: its cover, how long it is, its name and artist, and what it
 * offers. The row is the whole control — pressing it selects the song — so the jukebox
 * needs no icons and nothing to decode.
 *
 * **What the row does not carry is the point of it.** It used to lead with the song's
 * slot code and end with this browser's best: the slot is the jukebox's own address and
 * is said again on the now-playing display, and a score belongs with the numbers rather
 * than beside a title, so neither earns a column here. What is left is what the song
 * *is* — how long, what it is called, who it is by, and what there is to play on it.
 *
 * **The time heads the title's line**: `4:00  1999 Forever` is one thing read once. The
 * elements are in the order they are spoken, and where they land is `band.css`'s — the
 * time is indented on the title's line and the artist and the offers start at the row's
 * text edge, on the tiers where the row is more than one line.
 *
 * What it offers is one dense line rather than a chip each: a row has to survive five of
 * them (a duet with four instruments) without wrapping, and the list is read by scanning.
 * The now-playing slot shows the same list as chips, where there is room. Both come from
 * `songChips`, so the two cannot describe a song differently.
 */
interface Props {
  song: Song;
  selected: boolean;
  opensDialog?: boolean;
  /** The first row is where the jukebox starts when a controller walks in. */
  defaultFocus?: boolean;
  /** Moving onto a row with Tab or the arrows chooses it and previews it. */
  onFocus?: () => void;
  /** A mouse/touch press: preview the song and, on a phone, open its panel. */
  onSelect: () => void;
  /** Keyboard or pad confirmation: take the next step (Next: your band). */
  onStart?: () => void;
}

/**
 * The row's geometry, as one string. The cover's size is the variable its own tile
 * reads, so the two can never drift apart; the time's track is fixed, or the titles
 * below it would not start at the same x. The three tiers all rewrite the grid:
 * five columns on a wide screen, two lines under 80rem, three under 40rem — one row
 * height each, because the windowed list measures one row and stands in for every
 * row outside the window.
 *
 * The **phone tier is written `[&.song-row]`**: two media conditions can both be
 * true (a phone is under 80rem and under 40rem), and Tailwind emits a smaller
 * max-width first, so the phone's own rules must outrank the two-line ones rather
 * than rely on their order.
 */
const ROW = [
  "song-row group/row grid grid-cols-[1.9rem_2.4rem_minmax(0,1.1fr)_minmax(0,0.9fr)_17rem] [grid-template-areas:'art_time_title_artist_chips'] items-center gap-[0.6rem] w-full px-[0.6rem] py-[0.28rem] text-left text-cream bg-transparent border-b border-b-[rgba(250,250,244,0.07)] cursor-pointer",
  "[--song-art-size:1.9rem]",
  "hover:bg-[rgba(255,212,0,0.1)] focus-visible:bg-[rgba(255,212,0,0.1)] data-[nav-focus]:bg-[rgba(255,212,0,0.1)]",
  "[@media(max-width:80rem)]:[--song-art-size:2.7rem]",
  "[@media(max-width:80rem)]:grid-cols-[2.7rem_calc(0.88rem_*_3.1)_minmax(0,1fr)_17rem]",
  "[@media(max-width:80rem)]:[grid-template-areas:'art_time_title_chips'_'art_artist_artist_chips']",
  "[@media(max-width:80rem)]:gap-y-[0.12rem]",
  "[@media(max-width:80rem)]:py-[0.42rem]",
  "[@media(max-width:40rem)]:[&.song-row]:[--song-art-size:3.4rem]",
  "[@media(max-width:40rem)]:[&.song-row]:grid-cols-[3.4rem_calc(0.88rem_*_3.1)_minmax(0,1fr)]",
  "[@media(max-width:40rem)]:[&.song-row]:[grid-template-areas:'art_time_title'_'art_artist_artist'_'art_chips_chips']",
].join(" ");

export function SongRow({
  song,
  selected,
  opensDialog = false,
  defaultFocus = false,
  onFocus,
  onSelect,
  onStart,
}: Props) {
  const t = useT();
  const offers = songChips(song)
    .map((key) => t(key))
    .join(" · ");

  return (
    <button
      type="button"
      className={selected ? `${ROW} is-active bg-[rgba(255,212,0,0.16)] shadow-[inset_3px_0_0_var(--color-yellow)]` : ROW}
      aria-pressed={selected}
      aria-haspopup={opensDialog ? "dialog" : undefined}
      data-nav-default={defaultFocus ? "true" : undefined}
      data-song-id={song.id}
      data-sound="select"
      onFocus={onFocus}
      onClick={(event) => {
        // Keyboard Enter, Space and a pad's A arrive as a click with no detail;
        // a real mouse/touch press has one. The former confirms the row (Next:
        // your band); the latter auditions it and stays in the jukebox.
        if (event.detail === 0 && onStart) onStart();
        else onSelect();
      }}
    >
      <SongCover song={song} />
      <span className="song-row__time [grid-area:time] font-mono text-[0.62rem] whitespace-nowrap text-[rgba(250,250,244,0.72)] [@media(max-width:80rem)]:text-[0.88rem]">
        {formatClock(song.durationMs)}
      </span>
      <span className="song-row__title [grid-area:title] overflow-hidden whitespace-nowrap text-ellipsis text-[0.88rem] [@media(max-width:80rem)]:self-end [@media(max-width:40rem)]:[&[class*='song-row'][class*='title']]:self-center">
        {song.title}
      </span>
      <span className="song-row__artist [grid-area:artist] overflow-hidden whitespace-nowrap text-ellipsis text-label text-[rgba(250,250,244,0.6)] [@media(max-width:80rem)]:self-start [@media(max-width:40rem)]:[&[class*='song-row'][class*='artist']]:self-center">
        {song.artist.name}
      </span>
      <span className="song-row__offers [grid-area:chips] overflow-hidden whitespace-nowrap text-ellipsis font-mono text-[0.56rem] lowercase text-[rgba(250,250,244,0.6)]">
        {offers}
      </span>
    </button>
  );
}
