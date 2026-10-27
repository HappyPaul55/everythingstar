import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useT } from "../../../i18n/react";
import { hopoTappable, type LaneRun } from "../../../lib/game/lanes";
import type { ControllerLabels } from "../../../lib/game/controls/plan";
import { HIT_WINDOW_MS } from "../../../lib/game/scoring";
import type { HighwayView, NoteStyle } from "../../../lib/game/settings";
import {
  INSTRUMENTS,
  isKick,
  KICK_COLUMN,
  type LaneChart,
  type LaneNote,
  type NoteState,
} from "../../../lib/game/track";
import {
  arrowFor,
  HIT_BURST_MS,
  heldColumns,
  hitBursts,
  noteBox,
  noteClasses,
  noteColumnBox,
  noteGlyph,
  noteWindowSeconds,
  type ArrowGlyph,
} from "../../../lib/game/band/notes";
import { notesInWindow, beatsInWindow } from "../../../lib/game/scroll";
import { useClock, useClockMs } from "./StageClock";
import { useScrollTrack } from "./useScrollTrack";

/**
 * The note highway inside a player panel: notes fall to the hit line and are hit
 * there.
 *
 * A highway note is a **button** — it is hit where it lands, it does not slide —
 * so the highway carries no ribbons; only the voice does. Every note is a span and
 * a **face**: the skin (`NoteStyle`) decides whether the face is a bar, a rounded
 * gem or an arrow, and everything else a note can be is a channel of its own: an
 * open note spans the highway, a sustain has a tail, a hero note wears a border,
 * and a hopo wears a white face while it can be hammered on. The **bottom of the
 * span is the head** (`noteBox`), so a plain note and the head of a sustain at the
 * same moment meet the hit line together; the body stands above it, where the song
 * is going.
 *
 * The highway is a **neck**, and it is drawn two ways (see `HighwayView`): `flat`,
 * face-on, and `3d`, the same board tilted into perspective so its columns converge
 * toward the song. The tilt is pure CSS — `perspective` on the frame, one `rotateX`
 * on the deck — so nothing here changes what a note *is*; and because the whole deck
 * is one plane, a note being **held** is shown by its own brightness and size, while
 * a note that **lands** leaves the neck and puts its burst on the hit line. A miss
 * keeps its place there in red: nothing on the neck moves to say how it went.
 *
 * Nothing here re-renders per frame: the notes sit at fixed positions and the
 * track's transform carries them, so a frame is one style write. Only the mounted
 * window, the held pads, the judged states and the short-lived bursts involve React.
 * A note face is one span and (when it has one) one inline arrow — never an image, a
 * canvas or a filter that has to be repainted on a frame.
 */
interface Props {
  chart: LaneChart;
  run: LaneRun;
  /**
   * Which columns are held down right now. A pad **is** the fret under it, so
   * holding one fills it — and **only** the player's hand ever does: a note
   * landing or being struck is the note's own treatment, never the pad's.
   */
  held: readonly boolean[];
  /**
   * What this seat's controller asks for, column by column. The first few notes
   * wear these labels and the hit line names its strum; after `KEY_HINT_HITS`
   * notes they step aside. `null` for a machine seat or a controller that has no
   * keys to name.
   */
  labels?: ControllerLabels | null;
  /**
   * Whether this is the player's first run. The labels are a lesson, so a seat
   * that has already had one never sees them again — even if this run is a replay.
   */
  firstRun?: boolean;
  /** Which way the neck is drawn. */
  view: HighwayView;
  /** What a note's face looks like: a bar, a gem or an arrow. Drawing only. */
  noteStyle: NoteStyle;
  /**
   * How fast the notes travel, as a multiplier on the neck's own run-up. Higher is
   * less song across the neck at once. It is drawing only: the chart, the clock and
   * the judging never see it.
   */
  noteSpeed: number;
  /**
   * How far ahead of the audio clock the neck is drawn, in ms (`visualLagMs`).
   * Positive is a display that lags the sound. It moves the scrolling layer and
   * its mounted window only; the hit line, the run and the judging are untouched.
   */
  visualLagMs: number;
  /**
   * Whether the hit markers are **controls**: a tap plays the note above the pad,
   * and holding one holds a sustain. It is the phone's way in, and it changes
   * nothing about a key or a gamepad.
   */
  tap: boolean;
  /** A finger landed on a pad. Goes straight to this panel's own run. */
  onTapDown: (column: number, eventTimeMs?: number) => void;
  /** The finger left the pad. */
  onTapUp: (column: number) => void;
}

/** Where the hit line sits: low on the neck, with only the flash room beneath it. */
const HIT_FRACTION = 0.95;
/** How long a judged note stays mounted below the hit line, so it can flash. */
const BEHIND_MS = 700;
/**
 * How many notes a player lands before the first-run key labels step aside.
 * Enough to find the frets, few enough that they never become part of the chart.
 */
const KEY_HINT_HITS = 8;
/** The shortest a tap is drawn; a hold adds its own length to this. */
const TAP_FLAT = 4;
/**
 * A tilted deck is scaled up to fill the frame, so a tap has to be proportionally
 * shorter to land at the same size on screen.
 */
const TAP_3D = 1.5;
/**
 * How soon after a pad release a click is that press's compatibility click rather
 * than a fresh activation. Long enough for a browser's delayed click, short enough
 * that an assisted click made later is still a tap of its own.
 */
const TAP_CLICK_MS = 1000;

/**
 * The turn, in degrees clockwise, from an **up** arrow to each glyph. Compass names
 * live in `notes.ts`; this is the one place they become geometry, so a face never
 * depends on a font carrying a character.
 */
const ARROW_ANGLES: Record<ArrowGlyph, number | null> = {
  up: 0,
  "up-right": 45,
  right: 90,
  "down-right": 135,
  down: 180,
  "down-left": 225,
  left: 270,
  "up-left": 315,
  dot: null,
};

/**
 * One arrow, drawn once and turned. The path is a chunky arrow on a 24-unit grid,
 * so it stays crisp at a bar's size and at a whole face's, and its casing is the
 * SVG's own stroke — no second layer, no image and no text to load.
 */
function ArrowMark({ glyph, className }: { glyph: ArrowGlyph; className: string }) {
  const angle = ARROW_ANGLES[glyph];
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {angle === null ? (
        <circle cx="12" cy="12" r="6" />
      ) : (
        <path
          d="M12 2.5 21 12h-5.5v9.5h-7V12H3Z"
          transform={angle === 0 ? undefined : `rotate(${angle} 12 12)`}
        />
      )}
    </svg>
  );
}

export function Highway({
  chart,
  run,
  held,
  labels = null,
  firstRun = false,
  view,
  noteStyle,
  noteSpeed,
  visualLagMs,
  tap,
  onTapDown,
  onTapUp,
}: Props) {
  const t = useT();
  const now = useClockMs(80);
  /**
   * The first few notes are a lesson, not a chart: each carries the control that
   * plays it, and the line carries the strum. The moment `run.hits` reaches
   * `KEY_HINT_HITS` the labels go — the player has found the keys, and the song
   * should be read as notes rather than as a keyboard.
   *
   * The lesson is per run of the component: a replay or a restart inside the same
   * stage does not bring it back after it has been earned.
   */
  const [hintsDone, setHintsDone] = useState(false);
  useEffect(() => {
    if (run.hits >= KEY_HINT_HITS) setHintsDone(true);
  }, [run.hits]);
  const teach =
    firstRun && labels !== null && !hintsDone && run.hits < KEY_HINT_HITS;
  /**
   * The label for a note: its column's control, or the strum for an open note.
   * A dance mat draws its controls as arrows already, so it needs no second name.
   */
  const keyFor = (note: LaneNote): string | null => {
    if (!teach || !labels || labels.family === "dance") return null;
    return note.column === null ? labels.strum : labels.frets[note.column] ?? null;
  };
  /**
   * The strikes that are still lighting the line. The note itself is taken off the
   * neck the moment it lands; this is what says where it landed, and it stands on
   * the line rather than travelling with the song.
   */
  const bursts = hitBursts(run.hitTimes, now, HIT_BURST_MS, run.cursor - 1);
  const secondsAcross = noteWindowSeconds(view, noteSpeed);
  const tapHeight = view === "3d" ? TAP_3D : TAP_FLAT;
  const track = useScrollTrack({
    axis: "y",
    secondsAcross,
    anchor: HIT_FRACTION,
    // The highway only needs a little of the past mounted (just below the hit
    // line); most of the window is the run-up above it.
    beforeMs: BEHIND_MS,
    afterMs: HIT_FRACTION * secondsAcross * 1000 + 300,
    offsetMs: visualLagMs,
  });

  const columns = chart.columns;
  const kit = INSTRUMENTS[chart.instrument].kit;
  /** The drum kit's pedal column, so the neck can say which one is under the foot. */
  const kickColumn = chart.instrument === "drums" ? KICK_COLUMN : null;
  /**
   * The hit line's markers are arrows when the instrument is a mat **or** the skin
   * is arrows: a note that is a direction lands on a marker that is one too. They
   * stay inside the pad's full-column target, so a five-column board on a phone is
   * still playable.
   */
  const arrows = kit.hitMarker === "arrows" || noteStyle === "arrows";
  /**
   * The pads a finger is on **right now**. The run publishes its own held set on a
   * throttle, which is fine for the score rail and a little late for a pad: a hand
   * on a touch screen should light its own colour on the press, not up to a frame
   * batch later. This is the pad's own immediate light; the run still owns the hold.
   */
  const [pressed, setPressed] = useState<boolean[]>(() =>
    Array.from({ length: columns }, () => false),
  );
  const clock = useClock();
  /** Which pointer is on which column, so two fingers on one pad let go together. */
  const pointers = useRef(new Map<number, number>());
  /**
   * When each pad was last released by a pointer. A browser may follow a pointerup
   * with a compatibility click, and some report that click with `detail` 0 — the
   * same shape as a keyboard or assistive activation. Remembering the release means
   * a press is never counted twice, without swallowing an assisted click made later.
   */
  const pointerTaps = useRef(new Map<number, number>());

  useEffect(() => {
    // A board that changed its column count takes its pads with it, so a pointer
    // holding one can never deliver its own pointerup. Every column still held is
    // let go before the map is forgotten — otherwise `useLaneRun.touched` keeps it
    // down for the rest of the run, holding a sustain nobody is pressing.
    const stillHeld = new Set(pointers.current.values());
    pointers.current.clear();
    pointerTaps.current.clear();
    for (const column of stillHeld) onTapUp(column);
    setPressed((current) =>
      stillHeld.size === 0 && current.length === columns
        ? current
        : Array.from({ length: columns }, () => false),
    );
  }, [columns, onTapUp]);

  const holdPad = (pointerId: number, column: number, eventTimeMs?: number) => {
    const wasDown = [...pointers.current.values()].includes(column);
    pointers.current.set(pointerId, column);
    if (wasDown) return;
    // The press itself is an input only while the stage is moving: `useLaneRun`
    // refuses a tap on a paused stage, so lighting the pad here would leave a
    // light on for a press nobody judged. The pointer is still remembered, so its
    // release is the ordinary one and any compatibility click it brings is
    // swallowed as usual.
    if (!clock.playing) return;
    setPressed((current) => {
      if (current[column]) return current;
      const next = current.slice();
      next[column] = true;
      return next;
    });
    onTapDown(column, eventTimeMs);
  };

  /** Let a pointer go, and say which column it was on. */
  const releasePad = (pointerId: number): number | null => {
    const column = pointers.current.get(pointerId);
    if (column === undefined) return null;
    pointers.current.delete(pointerId);
    if ([...pointers.current.values()].includes(column)) return column;
    setPressed((current) => {
      if (!current[column]) return current;
      const next = current.slice();
      next[column] = false;
      return next;
    });
    onTapUp(column);
    return column;
  };

  const padDown = (column: number) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    // The pad is the input: no focus, no text selection, no page scroll, and no
    // compatibility click. Capturing the pointer means a finger that slides off
    // still lets the pad go rather than leaving a sustain held for ever.
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is best effort; the run still got the tap.
    }
    holdPad(event.pointerId, column, event.timeStamp);
  };

  /** A pointerup, which a compatibility click may follow. */
  const padUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const column = releasePad(event.pointerId);
    if (column !== null) pointerTaps.current.set(column, performance.now());
  };

  /** A cancelled or lost pointer produces no click, so it leaves no click to swallow. */
  const padCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    releasePad(event.pointerId);
  };

  // A pad is not a menu button: it must not make the UI's click sound, and it must
  // not take a click's focus. The press itself was the sound of playing. A click
  // with no pointer behind it is a keyboard or assistive activation, and is played
  // as one quick tap — that is the pad's whole gesture. A pointer's own click is
  // the one the press already handled, whatever `detail` the browser gives it.
  const padClick =
    (column: number) => (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const releasedAt = pointerTaps.current.get(column);
      pointerTaps.current.delete(column);
      const fromPointer =
        releasedAt !== undefined && performance.now() - releasedAt < TAP_CLICK_MS;
      if (fromPointer || event.detail !== 0) return;
      onTapDown(column, event.timeStamp);
      onTapUp(column);
    };
  const mounted = useMemo(
    () => notesInWindow(chart.notes, track.fromMs, track.toMs),
    [chart.notes, track.fromMs, track.toMs],
  );
  /** Which columns the pads are holding: the frets under the player's fingers. */
  const down = useMemo(() => heldColumns(held, columns), [held, columns]);
  /**
   * The beat grid under the notes. It is anchored to **song time**, so the lines are
   * in step with the music as the mounted window slides rather than drifting with it,
   * and it is only mounted for the window the notes are — a bar line a minute away is
   * not worth a node.
   */
  const beatMs = typeof chart.bpm === "number" && chart.bpm > 0 ? 60000 / chart.bpm : null;
  const beats = useMemo(
    () => (beatMs === null ? [] : beatsInWindow(beatMs, track.fromMs, track.toMs)),
    [beatMs, track.fromMs, track.toMs],
  );

  /** Where each note sits in the chart, so its judged outcome can be read. */
  const indexOf = useMemo(() => {
    const map = new Map<string, number>();
    chart.notes.forEach((note, index) => map.set(note.id, index));
    return map;
  }, [chart.notes]);
  const box = (note: LaneNote) =>
    noteBox(
      track.position(note.timeMs),
      track.position(note.timeMs + note.lengthMs),
      tapHeight,
    );
  /**
   * The chart's **fills** that touch the mounted window. A fill is a span like a
   * sustain's, placed on the same axis with the same maths, so it scrolls with the
   * notes rather than sitting still behind them; one element per mounted fill, and
   * a fill a minute away is not worth a node. Held against the window, so the
   * filter and the boxes cost nothing until the window (or the chart) moves.
   */
  const fills = useMemo(
    () =>
      (chart.fills ?? [])
        .filter((fill) => fill.endMs >= track.fromMs && fill.startMs <= track.toMs)
        .map((fill) => ({
          key: `${fill.startMs}-${fill.endMs}`,
          ...noteBox(
            track.position(fill.startMs),
            track.position(fill.endMs),
            0,
          ),
        })),
    [chart.fills, track.fromMs, track.toMs, secondsAcross],
  );
  /** A hopo may be tapped while its chain holds — and its ring follows that. */
  const hammered = (note: LaneNote) =>
    note.kind === "hopo" && hopoTappable(chart, run, indexOf.get(note.id) ?? -1);

  return (
    <div
      className={`highway highway--${view} highway--notes-${noteStyle}${
        arrows ? " highway--markers-arrows" : ""
      }${tap ? " highway--tap" : ""}`}
      style={
        {
          "--columns": columns,
          "--hit-fraction": HIT_FRACTION,
          "--tap": tapHeight,
        } as CSSProperties
      }
      role={tap ? "group" : "img"}
      aria-label={t("band.highway")}
    >
      <div className="highway__deck">
        <div className="highway__columns" aria-hidden="true">
          {Array.from({ length: columns }, (_, column) => (
            <span key={column} className="highway__column" />
          ))}
        </div>

        <div className="highway__track" ref={track.ref}>
          {/* A fill is drawn under the notes: a band across the neck that moves
              with them, saying "play freely here" without being something to hit. */}
          {fills.map((fill) => (
            <span
              key={fill.key}
              className="highway__fill"
              style={{ top: `${fill.top}%`, height: `${fill.height}%` }}
              aria-hidden="true"
            >
              <span className="highway__fill-label">{t("band.fill")}</span>
            </span>
          ))}
          {/* The beat grid, under everything: a line a beat, a brighter one a bar. */}
          {beats.map((beat) => (
            <span
              key={beat.timeMs}
              className={beat.bar ? "highway__beat is-bar" : "highway__beat"}
              style={{ top: `${track.position(beat.timeMs)}%` }}
            />
          ))}
          {mounted.map((note) => {
            const index = indexOf.get(note.id) ?? -1;
            const state = stateOf(note, run, index, now);
            const holding = run.holding.includes(index);
            // A note that has landed is **gone**. A hold is the one exception: its
            // tail is the hold, so it stays while the fret is down and goes when it
            // is let go. Nothing is left behind sliding out of the line.
            if (state === "hit" && !holding) return null;
            const classes = noteClasses(note, {
              state,
              hammered: hammered(note),
              held: holding,
              kick: isKick(note, chart.instrument),
            });
            const glyph = noteGlyph(
              noteStyle,
              chart.instrument,
              note.column,
              columns,
            );
            // An open note is drawn across the whole highway; any other note takes
            // its own column, so the two notes of a chord stand side by side.
            const across = noteColumnBox(note.column, columns);
            const { top, height } = box(note);
            const key = keyFor(note);
            const style: CSSProperties = {
              left: `${across.left}%`,
              width: `${across.width}%`,
              top: `${top}%`,
              height: `${height}%`,
            };
            return (
              <span
                key={note.id}
                className={classes.join(" ")}
                style={style}
                data-note={note.id}
              >
                <span className="highway__face" aria-hidden="true">
                  {glyph ? <ArrowMark glyph={glyph} className="highway__glyph" /> : null}
                </span>
                {key ? (
                  <span className="highway__key" aria-hidden="true">
                    {key}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>

        {/* The strike: one burst per note that just landed, standing **above** the
            pad it was played on. It is drawn outside the track, on the line itself,
            so the song moves on without it and the burst does not slide away with
            the note it answers. Decorative, and it reads the run's own hit times.
            An open note spans the neck, so its burst does too. */}
        <div className="highway__bursts" aria-hidden="true">
          {bursts.map(({ index, atMs }) => {
            const note = chart.notes[index];
            if (!note) return null;
            const across = noteColumnBox(note.column, columns);
            const classes = ["highway__burst"];
            if (note.column === null) classes.push("is-open");
            else classes.push(`is-column-${note.column % 5}`);
            if (isKick(note, chart.instrument)) classes.push("is-kick");
            return (
              <span
                key={`${index}:${atMs}`}
                className={classes.join(" ")}
                style={{ left: `${across.left}%`, width: `${across.width}%` }}
              />
            );
          })}
        </div>

        {/* The far end of a tilted neck is dimmed, so a small note up there reads as
            distance rather than as a small note. Decorative, and above the notes. */}
        <div className="highway__fog" aria-hidden="true" />

        {/* The pads the notes land on: one per column, filled by the fret held on
            it and by nothing else — the hand on the line, never the note. With tap
            on they are also the **controls**: a press plays the note above the pad,
            because on a phone there is no strum bar to reach for. An arrow marker
            keeps the pad's full-column target and draws its direction inside it, so
            a mat's four and a five-column neck are hit the same way. */}
        <div className="highway__hit" aria-hidden={tap ? undefined : true}>
          {Array.from({ length: columns }, (_, column) => {
            const lit = down[column] || pressed[column];
            const kick = column === kickColumn;
            const label = kick ? t("band.kick") : t("band.column", { n: column + 1 });
            const className = `highway__pad is-column-${column % 5}${
              kick ? " is-kick" : ""
            }${arrows ? " highway__pad--arrow" : ""}${lit ? " is-held" : ""}`;
            // A dance mat's arrow **is** the control, so it keeps its glyph even
            // while the other instruments are naming their keys. A guitar with an
            // arrow skin gets the key instead for these first notes: the note above
            // already says the direction.
            const hint =
              teach && labels && labels.family !== "dance"
                ? labels.frets[column] ?? null
                : null;
            const mark = arrows && !hint ? (
              <ArrowMark
                glyph={arrowFor(column, columns)}
                className="highway__pad-glyph"
              />
            ) : null;
            return tap ? (
              <button
                key={column}
                type="button"
                className={className}
                aria-label={label}
                tabIndex={-1}
                draggable={false}
                onPointerDown={padDown(column)}
                onPointerUp={padUp}
                onPointerCancel={padCancel}
                onLostPointerCapture={padCancel}
                onClick={padClick(column)}
                onContextMenu={(event) => event.preventDefault()}
              >
                {hint ? (
                  <span className="highway__pad-key" aria-hidden="true">
                    {hint}
                  </span>
                ) : (
                  mark
                )}
              </button>
            ) : (
              <span key={column} className={className}>
                {hint ? (
                  <span className="highway__pad-key" aria-hidden="true">
                    {hint}
                  </span>
                ) : (
                  mark
                )}
              </span>
            );
          })}
        </div>
      </div>
      {/* The strum is the one control a falling note cannot carry: an open note
          has no column, and a hopo may not need a strum at all. This is the line's
          own caption for the first few notes, outside the tilted deck so it stays
          flat while the neck recedes. */}
      {teach && labels?.strum ? (
        <div className="highway__coach" aria-hidden="true">
          <span className="highway__coach-keys">{labels.strum}</span>
          <span className="highway__coach-word">{t("band.strum")}</span>
        </div>
      ) : null}
    </div>
  );
}

function stateOf(
  note: LaneNote,
  run: LaneRun,
  index: number,
  now: number,
): NoteState {
  const outcome = index >= 0 ? run.outcomes[index] : undefined;
  if (outcome === "hit") return "hit";
  if (outcome === "miss") return "miss";
  if (now >= note.timeMs - HIT_WINDOW_MS && now <= note.timeMs + HIT_WINDOW_MS) {
    return "live";
  }
  return "pending";
}
