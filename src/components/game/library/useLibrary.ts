import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isStale } from "../../../lib/game/cache";
import {
  looksLikePlaylist,
  mergeSongs,
  readPlaylist,
  type PlaylistRead,
  type PlaylistSearch,
} from "../../../lib/game/playlist";
import type { Song } from "../../../lib/game/song";
import { fetchableUrl } from "../../../lib/game/url";
import {
  listOffline,
  mergeOfflineSongs,
  subscribeOffline,
} from "./downloads";
import { errorMessage } from "./errors";
import {
  closeFolder,
  importFiles as importLocalFiles,
  openFolder,
  requestFolderAccess,
  rescanFolder,
  restoreFolders,
  type ImportOutcome,
  type ImportProblem,
  type RestoredFolder,
} from "./folder";
import { useOnDemand, type OnDemandState } from "./useOnDemand";
import { usePinned, type PinnedRow, type PinResult } from "./usePinned";
import {
  absoluteUrl,
  fetchJson,
  loadDisabledSources,
  loadSources,
  readCache,
  saveDisabledSources,
  saveSources,
  writeCache,
} from "./store";

/**
 * The library: the playlists this browser has, and the songs they add up to.
 *
 * This is the **one** place anything is fetched. A playlist is read from the cache
 * while we have one and re-fetched when asked — never behind the player's back — and
 * a source that fails keeps whatever copy we had, so the menu is never emptier than
 * it was. Nothing here throws: a browser with no storage and no network is a library
 * with nothing in it, which the screen says plainly.
 *
 * A read is answered **once per generation**: Refresh, Enable and a removal followed
 * by an add all ask again, and the row waits for the newest question only. The answer
 * to the read they replaced is discarded rather than painted over it, so a press is
 * never swallowed by a request that was already out.
 *
 * The sources are **seeded once**: a first visit remembers the built-in playlist,
 * and after that the list is whatever the player has made of it. Deleting every
 * playlist is a choice, and the game does not put one back. The **built-in**
 * playlist is the published EverythingStar FOSS library, so it is read fresh once
 * per visit (the cached copy is the fallback); a player's playlist is only re-read
 * when they ask. A browser that seeded the old local empty index is moved onto the
 * published library.
 */
export interface PlaylistRow {
  url: string;
  name: string | null;
  count: number;
  /** When this copy was fetched, or null when there is none. */
  fetchedAt: number | null;
  /** `cached` is a copy we already had; `ready` is one fetched just now. */
  status: "loading" | "ready" | "cached" | "failed" | "disabled";
  /** Old enough to be worth refreshing, which is a thing the reader may do. */
  stale: boolean;
  /** Why it failed, when it did. */
  error: string | null;
  problems: string[];
  /** The published playlist this build seeds: it can be disabled, never removed. */
  builtIn: boolean;
  /** Kept as a row, but its songs are not in the library. */
  disabled: boolean;
  /**
   * How to ask this playlist for a song. Null for a catalogue — and a source that
   * can be asked normally lists no songs of its own.
   */
  onDemand: PlaylistSearch | null;
}

export interface Library {
  songs: Song[];
  playlists: PlaylistRow[];
  /** Folders opened or imported from this machine, remembered between visits. */
  folders: FolderRow[];
  /** Songs two playlists both list: the first one wins. */
  duplicates: string[];
  loading: boolean;
  add: (url: string) => void;
  remove: (url: string) => void;
  /**
   * A song document added from a link, with no playlist around it.
   *
   * `pinSong` reads the document before keeping it: a URL that is not a song, a
   * host with no CORS headers or a song already in the library is a refusal the
   * link dialog can say, not a row that fails later.
   */
  pinned: PinnedRow[];
  pinSong: (url: string) => Promise<PinResult>;
  unpinSong: (url: string) => void;
  refreshPinned: (url: string) => void;
  /** Switch a kept playlist off or on without forgetting the URL. */
  setEnabled: (url: string, enabled: boolean) => void;
  /** Fetch again - one playlist, or all of them. Never asked for on its own. */
  refresh: (url?: string) => void;
  /**
   * Ask the **on-demand** playlists for a song. The jukebox's search field is what
   * calls this; nothing asks on a screen load, and a search that fails is retried
   * by hand rather than by a hidden loop.
   */
  search: (query: string, force?: boolean) => void;
  /** What the on-demand playlists are doing for the query last asked. */
  searchState: OnDemandState;
  /**
   * Read a folder of charts off this machine. The songs join the library beside
   * the playlists; nothing is uploaded and nothing is copied.
   */
  addFolder: () => void;
  /**
   * Copy local files into this browser's storage and read them as a folder.
   *
   * Null when it worked; a problem word when it was refused or failed, which the
   * dialog says in one plain sentence.
   */
  importFiles: (files: FileList | readonly File[]) => Promise<ImportProblem | null>;
  removeFolder: (id: string) => void;
  /**
   * Ask the browser to let us read a restored folder again. A reload takes the
   * permission away, and only a gesture can ask for it back.
   */
  reconnectFolder: (id: string) => void;
  /**
   * Put the **built-in** playlist back, for a library that has none.
   *
   * Deleting every playlist is a player's choice and the game does not undo it — so
   * this is offered rather than done: one press and the list they started with is
   * theirs again, rather than a dead end with nothing in it.
   */
  addDefault: () => void;
}

/** One folder read from this machine, and how far the reading has got. */
export interface FolderRow {
  id: string;
  name: string;
  count: number;
  status: "copying" | "scanning" | "ready";
  /** The browser wants permission again before its charts can be read. */
  locked: boolean;
  /** Files copied, of how many, while an import is being written. */
  copied?: number;
  total?: number;
  /** Copied into this browser's storage, rather than a folder the player picked. */
  imported: boolean;
  /** A reconnect is walking the folder again: a second press is ignored. */
  busy?: boolean;
  /** Why the last reconnect could not happen, when it could not. */
  error?: "permission" | "failed" | null;
}

/** One folder's row, and the songs it brought with it. */
interface FolderSource {
  row: FolderRow;
  songs: Song[];
}

/**
 * May this folder be forgotten?
 *
 * A folder that is still being **copied** or **scanned** is a write in progress:
 * closing it deletes `imports/<id>/` out from under the writer, and the import
 * fails with its bytes already gone. A reconnect is the same kind of moment — the
 * walk is still reading the folder and would write its record back afterwards — so
 * it counts too. A **locked** folder is `ready`: it is a record whose charts want
 * permission, not a copy being written, and it can be forgotten freely.
 */
export function canForget(row: FolderRow): boolean {
  return row.status === "ready" && row.busy !== true;
}

/**
 * Is the library still being read?
 *
 * A playlist or a pinned song that has not answered is one thing; a folder being
 * walked or copied is the other, and a large import can spend its first seconds
 * there. Counting only the playlists let the jukebox show its empty state while a
 * folder was plainly being read, so a folder row counts until it is **finished** —
 * `ready` and no reconnect walking it. A locked or failed row is an answer, not a
 * wait, and does not keep the library loading.
 */
export function libraryLoading(
  entries: readonly Pick<Entry, "status">[],
  pinned: readonly Pick<PinnedRow, "status">[],
  folders: readonly FolderRow[],
): boolean {
  return (
    entries.some((entry) => entry.status === "loading") ||
    pinned.some((row) => row.status === "loading") ||
    folders.some((folder) => folder.status !== "ready" || folder.busy === true)
  );
}

/**
 * Add restored folders beside whatever was added while the restore was running.
 *
 * A folder picked or imported during the restore is already in `current`, and that
 * row is **newer** than the record the restore read, so the current one wins. A
 * restored folder nobody has a row for is appended.
 */
export function mergeFolderSources(
  current: readonly FolderSource[],
  restored: readonly RestoredFolder[],
): FolderSource[] {
  const present = new Set(current.map((entry) => entry.row.id));
  const missing = restored
    .filter((folder) => !present.has(folder.id))
    .map((folder) => ({
      row: {
        id: folder.id,
        name: folder.name,
        count: folder.songs.length,
        status: "ready" as const,
        locked: folder.access !== "granted",
        imported: folder.imported,
      },
      songs: folder.songs,
    }));
  return [...current, ...missing];
}

/**
 * Take one folder's row out, and leave every other row alone.
 *
 * A picker that was closed or failed may only remove the placeholder **it** opened:
 * a filter on `status === "scanning"` would also take out a scan that is still
 * running, which is a folder that then never reappears this session.
 */
export function withoutFolder<T extends { row: { id: string } }>(
  current: readonly T[],
  id: string,
): T[] {
  return current.filter((entry) => entry.row.id !== id);
}

export interface Entry {
  url: string;
  status: PlaylistRow["status"];
  at: number | null;
  read: PlaylistRead | null;
  error: string | null;
  /** Asked for by hand: read it again rather than showing the copy we have. */
  fresh: boolean;
  /**
   * Which read this row is waiting for.
   *
   * A read is a question asked at a moment: Refresh, a re-enable and a removal
   * followed by an add all ask it again while the previous answer may still be on
   * its way. The generation names that moment, and it is **never reused** — one
   * counter for the life of the page — so an answer can only settle into the row
   * that is still waiting for exactly it. A stale answer is dropped rather than
   * painted over the newer row.
   */
  generation: number;
}

/**
 * Read generations, handed out one at a time for the life of the page.
 *
 * The counter is deliberately **outside** the hook and never reset: a URL removed
 * and added again must be given a number the removed row's read can never match,
 * and a component that mounts again must not start reusing numbers it has already
 * spent. The helpers below stay pure — a generation is passed to them, never
 * invented inside them.
 */
let issuedGenerations = 0;
export function nextGeneration(): number {
  issuedGenerations += 1;
  return issuedGenerations;
}

/** A row that has never been read, waiting for the read `generation` names. */
export function loadingEntry(url: string, generation: number, fresh: boolean): Entry {
  return {
    url,
    status: "loading",
    at: null,
    read: null,
    error: null,
    fresh,
    generation,
  };
}

/**
 * The entries this pass should read: still loading, and not already being read.
 *
 * `inFlight` is the URL a read is running for, against the **generation** that
 * asked for it. An effect that settles one entry changes `entries` and runs again,
 * so without this the next playlist would be fetched twice — once by the pass that
 * started it and again by the pass that followed its neighbour's result. Keying it
 * by generation and not by URL alone is what lets a Refresh start a new read while
 * the read it replaces is still running: the old one answers an older generation,
 * and the row is no longer asking it.
 */
export function pendingReads(
  entries: readonly Entry[],
  inFlight: ReadonlyMap<string, number>,
): Entry[] {
  return entries.filter(
    (entry) => entry.status === "loading" && inFlight.get(entry.url) !== entry.generation,
  );
}

/**
 * May this row take the answer a read was started for?
 *
 * Only the row that asked — still present, still loading, still waiting for that
 * same generation. A playlist removed and added again is a new row with a new
 * generation, and a Refresh moves the generation on; either way the old answer is
 * discarded rather than applied to a row that never asked for it.
 */
export function isCurrentRead(entry: Entry, started: Entry): boolean {
  return (
    entry.url === started.url &&
    entry.generation === started.generation &&
    entry.status === "loading"
  );
}

/**
 * The entries a Refresh marks as loading: the one asked for, or all of them.
 *
 * The new `generation` is stamped on every row the press refreshes — one press is
 * one generation, and a row that is not refreshed keeps its own. A **disabled**
 * playlist is never marked loading. Its songs are deliberately out of the library,
 * so reading it would be work nobody can see — and a specific refresh of one that
 * is off is a no-op rather than an accidental re-enable.
 */
export function refreshEntries(
  entries: readonly Entry[],
  generation: number,
  url?: string,
): Entry[] {
  return entries.map((entry) => {
    if (entry.status === "disabled") return entry;
    if (url !== undefined && entry.url !== url) return entry;
    return { ...entry, status: "loading", fresh: true, generation };
  });
}

/**
 * The seeded URL list, plus anything added while storage was still being read.
 *
 * The seeding effect is asynchronous, and a playlist can be added before it
 * answers. Replacing the list would lose that add, so the stored list comes first
 * and the just-added URL after it. `unique` keeps a URL that is both stored and
 * just added a single row.
 */
export function mergeSources(
  seeded: readonly string[],
  current: readonly string[] | null,
): string[] {
  return unique([...seeded, ...(current ?? [])]);
}

/**
 * The seeded entries, plus anything added while they were being read.
 *
 * An entry that is in both lists is the one added just now: it is newer than the
 * record, and its read is already under way. Anything else is appended so a
 * playlist added during the seeding survives it. A whole entry is kept, never
 * rebuilt — so the generation its read was started for comes with it, and a merge
 * can never make an answer look current again.
 */
export function mergeEntries(
  seeded: readonly Entry[],
  current: readonly Entry[],
): Entry[] {
  const byUrl = new Map(current.map((entry) => [entry.url, entry]));
  const seen = new Set<string>();
  const merged: Entry[] = [];
  for (const entry of seeded) {
    seen.add(entry.url);
    merged.push(byUrl.get(entry.url) ?? entry);
  }
  for (const entry of current) {
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    merged.push(entry);
  }
  return merged;
}

export function useLibrary(defaultUrl: string): Library {
  const [sources, setSources] = useState<string[] | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  /** Kept playlists whose songs are switched off. */
  const [disabled, setDisabled] = useState<string[]>([]);
  /** The seeded playlist, resolved the same way every source in the list is. */
  const builtIn = useMemo(() => absoluteUrl(defaultUrl) ?? defaultUrl, [defaultUrl]);
  // Folders read off this machine, and imports copied into this browser. Both come
  // back on a restore; only a picked folder can come back locked.
  const [folderSources, setFolderSources] = useState<{ row: FolderRow; songs: Song[] }[]>([]);
  /**
   * The songs saved for offline play, as their own record lists them.
   *
   * A downloaded on-demand search result has no source that will list it again —
   * the capability URL answers a query, not a catalogue — so the offline record is
   * the only place its summary lives. It is read here rather than fetched, and the
   * downloader announces a change so a download made on this screen appears
   * without a reload.
   */
  const [offlineSongs, setOfflineSongs] = useState<Song[]>([]);
  /** A picker is open: a second press must not start a second walk. */
  const picking = useRef(false);
  /** The folders a Reconnect is already walking, so one disk is read once. */
  const reconnecting = useRef(new Set<string>());
  /**
   * The read a URL is running for right now, against the generation that asked for
   * it. A Refresh while the first read is still out marks the row loading again
   * with a new generation, and `pendingReads` starts it because the URL is being
   * read for an **older** generation — which is the whole point of the pairing.
   */
  const inFlight = useRef(new Map<string, number>());
  /** The request each in-flight read can be stopped with when it is superseded. */
  const controllers = useRef(new Map<string, AbortController>());
  /** The folder rows as they are now, for a callback that must not act on a stale one. */
  const folderRows = useRef<FolderRow[]>([]);
  /** Storage has answered: only then is there a list to persist. */
  const restored = useRef(false);

  // What this device has saved for offline play, read fresh on mount and whenever
  // the downloader writes the record. It is a source like any other to the merge,
  // but it is last: a playlist or folder that lists the song is the one to keep.
  useEffect(() => {
    const read = () => setOfflineSongs(listOffline().map((entry) => entry.song));
    read();
    return subscribeOffline(read);
  }, []);

  // The URLs this browser has asked for. The first visit seeds the built-in one,
  // and only the first: a player who deletes it has deleted it. It is made
  // **absolute** on the way in, because everything inside a playlist resolves
  // against its own URL and a relative one has nothing to resolve against. A
  // browser from before the published library still has the old local empty index
  // in storage; that row is moved onto the published library here.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [stored, storedDisabled] = await Promise.all([
        loadSources(),
        loadDisabledSources(),
      ]);
      const origin = window.location.origin;
      const migrate = (url: string) => migrateLegacyDefault(url, origin, builtIn);
      const resolvedStored = stored?.map((url) => absoluteUrl(url) ?? url) ?? null;
      const seededUrls = unique((resolvedStored ?? [builtIn]).map(migrate));
      const resolvedDisabled = storedDisabled.map((url) => absoluteUrl(url) ?? url);
      // Only a source that is still in the list can be disabled.
      const off = unique(
        resolvedDisabled.map(migrate).filter((url) => seededUrls.includes(url)),
      );
      if (!alive) return;
      // The list is **merged**, not replaced: a playlist added while storage was
      // still being read is already on screen, and the seeding must not drop it.
      // Stored first, the just-added URL after — and the same for the entries, so
      // the read that add started is not thrown away either.
      //
      // The **built-in** playlist is the published library, so it is read fresh
      // once per visit: a cached copy would keep listing old songs after the
      // library changes. A player's playlist is still only re-read when they ask.
      restored.current = true;
      // One generation for this seeding, stamped on every row it creates. A row
      // that was already added while storage was being read keeps its own (the
      // merge below keeps the whole entry), so its read is not restarted.
      const seedGeneration = nextGeneration();
      setDisabled((current) => unique([...off, ...current]));
      setSources((current) => mergeSources(seededUrls, current));
      setEntries((current) =>
        mergeEntries(
          seededUrls.map((url) =>
            off.includes(url)
              ? {
                  ...loadingEntry(url, seedGeneration, url === builtIn),
                  status: "disabled",
                }
              : loadingEntry(url, seedGeneration, url === builtIn),
          ),
          current,
        ),
      );
    })();
    return () => {
      alive = false;
    };
  }, [builtIn]);

  // What the player has chosen is written down here, not inside a state updater:
  // an updater has to be pure, and StrictMode invokes it twice. `restored` keeps
  // the first render — where `sources` is still null and `disabled` still empty —
  // from erasing what storage already has. The write after the seeding is an
  // idempotent rewrite of what was just read.
  useEffect(() => {
    if (!restored.current || sources === null) return;
    void saveSources(sources);
  }, [sources]);

  useEffect(() => {
    if (!restored.current) return;
    void saveDisabledSources(disabled);
  }, [disabled]);

  // Whatever is still to be read, read — **once per URL and generation**. A settled
  // entry changes `entries`, which runs this effect again; the reads already in
  // flight are not started a second time, and none of them is cancelled by that
  // change. A row that has been asked for **again** (Refresh, Enable, removed and
  // added back) holds a newer generation, so it is a new read: the older one is
  // aborted where it can be, and its answer is dropped when it lands.
  useEffect(() => {
    for (const entry of pendingReads(entries, inFlight.current)) {
      // A read this one supersedes is asked to stop rather than left to finish into
      // a row nobody is waiting for. `read` also guards against applying it.
      controllers.current.get(entry.url)?.abort();
      const controller = new AbortController();
      inFlight.current.set(entry.url, entry.generation);
      controllers.current.set(entry.url, controller);
      void (async () => {
        const settled = await read(entry, controller.signal);
        // Forget this read only if it is still the one the URL is running. A newer
        // generation may hold the URL by the time an older answer lands, and clearing
        // its marker would start it a second time.
        if (inFlight.current.get(entry.url) === entry.generation) {
          inFlight.current.delete(entry.url);
          controllers.current.delete(entry.url);
        }
        // Only the row that asked takes the answer: one that is gone, switched off,
        // or waiting for a newer generation keeps what it has.
        setEntries((current) =>
          current.map((one) => (isCurrentRead(one, entry) ? settled : one)),
        );
      })();
    }
  }, [entries]);

  const add = useCallback((url: string) => {
    // The dialog says the same rule, and a caller that skips it still cannot put a
    // `javascript:` address into the list: only an absolute http(s) URL is fetched.
    const named = fetchableUrl(url);
    if (!named) return;
    // A generation is issued for the press: a URL removed and added again must not
    // be able to receive the answer to the read the removed row started. Adding one
    // that is already here spends it and changes nothing.
    const readGeneration = nextGeneration();
    // Adding a URL that is already here changes nothing: the row, and any read it
    // has in flight, is the one that is already there.
    setSources((current) => {
      const urls = current ?? [];
      return urls.includes(named) ? urls : [...urls, named];
    });
    setEntries((current) => {
      if (current.some((entry) => entry.url === named)) return current;
      return [...current, loadingEntry(named, readGeneration, true)];
    });
  }, []);

  const remove = useCallback((url: string) => {
    // A row that is gone has nobody waiting for its read: stop the request rather
    // than let a playlist nobody lists finish downloading into nothing.
    controllers.current.get(url)?.abort();
    controllers.current.delete(url);
    inFlight.current.delete(url);
    setSources((current) => (current ?? []).filter((one) => one !== url));
    setEntries((current) => current.filter((entry) => entry.url !== url));
    setDisabled((current) => current.filter((one) => one !== url));
  }, []);

  /**
   * Keep the row, leave its songs out. The built-in playlist is the one this is for:
   * a player can switch the EverythingStar FOSS library off without losing the URL
   * that puts it back.
   */
  const setEnabled = useCallback((url: string, enabled: boolean) => {
    setDisabled((current) =>
      enabled
        ? current.filter((one) => one !== url)
        : current.includes(url)
          ? current
          : [...current, url],
    );
    // Switching a playlist back on is a read asked for afresh, exactly as Refresh is,
    // so the row waits for a new generation — and the read it was waiting for before
    // it was switched off can never land on it.
    if (enabled) {
      const readGeneration = nextGeneration();
      setEntries((current) =>
        current.map((entry) =>
          entry.url === url
            ? {
                ...entry,
                status: "loading",
                read: null,
                fresh: true,
                generation: readGeneration,
              }
            : entry,
        ),
      );
    } else {
      // Staying off is not a read: the row keeps the generation it was asked for, and
      // its songs leave the library.
      setEntries((current) =>
        current.map((entry) =>
          entry.url === url ? { ...entry, status: "disabled" } : entry,
        ),
      );
    }
  }, []);

  const refresh = useCallback((url?: string) => {
    // One press is one generation: every row it refreshes waits for this one.
    const readGeneration = nextGeneration();
    setEntries((current) => refreshEntries(current, readGeneration, url));
  }, []);

  // Reading a folder: it is named as soon as it is chosen, so a big one shows up in
  // the list while it is still being read, and its count climbs as songs are found.
  const addFolder = useCallback(() => {
    // A second press while the picker is open would start a second walk of a disk
    // (or of a folder the player has not chosen yet). One press, one picker.
    if (picking.current) return;
    picking.current = true;
    let openedId: string | null = null;
    void (async () => {
      try {
        const found = await openFolder({
          onOpen: (folder) => {
            openedId = folder.id;
            setFolderSources((current) => [
              ...withoutFolder(current, folder.id),
              {
                row: {
                  ...folder,
                  count: 0,
                  status: "scanning",
                  locked: false,
                  imported: false,
                },
                songs: [],
              },
            ]);
          },
          // Only **this** scan's row moves: another folder may be reading at the same
          // time, and its count is its own.
          onFound: (count) =>
            setFolderSources((current) =>
              current.map((entry) =>
                entry.row.id === openedId ? { ...entry, row: { ...entry.row, count } } : entry,
              ),
            ),
        });
        if (!found) {
          // The picker was closed or the walk failed: drop the placeholder this press
          // opened, rather than every row that happens to be scanning.
          if (openedId !== null) {
            const id = openedId;
            setFolderSources((current) => withoutFolder(current, id));
          }
          return;
        }
        setFolderSources((current) =>
          current.map((entry) =>
            entry.row.id === found.id
              ? { row: { id: found.id, name: found.name, count: found.songs.length, status: "ready", locked: false, imported: false }, songs: found.songs }
              : entry,
          ),
        );
      } catch {
        if (openedId !== null) {
          const id = openedId;
          setFolderSources((current) => withoutFolder(current, id));
        }
      } finally {
        picking.current = false;
      }
    })();
  }, []);

  // Importing: the row appears as soon as the batch is validated and says how far
  // the copy and then the scan have got, exactly as a picked folder's row does.
  const importFiles = useCallback(
    async (files: FileList | readonly File[]): Promise<ImportProblem | null> => {
      let importedId: string | null = null;
      // The placeholder this import opened is removed however the copy ends, so a
      // throw cannot leave a row saying "copying" for the rest of the visit. It is
      // only ever **this** row: another folder's scan is not ours to drop.
      const forgetPlaceholder = () => {
        if (importedId === null) return;
        const failed = importedId;
        setFolderSources((current) => withoutFolder(current, failed));
      };
      let outcome: ImportOutcome;
      try {
        outcome = await importLocalFiles(files, {
          onOpen: (folder) => {
            importedId = folder.id;
            setFolderSources((current) => [
              ...current.filter((entry) => entry.row.id !== folder.id),
              {
                row: {
                  id: folder.id,
                  name: folder.name,
                  count: 0,
                  status: "copying",
                  locked: false,
                  copied: 0,
                  total: folder.files,
                  imported: true,
                },
                songs: [],
              },
            ]);
          },
          onCopy: (copied, total) =>
            setFolderSources((current) =>
              current.map((entry) =>
                entry.row.id === importedId
                  ? {
                      ...entry,
                      row: {
                        ...entry.row,
                        status: copied >= total ? "scanning" : "copying",
                        copied,
                        total,
                      },
                    }
                  : entry,
              ),
            ),
          onFound: (count) =>
            setFolderSources((current) =>
              current.map((entry) =>
                entry.row.id === importedId
                  ? { ...entry, row: { ...entry.row, count, status: "scanning" } }
                  : entry,
              ),
            ),
        });
      } catch {
        // A copy that throws is a failed import like any other: the placeholder
        // goes, and the caller gets the ordinary failure word to say.
        forgetPlaceholder();
        return "failed";
      }
      if (!outcome.ok) {
        forgetPlaceholder();
        return outcome.problem;
      }
      // The new generation is whole, so the row it replaced can go. The old copy
      // stayed on disk and on screen for the length of the copy; only now is it
      // safe to forget it, and only an imported row is ever named here.
      const replaced = new Set(outcome.replaced);
      setFolderSources((current) =>
        current
          .filter((entry) => !replaced.has(entry.row.id))
          .map((entry) =>
            entry.row.id === outcome.folder.id
              ? {
                  row: {
                    ...entry.row,
                    count: outcome.folder.songs.length,
                    status: "ready",
                    locked: false,
                    imported: true,
                  },
                  songs: outcome.folder.songs,
                }
              : entry,
          ),
      );
      return null;
    },
    [],
  );

  // The rows a callback may need to judge: state is not readable from a callback
  // without making it a dependency, and a folder's status changes while it copies.
  useEffect(() => {
    folderRows.current = folderSources.map((entry) => entry.row);
  }, [folderSources]);

  const removeFolder = useCallback((id: string) => {
    // Defence in depth: the dialog does not offer this while a folder is copying or
    // being read, and a caller that asks anyway is refused rather than deleting the
    // bytes under the writer. A folder nobody has a row for is left to `closeFolder`
    // to forget quietly, as it always was.
    const row = folderRows.current.find((one) => one.id === id);
    if (row && !canForget(row)) return;
    closeFolder(id);
    setFolderSources((current) => current.filter((entry) => entry.row.id !== id));
  }, []);

  // A reload takes a folder's permission away, so a folder remembered from the last
  // visit comes back **locked**: its songs are still listed (they are plain data) and
  // its charts can be read again the moment somebody presses Reconnect.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const restored = await restoreFolders();
      if (!alive || restored.length === 0) return;
      // Merge rather than replace: a folder picked or imported while the restore was
      // still reading is already on screen, and its row is newer than this record.
      setFolderSources((current) => mergeFolderSources(current, restored));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const reconnectFolder = useCallback((id: string) => {
    // One walk per folder: a second press while the disk is being read would start
    // a second full scan of the same folder and race the first one's answer.
    if (reconnecting.current.has(id)) return;
    reconnecting.current.add(id);
    const update = (change: (row: FolderRow) => FolderRow) =>
      setFolderSources((current) =>
        current.map((entry) =>
          entry.row.id === id ? { ...entry, row: change(entry.row) } : entry,
        ),
      );
    update((row) => ({ ...row, busy: true, error: null }));
    void (async () => {
      try {
        if (!(await requestFolderAccess(id))) {
          // A refusal is not silence: the row stays locked and says why, so the
          // player knows the press was heard and can ask again.
          update((row) => ({ ...row, busy: false, locked: true, error: "permission" }));
          return;
        }
        // Reconnect is the player saying "read this folder again", so it **rescans**,
        // not merely re-lists: a folder remembered by an older scanner may have songs
        // whose summaries say "no voice", and a folder whose chart was the wrong `.txt`
        // still reads a license. One full read is what makes the press mean something.
        const songs = await rescanFolder(id);
        setFolderSources((current) =>
          current.map((entry) =>
            entry.row.id === id
              ? {
                  ...entry,
                  songs,
                  row: {
                    ...entry.row,
                    locked: false,
                    count: songs.length,
                    status: "ready",
                    busy: false,
                    error: null,
                  },
                }
              : entry,
          ),
        );
      } catch {
        // A rescan that throws must not leave the row saying it is still reading.
        update((row) => ({ ...row, busy: false, error: "failed" }));
      } finally {
        reconnecting.current.delete(id);
      }
    })();
  }, []);

  // The playlists that can be **asked** for a song: read, on, and saying so in
  // their own manifest. A source still being read is not asked — there is nothing
  // yet that says what its query parameter is.
  const onDemandSources = useMemo(() => {
    if (!sources) return [];
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));
    return sources
      .filter((url) => !disabled.includes(url))
      .flatMap((url) => {
        const entry = byUrl.get(url);
        const read = entry?.read;
        if (!read?.onDemand) return [];
        return [{ url, name: read.name, param: read.onDemand.param }];
      });
  }, [sources, entries, disabled]);

  const demand = useOnDemand(onDemandSources);

  // Every playlist's songs, in the order the playlists are, each song once: the
  // library the screen lists and the band offers from. Folders come after them,
  // then songs added from a link, and the songs a search found this session last.
  //
  // What the playlists and folders list is kept apart from the merge: a link's
  // press asks whether the song is already in the library, and a pinned song is
  // not part of the answer (it would match itself).
  const listedSongs = useMemo(() => {
    if (!sources) return [] as Song[];
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));
    return [
      ...sources
        .filter((url) => !disabled.includes(url))
        .flatMap((url) => byUrl.get(url)?.read?.songs ?? []),
      ...folderSources.flatMap((folder) => folder.songs),
    ];
  }, [sources, entries, disabled, folderSources]);

  const pinned = usePinned(listedSongs);

  const merged = useMemo(
    () => mergeSongs([listedSongs, pinned.songs, demand.songs]),
    [listedSongs, pinned.songs, demand.songs],
  );

  // Downloaded songs are the **last** source, and only the ones nothing else
  // already lists: a saved copy must not add a second row for a playlist's song,
  // while an on-demand result with no playlist around it is exactly what this adds.
  const songs = useMemo(
    () => mergeOfflineSongs(merged.songs, offlineSongs),
    [merged.songs, offlineSongs],
  );

  const rows = useMemo(() => {
    if (!sources) return [];
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));
    return sources.map((url) =>
      row(url, byUrl.get(url), Date.now(), url === builtIn, disabled.includes(url)),
    );
  }, [sources, entries, builtIn, disabled]);

  // Putting the built-in playlist back: offered by the dialog when the library is
  // empty, never done on its own — deleting every playlist is a player's choice.
  // It goes through the same URL policy as a pasted one, on its resolved address.
  const addDefault = useCallback(() => add(builtIn), [add, builtIn]);

  return {
    songs,
    playlists: rows,
    folders: folderSources.map((folder) => folder.row),
    duplicates: merged.duplicates,
    loading: libraryLoading(
      entries,
      pinned.rows,
      folderSources.map((folder) => folder.row),
    ),
    add,
    remove,
    setEnabled,
    refresh,
    pinned: pinned.rows,
    pinSong: pinned.pin,
    unpinSong: pinned.unpin,
    refreshPinned: pinned.refresh,
    addFolder,
    importFiles,
    removeFolder,
    reconnectFolder,
    addDefault,
    search: demand.search,
    searchState: demand.state,
  };
}

function row(
  url: string,
  entry: Entry | undefined,
  now: number,
  builtIn: boolean,
  disabled: boolean,
): PlaylistRow {
  const at = entry?.at ?? null;
  return {
    url,
    name: entry?.read?.name ?? null,
    count: entry?.read?.songs.length ?? 0,
    fetchedAt: at,
    status: disabled ? "disabled" : (entry?.status ?? "loading"),
    stale: at !== null && isStale({ at }, now),
    error: entry?.error ?? null,
    problems: entry?.read?.problems ?? [],
    builtIn,
    disabled,
    onDemand: entry?.read?.onDemand ?? null,
  };
}

/**
 * Read one playlist: the copy we have, or the network, or both.
 *
 * The entry the answer is built from is the one the read **started** with, so the
 * generation travels with the answer and its caller can tell whether the row is
 * still waiting for it. `signal` is the request's own: a read a newer generation
 * has superseded is stopped here when the browser will stop it, and dropped by the
 * generation guard either way.
 */
async function read(entry: Entry, signal?: AbortSignal): Promise<Entry> {
  // The copy we already had, as an entry — or null when there is none we can read.
  // A first read and a failed refresh both go through this, so the two cannot drift
  // on what a cached playlist is or when it is worth showing.
  const cachedCopy = async (): Promise<Entry | null> => {
    const cached = await readCache(entry.url);
    if (!cached || !looksLikePlaylist(cached.body)) return null;
    return {
      ...entry,
      status: "cached",
      at: cached.at,
      read: readPlaylist(cached.body, entry.url),
      error: null,
    };
  };

  if (!entry.fresh) {
    const copy = await cachedCopy();
    // A read cancelled while its cache was being read is nobody's answer.
    if (signal?.aborted) return entry;
    if (copy) return copy;
  }
  try {
    const body = await fetchJson(entry.url, entry.fresh, signal);
    const parsed = readPlaylist(body, entry.url);
    await writeCache(entry.url, "playlist", body);
    return { ...entry, status: "ready", at: Date.now(), read: parsed, error: null };
  } catch (error) {
    // A read that was superseded is not a failure to report: its row is waiting for
    // a newer answer, and this one has nowhere to land.
    if (signal?.aborted) return entry;
    // A playlist that has gone away is still the list we had.
    const copy = await cachedCopy();
    const reason = errorMessage(error, "could not be read");
    return copy
      ? { ...copy, error: reason }
      : { ...entry, status: "failed", at: null, read: null, error: reason };
  }
}

/**
 * The old built-in playlist was a small generated file at `/playlist/default.json`.
 * A browser that was seeded with it still has that URL in storage; the published
 * library replaces it, so it is not left as a broken second row.
 */
function migrateLegacyDefault(url: string, origin: string, fallback: string): string {
  try {
    const parsed = new URL(url, origin);
    return parsed.origin === origin && parsed.pathname === "/playlist/default.json"
      ? fallback
      : url;
  } catch {
    return url;
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
