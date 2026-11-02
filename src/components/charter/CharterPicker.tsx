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

/** The label above a control in the picker's fields. */
const label = "charter-label";
/** A search field or a playlist URL: the label sits over the input. */
const field = "flex min-w-0 flex-col gap-[0.15rem]";
/** One song row: the title, the artist, what it offers, and the Open cue. */
const songRow =
  "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-[0.6rem] border-0 border-t border-t-[rgba(251,251,243,0.07)] bg-transparent px-[0.65rem] py-[0.55rem] text-left text-cream cursor-pointer hover:bg-[rgba(255,212,0,0.08)] focus-visible:bg-[rgba(255,212,0,0.08)] sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]";

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
    <div className="charter-picker charter-page mx-auto max-w-[70rem] overflow-auto max-[760px]:p-[0.55rem]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="charter-badge">{t("charter.badge")}</p>
          <h1 className="m-0">{t("charter.title")}</h1>
          <p className="mt-[0.45rem] max-w-[46rem] text-[0.88rem] leading-[1.45] text-[rgba(251,251,243,0.7)]">
            {t("charter.lede")}
          </p>
        </div>
        <button type="button" className="charter-btn" onClick={onBack}>
          {t("charter.back")}
        </button>
      </header>

      <div className="mt-[0.9rem] flex flex-wrap items-end gap-2">
        <label className={`${field} flex-1 basis-[18rem]`}>
          <span className={label}>{t("charter.find")}</span>
          <input
            className="charter-input"
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

      {error ? <p className="my-[0.6rem] text-[0.8rem] text-record-soft">{error}</p> : null}
      {loadingSong ? (
        <p className="my-[0.6rem] text-[0.8rem] text-[rgba(251,251,243,0.55)]">{t("charter.loadingSong")}</p>
      ) : null}

      <div
        className="mt-[0.8rem] max-h-[calc(100dvh-16rem)] overflow-auto rounded-brand border border-line-ink"
        aria-busy={library.loading || loadingSong}
      >
        {library.loading && library.songs.length === 0 ? (
          <p className="my-[0.6rem] text-[0.8rem] text-[rgba(251,251,243,0.55)]">{t("charter.loadingLibrary")}</p>
        ) : groups.length === 0 ? (
          <p className="my-[0.6rem] text-[0.8rem] text-[rgba(251,251,243,0.55)]">{t("charter.empty")}</p>
        ) : (
          groups.map((group) => (
            <section key={group.letter}>
              <h2 className="sticky top-0 z-1 m-0 bg-charter-menu px-[0.6rem] py-1 font-mono text-[0.62rem] tracking-[0.12em] text-yellow">
                {group.letter}
              </h2>
              {group.entries.map(({ song }) => (
                <button
                  key={`${song.from}:${song.id}`}
                  type="button"
                  className={songRow}
                  onClick={() => onOpen(song)}
                  disabled={loadingSong}
                >
                  <span className="text-[0.85rem] font-bold">{song.title}</span>
                  <span className="hidden text-[0.7rem] text-[rgba(251,251,243,0.55)] sm:block">
                    {song.artist.name}
                  </span>
                  <span className="hidden font-mono text-[0.7rem] text-[rgba(251,251,243,0.55)] capitalize sm:block">
                    {song.offer.instruments
                      .map((entry) => `${entry.role ?? entry.kind}`)
                      .join(" · ")}
                  </span>
                  <span className="font-mono text-[0.6rem] font-bold text-yellow uppercase">
                    {t("charter.open")}
                  </span>
                </button>
              ))}
            </section>
          ))
        )}
      </div>

      <form
        className="mt-4 flex flex-wrap items-end gap-2 border-t border-line-ink pt-[0.8rem]"
        onSubmit={add}
      >
        <label className={`${field} flex-1 basis-[18rem]`}>
          <span className={label}>{t("charter.addPlaylist")}</span>
          <input
            className="charter-input"
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
