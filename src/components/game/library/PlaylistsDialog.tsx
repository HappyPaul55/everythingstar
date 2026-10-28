import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import { useT } from "../../../i18n/react";
import type { Translate } from "../../../i18n";
import { shareUrl, type IntentKind } from "../../../lib/game/intent";
import type { Song } from "../../../lib/game/song";
import { shortDate } from "../../../lib/game/when";
import { fetchableUrl, hostOf, MAX_URL_CHARS, mixedContentBlocked } from "../../../lib/game/url";
import { filesFromDrop } from "./drop";
import { supportsFolders, supportsImports, type ImportProblem } from "./folder";
import {
  NO_IMPORT,
  cancelImport,
  claimImport,
  ownsImport,
  releaseImport,
  type ImportClaim,
} from "./importGuard";
import { IMPORT_ACCEPT } from "./localImport";
import { canForget, type FolderRow, type Library, type PlaylistRow } from "./useLibrary";
import { planPlaylistDownload } from "./downloads";
import type { OfflineController } from "./useOffline";
import { NativeDialog } from "../ui/NativeDialog";

/**
 * The playlists: where the songs come from, and the one place to say so.
 *
 * A playlist is a URL and nothing else — the built-in one included — so this is a
 * list of them, what each one gave us, and the things a reader can do about it:
 * **refresh** one (or all of them) when they know it has changed, **forget** one
 * they are done with, and **save** a catalogue for offline play. Nothing is fetched
 * behind their back, which is why Refresh is a button rather than a thing that
 * happens on load, and why saving a playlist is a press of its own.
 */
interface Props {
  library: Library;
  offline: OfflineController;
  onClose: () => void;
}

export function PlaylistsDialog({ library, offline, onClose }: Props) {
  const t = useT();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"files" | "folder" | "drop" | null>(null);
  const [problem, setProblem] = useState<ImportProblem | null>(null);
  const [dropping, setDropping] = useState(false);
  /** The row whose share link was just copied, `error`, or nothing. */
  const [copied, setCopied] = useState<string | "error" | null>(null);
  const copyTimer = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  // The one claim on this dialog, read **synchronously** by the drop handler and
  // by Close: `busy` is only the render of it, and a state update lands a frame
  // later than the press that has to be refused.
  const gate = useRef<ImportClaim>(NO_IMPORT);
  const dragDepth = useRef(0);
  const typed = url.trim();
  // What the address is, before it is added: the host is the thing a player can
  // recognise, and the two refusals are said here rather than after a failed read.
  const host = hostOf(typed);
  const invalid = typed !== "" && host === null;
  const insecure = host !== null && mixedContentBlocked(typed, window.location.protocol);
  const addable = fetchableUrl(typed) !== null;
  const importable = supportsImports();

  // One playlist's songs, by the URL that listed them: the same `from` a song's
  // offline record is deduplicated by. Grouped once, because the dialog redraws on
  // every download tick and a filter per row would walk the whole library per tick.
  const songsBySource = useMemo(() => {
    const grouped = new Map<string, Song[]>();
    for (const song of library.songs) {
      const listed = grouped.get(song.from);
      if (listed) listed.push(song);
      else grouped.set(song.from, [song]);
    }
    return grouped;
  }, [library.songs]);

  /** Let go of the dialog, if `epoch` is still the attempt holding it. */
  const finish = useCallback((epoch: number) => {
    if (!ownsImport(gate.current, epoch)) return;
    gate.current = releaseImport(gate.current);
    setBusy(null);
  }, []);

  /**
   * Copy a batch that already holds the claim.
   *
   * The claim covers the walk as well as the copy for a drop, so this never
   * asks for it again — it reports into the attempt that came before it and
   * lets go on every path.
   */
  const copy = useCallback(
    async (files: readonly File[], epoch: number): Promise<void> => {
      try {
        const failure = await library.importFiles(Array.from(files));
        if (ownsImport(gate.current, epoch) && failure) setProblem(failure);
      } catch {
        // The library reports its own failures, but a copy that throws is still
        // one the player has to be told about rather than left waiting.
        if (ownsImport(gate.current, epoch)) setProblem("failed");
      } finally {
        finish(epoch);
      }
    },
    [finish, library.importFiles],
  );

  const runImport = useCallback(
    async (
      files: FileList | readonly File[],
      kind: "files" | "folder" | "drop",
    ): Promise<void> => {
      const claimed = claimImport(gate.current);
      if (!claimed) return;
      gate.current = claimed;
      setBusy(kind);
      setProblem(null);
      await copy(Array.from(files), claimed.epoch);
    },
    [copy],
  );

  /**
   * Take a drop: busy from the moment the files land.
   *
   * Walking a dropped directory happens after the drop event and can outlast
   * the dialog, so the claim is taken **before** the walk. Close, Escape and the
   * backdrop are refused while it is held, and a walk that resolves after the
   * dialog has gone owns nothing and starts no copy.
   */
  const startDrop = useCallback(
    (transfer: DataTransfer) => {
      const claimed = claimImport(gate.current);
      if (!claimed) return;
      gate.current = claimed;
      setBusy("drop");
      setProblem(null);
      void (async () => {
        let files: File[];
        try {
          files = await filesFromDrop(transfer);
        } catch {
          if (ownsImport(gate.current, claimed.epoch)) setProblem("failed");
          finish(claimed.epoch);
          return;
        }
        if (!ownsImport(gate.current, claimed.epoch)) return;
        if (files.length === 0) {
          setProblem("empty");
          finish(claimed.epoch);
          return;
        }
        await copy(files, claimed.epoch);
      })();
    },
    [copy, finish],
  );

  // The dialog going away cancels the walk it owned: the claim's epoch moves on,
  // so a drop that resolves afterwards cannot begin a copy nobody can see.
  useEffect(() => () => {
    gate.current = cancelImport(gate.current);
  }, []);

  // The copied-link note is a moment, not a state: clear it, and its timer, with
  // the dialog.
  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  /**
   * Copy the canonical "Add … to EverythingStar" link for a source.
   *
   * The link is the one a provider would publish, built from this origin, so a
   * player who copies it here shares exactly what a playlist's own page would.
   */
  const copyLink = (kind: IntentKind, url: string) => {
    const link = shareUrl(window.location.origin, { kind, url });
    void (async () => {
      try {
        if (!navigator.clipboard) throw new Error("no clipboard");
        await navigator.clipboard.writeText(link);
        setCopied(url);
        if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopied(null), 2000);
      } catch {
        setCopied("error");
      }
    })();
  };

  // A drop is taken wherever the pointer is while the dialog is open, so the page
  // behind a modal cannot treat it as navigation. The count keeps `dragleave` from
  // going out as the pointer crosses a child.
  useEffect(() => {
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDropping(true);
    };
    const leave = (event: DragEvent) => {
      if (dragDepth.current === 0) return;
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDropping(false);
    };
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDropping(false);
      // One import at a time: a drop that lands while another is walking or
      // copying is ignored, so it cannot walk a second tree or replace the first
      // import's row and progress. `startDrop` claims the dialog before it walks.
      const transfer = event.dataTransfer;
      if (!transfer) return;
      startDrop(transfer);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [startDrop]);

  const close = () => {
    // An import is a copy in progress — or a dropped tree still being walked:
    // closing mid-way would leave nobody able to remove what it wrote or stop
    // what it started, so the dialog waits for it.
    if (gate.current.busy) return;
    onClose();
  };

  const add = () => {
    if (!addable) return;
    library.add(typed);
    setUrl("");
  };

  const empty = library.playlists.length === 0 && library.folders.length === 0;
  const working = library.folders.find((folder) => folder.status !== "ready");
  const progress =
    working?.status === "copying"
      ? t("screen.importCopying", {
          copied: working.copied ?? 0,
          total: working.total ?? 0,
        })
      : working?.status === "scanning"
        ? t("screen.importReading")
        : t("screen.importPreparing");

  return (
    <NativeDialog
      title={t("screen.playlists")}
      panelClassName="config__panel--wide"
      dismissible={busy === null}
      onClose={close}
    >
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          data-import="files"
          accept={IMPORT_ACCEPT}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            void runImport(files, "files");
          }}
        />
        <input
          ref={folderInput}
          type="file"
          multiple
          hidden
          data-import="folder"
          {...({ webkitdirectory: "", directory: "" } as unknown as InputHTMLAttributes<HTMLInputElement>)}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            void runImport(files, "folder");
          }}
        />
        <p className="config__lead">{t("screen.playlistsLead")}</p>
        <p className="sr-only" role="status" aria-live="polite">
          {library.loading
            ? t("screen.libraryLoading")
            : t("screen.songCount", { count: library.songs.length })}
        </p>

        {empty ? (
          <div className="playlists__empty">
            <p className="config__hint">{t("screen.playlistsNone")}</p>
            {/* The way back: a library somebody has emptied stays emptied unless
                they say otherwise, and this is the one press that says it. */}
            <button
              type="button"
              className="band-btn band-btn--primary"
              onClick={() => library.addDefault()}
            >
              {t("screen.playlistRestore")}
            </button>
          </div>
        ) : (
          <ul className="playlists">
            {library.playlists.map((row) => {
              // What saving this row would do, worked out before anybody presses:
              // a catalogue can say how many songs it would keep, and a row that is
              // off, a capability or already on this device simply offers nothing.
              const listed = songsBySource.get(row.url) ?? [];
              const plan = planPlaylistDownload(listed);
              const queue = offline.queue?.source === row.url ? offline.queue : null;
              const saveable =
                offline.supported &&
                !row.disabled &&
                row.onDemand === null &&
                plan.songs.length > 0;
              return (
                <li
                  className={row.disabled ? "playlists__row is-disabled" : "playlists__row"}
                  key={row.url}
                >
                  <div className="playlists__head">
                    <span className="playlists__name">
                      {row.builtIn
                        ? t("screen.playlistDefaultName")
                        : row.name ?? fileName(row.url)}
                    </span>
                    {row.disabled ? null : row.onDemand ? (
                      <span className="playlists__count">
                        {t("screen.playlistOnDemand")}
                      </span>
                    ) : (
                      <span className="playlists__count">
                        {row.count === 1
                          ? t("screen.playlistOneSong")
                          : t("screen.playlistSongs", { count: row.count })}
                      </span>
                    )}
                  </div>
                  <p className="playlists__url">{row.url}</p>
                  {row.onDemand && !row.disabled ? (
                    <p className="config__hint">{t("screen.playlistOnDemandHint")}</p>
                  ) : null}
                  <div className="playlists__foot">
                    <span className="playlists__state">{state(t, row)}</span>
                    <button
                      type="button"
                      className="band-btn"
                      title={t("screen.playlistCopyLink")}
                      onClick={() => copyLink("playlist", row.url)}
                      data-sound="select"
                    >
                      {copied === row.url
                        ? t("screen.playlistCopied")
                        : t("screen.playlistCopyLink")}
                    </button>
                    {row.disabled ? (
                      <button
                        type="button"
                        className="band-btn band-btn--primary"
                        onClick={() => library.setEnabled(row.url, true)}
                        data-sound="select"
                      >
                        {t("screen.playlistEnable")}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="band-btn"
                          onClick={() => library.refresh(row.url)}
                        >
                          {t("screen.playlistRefresh")}
                        </button>
                        {saveable ? (
                          queue ? (
                            <button
                              type="button"
                              className="band-btn"
                              aria-label={t("screen.playlistSaveCancel")}
                              onClick={() => offline.cancel()}
                              data-sound="back"
                            >
                              {t("screen.downloadCancel")}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="band-btn"
                              disabled={offline.busy}
                              onClick={() => offline.downloadPlaylist(listed, row.url)}
                              data-sound="select"
                            >
                              {plan.songs.length === 1
                                ? t("screen.playlistSaveOfflineOne")
                                : t("screen.playlistSaveOffline", {
                                    count: plan.songs.length,
                                  })}
                            </button>
                          )
                        ) : null}
                        {row.builtIn ? (
                          <button
                            type="button"
                            className="band-btn"
                            onClick={() => library.setEnabled(row.url, false)}
                            data-sound="back"
                          >
                            {t("screen.playlistDisable")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="band-btn"
                            onClick={() => library.remove(row.url)}
                            data-sound="back"
                          >
                            {t("screen.playlistRemove")}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {queue ? (
                    <p className="config__hint" role="status">
                      {t("screen.downloadQueue", {
                        done: queue.done,
                        total: queue.total,
                      })}
                    </p>
                  ) : null}
                  {saveable && plan.skipped.length > 0 ? (
                    <p className="config__hint">
                      {t("screen.playlistOfflineSkipped", {
                        count: plan.skipped.length,
                      })}
                    </p>
                  ) : null}
                  {row.problems.length > 0 ? (
                    <p className="config__hint is-warn">
                      {t("screen.playlistProblems", { count: row.problems.length })}:{" "}
                      {row.problems.slice(0, 3).join("; ")}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {library.folders.length > 0 ? (
          <ul className="playlists">
            {library.folders.map((folder) => (
              <li className="playlists__row" key={folder.id}>
                <div className="playlists__head">
                  <span className="playlists__name">{folder.name}</span>
                  <span className="playlists__count">{folderState(t, folder)}</span>
                </div>
                <p className="playlists__url">
                  {folder.imported
                    ? t("screen.folderImportedHint")
                    : folder.locked
                      ? t("screen.folderLockedHint")
                      : t("screen.openFolderHint")}
                </p>
                {folder.error ? (
                  <p className="config__hint is-warn" role="alert">
                    {folder.error === "permission"
                      ? t("screen.folderReconnectDenied")
                      : t("screen.folderReconnectFailed")}
                  </p>
                ) : null}
                <div className="playlists__foot">
                  <span className="playlists__state" />
                  {folder.locked ? (
                    <button
                      type="button"
                      className="band-btn band-btn--primary"
                      disabled={folder.busy === true}
                      onClick={() => library.reconnectFolder(folder.id)}
                      data-sound="open"
                    >
                      {t("screen.folderReconnect")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="band-btn"
                    disabled={!canForget(folder)}
                    onClick={() => library.removeFolder(folder.id)}
                    data-sound="back"
                  >
                    {t("screen.folderForget")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {library.pinned.length > 0 ? (
          <div className="playlists__add">
            <span className="config__label">{t("screen.pinnedLead")}</span>
            <ul className="playlists">
              {library.pinned.map((row) => (
                <li className="playlists__row" key={row.url}>
                  <div className="playlists__head">
                    <span className="playlists__name">
                      {row.song?.title ?? fileName(row.url)}
                    </span>
                    <span className="playlists__count">
                      {row.status === "ready"
                        ? t("screen.playlistOneSong")
                        : row.status === "loading"
                          ? t("screen.playlistLoading")
                          : t("screen.pinnedUnreadable")}
                    </span>
                  </div>
                  <p className="playlists__url">{row.url}</p>
                  {row.song ? (
                    <p className="config__hint">{row.song.artist.name}</p>
                  ) : null}
                  {row.status === "error" && row.error ? (
                    <p className="config__hint is-warn">{row.error}</p>
                  ) : null}
                  <div className="playlists__foot">
                    <span className="playlists__state" />
                    <button
                      type="button"
                      className="band-btn"
                      onClick={() => copyLink("song", row.url)}
                      data-sound="select"
                    >
                      {copied === row.url
                        ? t("screen.playlistCopied")
                        : t("screen.playlistCopyLink")}
                    </button>
                    <button
                      type="button"
                      className="band-btn"
                      onClick={() => library.refreshPinned(row.url)}
                    >
                      {t("screen.playlistRefresh")}
                    </button>
                    <button
                      type="button"
                      className="band-btn"
                      onClick={() => library.unpinSong(row.url)}
                      data-sound="back"
                    >
                      {t("screen.playlistRemove")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {copied === "error" ? (
          <p className="config__hint is-warn" role="alert">
            {t("screen.playlistCopyFailed")}
          </p>
        ) : null}
        <p className="sr-only" role="status" aria-live="polite">
          {copied !== null && copied !== "error" ? t("screen.playlistCopied") : ""}
        </p>

        {library.duplicates.length > 0 ? (
          <p className="config__hint">
            {t("screen.playlistDuplicates", { count: library.duplicates.length })}
          </p>
        ) : null}

        <form
          className="playlists__add"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <label className="config__label" htmlFor="playlists-url">
            {t("screen.addPlaylist")}
          </label>
          <div className="playlists__add-row">
            <input
              id="playlists-url"
              className="jukebox__input"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              maxLength={MAX_URL_CHARS}
              placeholder={t("screen.playlistUrl")}
              value={url}
              aria-describedby={typed === "" ? undefined : "playlists-url-hint"}
              onChange={(event) => setUrl(event.target.value)}
            />
            <button
              type="submit"
              className="band-btn band-btn--primary"
              disabled={!addable}
              data-sound="select"
            >
              {t("screen.playlistAdd")}
            </button>
          </div>
          {typed === "" ? null : invalid ? (
            <p id="playlists-url-hint" className="config__hint is-warn">
              {t("screen.playlistUrlInvalid")}
            </p>
          ) : (
            <p id="playlists-url-hint" className="config__hint">
              {t("screen.playlistHost", { host: host ?? "" })}
              {insecure ? ` ${t("screen.playlistInsecure")}` : null}
            </p>
          )}
        </form>

        <div className="playlists__add">
          <span className="config__label">{t("screen.foldersLead")}</span>
          <div
            className={dropping ? "playlists__drop is-over" : "playlists__drop"}
            aria-live="polite"
          >
            <span className="playlists__drop-note">
              {dropping ? t("screen.importDropActive") : t("screen.importDrop")}
            </span>
          </div>
          <div className="playlists__add-row playlists__import-row">
            <button
              type="button"
              className="band-btn band-btn--primary"
              disabled={busy !== null || !importable}
              onClick={() => fileInput.current?.click()}
              data-sound="open"
            >
              {t("screen.importFiles")}
            </button>
            <button
              type="button"
              className="band-btn"
              disabled={busy !== null || !importable}
              onClick={() => folderInput.current?.click()}
              data-sound="open"
            >
              {t("screen.importFolder")}
            </button>
          </div>
          <p className="config__hint">
            {importable ? t("screen.importHint") : t("screen.importNoSupport")}
          </p>
          <div className="playlists__add-row">
            <p className="config__hint">
              {supportsFolders() ? t("screen.openFolderHint") : t("screen.folderNoSupport")}
            </p>
            <button
              type="button"
              className="band-btn"
              disabled={!supportsFolders() || busy !== null}
              onClick={() => library.addFolder()}
              data-sound="open"
            >
              {t("screen.openFolder")}
            </button>
          </div>
          {busy !== null ? (
            <p className="config__hint" role="status" aria-live="polite">
              {progress}
            </p>
          ) : null}
          {problem !== null ? (
            <p className="config__hint is-warn" role="alert">
              {importProblem(t, problem)}
            </p>
          ) : null}
        </div>

        <div className="config__actions">
          <button type="button" className="band-btn" onClick={() => library.refresh()}>
            {t("screen.refreshAll")}
          </button>
          <button
            type="button"
            className="band-btn"
            disabled={busy !== null}
            onClick={close}
          >
            {t("screen.close")}
          </button>
        </div>
    </NativeDialog>
  );
}

/** What a folder is doing: still being copied or read, waiting to be let back in, or read. */
function folderState(t: Translate, folder: FolderRow): string {
  if (folder.busy) return t("screen.folderReconnecting");
  if (folder.status === "copying") {
    return t("screen.folderCopying", {
      copied: folder.copied ?? 0,
      total: folder.total ?? 0,
    });
  }
  if (folder.status === "scanning") return `${t("screen.folderReading")} ${folder.count}`;
  if (folder.locked) return t("screen.folderLocked");
  return folder.count === 1
    ? t("screen.playlistOneSong")
    : t("screen.playlistSongs", { count: folder.count });
}

/** One plain sentence for a refusal or a copy that failed. */
function importProblem(t: Translate, problem: ImportProblem): string {
  switch (problem) {
    case "unsupported":
      return t("screen.importUnsupported");
    case "empty":
      return t("screen.importEmpty");
    case "too-large":
      return t("screen.importTooLarge");
    case "no-space":
      return t("screen.importNoSpace");
    default:
      return t("screen.importFailed");
  }
}

/** What this playlist is doing: reading, read, cached, or a thing that went wrong. */
function state(t: Translate, row: PlaylistRow): string {
  if (row.disabled) return t("screen.playlistDisabled");
  if (row.status === "loading") return t("screen.playlistLoading");
  if (row.status === "failed") {
    return `${t("screen.playlistFailed")}${row.error ? `: ${row.error}` : ""}`;
  }
  const when =
    row.fetchedAt === null ? t("screen.playlistNever") : t("screen.playlistFetched", { when: shortDate(row.fetchedAt) });
  if (row.status === "cached") {
    // A refresh that failed falls back to the copy we had, and that copy is still
    // the library — so the row is **cached**, not failed. But the failure is the
    // reason the songs may be old, and hiding it made a broken refresh look like a
    // healthy row, so it is said quietly on the same line.
    const cached = `${when} · ${t("screen.playlistCached")}`;
    return row.error
      ? `${cached} · ${t("screen.playlistCachedError", { error: row.error })}`
      : cached;
  }
  return row.stale ? `${when} · ${t("screen.playlistStale")}` : when;
}

/** The last piece of a URL, for a playlist that does not name itself. */
function fileName(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.split("/").filter(Boolean).pop() ?? url;
  } catch {
    return url;
  }
}
