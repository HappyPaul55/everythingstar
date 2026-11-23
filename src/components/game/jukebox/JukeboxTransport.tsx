import { useT } from "../../../i18n/react";
import { formatClock, useClock, useClockMs } from "../band/StageClock";

/**
 * The Jukebox's play/pause, next and progress.
 *
 * The transport is a small component of its own so the clock's four-a-second
 * read-out does not re-render the record and the words beside it. The play
 * button is the screen's starting control; the record follows `clock.playing`
 * from the screen, not from this read-out.
 */
interface Props {
  durationMs: number;
  /** The current song's document and sound can be played. */
  ready: boolean;
  onNext: () => void;
}

export function JukeboxTransport({ durationMs, ready, onNext }: Props) {
  const t = useT();
  const clock = useClock();
  const timeMs = useClockMs(250);
  const progress = durationMs > 0 ? Math.min(1, timeMs / durationMs) : 0;

  return (
    <div className="jukebox__transport">
      <button
        type="button"
        className="jukebox__control jukebox__control--play"
        data-nav-default="true"
        data-sound={ready ? "select" : "refuse"}
        aria-disabled={!ready}
        aria-label={
          ready
            ? clock.playing
              ? t("screen.pause")
              : t("screen.play")
            : t("screen.jukeboxLoading")
        }
        onClick={() => {
          if (ready) clock.toggle();
        }}
      >
        <span aria-hidden="true">{clock.playing ? "❚❚" : "▶"}</span>
      </button>
      <button
        type="button"
        className="jukebox__control"
        data-sound="select"
        aria-label={t("screen.nextShort")}
        onClick={onNext}
      >
        <span aria-hidden="true">⏭</span>
      </button>
      <div className="jukebox__timeline">
        <div
          className="jukebox__progress"
          role="progressbar"
          aria-label={t("screen.jukeboxProgress")}
          aria-valuemin={0}
          aria-valuemax={durationMs}
          aria-valuenow={Math.round(timeMs)}
        >
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="jukebox__time">
          {formatClock(timeMs)} <span aria-hidden="true">/</span>{" "}
          {formatClock(durationMs)}
        </p>
      </div>
    </div>
  );
}
