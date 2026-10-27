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
    <div className="jukebox__offline" data-downloaded={entry ? "true" : "false"}>
      {entry ? (
        <p className="jukebox__offline-state">
          <span aria-hidden="true">✓</span> {t("screen.downloaded")}
        </p>
      ) : busy ? (
        <div className="jukebox__offline-progress">
          <p className="jukebox__offline-state" role="status">
            {t("screen.downloading", { done, total })}
          </p>
          <div
            className="jukebox__offline-bar"
            role="progressbar"
            aria-label={t("screen.downloading", { done, total })}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={Math.min(done, total)}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : allowed.ok ? (
        <button
          type="button"
          className="band-btn jukebox__offline-btn"
          data-sound="select"
          onClick={onDownload}
        >
          <span aria-hidden="true">↓</span> {t("screen.download")}
        </button>
      ) : (
        <p className="jukebox__offline-note">{t(failureKey(allowed.reason))}</p>
      )}

      {error && !entry ? (
        <p className="jukebox__offline-note is-warn" role="status">
          {t(failureKey(error))}{" "}
          {allowed.ok && error !== "youtube" && error !== "local" ? (
            <button
              type="button"
              className="jukebox__offline-retry"
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
