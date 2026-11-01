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
    <p className="stage-notice" role="status">
      {t("stage.noSound")}
    </p>
  );
}
