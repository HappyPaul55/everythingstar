import { useEffect, useRef } from "react";
import { useT } from "../../../i18n/react";
import { useClock } from "./StageClock";

/**
 * How far through the song we are: a bar right across the top of the stage.
 *
 * It is deliberately the one thing that ignores the stage's gutter — the gutter
 * keeps *play areas* clear of the edge, and this belongs on it — so it spans the
 * full width and sits over the gutter rather than inside it.
 *
 * It is written straight to the DOM on a frame, like the highways: a moving bar
 * must not cost a re-render. It is a read-out, not a control: seeking belongs to
 * the transport (a dev tool) and to the pause menu, which comes later.
 */
export function SongProgress() {
  const t = useT();
  const clock = useClock();
  const bar = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const apply = () => {
      const share =
        clock.durationMs > 0 ? clock.timeRef.current / clock.durationMs : 0;
      const percent = Math.max(0, Math.min(100, share * 100));
      if (fill.current) fill.current.style.width = `${percent}%`;
      if (bar.current) {
        bar.current.setAttribute("aria-valuenow", String(Math.round(percent)));
      }
    };
    apply();
    return clock.subscribe(apply);
  }, [clock]);

  return (
    <div
      className="song-progress"
      ref={bar}
      role="progressbar"
      aria-label={t("band.progress")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
    >
      <span className="song-progress__fill" ref={fill} />
    </div>
  );
}
