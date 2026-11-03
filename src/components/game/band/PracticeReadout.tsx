import { useMemo } from "react";
import { useT } from "../../../i18n/react";
import {
  practiceLabel,
  practiceSections,
  sectionAt,
  type PracticePlan,
} from "../../../lib/game/practice";
import type { Track } from "../../../lib/game/track";

/**
 * A compact read-out for a practice run, under the song progress bar.
 *
 * It says the four things a practice run is: the section the plan starts in, the
 * speed, and whether the pass loops. It is a read-out and not a control — the
 * pause menu is where a plan is chosen or stopped — so it never takes a pointer.
 */
export function PracticeReadout({ plan, track }: { plan: PracticePlan; track: Track }) {
  const t = useT();
  // The stage re-renders on the clock's throttle, so the sections are read once
  // for the song rather than regrouped on every tick.
  const sections = useMemo(() => practiceSections(track), [track]);
  const section = sectionAt(sections, plan.startMs);
  return (
    // Under the progress bar, and under the corner's fullscreen chip: the read-out
    // is a status strip, and the one control that has to stay reachable owns the
    // top-right corner. On a phone the score rail is a compact row at the top, so
    // the read-out goes below it rather than over the score and combo it sits above.
    <p
      className="practice-readout pointer-events-none absolute right-[clamp(0.6rem,2vmin,1.6rem)] top-[calc(3.15rem_+_env(safe-area-inset-top,0px))] z-[3] m-0 flex max-w-[calc(100%_-_2rem)] flex-wrap items-center gap-[0.4rem] rounded-inner border border-[rgba(250,250,244,0.28)] bg-[rgba(12,13,10,0.72)] px-[0.55rem] py-[0.28rem] font-mono text-[0.6rem] font-bold uppercase tracking-[0.08em] text-cream max-[40rem]:top-[calc(5.4rem_+_env(safe-area-inset-top,0px))]"
      role="status"
    >
      <span className="practice-readout__tag rounded-pill bg-yellow px-[0.45rem] py-[0.1rem] text-ink">
        {t("practice.label")}
      </span>
      <span className="practice-readout__section text-yellow">
        {section ? practiceLabel(t, section) : t("practice.wholeSong")}
      </span>
      <span>{t("practice.speed", { speed: Math.round(plan.speed * 100) })}</span>
      <span>{t(plan.loop ? "practice.loopOn" : "practice.loopOff")}</span>
    </p>
  );
}
