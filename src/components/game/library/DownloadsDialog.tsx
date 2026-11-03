import { useState } from "react";
import { useT } from "../../../i18n/react";
import { shortDate } from "../../../lib/game/when";
import { NativeDialog } from "../ui/NativeDialog";
import { SongCover } from "./SongCover";
import {
  formatBytes,
  type OfflineEntry,
  type OfflineQueueState,
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
  /** The song being downloaded, if a single download is the job in flight. */
  busyId: string | null;
  /** The playlist queue in flight, if the job is a whole playlist. */
  queue: OfflineQueueState | null;
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
  queue,
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
      <p className="downloads__lead m-0 text-[0.78rem] leading-[1.45] text-[rgba(250,250,244,0.72)]">
        {t("screen.downloadsLead")}
      </p>

      {entries.length > 0 ? (
        <ul className="downloads__list m-0 mt-[0.6rem] flex max-h-[min(50vh,24rem)] list-none flex-col gap-0 overflow-y-auto p-0">
          {entries.map((entry) => (
            <li
              className="downloads__row grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-[0.6rem] border-b border-dashed border-[rgba(250,250,244,0.16)] py-[0.45rem] [--song-art-size:2.5rem] last:border-b-0 [grid-template-areas:'art_text_actions']"
              key={entry.song.id}
            >
              <SongCover song={entry.song} size="row" />
              <div className="downloads__text min-w-0 [grid-area:text]">
                <p className="downloads__title m-0 overflow-hidden truncate font-display text-[0.95rem] leading-[1.15] text-cream">
                  {entry.song.title}
                </p>
                <p className="downloads__meta m-0 mt-[0.1rem] overflow-hidden truncate font-mono text-[0.57rem] leading-[1.3] text-[rgba(250,250,244,0.55)]">
                  {entry.song.artist.name} · {formatBytes(entry.bytes)} ·{" "}
                  {shortDate(entry.downloadedAt)}
                </p>
              </div>
              <button
                type="button"
                className="band-btn downloads__remove min-h-[2.75rem] whitespace-nowrap px-[0.55rem] py-[0.3rem] text-[0.56rem] [grid-area:actions]"
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
        <p className="downloads__empty my-[1rem] text-[rgba(250,250,244,0.66)]">
          {t("screen.downloadsEmpty")}
        </p>
      )}

      <div className="downloads__footer mt-[0.8rem] flex flex-col items-start gap-[0.4rem]">
        {queue ? (
          <p className="downloads__queue m-0 font-mono text-[0.62rem] text-cream" role="status">
            {t("screen.downloadQueue", {
              done: queue.done,
              total: queue.total,
            })}
          </p>
        ) : null}
        {busyId !== null || queue !== null ? (
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
          <p className="downloads__storage m-0 font-mono text-[0.6rem] text-[rgba(250,250,244,0.62)]">
            {t("screen.downloadsStorage", {
              used: formatBytes(storage.usage),
              quota: formatBytes(storage.quota),
            })}
          </p>
        ) : null}
        {storage && !storage.persisted ? (
          <p className="downloads__note is-warn m-0 text-[0.62rem] leading-[1.35] text-[rgba(250,250,244,0.58)] [&.is-warn]:text-yellow">
            {t("screen.downloadsPersistWarning")}
          </p>
        ) : null}
        <button
          type="button"
          className="band-btn downloads__clear mt-[0.2rem] min-h-[2.75rem] px-[0.7rem] py-[0.35rem] text-[0.58rem] disabled:cursor-not-allowed disabled:opacity-[0.45]"
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
        <dl className="downloads__app m-0 mt-[0.8rem] flex flex-wrap gap-x-[1rem] gap-y-[0.35rem] border-t border-dashed border-[rgba(250,250,244,0.16)] pt-[0.55rem] font-mono text-[0.55rem] text-[rgba(250,250,244,0.5)] [&_dt]:font-bold [&_dt]:uppercase [&_dt]:tracking-[0.08em] [&_dt]:text-[rgba(250,250,244,0.4)] [&_dd]:m-0 [&_dd]:text-[rgba(250,250,244,0.7)] [&>div]:flex [&>div]:gap-[0.3rem]">
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
