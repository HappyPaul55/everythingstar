import { useId, useState } from "react";
import { useT } from "../../../i18n/react";
import {
  PRACTICE_SPEEDS,
  clampPractice,
  practiceLabel,
  type PracticePlan,
  type PracticeSection,
} from "../../../lib/game/practice";
import { NativeDialog } from "../ui/NativeDialog";

/**
 * The practice dialog over the pause: which stretch, how fast, and whether it
 * repeats. Opening it does not move the transport — Start practice is the press
 * that does, through the session's `practice` event and the ordinary stage entrance.
 *
 * The plan handed back is clamped again by the session, so this is a chooser and
 * not the authority on what is playable.
 */
interface Props {
  sections: PracticeSection[];
  /** The plan already running, so opening Practice again preselects it. */
  initial: PracticePlan | null;
  durationMs: number;
  onStart: (plan: PracticePlan) => void;
  onClose: () => void;
}

/** A stretch or a speed: a radio-like tile, and never smaller than a thumb. */
const OPTION =
  "min-h-[2.75rem] cursor-pointer rounded-inner border border-[rgba(250,250,244,0.3)] bg-[rgba(12,13,10,0.6)] px-[0.6rem] py-[0.45rem] font-mono text-[0.68rem] font-bold uppercase tracking-[0.06em] text-cream";

export function PracticeDialog({
  sections,
  initial,
  durationMs,
  onStart,
  onClose,
}: Props) {
  const t = useT();
  const sectionLabel = useId();
  const speedLabel = useId();
  // Preselect the running plan, or the song's first stretch when there is none.
  const [startMs, setStartMs] = useState(() => initial?.startMs ?? sections[0]?.startMs ?? 0);
  const [speed, setSpeed] = useState(() => initial?.speed ?? 1);
  const [loop, setLoop] = useState(() => initial?.loop ?? false);
  const chosen = sections.find((section) => section.startMs === startMs) ?? sections[0];

  const start = () => {
    if (!chosen) return;
    onStart(
      clampPractice(
        { startMs: chosen.startMs, endMs: chosen.endMs, speed, loop },
        durationMs,
      ),
    );
  };

  return (
    <NativeDialog
      title={t("practice.title")}
      onClose={onClose}
      panelClassName="w-[min(30rem,100%)]"
      initialFocus="[data-dialog-focus]"
    >
      <p className="dialog-lead">{t("practice.title")}</p>
      <p className="dialog-hint">{t("practice.lede")}</p>

      <p className="dialog-label" id={sectionLabel}>
        {t("practice.section")}
      </p>
      {sections.length > 0 ? (
        <div
          className="practice-options grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-[0.35rem]"
          role="radiogroup"
          aria-labelledby={sectionLabel}
        >
          {sections.map((section, index) => (
            <button
              key={`${section.startMs}-${section.endMs}-${practiceLabel(t, section)}`}
              type="button"
              role="radio"
              aria-checked={chosen === section}
              className={`practice-option practice-option--section text-left ${OPTION} aria-checked:border-yellow aria-checked:bg-yellow aria-checked:text-ink ${
                chosen === section ? " is-chosen" : ""
              }`}
              data-dialog-focus={index === 0 ? true : undefined}
              onClick={() => setStartMs(section.startMs)}
            >
              {practiceLabel(t, section)}
            </button>
          ))}
        </div>
      ) : (
        <p className="dialog-hint">{t("practice.noSection")}</p>
      )}

      <p className="dialog-label" id={speedLabel}>
        {t("practice.speedLabel")}
      </p>
      <div
        className="practice-options practice-options--speeds grid grid-cols-3 gap-[0.35rem]"
        role="radiogroup"
        aria-labelledby={speedLabel}
      >
        {PRACTICE_SPEEDS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={speed === option}
            className={`practice-option ${OPTION} aria-checked:border-yellow aria-checked:bg-yellow aria-checked:text-ink ${
              speed === option ? " is-chosen" : ""
            }`}
            onClick={() => setSpeed(option)}
          >
            {Math.round(option * 100)}%
          </button>
        ))}
      </div>

      <label className="practice-loop flex min-h-[2.75rem] cursor-pointer items-center gap-[0.5rem] font-mono text-[0.68rem] font-bold uppercase tracking-[0.06em] text-cream [&_input]:size-[1.15rem] [&_input]:accent-yellow">
        <input
          type="checkbox"
          checked={loop}
          onChange={(event) => setLoop(event.target.checked)}
        />
        <span>{t("practice.loop")}</span>
      </label>
      <p className="dialog-hint">{t("practice.loopHint")}</p>

      <div className="config__actions dialog-actions">
        <button
          type="button"
          className="band-btn band-btn--primary"
          data-sound="select"
          disabled={!chosen}
          onClick={start}
        >
          {t("practice.start")}
        </button>
        <button type="button" className="band-btn" data-sound="back" onClick={onClose}>
          {t("practice.cancel")}
        </button>
      </div>
    </NativeDialog>
  );
}
