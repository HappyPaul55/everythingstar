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
    // On the gutter and under the safe area rather than in it: in fullscreen the
    // top of the screen is the status bar or the notch, and a progress bar there
    // is a bar nobody sees.
    <div
      className="song-progress pointer-events-none absolute inset-x-0 top-[env(safe-area-inset-top,0px)] z-[2] h-[5px] bg-[rgba(250,250,244,0.16)]"
      ref={bar}
      role="progressbar"
      aria-label={t("band.progress")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
    >
      <span
        className="song-progress__fill block h-full w-full origin-left [transform:scaleX(0)] bg-yellow [box-shadow:0_0_12px_rgba(255,212,0,0.45)] will-change-transform"
        ref={fill}
      />
    </div>
  );
}
