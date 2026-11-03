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
 * The jukebox's three shapes. At medium widths the heading and the now-playing
 * slot share the top row and the list gets the full width below; on a wide screen
 * the heading spans the page and the list and slot share the remaining height. The
 * media queries are written out on each utility rather than composed from a prefix,
 * because a utility has to appear whole in the source for Tailwind to generate it.
 */
const PANEL =
  "screen__panel screen__panel--page screen__panel--songs max-narrow:min-h-0 narrow:max-wide:grid narrow:max-wide:grid-cols-[minmax(0,1fr)_minmax(14rem,0.72fr)] narrow:max-wide:grid-rows-[auto_minmax(0,1fr)] narrow:max-wide:min-h-0 wide:grid wide:grid-cols-[minmax(0,1fr)_minmax(16rem,19rem)] wide:grid-rows-[auto_minmax(0,1fr)] wide:min-h-0";

const HEADING =
  "jukebox__heading narrow:max-wide:col-start-1 narrow:max-wide:row-start-1 narrow:max-wide:min-w-0 wide:col-span-full wide:row-start-1";

const JUKEBOX =
  "jukebox flex flex-wrap items-start gap-[clamp(0.7rem,2vmin,1.4rem)] max-narrow:flex max-narrow:flex-[1_1_auto] max-narrow:flex-col max-narrow:flex-nowrap max-narrow:items-stretch max-narrow:w-full max-narrow:min-h-0 narrow:max-wide:col-span-full narrow:max-wide:row-start-2 narrow:max-wide:flex-nowrap narrow:max-wide:items-stretch narrow:max-wide:min-h-0 wide:col-start-1 wide:row-start-2 wide:flex-nowrap wide:items-stretch wide:min-h-0";

const LIST =
  "jukebox__list flex-[1_1_34rem] min-w-0 max-narrow:flex max-narrow:flex-[1_1_auto] max-narrow:flex-col max-narrow:w-full max-narrow:min-h-0 narrow:max-wide:flex narrow:max-wide:flex-1 narrow:max-wide:basis-0 narrow:max-wide:flex-col narrow:max-wide:min-h-0 wide:self-stretch wide:flex wide:flex-auto wide:flex-col wide:min-h-0";

const SCROLLER =
  "jukebox__scroller relative h-[clamp(13rem,52vh,30rem)] overflow-y-auto overscroll-contain border border-[rgba(250,250,244,0.14)] rounded-inner bg-[rgba(12,13,10,0.62)] max-narrow:flex-[1_1_0] max-narrow:h-auto max-narrow:min-h-0 max-narrow:overflow-y-auto narrow:max-wide:flex-1 narrow:max-wide:basis-0 narrow:max-wide:h-auto narrow:max-wide:min-h-0 narrow:max-wide:overflow-y-auto wide:flex-auto wide:h-auto wide:min-h-[12rem]";

const SELECTION =
  "jukebox__selection flex-none flex flex-col gap-[0.6rem] min-w-0 narrow:max-wide:col-start-2 narrow:max-wide:row-start-1 narrow:max-wide:grid narrow:max-wide:grid-cols-[minmax(0,1fr)_2.75rem] narrow:max-wide:items-stretch narrow:max-wide:gap-[0.4rem] narrow:max-wide:min-w-0 wide:col-start-2 wide:row-start-2 wide:self-stretch wide:flex-col wide:min-h-0";

const DISPLAY =
  "jukebox__display group/display flex-[1_1_auto] flex flex-col gap-[0.3rem] p-[0.9rem] bg-[rgba(12,13,10,0.72)] border border-[rgba(250,250,244,0.16)] rounded-brand overflow-hidden narrow:max-wide:grid narrow:max-wide:col-start-1 narrow:max-wide:row-start-1 narrow:max-wide:grid-cols-[minmax(0,1fr)_2.5rem] narrow:max-wide:[grid-template-areas:'now-playing_now-playing'_'title_cover'_'chips_cover'_'artist_artist'_'offline_offline'] narrow:max-wide:content-start narrow:max-wide:gap-[0.2rem_0.45rem] narrow:max-wide:flex-none narrow:max-wide:min-w-0 narrow:max-wide:p-[0.65rem] wide:flex-auto wide:min-h-0 narrow:max-wide:[&_.song-art--panel]:[grid-area:cover] narrow:max-wide:[&_.song-art--panel]:size-[2.5rem] narrow:max-wide:[&_.song-art--panel]:m-0 narrow:max-wide:[&_[data-downloaded]]:[grid-area:offline] narrow:max-wide:[&_[data-downloaded]]:mt-[0.1rem] narrow:max-wide:[&_[class*='chips']]:[grid-area:chips] narrow:max-wide:[&_[class*='chips']]:min-w-0 narrow:max-wide:[&_[class*='chips']]:m-0 narrow:max-wide:[&_[class*='chips']]:gap-[0.2rem] narrow:max-wide:[&_[class*='chips--full']]:hidden narrow:max-wide:[&_[class*='chips--compact']]:flex narrow:max-wide:[&_[class*='chips--compact']]:flex-[0_1_auto] narrow:max-wide:[&_[class*='chips--compact']]:flex-nowrap narrow:max-wide:[&_[class*='chips--compact']]:max-w-full narrow:max-wide:[&_[class*='chips--compact']]:overflow-hidden narrow:max-wide:[&_[class*='chips--compact']]:whitespace-nowrap narrow:max-wide:[&_[class*='chips--compact']_.song-chip]:flex-none narrow:max-wide:[&_[class*='chips--compact']_.song-chip]:px-[0.25rem] narrow:max-wide:[&_[class*='chips--compact']_.song-chip]:py-[0.08rem] narrow:max-wide:[&_[class*='chips--compact']_.song-chip]:text-[0.45rem] narrow:max-wide:[&_[class*='chips--compact']_.song-chip]:tracking-[0.04em] narrow:max-wide:[&_[class*='chips--compact']_.song-chip]:whitespace-nowrap narrow:max-wide:[&_[class*='history']]:hidden";

const NOW_PLAYING =
  "jukebox__now-playing flex items-baseline justify-between gap-[0.5rem] narrow:max-wide:[grid-area:now-playing] narrow:max-wide:flex narrow:max-wide:items-baseline narrow:max-wide:justify-between narrow:max-wide:gap-2";

const DURATION =
  "jukebox__duration m-0 font-mono text-[0.72rem] font-bold tracking-[0.08em] text-yellow narrow:max-wide:min-w-0 narrow:max-wide:m-0";

const HEADLINE = "jukebox__headline narrow:max-wide:contents";

const TITLE =
  "jukebox__title mt-[0.2rem] mb-0 font-display text-[clamp(1.2rem,3vmin,1.7rem)] leading-[1.1] text-cream narrow:max-wide:[grid-area:title] narrow:max-wide:min-w-0 narrow:max-wide:max-w-full narrow:max-wide:m-0 narrow:max-wide:text-[clamp(1rem,2.3vmin,1.35rem)] narrow:max-wide:leading-[1.1] narrow:max-wide:overflow-hidden narrow:max-wide:text-ellipsis narrow:max-wide:whitespace-nowrap narrow:max-wide:group-data-[has-song=false]/display:col-span-full";

const ARTIST =
  "jukebox__artist m-0 text-[0.78rem] text-[rgba(250,250,244,0.66)] narrow:max-wide:[grid-area:artist] narrow:max-wide:min-w-0 narrow:max-wide:text-[0.68rem] narrow:max-wide:overflow-hidden narrow:max-wide:text-ellipsis narrow:max-wide:whitespace-nowrap";

const NEXT =
  "band-btn band-btn--primary band-btn--big jukebox__next w-full narrow:max-wide:col-start-2 narrow:max-wide:row-start-1 narrow:max-wide:flex narrow:max-wide:items-center narrow:max-wide:justify-center narrow:max-wide:w-full narrow:max-wide:min-w-[2.75rem] narrow:max-wide:min-h-[44px] narrow:max-wide:px-1 narrow:max-wide:py-[0.4rem] narrow:max-wide:text-[0.65rem] narrow:max-wide:[writing-mode:vertical-rl] narrow:max-wide:[text-orientation:upright] narrow:max-wide:tracking-[0.08em] narrow:max-wide:mt-0 wide:mt-auto";

const NEXT_FULL = "jukebox__next-full narrow:max-wide:hidden";

const NEXT_COMPACT =
  "jukebox__next-compact hidden narrow:max-wide:inline";

const INDEX =
  "jukebox__index flex flex-col self-stretch gap-[0.05rem] p-[0.2rem] border border-[rgba(250,250,244,0.14)] rounded-inner bg-[rgba(12,13,10,0.6)] data-[idle=true]:opacity-40 max-[48rem]:hidden";

const LETTER =
  "jukebox__letter flex items-center justify-center flex-[1_1_0] min-h-[1rem] p-0 w-[1.5rem] font-mono text-[clamp(0.6rem,1.4vmin,0.85rem)] font-bold leading-none text-cream bg-transparent border-0 rounded-inner cursor-pointer [&:hover:not(:disabled)]:text-ink [&:hover:not(:disabled)]:bg-yellow [:root:not([data-game-input=pointer])_&:focus-visible:not(:disabled)]:text-ink [:root:not([data-game-input=pointer])_&:focus-visible:not(:disabled)]:bg-yellow [&[data-nav-focus]:not(:disabled)]:text-ink [&[data-nav-focus]:not(:disabled)]:bg-yellow disabled:text-[rgba(250,250,244,0.28)] disabled:cursor-[var(--cursor-arrow),default] [&.is-active]:text-ink [&.is-active]:bg-yellow";

/** The phone's own dialog: the details the full-width list cannot also show. */
const SONG_DIALOG =
  "jukebox__song-dialog [&_.song-art--panel]:max-narrow:w-[clamp(7rem,32vw,10rem)] [&_.song-art--panel]:max-narrow:max-w-full [&_.song-art--panel]:max-narrow:aspect-square [&_.song-art--panel]:max-narrow:self-center";

/** The selection shown inside that dialog: full width, a little more air. */
const DIALOG_SELECTION = "max-narrow:flex max-narrow:w-full max-narrow:gap-[0.7rem]";

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
  /** Entered from a run, so the chosen song is one that was just played. */
  returning?: boolean;
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
  returning = false,
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
  const visibleSong =
    attract || returning || !phone || phonePicked ? song : null;

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

  const selection = (inDialog = false) => (
    <div className={inDialog ? `${SELECTION} ${DIALOG_SELECTION}` : `${SELECTION} max-narrow:hidden`}>
      <aside
        className={DISPLAY}
        aria-label={t("screen.nowPlaying")}
        data-has-song={song ? "true" : "false"}
      >
        <div className={NOW_PLAYING}>
          <p className="jukebox__label m-0 font-mono text-[0.58rem] font-bold tracking-[0.18em] uppercase text-[rgba(250,250,244,0.55)]">
            {t("screen.nowPlaying")}
          </p>
          {song ? (
            <p className={DURATION}>{formatClock(song.durationMs)}</p>
          ) : null}
        </div>
        {song ? (
          <>
            <SongCover
              song={song}
              size="panel"
              art={previewView.songId === song.id ? previewView.art ?? undefined : undefined}
            />
            <div className={HEADLINE}>
              <p className={TITLE}>{song.title}</p>
              <SongChips song={song} className="jukebox__chips" />
            </div>
            <p className={ARTIST}>
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
            <div className="jukebox__history flex-[1_1_7rem] min-h-0 mt-[0.25rem] overflow-hidden border-t border-dashed border-[rgba(250,250,244,0.2)]">
              <table className="jukebox__history-table block w-full border-collapse table-fixed font-mono text-[0.57rem] leading-[1.2] text-[rgba(250,250,244,0.78)] [&_thead]:block [&_tbody]:block [&_tbody]:max-h-full [&_tbody]:overflow-hidden [&_tr]:grid [&_tr]:grid-cols-[minmax(0,1fr)_3.6rem_4rem] [&_tr]:items-center [&_tr]:h-[1.45rem] [&_th]:min-w-0 [&_th]:overflow-hidden [&_th]:px-[0.2rem] [&_th]:py-[0.1rem] [&_th]:text-left [&_th]:whitespace-nowrap [&_th]:text-ellipsis [&_td]:min-w-0 [&_td]:overflow-hidden [&_td]:px-[0.2rem] [&_td]:py-[0.1rem] [&_td]:text-left [&_td]:whitespace-nowrap [&_td]:text-ellipsis [&_th]:text-[rgba(250,250,244,0.48)] [&_th]:text-[0.52rem] [&_th]:font-normal [&_th]:tracking-[0.08em] [&_th]:uppercase [&_td:last-child]:text-right [&_th:last-child]:text-right">
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
                      <td
                        colSpan={3}
                        className="col-span-full text-center text-[rgba(250,250,244,0.55)]"
                      >
                        {t("screen.noScoreYet")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className={TITLE}>{t("screen.libraryEmpty")}</p>
        )}
      </aside>
      <button
        type="button"
        className={NEXT}
        aria-label={t("screen.nextBand")}
        // A button that does nothing is still pressed: `aria-disabled` keeps it
        // focusable and says "not now" when a player tries, where `disabled` takes
        // the control out of the walk and answers with silence.
        aria-disabled={!song}
        data-sound={song ? "select" : "refuse"}
        onClick={() => {
          if (!song) return;
          onNext();
        }}
      >
        <span className={NEXT_FULL}>{t("screen.nextBand")}</span>
        <span className={NEXT_COMPACT} aria-hidden="true">
          {t("screen.nextShort")}
        </span>
      </button>
    </div>
  );

  return (
    <div className="screen screen--songs">
      <div className={PANEL}>
        <div className={HEADING}>
          <ScreenBackButton label={t("screen.backToMenu")} onBack={onBack} />
          <h2 className="screen__title">{t("screen.songsTitle")}</h2>
        </div>

        <div className={JUKEBOX}>
          <div className={LIST}>
            <div className="jukebox__search flex flex-wrap items-center gap-[0.6rem] mb-[0.6rem]">
              <label
                className="jukebox__search-label font-mono text-kicker-tight font-bold tracking-[0.12em] uppercase text-[rgba(250,250,244,0.62)] [@media(max-width:40rem)]:sr-only"
                htmlFor="jukebox-search"
              >
                {t("screen.searchLabel")}
              </label>
              <input
                id="jukebox-search"
                className="jukebox__input flex-[1_1_12rem] min-w-0 px-[0.6rem] py-[0.45rem] font-[inherit] text-[0.9rem] text-cream bg-[rgba(12,13,10,0.7)] border border-[rgba(250,250,244,0.28)] rounded-inner focus-visible:border-yellow [@media(max-width:40rem)]:basis-[7rem]"
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
                className="band-btn jukebox__playlists flex-none inline-flex items-center gap-[0.45rem]"
                aria-haspopup="dialog"
                data-sound="open"
                onClick={() => setLists(true)}
              >
                {t("screen.playlists")}
                <span className="jukebox__playlists-count px-[0.35rem] text-[0.62rem] text-ink bg-yellow rounded-pill">
                  {sourceCount}
                </span>
              </button>
              {offline.supported ? (
                <button
                  type="button"
                  className="band-btn jukebox__playlists flex-none inline-flex items-center gap-[0.45rem]"
                  aria-haspopup="dialog"
                  data-sound="open"
                  onClick={() => setDownloadsOpen(true)}
                >
                  {t("screen.downloads")}
                  {offline.entries.length > 0 ? (
                    <span className="jukebox__playlists-count px-[0.35rem] text-[0.62rem] text-ink bg-yellow rounded-pill">
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
              <div
                className="jukebox__search-state flex flex-wrap items-center gap-x-[0.7rem] gap-y-[0.35rem] mt-[-0.15rem] mb-[0.5rem]"
                aria-live="polite"
              >
                {searching ? (
                  <p className="jukebox__search-line m-0 font-mono text-[0.66rem] text-[rgba(250,250,244,0.62)]">
                    {onDemandCount === 1
                      ? t("screen.searchingOne")
                      : t("screen.searchingMany", { count: onDemandCount })}
                  </p>
                ) : null}
                {live
                  ? searchState.failures.map((failure) => (
                      <p
                        className="jukebox__search-line is-warn m-0 font-mono text-[0.66rem] text-[rgba(250,250,244,0.62)] [&.is-warn]:text-yellow"
                        key={failure.url}
                      >
                        {t("screen.searchFailed", {
                          name: failure.name ?? failure.url,
                        })}{" "}
                        <span className="jukebox__search-error text-[rgba(250,250,244,0.5)]">
                          {failure.error}
                        </span>{" "}
                        <button
                          type="button"
                          className="band-btn jukebox__search-retry px-[0.45rem] py-[0.12rem] text-[0.62rem]"
                          data-sound="select"
                          onClick={() => library.search(trimmed, true)}
                        >
                          {t("screen.searchRetry")}
                        </button>
                      </p>
                    ))
                  : null}
                {trimmed.length > 0 && trimmed.length < SEARCH_MIN_CHARS ? (
                  <p className="jukebox__search-line m-0 font-mono text-[0.66rem] text-[rgba(250,250,244,0.62)]">
                    {t("screen.searchShort")}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div
              className={SCROLLER}
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
                <p className="jukebox__empty m-0 p-[1.2rem] font-mono text-[0.72rem] text-[rgba(250,250,244,0.6)]">
                  {t("screen.songsLoading")}
                </p>
              ) : null}
              {ready && loadingLibrary ? (
                <p className="jukebox__empty m-0 p-[1.2rem] font-mono text-[0.72rem] text-[rgba(250,250,244,0.6)]">
                  {t("screen.libraryLoading")}
                </p>
              ) : null}
              {nothing ? (
                <p className="jukebox__empty m-0 p-[1.2rem] font-mono text-[0.72rem] text-[rgba(250,250,244,0.6)]">
                  {onDemandCount > 0
                    ? t("screen.libraryEmptySearch")
                    : t("screen.libraryEmpty")}
                </p>
              ) : null}
              {!reading && !nothing && !searching && shown.length === 0 ? (
                <p className="jukebox__empty m-0 p-[1.2rem] font-mono text-[0.72rem] text-[rgba(250,250,244,0.6)]">
                  {t("screen.noMatches")}
                </p>
              ) : null}
              {/* Only the window is mounted: the spacers stand in for every row
                  and heading outside it, so the scrollbar and every letter's
                  offset are the ones a fully mounted list would have. */}
              <div
                className="jukebox__spacer w-full pointer-events-none"
                aria-hidden="true"
                style={{ height: list.range?.top ?? 0 }}
              />
              {list.sections.map((section) => {
                const group = shown[section.group];
                if (!group) return null;
                return (
                  <section className="song-group" key={group.letter}>
                    <h3 className="song-group__letter sticky top-0 z-1 m-0 px-[0.6rem] py-[0.2rem] font-mono text-[0.62rem] font-bold tracking-[0.18em] text-ink bg-yellow">
                      <span>{group.letter}</span>
                      <span className="song-group__count ml-[0.65rem] font-normal tracking-[0.04em] text-ink-soft before:content-['·'] before:mr-[0.55rem] before:text-ink-soft">
                        {group.entries.length === 1
                          ? t("screen.playlistOneSong")
                          : t("screen.songCount", { count: group.entries.length })}
                      </span>
                    </h3>
                    {/* The heading is mounted before the rows are: this is the
                        gap between it and the first row the window kept. */}
                    {section.skip > 0 ? (
                      <div
                        className="jukebox__spacer w-full pointer-events-none"
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
                className="jukebox__spacer w-full pointer-events-none"
                aria-hidden="true"
                style={{ height: list.range?.bottom ?? 0 }}
              />
            </div>
          </div>

          <nav
            className={INDEX}
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
                      ? `${LETTER} is-active`
                      : LETTER
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
          className={SONG_DIALOG}
          panelClassName="config__panel--wide jukebox__song-dialog-panel"
          onClose={() => setPhoneSelectionOpen(false)}
        >
          {selection(true)}
        </NativeDialog>
      ) : null}

      {lists ? (
        <Suspense fallback={null}>
          <PlaylistsDialog
            library={library}
            offline={offline}
            onClose={() => setLists(false)}
          />
        </Suspense>
      ) : null}

      {downloadsOpen ? (
        <Suspense fallback={null}>
          <DownloadsDialog
            entries={offline.entries}
            storage={offline.storage}
            busy={offline.busy}
            busyId={offline.busyId}
            queue={offline.queue}
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
