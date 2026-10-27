/**
 * **Songs from links**: one song document added to the library on its own.
 *
 * A playlist is the library's index, and a shared song may have none. A pinned
 * song is therefore a source of its own: its URL is remembered (the same store as
 * the playlists), its document is read through the library cache, and the summary
 * the jukebox draws comes from the document itself (`pinnedSong`).
 *
 * The hook is a reader and a small registry. Nothing here fetches outside
 * `cachedJson`, so the one-fetch-path rule still holds, and a pinned song that was
 * read once is offline-readable from the same cache.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pinnedSong } from "../../../lib/game/pinned";
import type { Song } from "../../../lib/game/song";
import { readSongDoc } from "../../../lib/game/source";
import { fetchableUrl } from "../../../lib/game/url";
import { errorMessage } from "./errors";
import { cachedJson, loadPinnedSongs, savePinnedSongs, writeCache } from "./store";

export interface PinnedRow {
  url: string;
  song: Song | null;
  status: "loading" | "ready" | "error";
  /** Why the document could not be read, when it could not. */
  error: string | null;
}

/** What a link's Add press got. */
export type PinResult =
  | { ok: true; song: Song }
  | { ok: false; problem: "url" | "already" | "read"; detail?: string };

interface Entry {
  song: Song | null;
  status: PinnedRow["status"];
  error: string | null;
}

const LOADING: Entry = { song: null, status: "loading", error: null };

export interface PinnedSongs {
  rows: PinnedRow[];
  songs: Song[];
  /** Read a song document and keep it, unless it is already in the library. */
  pin: (url: string) => Promise<PinResult>;
  unpin: (url: string) => void;
  /** Read one again, because the document changed at its URL. */
  refresh: (url: string) => void;
}

/**
 * `others` is what the playlists and folders already list: pinning one of those
 * songs would put a second copy in the jukebox, so the press says "already"
 * instead. It is read from a ref, because a callback must not capture an old
 * library.
 */
export function usePinned(others: readonly Song[]): PinnedSongs {
  const [urls, setUrls] = useState<string[] | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const urlsRef = useRef<string[]>([]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const othersRef = useRef(others);
  othersRef.current = others;
  /** One read per URL, so a mount and a quick press share the same request. */
  const running = useRef(new Map<string, Promise<Entry>>());

  // The URLs this browser kept from links, read once.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const saved = await loadPinnedSongs();
      if (!alive) return;
      urlsRef.current = saved;
      setUrls(saved);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const read = useCallback((url: string, fresh: boolean): Promise<Entry> => {
    const already = running.current.get(url);
    if (already && !fresh) return already;

    const task = (async (): Promise<Entry> => {
      try {
        const body = await cachedJson(url, "song", fresh);
        if (!body) {
          return { song: null, status: "error", error: "could not be read" };
        }
        const { doc, problems } = readSongDoc(body, url);
        if (!doc) {
          return {
            song: null,
            status: "error",
            error: problems[0] ?? "not a song document",
          };
        }
        const song = pinnedSong(doc, url);
        // The document is cached by its **content**, and this is the one reader that
        // knows what that is: `useSongTrack` and the jukebox's preview ask for it with
        // `song.revision`, so writing the body without it would leave every later read
        // a miss — a pinned song that always refetches, and never plays offline.
        await writeCache(url, "song", body, song.revision);
        return { song, status: "ready", error: null };
      } catch (error) {
        return {
          song: null,
          status: "error",
          error: errorMessage(error, "could not be read"),
        };
      }
    })();

    running.current.set(url, task);
    void task.finally(() => {
      if (running.current.get(url) === task) running.current.delete(url);
    });
    return task;
  }, []);

  // Read whatever a restore brought back, and whatever a pin has just added.
  useEffect(() => {
    if (!urls) return;
    for (const url of urls) {
      const entry = entriesRef.current[url];
      if (entry && entry.status !== "loading") continue;
      if (running.current.has(url)) continue;
      if (!entry) {
        setEntries((current) => ({ ...current, [url]: LOADING }));
      }
      void read(url, false).then((settled) => {
        setEntries((current) => ({ ...current, [url]: settled }));
      });
    }
  }, [urls, read]);

  const pin = useCallback(
    async (raw: string): Promise<PinResult> => {
      const url = fetchableUrl(raw);
      if (!url) return { ok: false, problem: "url" };
      if (urlsRef.current.includes(url)) return { ok: false, problem: "already" };

      const entry = await read(url, true);
      if (!entry.song) {
        return {
          ok: false,
          problem: "read",
          ...(entry.error ? { detail: entry.error } : {}),
        };
      }
      const song = entry.song;

      const listed =
        othersRef.current.some((other) => other.id === song.id || other.doc === url) ||
        urlsRef.current.some(
          (known) => entriesRef.current[known]?.song?.id === song.id,
        );
      if (listed) return { ok: false, problem: "already" };

      const next = [...urlsRef.current, url];
      urlsRef.current = next;
      setUrls(next);
      setEntries((current) => ({ ...current, [url]: entry }));
      void savePinnedSongs(next);
      return { ok: true, song };
    },
    [read],
  );

  const unpin = useCallback((url: string) => {
    const next = urlsRef.current.filter((known) => known !== url);
    urlsRef.current = next;
    setUrls(next);
    setEntries((current) => {
      const copy = { ...current };
      delete copy[url];
      return copy;
    });
    void savePinnedSongs(next);
  }, []);

  const refresh = useCallback(
    (url: string) => {
      setEntries((current) => ({ ...current, [url]: LOADING }));
      void read(url, true).then((settled) => {
        setEntries((current) => ({ ...current, [url]: settled }));
      });
    },
    [read],
  );

  const rows: PinnedRow[] = useMemo(
    () =>
      (urls ?? []).map((url) => {
        const entry = entries[url] ?? LOADING;
        return { url, song: entry.song, status: entry.status, error: entry.error };
      }),
    [urls, entries],
  );
  const songs = useMemo(
    () => rows.flatMap((row) => (row.song ? [row.song] : [])),
    [rows],
  );

  return { rows, songs, pin, unpin, refresh };
}
