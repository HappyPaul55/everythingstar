import { useMemo, useState, type SyntheticEvent } from "react";
import { useT } from "../../i18n/react";
import { groupSongs, searchSongs } from "../../lib/game/jukebox";
import type { Song } from "../../lib/game/song";
import type { Library } from "../game/library/useLibrary";

interface Props {
  library: Library;
  loadingSong: boolean;
  error: string | null;
  onOpen: (song: Song) => void;
  onBack: () => void;
}

/**
 * The charter's front door: a song from the library, a folder from this machine, or
 * a playlist to add first. Nothing is fetched until a song is opened.
 */
export function CharterPicker({ library, loadingSong, error, onOpen, onBack }: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const groups = useMemo(
    () => searchSongs(groupSongs(library.songs), query),
    [library.songs, query],
  );

  const add = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = url.trim();
    if (!value) return;
    library.add(value);
    setUrl("");
  };

  return (
    <div className="charter-picker">
      <header className="charter-head">
        <div>
          <p className="charter-badge">{t("charter.badge")}</p>
          <h1>{t("charter.title")}</h1>
          <p className="charter-lede">{t("charter.lede")}</p>
        </div>
        <button type="button" className="charter-btn" onClick={onBack}>
          {t("charter.back")}
        </button>
      </header>

      <div className="charter-picker__bar">
        <label className="charter-field">
          <span>{t("charter.find")}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("charter.search")}
            type="search"
          />
        </label>
        <button type="button" className="charter-btn" onClick={() => library.addFolder()}>
          {t("charter.openFolder")}
        </button>
      </div>

      {error ? <p className="charter-error">{error}</p> : null}
      {loadingSong ? <p className="charter-message">{t("charter.loadingSong")}</p> : null}

      <div className="charter-list" aria-busy={library.loading || loadingSong}>
        {library.loading && library.songs.length === 0 ? (
          <p className="charter-message">{t("charter.loadingLibrary")}</p>
        ) : groups.length === 0 ? (
          <p className="charter-message">{t("charter.empty")}</p>
        ) : (
          groups.map((group) => (
            <section key={group.letter}>
              <h2 className="charter-letter">{group.letter}</h2>
              {group.entries.map(({ song }) => (
                <button
                  key={`${song.from}:${song.id}`}
                  type="button"
                  className="charter-song"
                  onClick={() => onOpen(song)}
                  disabled={loadingSong}
                >
                  <span className="charter-song__title">{song.title}</span>
                  <span className="charter-song__artist">{song.artist.name}</span>
                  <span className="charter-song__offer">
                    {song.offer.instruments
                      .map((entry) => `${entry.role ?? entry.kind}`)
                      .join(" · ")}
                  </span>
                  <span className="charter-song__open">{t("charter.open")}</span>
                </button>
              ))}
            </section>
          ))
        )}
      </div>

      <form className="charter-add" onSubmit={add}>
        <label className="charter-field">
          <span>{t("charter.addPlaylist")}</span>
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t("charter.playlistUrl")}
          />
        </label>
        <button type="submit" className="charter-btn" disabled={!url.trim()}>
          {t("charter.add")}
        </button>
      </form>
    </div>
  );
}
