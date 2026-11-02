import { useT } from "../../../i18n/react";
import { useClock } from "./StageClock";

/**
 * The stage's quiet admission that the sound is gone.
 *
 * A run whose every stem failed, or whose video was refused, is not over: the
 * clock has fallen back to the frame loop, the notes still come and the score
 * still counts. Saying so is the difference between a silent run and a broken
 * one. It is a `status`, so a screen reader hears it once rather than every
 * frame — the text only changes when the answer does.
 */
export function StageNotice() {
  const t = useT();
  const clock = useClock();
  if (!clock.sourceLost) return null;

  return (
    <p
      className="stage-notice pointer-events-none absolute top-[calc(0.7rem_+_env(safe-area-inset-top,0px))] left-1/2 z-[4] m-0 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-inner border border-[rgba(250,250,244,0.24)] bg-[rgba(12,13,10,0.86)] px-[0.7rem] py-[0.4rem] text-center font-mono text-[0.62rem] font-bold uppercase leading-[1.35] tracking-[0.08em] text-cream"
      role="status"
    >
      {t("stage.noSound")}
    </p>
  );
}
