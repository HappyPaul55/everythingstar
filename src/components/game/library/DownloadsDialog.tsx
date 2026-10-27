import { useState } from "react";
import { useT } from "../../../i18n/react";
import { shortDate } from "../../../lib/game/when";
import { NativeDialog } from "../ui/NativeDialog";
import { SongCover } from "./SongCover";
import {
  formatBytes,
  type OfflineEntry,
  type OfflineStorageInfo,
} from "./downloads";

/**
 * The Downloads manager: what is saved, how much room it takes, and the way to
 * let it go.
 *
 * The dialog is reached from the jukebox toolbar. It is deliberately about the
 * device's downloads rather than the current song — the now-playing slot has
 * its own Download button — so opening it never changes what is selected.
 *
 * The app footer carries the app, game and WebView versions when the native
 * shell injected them. On the public website those meta tags are absent and the
 * section simply does not render.
 */
interface Props {
  entries: OfflineEntry[];
  storage: OfflineStorageInfo | null;
  /** A download, removal or clear is running; the others wait for it. */
  busy: boolean;
  /** The song being downloaded, if a download is the job in flight. */
  busyId: string | null;
  onRemove: (id: string) => void;
  onClear: () => void;
  onCancel: () => void;
  onClose: () => void;
}

function meta(name: string): string | null {
  return (
    document
      .querySelector(`meta[name="${name}"]`)
      ?.getAttribute("content") ?? null
  );
}

export function DownloadsDialog({
  entries,
  storage,
  busy,
  busyId,
  onRemove,
  onClear,
  onCancel,
  onClose,
}: Props) {
  const t = useT();
  const [confirmClear, setConfirmClear] = useState(false);
  const appVersion = meta("everythingstar-app-version");
  const gameCommit = meta("everythingstar-game-commit");
  const webView = /Chrome\/([\d.]+)/.exec(navigator.userAgent)?.[1] ?? null;

  return (
    <NativeDialog
      title={t("screen.downloads")}
      panelClassName="config__panel--wide"
      onClose={onClose}
    >
      <p className="downloads__lead">{t("screen.downloadsLead")}</p>

      {entries.length > 0 ? (
        <ul className="downloads__list">
          {entries.map((entry) => (
            <li className="downloads__row" key={entry.song.id}>
              <SongCover song={entry.song} size="row" />
              <div className="downloads__text">
                <p className="downloads__title">{entry.song.title}</p>
                <p className="downloads__meta">
                  {entry.song.artist.name} · {formatBytes(entry.bytes)} ·{" "}
                  {shortDate(entry.downloadedAt)}
                </p>
              </div>
              <button
                type="button"
                className="band-btn downloads__remove"
                data-sound="back"
                disabled={busy}
                onClick={() => onRemove(entry.song.id)}
              >
                {t("screen.downloadRemove")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="downloads__empty">{t("screen.downloadsEmpty")}</p>
      )}

      <div className="downloads__footer">
        {busyId !== null ? (
          <button
            type="button"
            className="band-btn downloads__cancel"
            data-sound="back"
            onClick={onCancel}
          >
            {t("screen.downloadCancel")}
          </button>
        ) : null}
        {storage ? (
          <p className="downloads__storage">
            {t("screen.downloadsStorage", {
              used: formatBytes(storage.usage),
              quota: formatBytes(storage.quota),
            })}
          </p>
        ) : null}
        {storage && !storage.persisted ? (
          <p className="downloads__note is-warn">
            {t("screen.downloadsPersistWarning")}
          </p>
        ) : null}
        <button
          type="button"
          className="band-btn downloads__clear"
          data-sound="back"
          disabled={busy || entries.length === 0}
          onClick={() => {
            if (!confirmClear) {
              setConfirmClear(true);
              return;
            }
            setConfirmClear(false);
            onClear();
          }}
        >
          {confirmClear
            ? t("screen.downloadClearConfirm")
            : t("screen.downloadClearAll")}
        </button>
      </div>

      {appVersion ? (
        <dl className="downloads__app">
          <div>
            <dt>{t("screen.downloadApp")}</dt>
            <dd>{appVersion}</dd>
          </div>
          {gameCommit ? (
            <div>
              <dt>{t("screen.downloadGame")}</dt>
              <dd>{gameCommit.slice(0, 7)}</dd>
            </div>
          ) : null}
          {webView ? (
            <div>
              <dt>{t("screen.downloadWebView")}</dt>
              <dd>{webView}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </NativeDialog>
  );
}
