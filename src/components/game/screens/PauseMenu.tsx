import { useState } from "react";
import { useT } from "../../../i18n/react";
import type { PracticePlan, PracticeSection } from "../../../lib/game/practice";
import type { Song } from "../../../lib/game/song";
import { NativeDialog } from "../ui/NativeDialog";
import { PracticeDialog } from "./PracticeDialog";

/**
 * The pause: resume where you were, start the song again, practise a stretch, or
 * leave the stage. Escape opens it too (see the island), which is the key a
 * player will reach for.
 *
 * Practice is a **dialog over the pause**, not a screen. It hands its plan to the
 * session, which dispatches the stage entrance: the pause overlay goes away and the
 * ordinary count-in — the slide and the band's hype — takes over.
 */
interface Props {
  song: Song;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  /** The running plan, so Practice opens on the stretch already being played. */
  practice: PracticePlan | null;
  /** What this song offers as practice stretches. */
  sections: PracticeSection[];
  durationMs: number;
  onStartPractice: (plan: PracticePlan) => void;
  /** Leave practice and put the run back at the top at the record's speed. */
  onStopPractice: () => void;
}

export function PauseMenu({
  song,
  onResume,
  onRestart,
  onQuit,
  practice,
  sections,
  durationMs,
  onStartPractice,
  onStopPractice,
}: Props) {
  const t = useT();
  const [choosing, setChoosing] = useState(false);
  return (
    <>
      <NativeDialog
        title={t("screen.paused")}
        onClose={onResume}
        className="screen screen--over screen--paused"
        panelClassName="screen__panel screen__panel--centre"
        showHeader={false}
        dismissible={false}
        initialFocus="[data-dialog-focus]"
      >
        <h2 className="screen__title">{t("screen.paused")}</h2>
        <p className="screen__lede">{song.title}</p>
        <div className="screen__practice">
          <button
            type="button"
            className="band-btn"
            aria-haspopup="dialog"
            onClick={() => setChoosing(true)}
          >
            {t("practice.open")}
          </button>
          {practice ? (
            <button type="button" className="band-btn" onClick={onStopPractice}>
              {t("practice.stop")}
            </button>
          ) : null}
        </div>
        <div className="screen__actions">
          <button
            type="button"
            className="band-btn band-btn--primary"
            data-dialog-focus
            data-nav-default="true"
            data-sound="select"
            onClick={onResume}
          >
            {t("screen.resume")}
          </button>
          <button type="button" className="band-btn" onClick={onRestart}>
            {t("screen.restart")}
          </button>
          <button type="button" className="band-btn" data-sound="back" onClick={onQuit}>
            {t("screen.quit")}
          </button>
        </div>
        <p className="screen__hint">{t("screen.pauseHint")}</p>
      </NativeDialog>
      {choosing ? (
        <PracticeDialog
          sections={sections}
          initial={practice}
          durationMs={durationMs}
          onStart={onStartPractice}
          onClose={() => setChoosing(false)}
        />
      ) : null}
    </>
  );
}
