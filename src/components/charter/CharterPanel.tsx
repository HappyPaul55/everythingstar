import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useT } from "../../i18n/react";
import { noteBox, noteColumnBox } from "../../lib/game/band/notes";
import { notesInWindow } from "../../lib/game/scroll";
import type { CharterChart } from "../../lib/game/charter/edit";
import type { LaneNote } from "../../lib/game/track";
import { chartLabel } from "../../lib/game/charter/edit";
import { gridLines, snapMs, type CharterGrid } from "../../lib/game/charter/grid";
import { useClock } from "../game/band/StageClock";
import { useScrollTrack } from "../game/band/useScrollTrack";

/** Where the playhead sits in a pane: low, with the song rising above it. */
const PANE_ANCHOR = 0.76;

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

  return (
    <section
      className={["charter-pane", active ? "is-active" : "", dragging ? "is-dragging" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={chartLabel(chart)}
    >
      <header className="charter-pane__head">
        <button type="button" className="charter-pane__name" onClick={() => onActivate(chart.key)}>
          <span className="charter-pane__dot" data-instrument={chart.instrument} />
          {chartLabel(chart)}
        </button>
        <span className="charter-pane__count">
          {chart.notes.length} {t("charter.notes")}
        </span>
        {active ? <span className="charter-pane__editing">{t("charter.active")}</span> : null}
      </header>
      <div
        ref={body}
        className="charter-pane__body"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onDoubleClick={() => onSelectAll(chart.key)}
        role="application"
        aria-label={`${chartLabel(chart)} highway`}
        tabIndex={0}
      >
        <div className="charter-pane__columns" aria-hidden="true">
          {Array.from({ length: chart.columns }, (_, index) => (
            <span
              key={index}
              className="charter-pane__column"
              style={{ left: `${(index / chart.columns) * 100}%`, width: `${100 / chart.columns}%` }}
            />
          ))}
        </div>
        <div ref={track.ref} className="charter-pane__layer">
          {lines.map((line) => (
            <span
              key={`g-${line.timeMs}`}
              className={["charter-pane__grid", line.bar ? "is-bar" : line.beat ? "is-beat" : ""]
                .filter(Boolean)
                .join(" ")}
              style={{ top: `${track.position(line.timeMs)}%` }}
              aria-hidden="true"
            />
          ))}
          {take.map((note) => {
            const head = track.position(note.timeMs);
            const tail = track.position(note.timeMs + note.lengthMs);
            const box = noteBox(head, tail, 1.2);
            const across = noteColumnBox(note.column, chart.columns);
            return (
              <span
                key={`take-${note.id}`}
                className="charter-note charter-note--take"
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
              column === null ? "is-open" : `is-c${column % 5}`,
              note.lengthMs > 0 ? "is-sustain" : "",
              note.kind === "hopo" ? "is-hopo" : "",
              note.hero ? "is-hero" : "",
              selected.has(note.id) ? "is-selected" : "",
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
          className="charter-pane__playhead"
          style={{ top: `${PANE_ANCHOR * 100}%` }}
          aria-hidden="true"
        />
        {chart.notes.length === 0 ? (
          <p className="charter-pane__empty">{t("charter.emptyChart")}</p>
        ) : null}
      </div>
    </section>
  );
}

