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
    let lastShown = -1;
    const apply = () => {
      const share =
        clock.durationMs > 0 ? clock.timeRef.current / clock.durationMs : 0;
      const percent = Math.max(0, Math.min(100, share * 100));
      // A transform, not a width: the bar is a compositor job and never makes the
      // layout of the stage above it recalculate.
      if (fill.current) {
        fill.current.style.transform = `scaleX(${Math.max(0, Math.min(1, share))})`;
      }
      // The fill moves every frame; the accessible value does not need to. Writing
      // it at 60 Hz is churn in the accessibility tree for a number nobody can read
      // at that rate, so it follows the rounded percent.
      const shown = Math.round(percent);
      if (bar.current && shown !== lastShown) {
        lastShown = shown;
        bar.current.setAttribute("aria-valuenow", String(shown));
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
