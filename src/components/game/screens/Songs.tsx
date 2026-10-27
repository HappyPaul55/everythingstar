import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useT } from "../../../i18n/react";
import {
  INDEX_LETTERS,
  groupSongs,
  searchSongs,
  type SongGroup,
} from "../../../lib/game/jukebox";
import type { Song } from "../../../lib/game/song";
import type { SavedRun } from "../../../lib/game/scores";
import { formatScore } from "../../../lib/game/scoring";
import { shortDate } from "../../../lib/game/when";
import type { Library } from "../library/useLibrary";
import { DownloadAction } from "../library/DownloadAction";
import { useOffline } from "../library/useOffline";
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_CHARS } from "../library/useOnDemand";
import { useSongPreview } from "../library/useSongPreview";
import { SongChips } from "./SongChips";
import { SongCover } from "../library/SongCover";
import { SongRow } from "./SongRow";
import { formatClock } from "../band/StageClock";
import { NativeDialog } from "../ui/NativeDialog";
import { focusIsSilent } from "../ui/nav";
import { ScreenBackButton } from "./ScreenBackButton";
import { useJukeboxList } from "./useJukeboxList";

/**
 * The playlists dialog is opened from the jukebox's toolbar and nowhere else, so
 * it is fetched the first time somebody presses that button rather than with the
 * game. Its chunk arriving a moment after the press is invisible: the dialog is
 * still a native `<dialog>` when it mounts, and `useModal` still returns focus to
 * the button that asked for it.
 */
const PlaylistsDialog = lazy(() =>
  import("../library/PlaylistsDialog").then((module) => ({
    default: module.PlaylistsDialog,
  })),
);

/**
 * The Downloads manager is another one-press dialog. It is lazy for the same
 * reason as Playlists: the jukebox is useful without it, and its rows, storage
 * estimate and app information should not be in the first download.
 */
const DownloadsDialog = lazy(() =>
  import("../library/DownloadsDialog").then((module) => ({
    default: module.DownloadsDialog,
  })),
);

/**
 * The jukebox: a song list with an index, a search and a slot on the front.
 *
 * A few hundred songs is a list you navigate rather than a grid you browse, so the
 * list is one column, sorted by title and filed under its letter, with the index
 * down the side to get to a letter and the search box to get to a song. The song
 * goes into the **now playing** slot, and the next press is the band's — what to
 * play and who plays it are two decisions, and this screen only asks the first.
 *
 * The songs are the **library's**, which is the playlists this browser has: the
 * list can therefore be reading, empty, or slower than the screen. All three are
 * said plainly, and the way to a playlist is the button in the corner.
 */
interface Props {
  song: Song | null;
  phone: boolean;
  library: Library;
  onSong: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
  board: SavedRun[];
  /**
   * The attract demo is moving the selection. It is not a player on the row, so
   * the chosen row follows the demo silently — no preview, no focus stolen — and
   * a phone shows the row as selected rather than waiting for a press.
   */
  attract?: boolean;
}

export function Songs({
  song,
  phone,
  library,
  onSong,
  onNext,
  onBack,
  board,
  attract = false,
}: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [lists, setLists] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const offline = useOffline();
  /**
   * Whether the song list has been built yet. A library can be thousands of
   * songs — a folder off this machine is not a playlist of a few hundred — and
   * grouping and mounting all of them is the most expensive thing this screen
   * does. It happens a frame **after** the screen is up, so the press that opened
   * the jukebox lands on a loading line rather than on a menu that has not
   * changed yet.
   */
  const [ready, setReady] = useState(false);
  const [phonePicked, setPhonePicked] = useState(false);
  const [phoneSelectionOpen, setPhoneSelectionOpen] = useState(false);
  /** The row just pressed, and which press it was — the preview is per press. */
  const [preview, setPreview] = useState<{ song: Song; at: number } | null>(null);
  const previewAt = useRef(0);
  const previewView = useSongPreview(preview?.song ?? null, preview?.at ?? 0);
  /** Build the list after the loading line has had a frame on screen. */
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);
  const groups = useMemo<SongGroup[]>(
    () => (ready ? groupSongs(library.songs) : []),
    [ready, library.songs],
  );
  /**
   * The on-demand playlists answer the same field the local filter uses. The state
   * only describes the field when it is about the words in it, so editing the query
   * cannot leave a stale "searching" line behind.
   */
  const trimmed = query.trim();
  const searchState = library.searchState;
  const live = searchState.query === trimmed;
  const searching = live && searchState.searching;
  const keep = live && searchState.found.size > 0 ? searchState.found : undefined;
  const shown = useMemo(
    () => searchSongs(groups, query, keep),
    [groups, query, keep],
  );
  const onDemandCount = library.playlists.filter(
    (row) => row.onDemand !== null && !row.disabled,
  ).length;
  /** A pause in typing is the ask; Enter is the same ask without the wait. */
  useEffect(() => {
    if (trimmed.length < SEARCH_MIN_CHARS) return;
    const timer = setTimeout(() => library.search(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, library.search]);
  const history = song
    ? board
        .filter((run) => run.song === song.id)
        .sort((a, b) => b.at - a.at)
        .slice(0, 10)
    : [];

  /** Reading the playlists for the first time: there is nothing to show yet. */
  const loadingLibrary = library.loading && library.songs.length === 0;
  const reading = !ready || loadingLibrary;
  /** Asked, and answered: the empty list is now "nothing by that name", not "nothing here". */
  const answered =
    trimmed.length >= SEARCH_MIN_CHARS && live && !searchState.searching;
  /** Empty and staying empty: a search in flight is not "nothing to play". */
  const nothing =
    ready && !library.loading && library.songs.length === 0 && !searching && !answered;
  const visibleSong = attract ? song : phone && !phonePicked ? null : song;

  /**
   * The list's own orchestration: measuring a heading and a row, the mounted
   * window, the scroll position and focus moving through rows the browser cannot
   * all see. The toolbar, the search, the preview and the rows stay here.
   */
  const list = useJukeboxList({
    shown,
    query,
    chosen: song,
    ready,
    follow: attract,
  });
  const songCount = shown.reduce((count, group) => count + group.entries.length, 0);
  /**
   * What the badge says: the sources that are actually feeding this library. A
   * playlist kept but switched **off** is a row in the dialog, not a source — the
   * built-in one included — while a folder always is.
   */
  const sourceCount =
    library.playlists.filter((row) => !row.disabled).length + library.folders.length;

  /** Start (or restart) the selected song's preview. */
  const previewSong = (chosen: Song) => {
    onSong(chosen.id);
    previewAt.current += 1;
    setPreview({ song: chosen, at: previewAt.current });
  };

  /** A mouse press on a row previews it and, on a phone, opens its panel. */
  const chooseSong = (chosen: Song) => {
    previewSong(chosen);
    if (phone) {
      setPhonePicked(true);
      setPhoneSelectionOpen(true);
    }
  };

  /**
   * The confirmation key. It is **Next: your band** — the selected song is
   * already playing its preview, so Enter advances the jukebox rather than
   * starting a second copy of the clip. On a phone the next step is the song's
   * panel, where the same Next button lives.
   */
  const startSong = (chosen: Song) => {
    onSong(chosen.id);
    if (phone) {
      setPhonePicked(true);
      setPhoneSelectionOpen(true);
    } else {
      onNext();
    }
  };

  /**
   * Moving through the list chooses the row it lands on. A song previews as it
   * is chosen, unless the pointer is what put focus there: a mouse click follows
   * with `chooseSong`, and starting the preview twice would only restart it.
   */
  const focusSong = (chosen: Song) => {
    // Focus the game placed on a screen change or a returning row is not the
    // player moving onto it: it must not select the song or start its preview.
    if (focusIsSilent()) return;
    if (document.documentElement.dataset.gameInput === "pointer") {
      onSong(chosen.id);
      return;
    }
    previewSong(chosen);
  };

  const selection = () => (
    <div className="jukebox__selection">
      <aside
        className="jukebox__display"
        aria-label={t("screen.nowPlaying")}
        data-has-song={song ? "true" : "false"}
      >
        <div className="jukebox__now-playing">
          <p className="jukebox__label">{t("screen.nowPlaying")}</p>
          {song ? <p className="jukebox__duration">{formatClock(song.durationMs)}</p> : null}
        </div>
        {song ? (
          <>
            <SongCover
              song={song}
              size="panel"
              art={previewView.songId === song.id ? previewView.art ?? undefined : undefined}
            />
            <div className="jukebox__headline">
              <p className="jukebox__title">{song.title}</p>
              <SongChips song={song} className="jukebox__chips" />
            </div>
            <p className="jukebox__artist">
              {song.album
                ? t("screen.songByAlbum", {
                    artist: song.artist.name,
                    album: song.album.name,
                  })
                : song.artist.name}
            </p>
            {offline.supported ? (
              <DownloadAction
                song={song}
                entry={
                  offline.entries.find((entry) => entry.song.id === song.id) ??
                  null
                }
                busy={offline.busyId === song.id}
                progress={offline.busyId === song.id ? offline.progress : null}
                error={
                  offline.error?.songId === song.id
                    ? offline.error.reason
                    : null
                }
                onDownload={() => offline.download(song)}
              />
            ) : null}
            <div className="jukebox__history">
              <table className="jukebox__history-table">
                <thead>
                  <tr>
                    <th scope="col">{t("screen.historyPlayed")}</th>
                    <th scope="col">{t("screen.historyPlayers")}</th>
                    <th scope="col">{t("screen.historyScore")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length > 0 ? (
                    history.map((run, index) => (
                      <tr key={`${run.at}-${index}`}>
                        <td>{shortDate(run.at)}</td>
                        <td>{run.players.length}</td>
                        <td>{formatScore(run.score)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="jukebox__history-empty">
                      <td colSpan={3}>{t("screen.noScoreYet")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="jukebox__title">{t("screen.libraryEmpty")}</p>
        )}
      </aside>
      <button
        type="button"
        className="band-btn band-btn--primary band-btn--big jukebox__next"
        aria-label={t("screen.nextBand")}
        disabled={!song}
        data-sound="select"
        onClick={onNext}
      >
        <span className="jukebox__next-full">{t("screen.nextBand")}</span>
        <span className="jukebox__next-compact" aria-hidden="true">
          {t("screen.nextShort")}
        </span>
      </button>
    </div>
  );

  return (
    <div className="screen screen--songs">
      <div className="screen__panel screen__panel--page screen__panel--songs">
        <div className="jukebox__heading">
          <ScreenBackButton label={t("screen.backToMenu")} onBack={onBack} />
          <h2 className="screen__title">{t("screen.songsTitle")}</h2>
        </div>

        <div className="jukebox">
          <div className="jukebox__list">
            <div className="jukebox__search">
              <label className="jukebox__search-label" htmlFor="jukebox-search">
                {t("screen.searchLabel")}
              </label>
              <input
                id="jukebox-search"
                className="jukebox__input"
                type="search"
                autoComplete="off"
                spellCheck={false}
                placeholder={t("screen.searchPlaceholder")}
                value={query}
                data-nav-default={shown.length === 0 ? "true" : undefined}
                onChange={(event) => {
                  // Typing is the player taking the field; do not move them to the
                  // list when the last character is deleted again.
                  list.markTyped();
                  setQuery(event.target.value);
                }}
                onKeyDown={(event) => {
                  // Enter is the pause in typing, taken now: the on-demand playlists
                  // are asked without waiting out the debounce.
                  if (event.key !== "Enter" || trimmed.length < SEARCH_MIN_CHARS) return;
                  event.preventDefault();
                  library.search(trimmed, true);
                }}
              />
              {/* Where the songs come from, beside the list they are in: a playlist
                  is a URL, and this is where one is added, refreshed or forgotten. */}
              <button
                type="button"
                className="band-btn jukebox__playlists"
                aria-haspopup="dialog"
                data-sound="open"
                onClick={() => setLists(true)}
              >
                {t("screen.playlists")}
                <span className="jukebox__playlists-count">{sourceCount}</span>
              </button>
              {offline.supported ? (
                <button
                  type="button"
                  className="band-btn jukebox__playlists"
                  aria-haspopup="dialog"
                  data-sound="open"
                  onClick={() => setDownloadsOpen(true)}
                >
                  {t("screen.downloads")}
                  {offline.entries.length > 0 ? (
                    <span className="jukebox__playlists-count">
                      {offline.entries.length}
                    </span>
                  ) : null}
                </button>
              ) : null}
            </div>

            {/* What the on-demand playlists are doing, under the field that asked
                them. A failure is said here and retried by hand; it never replaces
                the songs the library already has. */}
            {onDemandCount > 0 ? (
              <div className="jukebox__search-state" aria-live="polite">
                {searching ? (
                  <p className="jukebox__search-line">
                    {onDemandCount === 1
                      ? t("screen.searchingOne")
                      : t("screen.searchingMany", { count: onDemandCount })}
                  </p>
                ) : null}
                {live
                  ? searchState.failures.map((failure) => (
                      <p className="jukebox__search-line is-warn" key={failure.url}>
                        {t("screen.searchFailed", {
                          name: failure.name ?? failure.url,
                        })}{" "}
                        <span className="jukebox__search-error">{failure.error}</span>{" "}
                        <button
                          type="button"
                          className="band-btn jukebox__search-retry"
                          data-sound="select"
                          onClick={() => library.search(trimmed, true)}
                        >
                          {t("screen.searchRetry")}
                        </button>
                      </p>
                    ))
                  : null}
                {trimmed.length > 0 && trimmed.length < SEARCH_MIN_CHARS ? (
                  <p className="jukebox__search-line">{t("screen.searchShort")}</p>
                ) : null}
              </div>
            ) : null}

            <div
              className="jukebox__scroller"
              ref={list.scroller}
              onScroll={list.onScroll}
              onKeyDown={list.onKeyDown}
              aria-busy={reading}
              // The sticky heading covers the top of the scroller. Native
              // `scrollIntoView` (the focus layer's) has to know about it, so a
              // row it brings into view is not seated behind the yellow bar.
              style={
                list.heights ? { scrollPaddingTop: list.heights.header } : undefined
              }
            >
              <p className="sr-only" role="status" aria-live="polite">
                {!ready
                  ? t("screen.songsLoading")
                  : loadingLibrary
                    ? t("screen.libraryLoading")
                    : searching
                      ? onDemandCount === 1
                        ? t("screen.searchingOne")
                        : t("screen.searchingMany", { count: onDemandCount })
                      : nothing
                        ? t("screen.libraryEmpty")
                        : songCount === 0
                          ? t("screen.noMatches")
                          : t("screen.songCount", { count: songCount })}
              </p>
              {!ready ? (
                <p className="jukebox__empty">{t("screen.songsLoading")}</p>
              ) : null}
              {ready && loadingLibrary ? (
                <p className="jukebox__empty">{t("screen.libraryLoading")}</p>
              ) : null}
              {nothing ? (
                <p className="jukebox__empty">
                  {onDemandCount > 0
                    ? t("screen.libraryEmptySearch")
                    : t("screen.libraryEmpty")}
                </p>
              ) : null}
              {!reading && !nothing && !searching && shown.length === 0 ? (
                <p className="jukebox__empty">{t("screen.noMatches")}</p>
              ) : null}
              {/* Only the window is mounted: the spacers stand in for every row
                  and heading outside it, so the scrollbar and every letter's
                  offset are the ones a fully mounted list would have. */}
              <div
                className="jukebox__spacer"
                aria-hidden="true"
                style={{ height: list.range?.top ?? 0 }}
              />
              {list.sections.map((section) => {
                const group = shown[section.group];
                if (!group) return null;
                return (
                  <section className="song-group" key={group.letter}>
                    <h3 className="song-group__letter">
                      <span>{group.letter}</span>
                      <span className="song-group__count">
                        {group.entries.length === 1
                          ? t("screen.playlistOneSong")
                          : t("screen.songCount", { count: group.entries.length })}
                      </span>
                    </h3>
                    {/* The heading is mounted before the rows are: this is the
                        gap between it and the first row the window kept. */}
                    {section.skip > 0 ? (
                      <div
                        className="jukebox__spacer"
                        aria-hidden="true"
                        style={{ height: section.skip }}
                      />
                    ) : null}
                    {group.entries
                      .slice(section.from, section.to)
                      .map((entry, offset) => {
                        const entryIndex = section.from + offset;
                        return (
                          <SongRow
                            key={entry.song.id}
                            song={entry.song}
                            selected={entry.song.id === visibleSong?.id}
                            opensDialog={phone}
                            defaultFocus={
                              section.group === 0 && entryIndex === 0
                            }
                            onFocus={() => focusSong(entry.song)}
                            onSelect={() => chooseSong(entry.song)}
                            onStart={() => startSong(entry.song)}
                          />
                        );
                      })}
                  </section>
                );
              })}
              <div
                className="jukebox__spacer"
                aria-hidden="true"
                style={{ height: list.range?.bottom ?? 0 }}
              />
            </div>
          </div>

          <nav
            className="jukebox__index"
            aria-label={t("screen.jukeboxIndex")}
            data-idle={query.trim() !== ""}
          >
            {INDEX_LETTERS.map((letter) => {
              const has = groups.some((group) => group.letter === letter);
              return (
                <button
                  key={letter}
                  type="button"
                  // The index is a shortcut for the pointer and the pad's own
                  // cursor, not a stop in the tab order: Tab from a row belongs
                  // to the controls around the list, not to 27 letters.
                  tabIndex={-1}
                  className={
                    letter === list.current
                      ? "jukebox__letter is-active"
                      : "jukebox__letter"
                  }
                  aria-current={letter === list.current ? "true" : undefined}
                  disabled={!has || query.trim() !== ""}
                  onClick={() => list.jump(letter)}
                >
                  {letter}
                </button>
              );
            })}
          </nav>

        </div>

        {!phone ? selection() : null}
      </div>

      {phone && phoneSelectionOpen && song ? (
        <NativeDialog
          title={song.title}
          className="jukebox__song-dialog"
          panelClassName="config__panel--wide jukebox__song-dialog-panel"
          onClose={() => setPhoneSelectionOpen(false)}
        >
          {selection()}
        </NativeDialog>
      ) : null}

      {lists ? (
        <Suspense fallback={null}>
          <PlaylistsDialog library={library} onClose={() => setLists(false)} />
        </Suspense>
      ) : null}

      {downloadsOpen ? (
        <Suspense fallback={null}>
          <DownloadsDialog
            entries={offline.entries}
            storage={offline.storage}
            busy={offline.busy}
            busyId={offline.busyId}
            onRemove={offline.remove}
            onClear={offline.clear}
            onCancel={offline.cancel}
            onClose={() => setDownloadsOpen(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
