import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useT } from "../../i18n/react";
import { columnCentre, noteBox, noteColumnBox } from "../../lib/game/band/notes";
import { slideRibbon } from "../../lib/game/band/slides";
import { notesInWindow } from "../../lib/game/scroll";
import type { CharterChart } from "../../lib/game/charter/edit";
import type { LaneNote } from "../../lib/game/track";
import { chartLabel } from "../../lib/game/charter/edit";
import { gridLines, snapMs, type CharterGrid } from "../../lib/game/charter/grid";
import { useClock } from "../game/band/StageClock";
import { useScrollTrack } from "../game/band/useScrollTrack";

/** Where the playhead sits in a pane: low, with the song rising above it. */
const PANE_ANCHOR = 0.76;

/** The five fret colours, in the order a chart's columns take them. */
const FRET_BG = ["bg-note-0", "bg-note-1", "bg-note-2", "bg-note-3", "bg-note-4"] as const;

/** The dot beside a pane's name names its instrument as well as its chart. */
const INSTRUMENT_BG: Record<string, string> = {
  guitar: "bg-instrument-guitar",
  bass: "bg-instrument-bass",
  drums: "bg-instrument-drums",
  keys: "bg-instrument-keys",
  dance: "bg-instrument-dance",
};

export interface PanelDrag {
  chartKey: string;
  deltaMs: number;
  deltaColumns: number;
}

interface Props {
  chart: CharterChart;
  active: boolean;
  selected: ReadonlySet<string>;
  grid: CharterGrid;
  zoom: number;
  drag: PanelDrag | null;
  /** Notes a take has heard but not yet committed. */
  take?: readonly LaneNote[];
  onActivate: (chartKey: string) => void;
  onSelect: (chartKey: string, id: string, additive: boolean) => void;
  onSelectAll: (chartKey: string) => void;
  onAdd: (chartKey: string, timeMs: number, column: number) => void;
  onDrag: (drag: PanelDrag | null) => void;
  onMove: (chartKey: string, deltaMs: number, deltaColumns: number) => void;
}

/**
 * One chart's 2D pane.
 *
 * The layer is the game's own scrolling track, face-on: notes are mounted around
 * the playhead and one transform carries them, so the panel costs a single style
 * write a frame. A note is a button-shaped span; the charter clicks the pane to
 * add one, drags a note to move it, and drags over empty cells to paint.
 */
export function CharterPanel({
  chart,
  active,
  selected,
  grid,
  zoom,
  drag,
  take = [],
  onActivate,
  onSelect,
  onSelectAll,
  onAdd,
  onDrag,
  onMove,
}: Props) {
  const t = useT();
  const clock = useClock();
  const body = useRef<HTMLDivElement>(null);
  const track = useScrollTrack({
    axis: "y",
    secondsAcross: zoom,
    anchor: PANE_ANCHOR,
    beforeMs: 1200,
    afterMs: zoom * 1000 + 1200,
  });
  /** The pane's layout size: a slide band is a rotated box, so it needs pixels. */
  const [trackSize, setTrackSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = track.ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setTrackSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [track.ref]);
  const notes = notesInWindow(chart.notes, track.fromMs, track.toMs);
  const lines = gridLines(track.fromMs, track.toMs, grid);
  const dragging = drag?.chartKey === chart.key;
  const pointer = useRef<{
    mode: "move" | "paint";
    pointerId: number;
    startTime: number;
    startColumn: number;
    lastCell: string;
  } | null>(null);

  const point = (event: ReactPointerEvent): { timeMs: number; column: number } | null => {
    const element = body.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const column = Math.max(0, Math.min(chart.columns - 1, Math.floor(x * chart.columns)));
    // The playhead is at `PANE_ANCHOR`; a point above it is a moment later in the
    // song. The layer's own transform has already carried the notes, so this is
    // the inverse of the visible axis rather than of the window.
    const timeMs = clock.timeRef.current + (PANE_ANCHOR - y) * zoom * 1000;
    return { timeMs: snapMs(Math.max(0, timeMs), grid), column };
  };

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    onActivate(chart.key);
    const at = point(event);
    if (!at) return;
    const noteElement = (event.target as HTMLElement).closest<HTMLElement>("[data-note-id]");
    if (noteElement) {
      const id = noteElement.dataset.noteId;
      if (!id) return;
      onSelect(chart.key, id, event.shiftKey);
      pointer.current = {
        mode: "move",
        pointerId: event.pointerId,
        startTime: at.timeMs,
        startColumn: at.column,
        lastCell: "",
      };
    } else {
      onAdd(chart.key, at.timeMs, at.column);
      pointer.current = {
        mode: "paint",
        pointerId: event.pointerId,
        startTime: at.timeMs,
        startColumn: at.column,
        lastCell: `${at.timeMs}:${at.column}`,
      };
    }
    body.current?.setPointerCapture(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = pointer.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const at = point(event);
    if (!at) return;
    if (current.mode === "move") {
      onDrag({
        chartKey: chart.key,
        deltaMs: Math.round(at.timeMs - current.startTime),
        deltaColumns: at.column - current.startColumn,
      });
      return;
    }
    const cell = `${at.timeMs}:${at.column}`;
    if (cell === current.lastCell) return;
    current.lastCell = cell;
    onAdd(chart.key, at.timeMs, at.column);
  };

  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = pointer.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.mode === "move" && drag?.chartKey === chart.key) {
      onMove(chart.key, drag.deltaMs, drag.deltaColumns);
    }
    pointer.current = null;
    onDrag(null);
    if (body.current?.hasPointerCapture(event.pointerId)) {
      body.current.releasePointerCapture(event.pointerId);
    }
  };

  const offset = dragging ? drag : null;
  const shown = notes.map((note) => {
    const moved = offset && selected.has(note.id);
    const timeMs = Math.max(0, note.timeMs + (moved ? offset.deltaMs : 0));
    const column =
      note.column === null || !moved
        ? note.column
        : Math.max(0, Math.min(chart.columns - 1, note.column + offset.deltaColumns));
    return { note, timeMs, column };
  });

  // The links this pane can show, from the source's tail to the target's head —
  // the same two points the stage glides between. A link outside the mounted
  // window is not drawn, so a long chart costs the pane only what is on screen.
  const byId = new Map(chart.notes.map((note) => [note.id, note]));
  const slides = chart.notes.flatMap((note) => {
    const target = note.slideTo === undefined ? undefined : byId.get(note.slideTo);
    if (!target || note.column === null || target.column === null) return [];
    const startMs = note.timeMs + Math.max(0, note.lengthMs);
    if (target.timeMs < track.fromMs || startMs > track.toMs) return [];
    return [{
      key: note.id,
      ribbon: slideRibbon(
        { x: columnCentre(note.column, chart.columns), y: track.position(startMs) },
        { x: columnCentre(target.column, chart.columns), y: track.position(target.timeMs) },
        trackSize,
      ),
    }];
  });

  return (
    <section
      className={[
        "charter-pane",
        active && "is-active border-yellow shadow-[inset_0_0_0_1px_var(--color-yellow)]",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={chartLabel(chart)}
    >
      <header
        className={[
          "flex min-h-[1.55rem] items-center gap-[0.35rem] border-b border-line-ink bg-[rgba(251,251,243,0.03)] px-[0.35rem] py-[0.15rem]",
          active && "bg-[rgba(255,212,0,0.1)]",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          type="button"
          className="charter-pane__name flex min-w-0 cursor-pointer items-center gap-[0.3rem] overflow-hidden border-0 bg-transparent font-mono text-[0.54rem] font-bold tracking-[0.03em] whitespace-nowrap text-cream uppercase text-ellipsis"
          onClick={() => onActivate(chart.key)}
        >
          <span
            className={`size-[0.34rem] flex-none rounded-full ${INSTRUMENT_BG[chart.instrument] ?? "bg-accent"}`}
            data-instrument={chart.instrument}
          />
          {chartLabel(chart)}
        </button>
        <span className="ml-auto font-mono text-[0.5rem] whitespace-nowrap text-[rgba(251,251,243,0.66)]">
          {chart.notes.length} {t("charter.notes")}
        </span>
        {active ? (
          <span className="font-mono text-[0.48rem] text-yellow uppercase">
            {t("charter.active")}
          </span>
        ) : null}
      </header>
      <div
        ref={body}
        className="charter-pane__body relative min-h-0 flex-1 cursor-crosshair touch-none overflow-hidden outline-none focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-yellow"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onDoubleClick={() => onSelectAll(chart.key)}
        role="application"
        aria-label={`${chartLabel(chart)} highway`}
        tabIndex={0}
      >
        <div className="absolute inset-0" aria-hidden="true">
          {Array.from({ length: chart.columns }, (_, index) => (
            <span
              key={index}
              className="absolute inset-y-0 border-r border-[rgba(251,251,243,0.045)]"
              style={{ left: `${(index / chart.columns) * 100}%`, width: `${100 / chart.columns}%` }}
            />
          ))}
        </div>
        <div ref={track.ref} className="absolute inset-0">
          {lines.map((line) => (
            <span
              key={`g-${line.timeMs}`}
              className={[
                "absolute inset-x-0 h-px",
                line.bar
                  ? "bg-[rgba(251,251,243,0.26)]"
                  : line.beat
                    ? "bg-[rgba(251,251,243,0.12)]"
                    : "bg-[rgba(251,251,243,0.055)]",
              ].join(" ")}
              style={{ top: `${track.position(line.timeMs)}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {slides.map((slide) => (
              <div
                key={`slide-${slide.key}`}
                className={[
                  "absolute rounded-full border-[5px] border-[rgba(232,232,226,0.36)]",
                  slide.ribbon.side === "right"
                    ? "[clip-path:inset(50%_0_0_50%)]"
                    : "[clip-path:inset(50%_50%_0_0)]",
                ].join(" ")}
                style={{
                  left: `${slide.ribbon.left}px`,
                  top: `${slide.ribbon.top}px`,
                  width: `${slide.ribbon.width}px`,
                  height: `${slide.ribbon.height}px`,
                }}
              />
            ))}
          </div>
          {take.map((note) => {
            const head = track.position(note.timeMs);
            const tail = track.position(note.timeMs + note.lengthMs);
            const box = noteBox(head, tail, 1.2);
            const across = noteColumnBox(note.column, chart.columns);
            return (
              <span
                key={`take-${note.id}`}
                className="charter-note pointer-events-none border border-dashed border-yellow bg-transparent opacity-90"
                style={{
                  left: `${across.left}%`,
                  width: `${across.width}%`,
                  top: `${box.top}%`,
                  height: `${box.height}%`,
                }}
              />
            );
          })}
          {shown.map(({ note, timeMs, column }) => {
            const head = track.position(timeMs);
            const tail = track.position(timeMs + Math.max(0, note.lengthMs));
            const box = noteBox(head, tail, 1.2);
            const across = noteColumnBox(column, chart.columns);
            const classes = [
              "charter-note",
              column === null ? "bg-note-open opacity-85" : FRET_BG[column % 5],
              note.lengthMs > 0 && "rounded-b-[3px] opacity-90",
              note.kind === "hopo" && "outline outline-1 -outline-offset-1 outline-cream/90",
              note.hero
                ? "shadow-[0_0_0_2px_var(--color-cream),0_0_8px_rgba(255,212,0,0.5)]"
                : "shadow-[0_1px_0_rgba(0,0,0,0.35)]",
              selected.has(note.id) && "z-2 outline-2 outline-dashed outline-cream outline-offset-1",
              dragging && "cursor-grabbing",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <span
                key={note.id}
                data-note-id={note.id}
                className={classes}
                style={{
                  left: `${across.left}%`,
                  width: `${across.width}%`,
                  top: `${box.top}%`,
                  height: `${box.height}%`,
                }}
                title={`${Math.round(timeMs)} ms · column ${column === null ? "open" : column + 1}`}
              />
            );
          })}
        </div>
        <span
          className="pointer-events-none absolute inset-x-0 h-px bg-yellow shadow-[0_0_6px_rgba(255,212,0,0.8)]"
          style={{ top: `${PANE_ANCHOR * 100}%` }}
          aria-hidden="true"
        />
        {chart.notes.length === 0 ? (
          <p className="pointer-events-none absolute inset-0 m-0 grid place-items-center p-4 text-center font-mono text-[0.55rem] text-cream/22">
            {t("charter.emptyChart")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
