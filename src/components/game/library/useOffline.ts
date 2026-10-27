/**
 * The jukebox's view of offline downloads.
 *
 * The **job** is not this hook's: it lives in `downloads.ts` so a download keeps
 * running when the player walks from the jukebox to the band and the screen that
 * started it unmounts. This hook is a reader of that one job and of the record it
 * writes, which is what lets a screen that mounts mid-download see it already in
 * progress rather than start a second one.
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
  subscribeDownloads,
  subscribeOffline,
  type OfflineEntry,
  type OfflineFailureInfo,
  type OfflineJobState,
  type OfflineProgress,
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
  /** The last failure, tied to the song it belonged to. */
  error: OfflineErrorInfo | null;
  download: (song: Song) => void;
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
    error: job.error,
    download,
    remove,
    clear,
    cancel,
  };
}
