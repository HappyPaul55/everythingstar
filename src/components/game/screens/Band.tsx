import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../../i18n/react";
import { useCoarsePointer } from "../band/useCoarsePointer";
import {
  MAX_PLAYERS,
  isMelodyKind,
  joinSlotAt,
  nextSlot,
  patchSlot,
  withOfferedRoles,
  type BandPlan,
  type BandSlot,
  type PlayerKind,
} from "../../../lib/game/band/types";
import {
  songDifficulties,
  songHasPart,
  songHasPitch,
  songWords,
  type Song,
} from "../../../lib/game/song";
import {
  nearestDifficulty,
  type Difficulty,
  type LaneRole,
} from "../../../lib/game/track";
import { offerFromDoc, sourceChartFor, type SourceSongDoc } from "../../../lib/game/source";
import { PRELOAD_GRACE_MS } from "../../../lib/game/audio/preload";
import { useSongAudioPreload, useSongAudioProgress } from "../band/SongAudioStatus";
import { useStageControls } from "../band/StageControls";
import type { FullscreenState } from "../band/useFullscreen";
import { GearButton, kindLabel, kindTone, slotLabel } from "./playerBits";
import { SlotSettings } from "./SlotSettings";
import { ScreenBackButton } from "./ScreenBackButton";
import { SongProblems } from "./SongProblems";
import { activeRoot, defaultFocus, focusStageTarget } from "../ui/nav";

/**
 * The band: who is on stage, a character box each.
 *
 * A player is a **box** holding everything about them — what they take, at what
 * difficulty, and a way off the stage — and the boxes stand beside each other, so
 * the band reads at a glance the way a character-select screen does: four to start
 * with, and a second row offered once the first is full. On a phone the boxes go
 * one a row and the first row of four is the whole band: eight beds of pickers is
 * a page nobody scrolls, and a phone is not going to have eight players.
 *
 * **Only what the song carries can be chosen.** A box takes an instrument, or the
 * place at the words — a singer or typist on a pitched song, and a typist on one
 * without pitch — and only modes the song supports are shown. Difficulties come from the
 * same place: the charts the song actually carries for that instrument, the three
 * singing always has, and nothing at all for lyrics, which is free play.
 *
 * A box remembers what it was given even when the song has moved on, so walking
 * back to the jukebox and picking another song does not throw the band away.
 */
interface Props {
  song: Song;
  /**
   * The song's own document. The screen needs it for one thing the offer cannot
   * say — how many columns a chart's highway has — and taking it from the document
   * rather than the loaded track means the band screen needs neither the stage nor
   * the charts to have arrived.
   */
  doc: SourceSongDoc | null;
  /** Anything the files said was wrong, said **before** the band plays it. */
  problems: readonly string[];
  /**
   * The charts are in hand. The band screen's loader waits for this **and** the
   * song's sound before it lets Play through; either one missing is a spinner,
   * because a run with no chart and a run with no drums are both half a run.
   */
  chartsReady: boolean;
  plan: BandPlan;
  onPlan: (plan: BandPlan) => void;
  onPlay: () => void;
  onBack: () => void;
  /** The screen's own fullscreen state, so a mic prompt can put it back. */
  fullscreen: FullscreenState;
  /**
   * The stage is on a **phone**, where a box fills the width and the band stops at
   * the first row of four. The session owns the breakpoint, so this screen and the
   * stylesheet cannot disagree about what a phone is.
   */
  phone: boolean;
}

/** How many boxes stand in a row before the second one is offered. */
const FIRST_ROW = 4;

/**
 * A player's box: a card the grid gives four columns, two on a tablet and one on a
 * phone. It is a **container** in the inline axis, so the pickers inside answer to
 * the box rather than to the window.
 */
const SLOT =
  "slot flex h-full flex-col gap-[0.5rem] rounded-inner border border-[rgba(250,250,244,0.14)] bg-[rgba(12,13,10,0.5)] px-[0.6rem] pt-[0.55rem] pb-[0.7rem] [container-type:inline-size]";

/** An empty box is a place in the band: dashed, and quieter than a player's. */
const SLOT_EMPTY =
  "slot slot--empty flex h-full flex-col gap-[0.5rem] rounded-inner border border-dashed border-[rgba(250,250,244,0.22)] bg-transparent p-[0.35rem] [container-type:inline-size]";

/** The × that takes a player off the stage: a 44px target around a small glyph. */
const REMOVE =
  "slot__remove flex-none grid size-[2.75rem] cursor-pointer place-items-center rounded-inner border-0 bg-transparent p-0 text-[1.05rem] leading-none text-[rgba(250,250,244,0.5)] [&:hover]:text-accent [&[data-nav-focus]]:text-accent [:root:not([data-game-input=pointer])_&:focus-visible]:text-accent";

/** A box too narrow for two tiles a row stacks them and says the label in full. */
const KINDS =
  "slot__kinds grid grid-cols-2 gap-[0.2rem] @max-[10.5rem]:grid-cols-[minmax(0,1fr)]";

/** A level: the same tile as a part, shrunk again when the box cannot hold it. */
const LEVEL =
  "slot__option @max-[10rem]:px-[0.15rem] @max-[10rem]:text-[0.5rem] @max-[10rem]:tracking-normal";

/** The same shrink for the two notes a box can carry where its levels would be. */
const SHRINK = "@max-[10rem]:px-[0.15rem] @max-[10rem]:text-[0.5rem] @max-[10rem]:tracking-normal";

export function Band({ song, doc, problems, chartsReady, plan, onPlan, onPlay, onBack, fullscreen, phone }: Props) {
  const t = useT();
  const coarse = useCoarsePointer();
  const { mic } = useStageControls();
  /**
   * The song's own files, preloading behind this screen.
   *
   * `SongAudio` starts them as soon as the document arrives; the progress is what
   * the Play button waits on. `prime` is the gesture a mobile browser needs to
   * actually fetch files it has been told to preload. The loader waits for
   * `HAVE_ENOUGH_DATA` on every stem, and the clock refuses to start a run until
   * the same answer arrives (StageDirector).
   */
  const songAudio = useSongAudioProgress();
  const preload = useSongAudioPreload();
  /** Play was pressed and the run is waiting for charts, sound, or both. */
  const [starting, setStarting] = useState(false);
  /**
   * The wait passed its grace. The band is still loading, but the player can say
   * "start anyway" rather than being trapped on a spinner.
   */
  const [giveUp, setGiveUp] = useState(false);
  /** The one start this screen will make, however many renders follow. */
  const started = useRef(false);
  const ready = chartsReady && songAudio.ready;
  /**
   * The charts are in hand but the **sound** is not. The grace is for that wait
   * only: starting without a chart is an empty highway, not a run the player can
   * play, and the chart loader has its own tolerant deadline.
   */
  const audioWaiting = chartsReady && !songAudio.ready;

  /** The one move from this screen into a run. */
  const startNow = useCallback(() => {
    if (started.current) return;
    started.current = true;
    onPlay();
  }, [onPlay]);

  // A run begins the moment both halves are in hand. This is the whole loader: the
  // press only starts the wait, and the wait itself starts the run.
  useEffect(() => {
    if (!starting || !ready) return;
    startNow();
  }, [starting, ready, startNow]);

  // A stem that never arrives is a wait that needs an exit. The rule is a
  // **delay**, not a readiness answer: when it passes, the button offers to play
  // anyway and the player decides. It is the **sound** that earns the exit; a
  // chart still in flight is the loader's own tolerant wait.
  useEffect(() => {
    if (!starting || !audioWaiting) return;
    const timer = window.setTimeout(() => setGiveUp(true), PRELOAD_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [starting, audioWaiting]);

  // The wait is no longer the sound's (a chart started loading, or the stems all
  // arrived): the exit stops being offered.
  useEffect(() => {
    if (!audioWaiting) setGiveUp(false);
  }, [audioWaiting]);


  /**
   * Ask for the microphone at the player's gesture. Some browsers leave fullscreen
   * to show the permission prompt, so if the screen was ours before the ask, try to
   * take it back once the browser has answered. Best effort: the prompt's answer may
   * no longer carry the gesture a fullscreen request needs.
   */
  const askForMic = (retry = false, after?: () => void) => {
    const wasFullscreen = fullscreen.active;
    const prompting = mic.permission !== "granted";
    void mic.requestPermission(retry).finally(() => {
      if (prompting) fullscreen.restore(wasFullscreen);
      after?.();
    });
  };
  // The entry is a summary; the document is the truth. A folder remembered before
  // a reader fix can still carry `voice: null` while the song document has vocals.
  const offered = useMemo(
    () => (doc ? { ...song, offer: offerFromDoc(doc, song.offer) } : song),
    [song, doc],
  );
  /**
   * **A seat takes the role the song actually offers.** The band is remembered
   * across songs, so a remembered guitar may be bound to the rhythm of a song that
   * only has a lead, or to a role that has since split in two. Resolving it here
   * means every box, every chart request and every label sees the same seat.
   */
  const playedPlan = useMemo(
    () => withOfferedRoles(plan, offered.offer),
    [plan, offered.offer],
  );
  // The fallback is **for this song only**: it is what the boxes show and what the
  // stage plays, but it is never written back. A player who chose Rhythm on a song
  // that has both must get Rhythm back when they return from a lead-only song, so a
  // resolution the song forced is not a choice to remember.
  const hasPitch = songHasPitch(offered);
  const [expanded, setExpanded] = useState(false);
  /** Which player's controller is being set up, if any. */
  const [setting, setSetting] = useState<number | null>(null);
  /**
   * The box whose controls replaced the one that was pressed. Joining, leaving and
   * adding a row all remove the focused button, and a browser's answer to that is
   * `<body>` — a long way from the band for a controller or a screen reader.
   */
  const focusAfter = useRef<number | null>(null);

  useEffect(() => {
    const at = focusAfter.current;
    if (at === null) return;
    focusAfter.current = null;
    const frame = requestAnimationFrame(() => {
      const box = document.querySelectorAll<HTMLElement>(".screen--band .slot")[at];
      // A box can lose the control that was pressed (a part the song has none of),
      // and the plan can shrink under the index. The screen's own starting control
      // is a place in the band rather than `<body>`.
      const root = activeRoot("band");
      const target =
        box?.querySelector<HTMLElement>(".slot__option, .slot__join") ??
        (root ? defaultFocus(root) : null);
      if (target) focusStageTarget(target, { silent: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [playedPlan, expanded]);
  /**
   * A phone draws **one box a row**, so the band it offers is the first row of
   * four: eight full-width boxes would be a scroll past the whole band before Play,
   * and a phone is not going to have eight players. A band remembered with more —
   * picked on a wide screen — is still drawn in full, because a seat the run will
   * play must not be hidden from the screen that plays it.
   */
  const room = phone
    ? Math.max(FIRST_ROW, playedPlan.slots.length)
    : expanded || playedPlan.slots.length > FIRST_ROW
      ? MAX_PLAYERS
      : FIRST_ROW;
  const offering =
    !phone &&
    !expanded &&
    Array.from({ length: FIRST_ROW }, (_, index) => playedPlan.slots[index]).every(
      (slot) => slot !== undefined && slot.active !== false,
    );

  /** The difficulties a slot could be set to, given what the song carries. */
  const difficultiesFor = (kind: PlayerKind, role?: LaneRole): Difficulty[] =>
    songDifficulties(offered, kind, role);
  /** Whether the song has anything for this kind and role at all. */
  const possible = (kind: PlayerKind, role?: LaneRole): boolean =>
    songHasPart(offered, kind, role);
  const activeSlots = playedPlan.slots.filter((slot) => slot.active !== false);
  const nothingPlays =
    activeSlots.length > 0 &&
    activeSlots.every((slot) => !possible(slot.kind, slot.role));
  const empty = activeSlots.length === 0;
  /** Stems the browser refused, said beside the chart problems — never silently. */
  const audioProblems = songAudio.failed.map((name) =>
    t("screen.audioFailed", { name }),
  );
  const shownProblems =
    audioProblems.length > 0 ? [...problems, ...audioProblems] : problems;
  /** The button is a wait while the files arrive, and an escape once the wait drags. */
  const waiting = starting && !giveUp;
  const loadingHint = giveUp
    ? t("screen.preloadStalled")
    : ready
      ? t("screen.ready")
      : chartsReady && songAudio.total > 0
        ? t("screen.preloadProgress", {
            done: songAudio.done,
            total: songAudio.total,
          })
        : t("screen.loading");

  const setSlot = (index: number, patch: Partial<BandSlot>) =>
    // Patch the remembered plan, not the song's fallback: changing a difficulty on
    // a lead-only song must not forget the rhythm the player chose elsewhere.
    onPlan(patchSlot(plan, index, patch));
  /**
   * What a box takes. A **different instrument is a different controller** — a
   * guitar's five frets are not a dance mat's four arrows — so whatever they had
   * set up is forgotten and the box invites them to set it up again. The level
   * stays: that was about the song, not the hands.
   *
   * Choosing the **other guitar role is not a different instrument**: it is the
   * same five frets, so the controller and its mapping stay.
   */
  const setKind = (index: number, kind: PlayerKind, role?: LaneRole) =>
    onPlan({
      ...plan,
      slots: plan.slots.map((slot, at) => {
        if (at !== index || slot.active === false) return slot;
        if (slot.kind === kind) {
          const next = { ...slot, ...(role ? { role } : {}) };
          if (!role) delete next.role;
          return next;
        }
        return {
          kind,
          difficulty: slot.difficulty,
          ...(role ? { role } : {}),
        };
      }),
    });
  const setWordsMode = (index: number, wordsMode: "sing" | "type") =>
    // Singing and typing are the same instrument: only a *different* instrument
    // forgets the controller and its mapping, so the slot is spread rather than
    // rebuilt.
    onPlan(
      patchSlot(plan, index, { kind: "words", wordsMode, role: undefined }),
    );
  const removeSlot = (index: number) => {
    focusAfter.current = index;
    onPlan({
      ...plan,
      slots: plan.slots.map((slot, at) =>
        at === index ? { kind: "guitar", difficulty: "normal", active: false } : slot,
      ),
    });
  };

  /** The chart's columns for a box, or `null` when the song has none for them. */
  const columnsFor = (slot: BandSlot): number | null =>
    isMelodyKind(slot.kind) || !doc
      ? null
      : (sourceChartFor(doc, slot.kind, slot.difficulty, slot.role)?.columns ?? null);

  /** One player's box: who they are, what they take, how hard, and off. */
  const box = (slot: BandSlot, index: number) => {
    const wordsMode = hasPitch && slot.wordsMode !== "type" ? "sing" : "type";
    const levels = isMelodyKind(slot.kind) && wordsMode === "type"
      ? []
      : difficultiesFor(slot.kind, slot.role);
    const asked = possible(slot.kind, slot.role);
    // Lyrics have no levels — free play — which is not the same as the song having
    // no part for this player at all.
    const freePlay = isMelodyKind(slot.kind) && wordsMode === "type" && songWords(offered);
    return (
      <li className={SLOT} key={index}>
        <div className="slot__head flex items-center gap-[0.3rem]">
          <span className="slot__who mr-auto font-mono text-[0.6rem] font-bold uppercase tracking-[0.1em] text-[rgba(250,250,244,0.7)]">
            {t("band.player", { n: index + 1 })}
          </span>
          {/* One player's controller: what they hold, and what each control is.
              A gear rather than a word — every box has one, and the words belong
              to the thing being played. */}
          <GearButton
            label={t("screen.controllerFor", { n: index + 1 })}
            onClick={() => setSetting(index)}
          />
          <button
            type="button"
            className={REMOVE}
            aria-label={t("screen.removePlayer", { n: index + 1 })}
            data-sound="back"
            onClick={() => removeSlot(index)}
          >
            ×
          </button>
        </div>

        {/* The portrait: what this player is, big enough to read across the grid. */}
        <p
          className={`slot__portrait m-0 font-display text-[clamp(1rem,1.5vw,1.35rem)] leading-[1.05] text-yellow [&.is-vocals]:text-accent ${
            kindTone(slot.kind, wordsMode) === "vocals" ? " is-vocals" : ""
          }`}
        >
          {slotLabel(t, slot, hasPitch)}
        </p>

        <div
          className={KINDS}
          role="group"
          aria-label={t("screen.playsLabel", { n: index + 1 })}
        >
          {/* Every part the song carries, by **role**: a lead and a rhythm guitar
              are two choices because they are two things to play. */}
          {offered.offer.instruments.map((instrument) => {
            const active =
              instrument.kind === slot.kind &&
              (instrument.role ?? undefined) === slot.role;
            return (
              <button
                key={`${instrument.kind}:${instrument.role ?? ""}`}
                type="button"
                className={active ? "slot__option is-active" : "slot__option"}
                aria-pressed={active}
                data-sound="select"
                onClick={() => setKind(index, instrument.kind, instrument.role)}
              >
                {kindLabel(t, instrument.kind, hasPitch, instrument.role)}
              </button>
            );
          })}
          {/* Words are one place, with a per-player sing/type choice on pitched songs. */}
          {songWords(offered)
            ? hasPitch
              ? (
                  <>
                    <button
                      type="button"
                      className={`slot__option is-vocals ${
                        isMelodyKind(slot.kind) && wordsMode === "sing" ? " is-active" : ""
                      }`}
                      aria-pressed={isMelodyKind(slot.kind) && wordsMode === "sing"}
                      data-sound="select"
                      onClick={() => {
                        // This is the gesture: ask here, not when the run starts.
                        void askForMic(true);
                        setWordsMode(index, "sing");
                      }}
                    >
                      {t("band.vocals")}
                    </button>
                    <button
                      type="button"
                      className={`slot__option ${
                        isMelodyKind(slot.kind) && wordsMode === "type" ? " is-active" : ""
                      }`}
                      aria-pressed={isMelodyKind(slot.kind) && wordsMode === "type"}
                      data-sound="select"
                      onClick={() => setWordsMode(index, "type")}
                    >
                      {t("band.type")}
                    </button>
                  </>
                )
              : (
                  <button
                    type="button"
                    className={`slot__option ${
                      isMelodyKind(slot.kind) ? " is-active" : ""
                    }`}
                    aria-pressed={isMelodyKind(slot.kind)}
                    data-sound="select"
                    onClick={() => setWordsMode(index, "type")}
                  >
                    {kindLabel(t, "words", hasPitch)}
                  </button>
                )
            : null}
        </div>

        {/* A singer whose microphone was refused is played by the machine; the box
            says so rather than leaving "the machine is singing" to be discovered. */}
        {hasPitch && isMelodyKind(slot.kind) && mic.permission === "denied" ? (
          <p className="slot__mic m-0 mt-[0.15rem] px-[0.35rem] py-[0.2rem] font-mono text-[0.6rem] leading-[1.4] text-yellow" role="status">
            {t("band.micRefusedHint")}
          </p>
        ) : null}

        {/* How hard, as far as this song is concerned — under a rule, because what
            a player takes and how hard they take it are two decisions. */}
        <div className="slot__foot mt-auto border-t border-dashed border-[rgba(250,250,244,0.24)] pt-[0.5rem]">
          {levels.length > 0 ? (
            <div
              className="slot__how grid grid-flow-col auto-cols-[minmax(0,1fr)] gap-[0.2rem]"
              role="group"
              aria-label={t("screen.howHardLabel", { n: index + 1 })}
            >
              {levels.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`${LEVEL} ${
                    level === nearestDifficulty(levels, slot.difficulty)
                      ? " is-active"
                      : ""
                  }`}
                  aria-pressed={level === nearestDifficulty(levels, slot.difficulty)}
                  data-sound="select"
                  onClick={() => setSlot(index, { difficulty: level })}
                >
                  {t(`band.${level}` as "band.easy")}
                </button>
              ))}
            </div>
          ) : freePlay ? (
            <p className={`slot__free px-[0.35rem] py-[0.2rem] border border-dashed border-accent rounded-inner text-center font-mono text-[0.58rem] font-bold uppercase tracking-[0.1em] text-accent ${SHRINK}`}>
              {t("screen.typedFreePlay")}
            </p>
          ) : asked ? null : (
            <p className={`slot__aside px-[0.35rem] py-[0.2rem] text-center font-mono text-[0.58rem] font-bold uppercase tracking-[0.04em] text-accent border border-accent rounded-inner ${SHRINK}`}>
              {t("screen.noPartHere")}
            </p>
          )}
        </div>
      </li>
    );
  };

  /** An empty box is a place in the band, waiting for somebody to take it. */
  const emptyBox = (index: number) => {
    // Never a part the song has none of; each seat gets the next instrument or
    // words mode in the song's offer, rather than every empty box repeating one.
    const choice = nextSlot(offered, index);
    return (
      <li className={SLOT_EMPTY} key={index}>
        <button
          type="button"
          className="slot__join flex-auto flex min-h-[7rem] cursor-pointer flex-col items-center justify-center gap-[0.3rem] rounded-inner border-0 bg-transparent p-[0.6rem] text-center font-mono text-[0.58rem] font-bold uppercase tracking-[0.08em] text-[rgba(250,250,244,0.55)] [&:hover]:bg-[rgba(255,212,0,0.08)] [&:hover]:text-yellow [&[data-nav-focus]]:bg-[rgba(255,212,0,0.08)] [&[data-nav-focus]]:text-yellow [:root:not([data-game-input=pointer])_&:focus-visible]:bg-[rgba(255,212,0,0.08)] [:root:not([data-game-input=pointer])_&:focus-visible]:text-yellow"
          data-nav-default={empty && index === 0 ? "true" : undefined}
          data-sound="select"
          onClick={() => {
            if (isMelodyKind(choice.kind) && choice.wordsMode === "sing") {
              void askForMic(true);
            }
            focusAfter.current = index;
            // Patch the remembered plan, not the song's fallback: joining a seat
            // on a lead-only song must not forget a player's rhythm guitar.
            onPlan(joinSlotAt(plan, index, offered));
          }}
        >
          <span className="slot__join-mark text-[1.5rem] leading-none text-yellow" aria-hidden="true">
            +
          </span>
          {t("screen.joinSlot", { n: index + 1 })}
          <span
            className={`slot__join-take text-[0.54rem] tracking-[0.14em] text-yellow [&.is-vocals]:text-accent ${
              kindTone(choice.kind, choice.wordsMode) === "vocals" ? " is-vocals" : ""
            }`}
          >
            {slotLabel(t, choice, hasPitch)}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="screen screen--band">
      <div className="screen__panel screen__panel--page">
        <ScreenBackButton label={t("screen.backToSongs")} onBack={onBack} />
        <h2 className="screen__title">{t("screen.bandTitle")}</h2>
        <p className="screen__lede">
          {t("screen.bandLede", { title: song.title, artist: song.artist.name })}
        </p>

        {/* A song whose files could not be read is said here rather than on the stage:
            the stage's own answer is "No chart for this instrument" on every panel,
            which reads as a broken song rather than a folder that needs a press. */}
        <SongProblems problems={shownProblems} className="screen__warn" />

        <ul
          className="slots m-0 mb-[1rem] grid auto-rows-[1fr] list-none grid-cols-4 items-stretch gap-[0.6rem] p-0 max-[76rem]:grid-cols-2 max-[40rem]:grid-cols-1"
          aria-label={t("screen.playersLabel")}
        >
          {Array.from({ length: room }, (_, index) => {
            const slot = playedPlan.slots[index];
            return slot && slot.active !== false ? box(slot, index) : emptyBox(index);
          })}
        </ul>

        <div className="band-actions grid grid-cols-[1fr_auto_1fr] items-center gap-[0.6rem] mt-[0.2rem]">
          {/* Only once the first four boxes are full, and only in the middle: it is
              an offer between leaving and playing, not a thing to reach for. */}
          {offering ? (
            <button
              type="button"
              className="band-btn band-btn--more band-actions__more col-start-2 justify-self-center border-dashed"
              data-sound="select"
              onClick={() => {
                focusAfter.current = FIRST_ROW;
                setExpanded(true);
              }}
            >
              {t("screen.addRow")}
            </button>
          ) : null}
          <button
            type="button"
            className="band-btn band-btn--primary band-btn--big band-actions__play col-start-3 justify-self-end"
            /* Not `disabled`: a disabled button fires nothing, and the *press* is what
               has to say "not like that" — see `refuse` in docs/developers/audio.md. While the
               loader waits, the press is ignored; once its grace passes, the same
               button is the way out and says so. */
            aria-disabled={nothingPlays || waiting}
            aria-busy={waiting || undefined}
            aria-describedby="band-hint"
            data-nav-default={!empty ? "true" : undefined}
            data-sound={nothingPlays ? "refuse" : "select"}
            onClick={() => {
              if (nothingPlays) return;
              // The wait has an exit: the player chooses to start without what is
              // still arriving rather than being held on a spinner forever. The
              // force is what also releases the clock's start gate.
              if (starting) {
                if (giveUp) {
                  preload.force();
                  startNow();
                }
                return;
              }
              // A mobile browser ignores `preload` until something plays; this is
              // the press that may make it fetch, so ask inside the gesture.
              preload.prime();
              // The microphone is asked for by **choosing Vocals**, not by pressing
              // Play: a remembered singer who never granted it is played by the
              // machine, and the band says so. A permission prompt at the first Play
              // was the one surprise a new player could not read.
              if (ready) {
                startNow();
                return;
              }
              setGiveUp(false);
              setStarting(true);
            }}
          >
            {starting
              ? giveUp
                ? t("screen.playAnyway")
                : t("screen.enterLoading")
              : empty
                ? t("screen.listen")
                : t("screen.play")}
          </button>
        </div>
        <p className="screen__hint" id="band-hint">
          {starting ? loadingHint : empty
            ? t("screen.bandListenHint")
            : nothingPlays
              ? t("screen.bandNothing")
              : coarse
                ? t("screen.handsTouchHint")
                : t("screen.handsHint")}
        </p>
      </div>

      {/* One player's controller, over the band: the band stays where it is, so
          who is playing is still legible while one of them is being set up. */}
      {setting !== null &&
      playedPlan.slots[setting] &&
      playedPlan.slots[setting].active !== false ? (
        <SlotSettings
          plan={playedPlan}
          index={setting}
          slot={playedPlan.slots[setting]}
          columns={columnsFor(playedPlan.slots[setting])}
          /* What *this* box does with the words: a typist on a pitched song has a
             keyboard, not a microphone, whatever the song carries. */
          hasPitch={hasPitch && playedPlan.slots[setting].wordsMode !== "type"}
          onController={(controller) => setSlot(setting, { controller })}
          onClose={() => setSetting(null)}
        />
      ) : null}
    </div>
  );
}
