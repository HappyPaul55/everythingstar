import { useId, useState } from "react";
import { useT } from "../../../i18n/react";
import { useCoarsePointer } from "../band/useCoarsePointer";
import {
  isMelodyKind,
  type BandSetup,
} from "../../../lib/game/band/types";
import {
  practiceEnded,
  sectionAt,
  type PracticePlan,
  type PracticeSection,
} from "../../../lib/game/practice";
import {
  LAG_LIMIT_MS,
  NOTE_SPEED_MAX,
  NOTE_SPEED_MIN,
  NOTE_SPEED_STEP,
  formatLag,
  formatNoteSpeed,
  snapNoteSpeed,
  stepLag,
  type Settings,
} from "../../../lib/game/settings";
import type { Song } from "../../../lib/game/song";
import { useClock } from "../band/StageClock";
import { NativeDialog } from "../ui/NativeDialog";
import { StepButton } from "../ui/StepButton";
import { PracticeDialog } from "./PracticeDialog";

/**
 * The pause: resume where you were, start the song again, practise a stretch, or
 * leave the stage. Escape opens it too (see the island), which is the key a
 * player will reach for.
 *
 * Two things that usually mean a page away are here, because they are about the
 * run in front of you rather than about the game: how fast the notes come and how
 * late the sound is, plus the song's guide vocal when somebody is singing. They
 * write the same settings Options does — there is no second store and no second
 * rule — and "Practice this section" opens the same dialog as Practice, seeded
 * with the stretch the playhead is in.
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
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  /** Who is on stage, so the guide vocal is offered only when somebody sings. */
  setup: BandSetup;
}

/** Which way the practice dialog was opened: the pause's own button, or "here". */
type Choosing = "open" | "section" | null;

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
  settings,
  onSettings,
  setup,
}: Props) {
  const t = useT();
  const coarse = useCoarsePointer();
  const clock = useClock();
  const [choosing, setChoosing] = useState<Choosing>(null);
  /** The plan "Practice this section" seeded, read once at the press. */
  const [seed, setSeed] = useState<PracticePlan | null>(null);
  const speedLabel = useId();
  const lagLabel = useId();
  const vocalLabel = useId();

  // A singer is a words player who is not typing. The song's pitch decides that
  // when the band is built, so a lyrics-only song never reports one.
  const singer = setup.players.some(
    (player) => isMelodyKind(player.kind) && player.wordsMode !== "type",
  );
  const slowest = settings.noteSpeed <= NOTE_SPEED_MIN;
  const fastest = settings.noteSpeed >= NOTE_SPEED_MAX;
  const earliest = settings.audioLagMs <= -LAG_LIMIT_MS;
  const latest = settings.audioLagMs >= LAG_LIMIT_MS;
  /**
   * A one-pass practice that reached its end pauses **on** the end. Resume would
   * then rewind a whole-song practice to the top (the clock's own rule) or play one
   * frame past the section and pause again — a button that does not do what it says.
   * The honest action is to play the same stretch again.
   */
  const passOver = practice !== null && practiceEnded(practice, clock.timeRef.current);
  /**
   * What closing the pause does. At a finished pass it is the same as the primary
   * button — repeat the stretch — because Escape and a pad's B resume, and a resume
   * there rewinds a whole-song practice or re-pauses one frame later.
   */
  const closeAction = () => {
    if (passOver && practice) onStartPractice(practice);
    else onResume();
  };

  /**
   * Practise the stretch the song is in **now**, at the record's speed and without
   * a loop: the plan a player wants on the first press. The playhead is read at the
   * press rather than rendered, so the pause never re-renders on a frame, and a
   * moment before the first section falls back to the first choice rather than
   * offering nothing.
   */
  const practiceHere = () => {
    const section = sectionAt(sections, clock.timeRef.current) ?? sections[0] ?? null;
    setSeed(
      section
        ? { startMs: section.startMs, endMs: section.endMs, speed: 1, loop: false }
        : null,
    );
    setChoosing("section");
  };

  return (
    <>
      <NativeDialog
        title={t("screen.paused")}
        onClose={closeAction}
        className="screen screen--over screen--paused"
        panelClassName="screen__panel screen__panel--centre"
        showHeader={false}
        dismissible={false}
        initialFocus="[data-dialog-focus]"
      >
        <h2 className="screen__title">{t("screen.paused")}</h2>
        <p className="screen__lede">{song.title}</p>
        <div className="quick" role="group" aria-label={t("pause.quick")}>
          <div className="quick__row">
            <span className="quick__name" id={speedLabel}>
              {t("pause.noteSpeed")}
            </span>
            <div className="quick__control" role="group" aria-labelledby={speedLabel}>
              <StepButton
                direction={-1}
                label={t("pause.speedSlower")}
                blocked={slowest}
                onStep={() =>
                  onSettings({
                    noteSpeed: snapNoteSpeed(settings.noteSpeed - NOTE_SPEED_STEP),
                  })
                }
              />
              <output className="quick__value" aria-live="polite" aria-atomic="true">
                {formatNoteSpeed(settings.noteSpeed)}
              </output>
              <StepButton
                direction={1}
                label={t("pause.speedFaster")}
                blocked={fastest}
                onStep={() =>
                  onSettings({
                    noteSpeed: snapNoteSpeed(settings.noteSpeed + NOTE_SPEED_STEP),
                  })
                }
              />
            </div>
          </div>
          <div className="quick__row">
            <span className="quick__name" id={lagLabel}>
              {t("pause.audioLag")}
            </span>
            <div className="quick__control" role="group" aria-labelledby={lagLabel}>
              <StepButton
                direction={-1}
                label={t("screen.lagEarlier")}
                blocked={earliest}
                onStep={() =>
                  onSettings({ audioLagMs: stepLag(settings.audioLagMs, -1) })
                }
              />
              <output className="quick__value" aria-live="polite" aria-atomic="true">
                {formatLag(settings.audioLagMs)}
              </output>
              <StepButton
                direction={1}
                label={t("screen.lagLater")}
                blocked={latest}
                onStep={() => onSettings({ audioLagMs: stepLag(settings.audioLagMs, 1) })}
              />
            </div>
          </div>
          {/* The song's own voice under a singer: karaoke when off, and the only
              way to hear a part drop out on a miss when on. The same setting
              Options writes, offered here because it is about the run. */}
          {singer ? (
            <div className="quick__row">
              <span className="quick__name" id={vocalLabel}>
                {t("pause.guideVocal")}
              </span>
              <div className="quick__control" role="group" aria-labelledby={vocalLabel}>
                <button
                  type="button"
                  className={settings.guideVocal ? "slot__option is-active" : "slot__option"}
                  aria-pressed={settings.guideVocal}
                  data-sound="select"
                  onClick={() => onSettings({ guideVocal: true })}
                >
                  {t("screen.guideVocalOn")}
                </button>
                <button
                  type="button"
                  className={settings.guideVocal ? "slot__option" : "slot__option is-active"}
                  aria-pressed={!settings.guideVocal}
                  data-sound="select"
                  onClick={() => onSettings({ guideVocal: false })}
                >
                  {t("screen.guideVocalOff")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="screen__practice">
          <button
            type="button"
            className="band-btn"
            aria-haspopup="dialog"
            onClick={() => setChoosing("open")}
          >
            {t("practice.open")}
          </button>
          {sections.length > 0 ? (
            <button
              type="button"
              className="band-btn"
              aria-haspopup="dialog"
              onClick={practiceHere}
            >
              {t("pause.practiceHere")}
            </button>
          ) : null}
          {practice ? (
            <button type="button" className="band-btn" onClick={onStopPractice}>
              {t("practice.stop")}
            </button>
          ) : null}
        </div>
        <div className="screen__actions">
          {passOver && practice ? (
            <button
              type="button"
              className="band-btn band-btn--primary"
              data-dialog-focus
              data-nav-default="true"
              data-sound="select"
              onClick={closeAction}
            >
              {t("practice.repeat")}
            </button>
          ) : (
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
          )}
          <button type="button" className="band-btn" onClick={onRestart}>
            {t("screen.restart")}
          </button>
          <button type="button" className="band-btn" data-sound="back" onClick={onQuit}>
            {t("screen.quit")}
          </button>
        </div>
        <p className="screen__hint">
          {t(coarse ? "screen.pauseTouchHint" : "screen.pauseHint")}
        </p>
      </NativeDialog>
      {choosing ? (
        <PracticeDialog
          sections={sections}
          initial={choosing === "section" ? seed : practice}
          durationMs={durationMs}
          onStart={onStartPractice}
          onClose={() => setChoosing(null)}
        />
      ) : null}
    </>
  );
}
