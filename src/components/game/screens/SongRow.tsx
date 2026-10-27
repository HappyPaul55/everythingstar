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
      className={selected ? "song-row is-active" : "song-row"}
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
      <span className="song-row__time">{formatClock(song.durationMs)}</span>
      <span className="song-row__title">{song.title}</span>
      <span className="song-row__artist">{song.artist.name}</span>
      <span className="song-row__offers">{offers}</span>
    </button>
  );
}
