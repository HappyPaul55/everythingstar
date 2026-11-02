import type { MessageKey } from "../../../i18n";
import { useT } from "../../../i18n/react";
import type { Song } from "../../../lib/game/song";
import {
  canDownload,
  type OfflineEntry,
  type OfflineFailure,
  type OfflineProgress,
} from "./downloads";

/**
 * The now-playing slot's download control.
 *
 * It is deliberately one compact line: the jukebox already asks for a song and
 * then a band, and this is an optional third thing to do with the song on the
 * front. A downloaded song says so instead of offering the action again; the
 * Downloads dialog is where it can be removed.
 */
interface Props {
  song: Song;
  entry: OfflineEntry | null;
  busy: boolean;
  progress: OfflineProgress | null;
  /** A failure that belongs to this song, if the last one was its own. */
  error: OfflineFailure | null;
  onDownload: () => void;
}

/** The sentence for a refusal the player can see. */
function failureKey(reason: OfflineFailure): MessageKey {
  switch (reason) {
    case "local":
      return "screen.downloadLocal";
    case "youtube":
      return "screen.downloadYouTube";
    case "quota":
      return "screen.downloadQuota";
    case "unsupported":
      return "screen.downloadUnsupported";
    case "cancelled":
    case "failed":
      return "screen.downloadFailed";
  }
}

export function DownloadAction({
  song,
  entry,
  busy,
  progress,
  error,
  onDownload,
}: Props) {
  const t = useT();
  const allowed = canDownload(song);
  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div
      className="jukebox__offline flex flex-wrap items-center gap-x-[0.6rem] gap-y-[0.35rem]"
      data-downloaded={entry ? "true" : "false"}
    >
      {entry ? (
        <p className="jukebox__offline-state m-0 font-mono text-[0.6rem] font-bold uppercase tracking-[0.08em] text-yellow">
          <span className="mr-[0.15rem]" aria-hidden="true">
            ✓
          </span>{" "}
          {t("screen.downloaded")}
        </p>
      ) : busy ? (
        <div className="jukebox__offline-progress flex min-w-[8rem] flex-[1_1_8rem] flex-col gap-[0.25rem]">
          <p
            className="jukebox__offline-state m-0 font-mono text-[0.6rem] font-bold uppercase tracking-[0.08em] text-yellow"
            role="status"
          >
            {t("screen.downloading", { done, total })}
          </p>
          <div
            className="jukebox__offline-bar h-[0.3rem] overflow-hidden rounded-pill bg-[rgba(250,250,244,0.18)]"
            role="progressbar"
            aria-label={t("screen.downloading", { done, total })}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={Math.min(done, total)}
          >
            <span
              className="block h-full bg-yellow transition-[width] duration-[0.2s] ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      ) : allowed.ok ? (
        <button
          type="button"
          className="band-btn jukebox__offline-btn min-h-[2.75rem] px-[0.65rem] py-[0.35rem] text-[0.6rem] tracking-[0.06em]"
          data-sound="select"
          onClick={onDownload}
        >
          <span className="text-yellow" aria-hidden="true">
            ↓
          </span>{" "}
          {t("screen.download")}
        </button>
      ) : (
        <p className="jukebox__offline-note m-0 text-[0.62rem] leading-[1.35] text-[rgba(250,250,244,0.58)]">
          {t(failureKey(allowed.reason))}
        </p>
      )}

      {error && !entry ? (
        <p
          className="jukebox__offline-note m-0 text-[0.62rem] leading-[1.35] text-[rgba(250,250,244,0.58)] [&.is-warn]:text-yellow"
          role="status"
        >
          {t(failureKey(error))}{" "}
          {allowed.ok && error !== "youtube" && error !== "local" ? (
            <button
              type="button"
              className="jukebox__offline-retry cursor-[var(--cursor-hand),pointer] border-0 bg-none p-0 font-[inherit] text-yellow underline"
              onClick={onDownload}
            >
              {t("screen.downloadRetry")}
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
