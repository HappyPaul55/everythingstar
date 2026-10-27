import { useCallback, useMemo, useRef, useState } from "react";
import { isPlaylistBody, mergeSongs, readPlaylist, searchUrl } from "../../../lib/game/playlist";
import type { Song } from "../../../lib/game/song";
import { searchError } from "./errors";
import { fetchJson } from "./store";

/**
 * The **on-demand** side of the library: playlists that are asked for a song.
 *
 * A source is a URL that normally lists nothing and answers a query instead. This
 * hook owns the asking — one request per source per query, the accumulated songs of
 * this session, and the state a screen needs to say what is happening — while
 * `useLibrary` still owns the merge, so a searched song is a song like any other.
 *
 * Results are **session state**, not library state: they are held in memory, never
 * written to the playlist cache, and they accumulate as the player searches so the
 * song they picked cannot vanish when they edit the field. A reload starts from the
 * capability again, which is what "no entries by default" means.
 */
export interface OnDemandSource {
  url: string;
  name: string | null;
  /** The query-string parameter this source reads. */
  param: string;
}

export interface OnDemandFailure {
  url: string;
  name: string | null;
  error: string;
}

export interface OnDemandState {
  /** The query the runs and `found` describe. */
  query: string;
  searching: boolean;
  /** Songs these sources returned for this query, shown even if their own text does not match. */
  found: ReadonlySet<string>;
  failures: OnDemandFailure[];
}

export interface OnDemand {
  /** Everything found this session, from the sources that are still on. */
  songs: Song[];
  state: OnDemandState;
  /**
   * Ask every on for a query. A query already answered for a source is not asked
   * again unless `force`; a request that is still in flight is never doubled.
   */
  search: (query: string, force?: boolean) => void;
}

/** A single character asks a metered API for too much and answers too little. */
export const SEARCH_MIN_CHARS = 2;
/** How long the field waits after the last keystroke before the sources are asked. */
export const SEARCH_DEBOUNCE_MS = 400;
/** A resolver may be generating a chart, so this is a long wait rather than a short one. */
const SEARCH_TIMEOUT_MS = 30_000;

type RunStatus = "searching" | "ready" | "failed";

interface Run {
  query: string;
  status: RunStatus;
  error: string | null;
}

const NO_IDS: ReadonlySet<string> = new Set();

/**
 * A record keyed by something a player typed — a query, a source URL.
 *
 * These three helpers are the only way in and out of one, because a plain `{}`
 * inherits `Object.prototype`: `byQuery["constructor"]` would answer with a
 * function and `new Set(...)` over it would throw while the screen rendered. The
 * record has **no prototype**, every write rebuilds it that way, and every read
 * asks for an own property — so a query like `toString` or `__proto__` is a key
 * and nothing else.
 */
export function blankRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

/** One key of a record the game wrote, never a member of `Object.prototype`. */
export function readRecord<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** The record with one key set, still without a prototype. */
export function writeRecord<T>(
  record: Record<string, T>,
  key: string,
  value: T,
): Record<string, T> {
  const next = blankRecord<T>();
  Object.assign(next, record);
  next[key] = value;
  return next;
}

export function useOnDemand(sources: readonly OnDemandSource[]): OnDemand {
  /** The songs found per source, for this session. */
  const [found, setFound] = useState<Record<string, Song[]>>(() => blankRecord());
  /** The latest run for each source **and query**, so a late answer cannot hide a live one. */
  const [runs, setRuns] = useState<Record<string, Run>>(() => blankRecord());
  /** The ids each query returned, which is what survives a local text filter. */
  const [byQuery, setByQuery] = useState<Record<string, string[]>>(() => blankRecord());
  /** The query the state describes: the one somebody last asked for. */
  const [askedQuery, setAskedQuery] = useState("");
  /** Queries a source has answered, or is answering. */
  const asked = useRef(new Set<string>());
  /** Queries a source is answering right now, so a force cannot double one. */
  const inFlight = useRef(new Set<string>());

  const run = useCallback(async (source: OnDemandSource, query: string, key: string) => {
    const url = searchUrl(source.url, query, source.param);
    if (!url) {
      asked.current.delete(key);
      inFlight.current.delete(key);
      setRuns((current) =>
        writeRecord(current, key, { query, status: "failed", error: "not a URL" }),
      );
      return;
    }

    setRuns((current) =>
      writeRecord(current, key, { query, status: "searching", error: null }),
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    try {
      const body = await fetchJson(url, true, controller.signal);
      if (!isPlaylistBody(body)) {
        // A document this reader cannot understand is a failed search, not an
        // empty one: "nothing matched" would be a lie about the source.
        throw new Error(readPlaylist(body, url).problems[0] ?? "not a playlist");
      }
      // The answer is read against the query URL — its files live beside the
      // answer — but its songs belong to the playlist that was asked.
      const read = readPlaylist(body, url, source.url);
      setFound((current) => addFound(current, source.url, read.songs));
      setByQuery((current) =>
        writeRecord(
          current,
          query,
          union(readRecord(current, query), read.songs.map((song) => song.id)),
        ),
      );
      setRuns((current) =>
        writeRecord(current, key, { query, status: "ready", error: null }),
      );
    } catch (error) {
      // A failure is not remembered as an answer: returning to the query, or
      // pressing Retry, is allowed to try again.
      asked.current.delete(key);
      setRuns((current) =>
        writeRecord(current, key, { query, status: "failed", error: searchError(error) }),
      );
    } finally {
      clearTimeout(timer);
      inFlight.current.delete(key);
    }
  }, []);

  const search = useCallback(
    (raw: string, force = false) => {
      const query = raw.trim();
      if (query.length < SEARCH_MIN_CHARS || sources.length === 0) return;
      setAskedQuery(query);
      for (const source of sources) {
        const key = runKey(source.url, query);
        if (inFlight.current.has(key)) continue;
        if (!force && asked.current.has(key)) continue;
        asked.current.add(key);
        inFlight.current.add(key);
        void run(source, query, key);
      }
    },
    [sources, run],
  );

  const state = useMemo<OnDemandState>(() => {
    let searching = false;
    const failures: OnDemandFailure[] = [];
    for (const source of sources) {
      const one = readRecord(runs, runKey(source.url, askedQuery));
      if (!one) continue;
      if (one.status === "searching") searching = true;
      if (one.status === "failed") {
        failures.push({ url: source.url, name: source.name, error: one.error ?? "failed" });
      }
    }
    return {
      query: askedQuery,
      searching,
      found: new Set(readRecord(byQuery, askedQuery) ?? NO_IDS),
      failures,
    };
  }, [sources, runs, askedQuery, byQuery]);

  const songs = useMemo(
    () => mergeSongs(sources.map((source) => readRecord(found, source.url) ?? [])).songs,
    [sources, found],
  );

  return { songs, state, search };
}

/** One source's one query, as a key: the source URL and the query do not collide. */
function runKey(url: string, query: string): string {
  return `${url}\n${query}`;
}

/** Add what a source just found, once per id. */
function addFound(
  current: Record<string, Song[]>,
  url: string,
  added: readonly Song[],
): Record<string, Song[]> {
  if (added.length === 0) return current;
  const existing = readRecord(current, url) ?? [];
  const seen = new Set(existing.map((song) => song.id));
  const fresh: Song[] = [];
  for (const song of added) {
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    fresh.push(song);
  }
  if (fresh.length === 0) return current;
  return writeRecord(current, url, [...existing, ...fresh]);
}

/** The ids of a query, before and after another answer. */
function union(before: readonly string[] | undefined, after: readonly string[]): string[] {
  return [...new Set([...(before ?? []), ...after])];
}
