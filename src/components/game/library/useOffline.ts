/**
 * The jukebox's view of offline downloads.
 *
 * The **job** is not this hook's: it lives in `downloads.ts` so a download keeps
 * running when the player walks from the jukebox to the band and the screen that
 * started it unmounts. This hook is a reader of that one job and of the record it
 * writes, which is what lets a screen that mounts mid-download see it already in
 * progress rather than start a second one.
 *
 * One song and a whole playlist share the same slot, so the view is one shape: a
 * single song's `progress` or a queue's `done of total`, whichever is running.
 *
 * A change to the record is announced too, so the **library** — which merges
 * songs from sources it did not write — can list a song the downloader saved.
 */

import { useCallback, useEffect, useState } from "react";
import type { Song } from "../../../lib/game/song";
import {
  cancelDownload,
  clearDownloads,
  downloadState,
  listOffline,
  offlineStorage,
  offlineSupported,
  removeDownload,
  startDownload,
  startPlaylistDownload,
  subscribeDownloads,
  subscribeOffline,
  type OfflineEntry,
  type OfflineFailureInfo,
  type OfflineJobState,
  type OfflineProgress,
  type OfflineQueueState,
  type OfflineStorageInfo,
} from "./downloads";

export type OfflineErrorInfo = OfflineFailureInfo;

export interface OfflineController {
  /** The active worker can serve a downloaded song. */
  supported: boolean;
  entries: OfflineEntry[];
  storage: OfflineStorageInfo | null;
  /** A download, removal or clear is running. */
  busy: boolean;
  /** The song currently being saved, if any. */
  busyId: string | null;
  progress: OfflineProgress | null;
  /** A whole playlist being saved, or null when no queue is running. */
  queue: OfflineQueueState | null;
  /** The last failure, tied to the song it belonged to. */
  error: OfflineErrorInfo | null;
  download: (song: Song) => void;
  /**
   * Save a playlist, song after song, in the same page-wide job slot.
   *
   * The dialog filters the library to one playlist's songs and passes the row's
   * URL, so a running queue can say which row it belongs to.
   */
  downloadPlaylist: (songs: readonly Song[], source: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  /** Stop the download in flight; the jukebox's Cancel button. */
  cancel: () => void;
}

export function useOffline(): OfflineController {
  const [supported, setSupported] = useState(offlineSupported);
  const [entries, setEntries] = useState<OfflineEntry[]>([]);
  const [storage, setStorage] = useState<OfflineStorageInfo | null>(null);
  const [job, setJob] = useState<OfflineJobState>(downloadState);

  const refresh = useCallback(() => {
    setEntries(listOffline());
    void offlineStorage().then(setStorage);
  }, []);

  useEffect(() => {
    setSupported(offlineSupported());
    refresh();

    // The boot claims the page after the worker activates. The jukebox can be
    // mounted before that on a very fast first paint; this makes the action
    // appear when it becomes true rather than requiring a reload.
    const changed = () => setSupported(offlineSupported());
    navigator.serviceWorker?.addEventListener("controllerchange", changed);
    return () => {
      navigator.serviceWorker?.removeEventListener("controllerchange", changed);
    };
  }, [refresh]);

  // A hook that mounts while a download is already running asks the coordinator
  // for the current job, then follows it. Both events are subscribed: the job for
  // progress and the finish, the record for a write this screen did not start.
  useEffect(() => {
    setJob(downloadState());
    const unsubscribeJob = subscribeDownloads(() => setJob(downloadState()));
    const unsubscribeRecord = subscribeOffline(() => {
      refresh();
      setJob(downloadState());
    });
    return () => {
      unsubscribeJob();
      unsubscribeRecord();
    };
  }, [refresh]);

  const download = useCallback((song: Song) => {
    startDownload(song);
  }, []);

  const downloadPlaylist = useCallback((songs: readonly Song[], source: string) => {
    startPlaylistDownload(songs, source);
  }, []);

  const remove = useCallback((id: string) => {
    removeDownload(id);
  }, []);

  const clear = useCallback(() => {
    clearDownloads();
  }, []);

  const cancel = useCallback(() => {
    cancelDownload();
  }, []);

  return {
    supported,
    entries,
    storage,
    busy: job.busy,
    busyId: job.busyId,
    progress: job.progress,
    queue: job.queue,
    error: job.error,
    download,
    downloadPlaylist,
    remove,
    clear,
    cancel,
  };
}
