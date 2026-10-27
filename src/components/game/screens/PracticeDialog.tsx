import { useId, useState } from "react";
import { useT } from "../../../i18n/react";
import {
  PRACTICE_SPEEDS,
  clampPractice,
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
      panelClassName="practice-panel"
      initialFocus="[data-dialog-focus]"
    >
      <p className="config__lead">{t("practice.title")}</p>
      <p className="config__hint">{t("practice.lede")}</p>

      <p className="config__label" id={sectionLabel}>
        {t("practice.section")}
      </p>
      {sections.length > 0 ? (
        <div className="practice-options" role="radiogroup" aria-labelledby={sectionLabel}>
          {sections.map((section, index) => (
            <button
              key={`${section.startMs}-${section.endMs}-${section.label}`}
              type="button"
              role="radio"
              aria-checked={chosen === section}
              className={
                chosen === section
                  ? "practice-option practice-option--section is-chosen"
                  : "practice-option practice-option--section"
              }
              data-dialog-focus={index === 0 ? true : undefined}
              onClick={() => setStartMs(section.startMs)}
            >
              {section.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="config__hint">{t("practice.noSection")}</p>
      )}

      <p className="config__label" id={speedLabel}>
        {t("practice.speedLabel")}
      </p>
      <div className="practice-options practice-options--speeds" role="radiogroup" aria-labelledby={speedLabel}>
        {PRACTICE_SPEEDS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={speed === option}
            className={
              speed === option
                ? "practice-option is-chosen"
                : "practice-option"
            }
            onClick={() => setSpeed(option)}
          >
            {Math.round(option * 100)}%
          </button>
        ))}
      </div>

      <label className="practice-loop">
        <input
          type="checkbox"
          checked={loop}
          onChange={(event) => setLoop(event.target.checked)}
        />
        <span>{t("practice.loop")}</span>
      </label>
      <p className="config__hint">{t("practice.loopHint")}</p>

      <div className="config__actions">
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
