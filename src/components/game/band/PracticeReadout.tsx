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
    <p className="practice-readout" role="status">
      <span className="practice-readout__tag">{t("practice.label")}</span>
      <span className="practice-readout__section">
        {section ? practiceLabel(t, section) : t("practice.wholeSong")}
      </span>
      <span>{t("practice.speed", { speed: Math.round(plan.speed * 100) })}</span>
      <span>{t(plan.loop ? "practice.loopOn" : "practice.loopOff")}</span>
    </p>
  );
}
