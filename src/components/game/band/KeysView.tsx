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
    return clock.subscribe(() => {
      const node = cursor.current;
      if (!node) return;
      const midi = mic.midiRef.current;
      if (midi === null) {
        node.style.opacity = "0";
        return;
      }
      node.style.top = `${rowCentre(midi - melody.rootMidi, rows, ROLL_SHARE)}%`;
      node.style.opacity = "1";
    });
  }, [clock, mic, melody.rootMidi, rows]);

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
      className="keys"
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
      <span className="keys__chip">
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
        <span className="keys__badge">{t("band.freeform")}</span>
      ) : null}
      <span className="keys__playhead" aria-hidden="true" />
      {/* Where the voice is, against where the note is — written to the DOM
          from the frame loop, since a cursor that re-rendered would be a
          frame's worth of re-rendering. Hidden whenever nothing is heard. */}
      <span className="keys__pitch" ref={cursor} aria-hidden="true" />

      <div className="keys__track" ref={scroll.ref}>
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
          return (
            <span
              key={`note-${note.id}`}
              className={[
                "keys__note",
                on.length > 1 ? "is-shared" : `is-part-${note.part}`,
                `is-${stateOf(note, now, verdicts, sungByPlace)}`,
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

  const classes = ["keys__line", `is-part-${part}`];
  if (sounding) classes.push("is-active");
  if (approaching) classes.push("is-rising");

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
      {parts > 1 ? <span className="keys__line__tag">{part + 1}</span> : null}
      <span className="keys__line__words">
        {line.words.map((item, index) => (
          <span
            key={index}
            className={[
              "lyrics-view__word",
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
        <span className="keys__line__typing" aria-hidden="true">
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
  sungByPlace: ReadonlyMap<string, MelodyNote>,
): NoteState {
  if (now < note.timeMs - HIT_WINDOW_MS) return "pending";
  if (now <= judgedAt(note)) return "live";
  // A shared note has one entry per part; the first sung one is the verdict
  // that belongs to the bar.
  const sung = sungByPlace.get(notePlace(note));
  if (!sung) return "pending";
  return verdicts.get(sung.id)?.hit ? "hit" : "miss";
}

/** Is a freeform word being delivered right now? Pitch is not judged on those. */
function onFreeform(notes: readonly MelodyNote[], now: number): boolean {
  return notes.some(
    (note) => note.row === null && isSounding(note.timeMs, note.lengthMs, now),
  );
}
