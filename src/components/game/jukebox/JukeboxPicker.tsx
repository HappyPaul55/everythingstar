import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../../i18n/react";
import { focusIsSilent } from "../ui/nav";
import {
  groupSongs,
  searchSongs,
  type SongGroup,
} from "../../../lib/game/songList";
import type { Song } from "../../../lib/game/song";
import type { Library } from "../library/useLibrary";
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_CHARS } from "../library/useOnDemand";
import { SongRow } from "../screens/SongRow";
import { useSongList } from "../screens/useSongList";
import { NativeDialog } from "../ui/NativeDialog";

/**
 * The Jukebox's picker: the library and the player's queue in one dialog.
 *
 * It is opened by a press and is therefore a **lazy chunk**: a listener who only
 * presses play never downloads the search, the window or the queue list. The
 * song list is the same one Songs uses — the same groups, the same search, the
 * same window — so a library of two thousand songs behaves the same in a dialog
 * as it does on its own page.
 *
 * A row selects the song; the three actions below are what the player chooses to
 * do with it. **Play now** closes the dialog because the choice is made;
 * **Play next** and **Add to queue** keep it open, so a listener can build the
 * queue in one visit and watch the count move.
 */
interface Props {
  library: Library;
  current: Song | null;
  queue: Song[];
  initialTab?: "songs" | "queue";
  onPlayNow: (song: Song) => void;
  onPlayNext: (song: Song) => void;
  onEnqueue: (song: Song) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onFindSongs: () => void;
  onClose: () => void;
}

export function JukeboxPicker({
  library,
  current,
  queue,
  initialTab = "songs",
  onPlayNow,
  onPlayNext,
  onEnqueue,
  onRemove,
  onClear,
  onFindSongs,
  onClose,
}: Props) {
  const t = useT();
  const [tab, setTab] = useState<"songs" | "queue">(initialTab);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Song | null>(current);
  const chosenRef = useRef<Song | null>(chosen);
  chosenRef.current = chosen;
  const [status, setStatus] = useState<string>("");
  const [ready, setReady] = useState(false);

  // Let the dialog paint before grouping a library that may be thousands of
  // rows. The same one-frame deferral as Songs.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const groups = useMemo<SongGroup[]>(
    () => (ready ? groupSongs(library.songs) : []),
    [ready, library.songs],
  );
  const trimmed = query.trim();
  const searchState = library.searchState;
  const live = searchState.query === trimmed;
  const searching = live && searchState.searching;
  const keep = live && searchState.found.size > 0 ? searchState.found : undefined;
  const shown = useMemo(
    () => searchSongs(groups, query, keep),
    [groups, query, keep],
  );
  const list = useSongList({ shown, query, chosen, ready });

  // A pause in typing is the ask, exactly as on Songs; Enter asks immediately.
  const searchLibrary = library.search;
  useEffect(() => {
    if (trimmed.length < SEARCH_MIN_CHARS) return;
    const timer = setTimeout(() => searchLibrary(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, searchLibrary]);

  const target = chosen ?? current;
  const canQueue = target !== null && target.id !== current?.id;
  const canNext = canQueue;
  const actionTarget = () => chosenRef.current ?? current;
  const reading = !ready || (library.loading && library.songs.length === 0);
  const nothing =
    ready && !library.loading && library.songs.length === 0 && !searching;

  const add = () => {
    const pick = actionTarget();
    if (!pick || pick.id === current?.id) return;
    onEnqueue(pick);
    setStatus(t("screen.jukeboxAdded"));
  };
  const next = () => {
    const pick = actionTarget();
    if (!pick || pick.id === current?.id) return;
    onPlayNext(pick);
    setStatus(t("screen.jukeboxNextStatus", { title: pick.title }));
  };

  return (
    <NativeDialog
      title={t("screen.jukeboxPick")}
      panelClassName="config__panel--wide jukebox__picker-panel"
      initialFocus={tab === "songs" ? "#song-list-search" : undefined}
      onClose={onClose}
    >
      <div className="jukebox__tabs" role="tablist" aria-label={t("screen.jukeboxPick")}>
        <button
          type="button"
          role="tab"
          id="jukebox-tab-songs"
          aria-controls="jukebox-panel-songs"
          aria-selected={tab === "songs"}
          className={tab === "songs" ? "jukebox__tab is-active" : "jukebox__tab"}
          data-sound="select"
          onClick={() => setTab("songs")}
        >
          {t("screen.jukeboxTabSongs")}
        </button>
        <button
          type="button"
          role="tab"
          id="jukebox-tab-queue"
          aria-controls="jukebox-panel-queue"
          aria-selected={tab === "queue"}
          className={tab === "queue" ? "jukebox__tab is-active" : "jukebox__tab"}
          data-sound="select"
          onClick={() => setTab("queue")}
        >
          {t("screen.jukeboxTabQueue")}
          <span className="jukebox__tab-count">{queue.length}</span>
        </button>
      </div>

      <div
        className="jukebox__tab-panel"
        id="jukebox-panel-songs"
        role="tabpanel"
        aria-labelledby="jukebox-tab-songs"
        hidden={tab !== "songs"}
      >
        <div className="jukebox__picker-search">
          <label className="jukebox__picker-label" htmlFor="song-list-search">
            {t("screen.searchLabel")}
          </label>
          <input
            id="song-list-search"
            className="song-list__input"
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder={t("screen.searchPlaceholder")}
            value={query}
            onChange={(event) => {
              list.markTyped();
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || trimmed.length < SEARCH_MIN_CHARS) return;
              event.preventDefault();
              library.search(trimmed, true);
            }}
          />
        </div>

        {live && searching ? (
          <p className="jukebox__picker-state" aria-live="polite">
            {t("screen.searchingOne")}
          </p>
        ) : null}
        {trimmed.length > 0 && trimmed.length < SEARCH_MIN_CHARS ? (
          <p className="jukebox__picker-state">{t("screen.searchShort")}</p>
        ) : null}
        {searchState.failures.length > 0 && live ? (
          <div className="jukebox__picker-state" aria-live="polite">
            {searchState.failures.map((failure) => (
              <p className="is-warn" key={failure.url}>
                {t("screen.searchFailed", { name: failure.name ?? failure.url })}{" "}
                <button
                  type="button"
                  className="band-btn jukebox__picker-retry"
                  data-sound="select"
                  onClick={() => library.search(trimmed, true)}
                >
                  {t("screen.searchRetry")}
                </button>
              </p>
            ))}
          </div>
        ) : null}

        <div
          className="song-list__scroller jukebox__picker-list"
          ref={list.scroller}
          onScroll={list.onScroll}
          onKeyDown={list.onKeyDown}
          aria-busy={reading}
          style={list.heights ? { scrollPaddingTop: list.heights.header } : undefined}
        >
          <p className="sr-only" role="status" aria-live="polite">
            {reading
              ? t("screen.songsLoading")
              : searching
                ? t("screen.searchingOne")
                : nothing
                  ? t("screen.libraryEmpty")
                  : t("screen.songCount", {
                      count: shown.reduce(
                        (count, group) => count + group.entries.length,
                        0,
                      ),
                    })}
          </p>
          {reading ? <p className="song-list__empty">{t("screen.songsLoading")}</p> : null}
          {nothing ? (
            <div className="jukebox__picker-empty">
              <p className="song-list__empty">{t("screen.jukeboxEmpty")}</p>
              <button
                type="button"
                className="band-btn band-btn--primary"
                data-sound="select"
                onClick={onFindSongs}
              >
                {t("screen.jukeboxEmptyAction")}
              </button>
            </div>
          ) : null}
          {!reading && !nothing && shown.length === 0 && !searching ? (
            <p className="song-list__empty">{t("screen.noMatches")}</p>
          ) : null}
          <div
            className="song-list__spacer"
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
                {section.skip > 0 ? (
                  <div
                    className="song-list__spacer"
                    aria-hidden="true"
                    style={{ height: section.skip }}
                  />
                ) : null}
                {group.entries.slice(section.from, section.to).map((entry) => (
                  <SongRow
                    key={entry.song.id}
                    song={entry.song}
                    selected={entry.song.id === chosen?.id}
                    defaultFocus={false}
                    onFocus={() => {
                      // The list seats its chosen row silently when it is built
                      // or filtered; that placement is not the player moving.
                      if (focusIsSilent()) return;
                      setChosen(entry.song);
                    }}
                    onSelect={() => setChosen(entry.song)}
                    onStart={() => onPlayNow(entry.song)}
                  />
                ))}
              </section>
            );
          })}
          <div
            className="song-list__spacer"
            aria-hidden="true"
            style={{ height: list.range?.bottom ?? 0 }}
          />
        </div>

        <div className="jukebox__picker-actions">
          <button
            type="button"
            className="band-btn band-btn--primary"
            aria-disabled={!target}
            data-sound="select"
            onClick={() => {
              const pick = actionTarget();
              if (pick) onPlayNow(pick);
            }}
          >
            {t("screen.jukeboxPlayNow")}
          </button>
          <button
            type="button"
            className="band-btn"
            aria-disabled={!canNext}
            data-sound="select"
            onClick={next}
          >
            {t("screen.jukeboxPlayNext")}
          </button>
          <button
            type="button"
            className="band-btn"
            aria-disabled={!canQueue}
            data-sound="select"
            onClick={add}
          >
            {t("screen.jukeboxAddQueue")}
          </button>
        </div>
        <p className="jukebox__picker-status" role="status" aria-live="polite">
          {status}
        </p>
      </div>

      <div
        className="jukebox__tab-panel"
        id="jukebox-panel-queue"
        role="tabpanel"
        aria-labelledby="jukebox-tab-queue"
        hidden={tab !== "queue"}
      >
        <p className="jukebox__queue-hint">{t("screen.jukeboxQueueHint")}</p>
        {queue.length === 0 ? (
          <p className="song-list__empty">{t("screen.jukeboxQueueEmpty")}</p>
        ) : (
          <>
            <ol className="jukebox__queue-list">
              {queue.map((song) => (
                <li className="jukebox__queue-row" key={song.id}>
                  <span className="jukebox__queue-title">{song.title}</span>
                  <span className="jukebox__queue-artist">{song.artist.name}</span>
                  <button
                    type="button"
                    className="band-btn jukebox__queue-remove"
                    aria-label={`${t("screen.jukeboxRemove")} ${song.title}`}
                    data-sound="back"
                    onClick={() => onRemove(song.id)}
                  >
                    {t("screen.jukeboxRemove")}
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="band-btn jukebox__queue-clear"
              data-sound="back"
              onClick={onClear}
            >
              {t("screen.jukeboxClearQueue")}
            </button>
          </>
        )}
      </div>
    </NativeDialog>
  );
}
