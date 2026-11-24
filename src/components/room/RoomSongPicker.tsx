import { useMemo, useState } from "react";
import { useT } from "../../i18n/react";
import { formatClock } from "../game/band/StageClock";
import type { Song } from "../../lib/game/song";
import { NativeDialog } from "../game/ui/NativeDialog";

/** A small host-side song picker for a room. The full Songs screen stays a page. */
export function RoomSongPicker({
  songs,
  current,
  onPick,
  onClose,
}: {
  songs: readonly Song[];
  current: Song | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    const found = words
      ? songs.filter(
          (song) =>
            song.title.toLowerCase().includes(words) ||
            song.artist.name.toLowerCase().includes(words) ||
            (song.album?.name.toLowerCase().includes(words) ?? false),
        )
      : songs;
    return found.slice(0, 80);
  }, [songs, query]);

  return (
    <NativeDialog
      title={t("screen.roomPickSong")}
      panelClassName="config__panel--wide room-picker"
      initialFocus="#room-song-search"
      onClose={onClose}
    >
      <label className="room-picker__label" htmlFor="room-song-search">
        {t("screen.searchLabel")}
      </label>
      <input
        id="room-song-search"
        className="song-list__input"
        type="search"
        autoComplete="off"
        spellCheck={false}
        placeholder={t("screen.searchPlaceholder")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="room-picker__list">
        {shown.length === 0 ? (
          <p className="room-muted">{t("screen.noMatches")}</p>
        ) : (
          shown.map((song) => (
            <button
              key={song.id}
              type="button"
              className={song.id === current?.id ? "room-picker__row is-active" : "room-picker__row"}
              data-sound="select"
              onClick={() => onPick(song.id)}
            >
              <span className="room-picker__time">{formatClock(song.durationMs)}</span>
              <span className="room-picker__title">{song.title}</span>
              <span className="room-picker__artist">{song.artist.name}</span>
            </button>
          ))
        )}
      </div>
    </NativeDialog>
  );
}
