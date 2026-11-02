import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useT } from "../../../i18n/react";
import {
  ROLL_ANCHOR,
  ROLL_SHARE,
  barSpanMs,
  linePlace,
  linesInWindow,
  mountedLines,
  nextOnsets,
  notePlace,
  rollNotes,
  rowCentre,
  placeVerdict,
  sungNotesByPlace,
} from "../../../lib/game/band/melody";
import { activeWordIndex, introProgress, isSounding, judgedAt } from "../../../lib/game/run";
import { HIT_WINDOW_MS } from "../../../lib/game/scoring";
import { notesInWindow } from "../../../lib/game/scroll";
import type { MelodyLine, MelodyNote, NoteState, Track } from "../../../lib/game/track";
import type { TypingLevel } from "../../../lib/game/typing";
import { useStageControls } from "./StageControls";
import { TypeWord } from "./TypeWord";
import { useClock, useClockMs } from "./StageClock";
import { useElementSize } from "./useElementSize";
import { useScrollTrack } from "./useScrollTrack";
import type { MelodySinging } from "./useSinging";
import type { MelodyTyping, WordProgress } from "./useTyping";
import { PART_BAR, PART_SHAPE, PART_TEXT, partClass } from "./partClasses";

/**
 * The roll's box. Its geometry is the game's, not the stylesheet's: `KeysView`
 * writes `--keys-anchor`, `--keys-share` and `--rows` here from
 * `ROLL_ANCHOR`/`ROLL_SHARE` in `melody.ts` and from the chart's own rows, so the
 * staff lines and the playhead cannot drift from the notes.
 *
 * The staff lines are the box's own `::before`, across the band the roll
 * occupies. The view is one of the two things the run's entrance drops from the
 * top.
 */
const KEYS = [
  "keys relative flex-none h-full overflow-hidden [container-type:size]",
  "before:pointer-events-none before:absolute before:inset-[0_0_calc(100%_-_var(--keys-share))_0] before:content-['']",
  "before:bg-[repeating-linear-gradient(to_top,transparent_0,transparent_calc(100%/var(--rows)_-_1px),rgba(250,250,244,0.12)_calc(100%/var(--rows)_-_1px),rgba(250,250,244,0.12)_calc(100%/var(--rows)))]",
  "animate-[lyrics-drop_var(--entrance-slide,650ms)_cubic-bezier(0.22,0.61,0.36,1)_var(--entrance-lead,1200ms)_both] motion-reduce:[animation-delay:0ms]",
].join(" ");

/** The "now" line: a fixed column the notes and words travel toward. It spans the
 *  whole box, because the words ride the same axis as the bars now. */
const PLAYHEAD =
  "keys__playhead absolute inset-y-0 left-[var(--keys-anchor)] z-[3] w-[2px] bg-[rgba(250,250,244,0.5)] [box-shadow:0_0_14px_rgba(250,250,244,0.35)]";

/** Where the voice is, at the playhead: a singer can see how close they are rather
 *  than only finding out afterwards. Sized in container units like everything else
 *  inside a panel, and only shown while something is heard. */
const PITCH =
  "keys__pitch pointer-events-none absolute left-[var(--keys-anchor)] top-0 z-[4] ml-[calc(clamp(0.45rem,2.6cqmin,1.2rem)/-2)] h-[clamp(0.45rem,2.6cqmin,1.2rem)] w-[clamp(0.45rem,2.6cqmin,1.2rem)] rounded-pill bg-yellow opacity-0 [box-shadow:0_0_0_2px_rgba(12,13,10,0.5)] transition-opacity duration-[120ms] ease-brand [transform:translateY(-50%)]";

/** One translated layer, so the roll moves as one — the words ride it too. */
const TRACK = "keys__track absolute inset-0 will-change-transform";

/**
 * One line's strip, on the roll's own layer: its words, placed at its own moment
 * and drawn for its own span, so the pitch and the reading stay together. The top
 * comes from the part's row in the band below the roll. A line still to be sung
 * rides its own approach fade, the way the lyric view always did; the moment it is
 * over stops it being lit.
 */
const LINE =
  "keys__line absolute z-[2] box-border flex items-center gap-[0.6cqmin] px-[0.8cqmin] font-display text-[clamp(0.7rem,3.4cqmin,1.5rem)] leading-[1.1] transition-[color] duration-300 ease-brand on-video";
const LINE_RESTING = "text-[rgba(250,250,244,0.4)]";
/** Above its neighbours, so a long line's words are never covered by the next
 *  line's as they pass. */
const LINE_SINGING = "z-[3] text-cream";

/** Which voice reads the line, in a duet: the words keep their own colour. */
const TAG =
  "keys__line__tag flex-none border-l-[3px] pl-[0.35em] font-mono text-[clamp(0.5rem,1.8cqmin,0.75rem)] font-bold tracking-[0.1em]";

/** The words themselves: the strip's whole width, so a line that is coming up and
 *  a line that is running out keep the same face. */
const WORDS = "keys__line__words inline-flex flex-nowrap gap-[0.32em]";

/** A typist on the part's words says their progress on the line, in the part's own
 *  colour: the words are where they type, not a separate card. */
const TYPING =
  "keys__line__typing flex-none font-mono text-[clamp(0.45rem,1.6cqmin,0.65rem)] font-bold tracking-[0.08em]";

/** A note is a bar for as long as it is held, so a voice holding on reads as one. */
const NOTE =
  "keys__note absolute z-[2] h-[clamp(0.32rem,1.6cqmin,0.85rem)] transition-[opacity,transform] duration-[160ms] ease-brand";

/** The ink outline every bar wears, and the glow a live one adds. */
const NOTE_OUTLINE = "[box-shadow:0_0_0_2px_rgba(12,13,10,0.45)]";
const NOTE_LIVE =
  "[box-shadow:0_0_0_2px_rgba(12,13,10,0.45),0_0_14px_rgba(250,250,244,0.6)]";

/** Both voices on the same note: one bar, split between them. */
const NOTE_SPLIT =
  "[background:linear-gradient(to_bottom,var(--part-0)_0_50%,var(--part-1)_50%_100%)]";

/**
 * A bar's face, its shadow and its motion for the state it is in.
 *
 * A bar stops short of the next note in its part rather than running into it, and
 * a freeform (spoken or rapped) word has no pitch and so no note here. The second
 * voice has square ends and the third is a pill, so the voices are told apart
 * without leaning on colour alone.
 *
 * Two singers on one bar, one hit and one miss, keep both part colours, dim a
 * little and are outlined in the miss colour: picking one singer's verdict would
 * tell the other player a lie about the note they just sang.
 */
function noteFace(part: number, shared: boolean, state: NoteState): string {
  const shape = shared ? "rounded-inner" : partClass(PART_SHAPE, part);
  const up = "[transform:translateY(-50%)]";
  if (state === "mixed") {
    return `rounded-inner opacity-[0.55] [box-shadow:inset_0_0_0_2px_var(--color-danger)] ${NOTE_SPLIT} ${up}`;
  }
  if (state === "miss") {
    return `${shape} [background:var(--color-danger)] ${NOTE_OUTLINE} ${up}`;
  }
  const fill = shared ? NOTE_SPLIT : partClass(PART_BAR, part);
  if (state === "live") {
    return `${shape} ${fill} ${NOTE_LIVE} ${up}`;
  }
  if (state === "hit") {
    // Shrink toward the note's own onset, so the bar does not slide off the
    // moment it belongs to.
    return `${shape} ${fill} origin-left opacity-25 ${NOTE_OUTLINE} [transform:translateY(-50%)_scale(0.8)]`;
  }
  return `${shape} ${fill} ${NOTE_OUTLINE} ${up}`;
}

/**
 * The keys view: the pitch roll the melody scrolls across, with the words
 * riding **the same layer** as the bars.
 *
 * A note is drawn as a bar for as long as it is held, so a part that holds on
 * reads as one. A bar stops short of the next note in its part, so two quick
 * notes are two bars rather than one long run of colour. There is no ribbon
 * between notes: a bar is the note.
 *
 * The words are not a line that sits below: they are mounted in the same
 * window, on the same axis and with the same transform, one strip per part.
 * A lyric line is placed at its own moment exactly as a bar is, with its own
 * span as its width, so a singer reads the words underneath the pitch they
 * belong to, at the pace the notes travel, in one place — instead of the
 * lyrics sitting still at the bottom while the roll moves on. A duet keeps
 * its rows, and a typist's progress rides on the same words (`TypeWord`).
 */
interface Props {
  /** How many of the words' players there are, for the chip. */
  words: number;
  height: number;
  track: Track;
  typing: MelodyTyping;
  /** The singers' own runs: what the roll draws, note by note. */
  singing: MelodySinging;
  level: TypingLevel;
  /** How far ahead of the audio clock the roll is drawn; drawing only. */
  visualLagMs: number;
}

/** How fast the roll travels: pixels of song per second. */
const PX_PER_SECOND = 150;

/**
 * The words' own mounted window, in ms of song, on either side of the anchor.
 *
 * The pitch roll's window is the notes' business — how many bars are on the
 * screen. The words ask their own: how much lyric does a reader want ahead to
 * see what is coming, and how much behind to see what was just sung. A little
 * of each, so a line still to start is on screen and fading up when it should
 * be, and one that has run out has scrolled away rather than staying on the
 * strip it was on.
 */
const LINES_BEFORE_MS = 1500;
const LINES_AFTER_MS = 6000;

/**
 * Where a part's strip sits, in the band the roll leaves the words: the top
 * of the box is the roll's (`ROLL_SHARE`), and the words' one strip per part
 * lives in the rest, so a duet reads two rows and a trio three.
 */
function partRowTop(part: number, parts: number): number {
  const top = ROLL_SHARE * 100;
  const band = 100 - top;
  const count = Math.max(1, parts);
  const slot = band / count;
  return top + slot * part + slot * 0.45;
}

export function KeysView({ words, height, track, typing, singing, level, visualLagMs }: Props) {
  const t = useT();
  const clock = useClock();
  const { mic } = useStageControls();
  const now = useClockMs(80);
  const { ref: sizeRef, size } = useElementSize<HTMLDivElement>();
  const melody = track.melody;
  const parts = melody.parts;
  const cursor = useRef<HTMLSpanElement | null>(null);

  // Seconds of song across the whole roll, scaled so a second is always about
  // the same distance on screen.
  const secondsAcross =
    size.width > 0 ? Math.min(14, Math.max(2.4, size.width / PX_PER_SECOND)) : 9;
  const scroll = useScrollTrack({
    axis: "x",
    secondsAcross,
    anchor: ROLL_ANCHOR,
    beforeMs: secondsAcross * ROLL_ANCHOR * 1000 + 400,
    afterMs: secondsAcross * (1 - ROLL_ANCHOR) * 1000 + 400,
    offsetMs: visualLagMs,
  });

  const mounted = useMemo(
    () => notesInWindow(melody.notes, scroll.fromMs, scroll.toMs),
    [melody.notes, scroll.fromMs, scroll.toMs],
  );
  // The singers' own verdicts, from the region above: what the roll draws is
  // what the run judged, whether that was a microphone or the simulator.
  const verdicts = singing.verdicts;
  // One bar per note, however many parts are on it.
  const bars = useMemo(() => rollNotes(mounted), [mounted]);
  // Where each note's part moves next, over the whole chart rather than the
  // window: the last note in the window still has to stop before the first
  // one outside it.
  const nextFor = useMemo(() => nextOnsets(melody.notes), [melody.notes]);
  /** The parts that actually have a singer: the others are not "missed". */
  // `singers` is a fresh array on every publish tick, so the memo is keyed on
  // a primitive: the parts themselves. Rebuilding it 12 times a second would
  // re-key every note in the melody for nothing.
  const sungPartsKey = singing.singers.map((singer) => singer.part).join(",");
  const sungParts = useMemo(
    () => new Set(sungPartsKey.split(",").filter(Boolean).map(Number)),
    [sungPartsKey],
  );
  /**
   * The note each bar's verdict belongs to, by place — the first sung note on
   * a moment and row. Built once for the melody rather than rescanned for
   * every bar the roll draws.
   */
  const sungByPlace = useMemo(
    () => sungNotesByPlace(melody.notes, sungParts),
    [melody.notes, sungParts],
  );
  // The chart says how many rows its roll has, so the view draws what the song
  // is rather than a constant of its own.
  const rows = track.melody.rows;
  const rowTop = (row: number) => rowCentre(row, rows, ROLL_SHARE);

  // The pitch being heard, placed where it would sit on the roll: the same
  // row maths as a note, so the two line up by construction.
  useEffect(() => {
    let shown: number | null = null;
    return clock.subscribe(() => {
      const node = cursor.current;
      if (!node) return;
      const midi = mic.midiRef.current;
      if (midi === null) {
        if (shown !== null) {
          shown = null;
          node.style.opacity = "0";
        }
        return;
      }
      // A row, in pixels: `top` is a layout property and this used to write it
      // every frame of a sung run. The cursor is out of flow and already has a
      // -50% transform, so one translate does the same job on the compositor.
      const row = rowCentre(midi - melody.rootMidi, rows, ROLL_SHARE);
      if (row === shown) return;
      shown = row;
      node.style.transform = `translateY(${(row / 100) * size.height}px) translateY(-50%)`;
      node.style.opacity = "1";
    });
  }, [clock, mic, melody.rootMidi, rows, size.height]);

  // The words on the same layer: every line the reader has at a glance, with
  // the span its strip is drawn for. The split is by part (`mountedLines`),
  // so a duet's two rows keep their own words and a line both sing shows in
  // both.
  const lineWindow = useMemo(
    () => linesInWindow(melody.lines, scroll.fromMs, scroll.toMs, ROLL_ANCHOR, LINES_BEFORE_MS, LINES_AFTER_MS),
    [melody.lines, scroll.fromMs, scroll.toMs],
  );
  const lineSpans = useMemo(
    () => mountedLines(melody.lines, parts),
    [melody.lines, parts],
  );

  // Which typist, if any, is on each part's words, so their progress rides
  // the words the same way a singer's note verdicts do.
  const typistForPart = useMemo(
    () => new Map(typing.typists.map((typist) => [typist.part, typist])),
    [typing.typists],
  );
  // The typists' own progress map, by part: the words read from it, not
  // from the singular reader.
  const wordsForPart = (part: number): Map<number, WordProgress> | undefined =>
    typing.words[part];

  return (
    <div
      className={KEYS}
      style={
        {
          height,
          "--rows": rows,
          // Published from the same constants the roll's own maths uses, so
          // the stylesheet's playhead and pitch cursor cannot drift from the
          // notes.
          "--keys-anchor": `${ROLL_ANCHOR * 100}%`,
          "--keys-share": `${ROLL_SHARE * 100}%`,
        } as CSSProperties
      }
      ref={sizeRef}
      role="group"
      aria-label={t("band.keysLabel")}
    >
      <span className="keys__chip chip z-[3]">
        {singing.singers.length > 0 && typing.typists.length > 0
          ? `${t("band.singers", { count: singing.singers.length })} · ${t(
              "band.typists",
              { count: typing.typists.length },
            )}`
          : singing.singers.length > 0
            ? t("band.singers", { count: singing.singers.length })
            : t("band.typists", { count: typing.typists.length || words })}
      </span>
      {onFreeform(mounted, now) ? (
        <span className="keys__badge chip chip-accent z-[3] [--chip-top:calc(1.6cqmin_+_2.4em)]">
          {t("band.freeform")}
        </span>
      ) : null}
      <span className={PLAYHEAD} aria-hidden="true" />
      {/* Where the voice is, against where the note is — written to the DOM
          from the frame loop, since a cursor that re-rendered would be a
          frame's worth of re-rendering. Hidden whenever nothing is heard. */}
      <span className={PITCH} ref={cursor} aria-hidden="true" />

      <div className={TRACK} ref={scroll.ref}>
        {/* A bar for as long as the note is held, stopping short of the next
            note in its part. Freeform words have no pitch, so no bar. */}
        {bars.map(({ note, parts: on }) => {
          if (note.row === null) return null;
          const nextTimes = on
            .map((part) => nextFor.get(`${part}:${note.timeMs}`))
            .filter((at): at is number => at !== undefined);
          const spanMs = barSpanMs(
            note,
            nextTimes.length > 0 ? Math.min(...nextTimes) : null,
          );
          const state = stateOf(note, now, verdicts, sungByPlace);
          return (
            <span
              key={`note-${note.id}`}
              className={[
                NOTE,
                noteFace(note.part, on.length > 1, state),
                on.length > 1 ? "is-shared" : `is-part-${note.part}`,
                `is-${state}`,
                note.hero ? "is-hero" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                left: `${scroll.position(note.timeMs)}%`,
                width: `${(spanMs / 1000 / secondsAcross) * 100}%`,
                top: `${rowTop(note.row)}%`,
              }}
            />
          );
        })}

        {/* The words on the same layer, one strip per part: placed at their
            own moment, with their own span as their width, so the roll's
            single transform carries them with the bars. A line the reader
            has not reached yet rides its own approach fade, the way the
            lyric view always did. */}
        {lineWindow.map((line) => {
          const partsOnLine =
            parts > 1
              ? line.parts.map((entry) => entry.part)
              : [0];
          return partsOnLine.map((part) => {
            const place = linePlace(line, part);
            const span = lineSpans.get(place);
            if (!span) return null;
            return (
              <LineStrip
                key={place}
                part={part}
                parts={parts}
                line={span.line}
                spanMs={span.spanMs}
                scroll={scroll}
                secondsAcross={secondsAcross}
                now={now}
                words={wordsForPart(part)}
                typist={typistForPart.get(part)}
                level={level}
              />
            );
          });
        })}
      </div>
    </div>
  );
}

/** One line's strip, on the roll's own layer: its words, and who is typing them. */
interface LineStripProps {
  part: number;
  parts: number;
  line: MelodyLine;
  spanMs: number;
  scroll: ReturnType<typeof useScrollTrack>;
  secondsAcross: number;
  now: number;
  /** What the typist(s) on this part's words have made of each, by moment. */
  words: Map<number, WordProgress> | undefined;
  typist: MelodyTyping["typists"][number] | undefined;
  level: TypingLevel;
}

function LineStrip({
  part,
  parts,
  line,
  spanMs,
  scroll,
  secondsAcross,
  now,
  words,
  typist,
  level,
}: LineStripProps) {
  // The words this line carries: which one the singer is on, and the carets
  // the typist has reached. A typist's progress rides the words, not a
  // separate read-out — the same words a singer reads.
  const wordIndex = activeWordIndex(line, now);
  // A line the reader has not reached yet fades up over its run-up, the way
  // the lyric view always worked; the moment it is over stops it being lit.
  const approaching = now < line.timeMs;
  const sounding = now >= line.timeMs && now < line.endMs;

  const classes = [LINE, `is-part-${part}`, sounding ? LINE_SINGING : LINE_RESTING];
  if (sounding) classes.push("is-active");
  if (approaching) classes.push("is-rising", "lyric-rising");

  return (
    <span
      className={classes.filter(Boolean).join(" ")}
      style={
        {
          left: `${scroll.position(line.timeMs)}%`,
          width: `${(spanMs / 1000 / secondsAcross) * 100}%`,
          top: `${partRowTop(part, parts)}%`,
          "--approach": approaching ? introProgress(line.timeMs, now) : undefined,
        } as CSSProperties
      }
      data-part={part}
    >
      {parts > 1 ? (
        <span className={`${TAG} ${partClass(PART_TEXT, part)}`}>{part + 1}</span>
      ) : null}
      <span className={WORDS}>
        {line.words.map((item, index) => (
          <span
            key={index}
            className={[
              "lyrics-view__word",
              index === wordIndex ? "word-active" : "",
              item.hero ? "word-hero" : "",
              index === wordIndex ? "is-active" : "",
              item.hero ? "is-hero" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <TypeWord
              text={item.text}
              level={level}
              progress={words?.get(item.timeMs)}
            />
            {index < line.words.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
      {typist ? (
        <span className={`${TYPING} ${partClass(PART_TEXT, part)}`} aria-hidden="true">
          {typist.hits}/{typist.total}
        </span>
      ) : null}
    </span>
  );
}

/** How a note reads while it is being sung: pending, live, hit or dropped.
 *
 * A long note is live for its whole length, because its verdict is taken
 * once its own span has passed — not at its onset. A note only has a verdict
 * on a part somebody is actually singing. In a duet where one voice has no
 * player, the other voice's notes must not turn red — that would be the game
 * marking a part nobody was asked to sing.
 */
function stateOf(
  note: MelodyNote,
  now: number,
  verdicts: Map<string, { hit: boolean }>,
  sungByPlace: ReadonlyMap<string, MelodyNote[]>,
): NoteState {
  if (now < note.timeMs - HIT_WINDOW_MS) return "pending";
  if (now <= judgedAt(note)) return "live";
  return placeVerdict(sungByPlace.get(notePlace(note)), now, verdicts, judgedAt);
}

/** Is a freeform word being delivered right now? Pitch is not judged on those. */
function onFreeform(notes: readonly MelodyNote[], now: number): boolean {
  return notes.some(
    (note) => note.row === null && isSounding(note.timeMs, note.lengthMs, now),
  );
}
