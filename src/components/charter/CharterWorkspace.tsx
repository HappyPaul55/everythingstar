import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useT } from "../../i18n/react";
import type { SourceSongDoc } from "../../lib/game/source";
import type { Song } from "../../lib/game/song";
import {
  cleanSlides,
  slideProblems,
  strums,
  type Difficulty,
  type InstrumentKind,
  type LaneNote,
  type LaneRole,
} from "../../lib/game/track";
import {
  addNote,
  chartKey,
  charterProblems,
  copyNotes,
  emptyChart,
  moveNotes,
  normaliseChart,
  noteId,
  pasteNotes,
  plainKind,
  quantizeNotes,
  removeNotes,
  setNote as setOneNote,
  type CharterChart,
  type Clipboard,
} from "../../lib/game/charter/edit";
import {
  DEFAULT_GRID,
  GRID_DIVISIONS,
  barMs,
  clampGrid,
  positionLabel,
  snapMs,
  stepMs,
  type CharterGrid,
} from "../../lib/game/charter/grid";
import { mergeTake, takeNotes } from "../../lib/game/charter/record";
import { writeChart } from "../../lib/game/charter/exportChart";
import { isEditable } from "../game/ui/nav";
import { useClock, useClockMs } from "../game/band/StageClock";
import { useCharterRecord } from "./useCharterRecord";
import { useMetronome } from "./useMetronome";
import { CharterPanel, type PanelDrag } from "./CharterPanel";
import { CharterChartsDialog } from "./CharterChartsDialog";

export interface CharterProject {
  song: Song;
  doc: SourceSongDoc | null;
  charts: CharterChart[];
  grid: CharterGrid;
  problems: string[];
}

interface Props {
  project: CharterProject;
  speed: number;
  onSpeed: (speed: number) => void;
  onBack: () => void;
  onGame: () => void;
}

/** One undo step: the charts **and** the grid, because ticks come from both. */
interface Snapshot {
  charts: CharterChart[];
  grid: CharterGrid;
}

const HISTORY_LIMIT = 60;
const ZOOMS = [4, 6, 8, 12, 16] as const;
const SPEEDS = [1, 0.75, 0.5] as const;

function clockText(timeMs: number): string {
  const total = Math.max(0, Math.round(timeMs));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function download(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // The click has already handed the blob to the browser; releasing it now would
  // be a race on a slow download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * The charter's working screen.
 *
 * One project's charts, a transport that follows the song's own audio, a grid and
 * a selection. Edits are immutable snapshots so undo is the same rule for one note
 * and for a whole take; a recording is one undo step.
 */
export function CharterWorkspace({ project, speed, onSpeed, onBack, onGame }: Props) {
  const t = useT();
  const clock = useClock();
  const now = useClockMs(100);
  const [charts, setCharts] = useState(project.charts);
  const chartsRef = useRef(charts);
  chartsRef.current = charts;
  const [grid, setGrid] = useState(() => clampGrid(project.grid ?? DEFAULT_GRID));
  const [activeKey, setActiveKey] = useState(project.charts[0]?.key ?? "");
  const [visible, setVisible] = useState<string[]>(
    project.charts.slice(0, 8).map((chart) => chart.key),
  );
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [drag, setDrag] = useState<PanelDrag | null>(null);
  const [zoom, setZoom] = useState<number>(8);
  const [quantize, setQuantize] = useState(true);
  const [recordMode, setRecordMode] = useState<"replace" | "overdub">("replace");
  const [metronome, setMetronome] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [recordMenu, setRecordMenu] = useState(false);
  const recordMenuRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [exportProblems, setExportProblems] = useState<string[]>([]);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const gridRef = useRef(grid);
  gridRef.current = grid;
  /** The chart a take was armed on, so clicking another pane cannot retarget it. */
  const recordingKey = useRef<string | null>(null);
  /** The latest stopRecording, for a pane change that has to end the take first. */
  const stopTake = useRef<() => void>(() => undefined);

  const visibleSet = useMemo(() => new Set(visible), [visible]);
  const active = charts.find((chart) => chart.key === activeKey) ?? charts[0] ?? null;
  const record = useCharterRecord(active?.instrument ?? null, active?.columns ?? null);
  useMetronome(grid, metronome && (record.recording || clock.playing));

  const commit = useCallback(
    (next: CharterChart[] | ((current: CharterChart[]) => CharterChart[])) => {
      const current = chartsRef.current;
      const value = typeof next === "function" ? next(current) : next;
      if (value === current) return;
      past.current.push({ charts: current, grid: gridRef.current });
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
      future.current = [];
      chartsRef.current = value;
      setCharts(value);
    },
    [],
  );

  const update = useCallback(
    (key: string, change: (chart: CharterChart) => CharterChart) => {
      commit((current) =>
        current.map((chart) => (chart.key === key ? normaliseChart(change(chart)) : chart)),
      );
    },
    [commit],
  );

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push({ charts: chartsRef.current, grid: gridRef.current });
    chartsRef.current = previous.charts;
    setCharts(previous.charts);
    gridRef.current = previous.grid;
    setGrid(previous.grid);
    setSelection(new Set());
    if (!previous.charts.some((chart) => chart.key === activeKey)) {
      setActiveKey(previous.charts[0]?.key ?? "");
    }
  }, [activeKey]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push({ charts: chartsRef.current, grid: gridRef.current });
    chartsRef.current = next.charts;
    setCharts(next.charts);
    gridRef.current = next.grid;
    setGrid(next.grid);
    setSelection(new Set());
    if (!next.charts.some((chart) => chart.key === activeKey)) {
      setActiveKey(next.charts[0]?.key ?? "");
    }
  }, [activeKey]);

  const activate = useCallback(
    (key: string) => {
      if (!charts.some((chart) => chart.key === key)) return;
      // A take belongs to the pane it was armed on. Switching panes mid-take used
      // to keep recording and then convert the events against the new chart, in
      // its instrument and its columns; the take ends here, where it was played.
      if (record.recording) stopTake.current();
      setActiveKey(key);
      setSelection(new Set());
      setVisible((current) => (current.includes(key) ? current : current.length < 8 ? [...current, key] : current));
    },
    [charts, record.recording],
  );

  const toggleVisible = useCallback(
    (key: string) => {
      if (visibleSet.has(key)) {
        if (visible.length <= 1) return;
        const next = visible.filter((entry) => entry !== key);
        setVisible(next);
        if (key === activeKey) setActiveKey(next[0] ?? "");
        return;
      }
      if (visible.length >= 8) {
        setStatus(t("charter.maxVisible"));
        return;
      }
      setVisible([...visible, key]);
    },
    [visible, visibleSet, activeKey, t],
  );

  const createChart = useCallback(
    (instrument: InstrumentKind, difficulty: Difficulty, role?: LaneRole) => {
      const chart = emptyChart(instrument, difficulty, role, grid.bpm);
      const current = chartsRef.current;
      if (current.some((entry) => chartKey(entry) === chartKey(chart))) {
        setStatus(`${chartKey(chart)} already exists`);
        return;
      }
      commit([...current, chart]);
      setActiveKey(chart.key);
      setSelection(new Set());
      setVisible((shown) => (shown.length < 8 ? [...shown, chart.key] : shown));
      setDialog(false);
    },
    [commit, grid.bpm],
  );

  const addAt = useCallback(
    (key: string, timeMs: number, column: number) => {
      const chart = chartsRef.current.find((entry) => entry.key === key);
      if (!chart) return;
      const note = {
        id: noteId(),
        timeMs: snapMs(timeMs, grid),
        lengthMs: 0,
        kind: plainKind(chart),
        column: chart.instrument === "drums" && column === 5 ? 5 : column,
        hero: false,
      };
      update(key, (entry) => ({ ...entry, notes: addNote(entry.notes, note, entry) }));
      setActiveKey(key);
      setSelection(new Set([note.id]));
    },
    [grid, update],
  );

  const selectNote = useCallback(
    (key: string, id: string, additive: boolean) => {
      setActiveKey(key);
      setSelection((current) => {
        if (!additive) return new Set([id]);
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [],
  );

  const selectAll = useCallback(
    (key: string) => {
      const chart = chartsRef.current.find((entry) => entry.key === key);
      if (!chart) return;
      setActiveKey(key);
      setSelection(new Set(chart.notes.map((note) => note.id)));
    },
    [],
  );

  const moveSelection = useCallback(
    (key: string, deltaMs: number, deltaColumns: number) => {
      const chart = chartsRef.current.find((entry) => entry.key === key);
      if (!chart || selection.size === 0) return;
      update(key, (entry) => ({
        ...entry,
        notes: moveNotes(entry.notes, selection, deltaMs, deltaColumns, entry),
      }));
    },
    [selection, update],
  );

  const deleteSelection = useCallback(() => {
    if (!active || selection.size === 0) return;
    update(active.key, (chart) => ({ ...chart, notes: removeNotes(chart.notes, selection) }));
    setSelection(new Set());
  }, [active, selection, update]);

  const copySelection = useCallback(() => {
    if (!active || selection.size === 0) return;
    setClipboard(copyNotes(active.notes, selection, active.columns));
    setStatus(t("charter.copy"));
  }, [active, selection, t]);

  const cutSelection = useCallback(() => {
    copySelection();
    deleteSelection();
  }, [copySelection, deleteSelection]);

  const pasteSelection = useCallback(() => {
    if (!active || !clipboard) return;
    const at = snapMs(clock.timeRef.current, grid);
    update(active.key, (chart) => ({
      ...chart,
      notes: pasteNotes(chart.notes, clipboard, at, chart, { quantize: true, grid }),
    }));
    setSelection(new Set());
  }, [active, clipboard, grid, update, clock.timeRef]);

  const quantizeSelection = useCallback(() => {
    if (!active) return;
    const ids = selection.size > 0 ? selection : new Set(active.notes.map((note) => note.id));
    update(active.key, (chart) => ({
      ...chart,
      notes: quantizeNotes(chart.notes, ids, grid, true),
    }));
  }, [active, selection, grid, update]);

  const selectedNotes = active ? active.notes.filter((note) => selection.has(note.id)) : [];
  const one = selectedNotes.length === 1 ? selectedNotes[0] : null;
  // A slide is two notes and a direction: the earlier one leaves, the later one
  // arrives. Ties keep a stable order so the same pair always means the same link.
  const pair =
    selectedNotes.length === 2
      ? [...selectedNotes].sort(
          (a, b) => a.timeMs - b.timeMs || (a.column ?? -1) - (b.column ?? -1),
        )
      : null;
  const slideTarget =
    one?.slideTo === undefined
      ? null
      : (active?.notes.find((note) => note.id === one.slideTo) ?? null);

  const patchNote = useCallback(
    (patch: Partial<Omit<LaneNote, "id">>) => {
      if (!active || !one) return;
      update(active.key, (chart) => ({
        ...chart,
        notes: setOneNote(chart.notes, one.id, patch, chart),
      }));
    },
    [active, one, update],
  );

  // The canvas cannot show a half-made slide, so an invalid pair is answered in
  // the status line rather than becoming a link `normaliseChart` would drop.
  const linkSlide = () => {
    if (!active) return;
    if (!pair) {
      setStatus(t("charter.slideTwo"));
      return;
    }
    const [source, target] = pair;
    const linked = active.notes.map((note) =>
      note.id === source.id ? { ...note, slideTo: target.id } : note,
    );
    // The repair is the test: a link the canonical chart would drop is not added,
    // whatever the reason — a stale link elsewhere in the chart must not make a
    // new one look valid just because its message was already there.
    const kept = cleanSlides(linked).find((note) => note.id === source.id)?.slideTo;
    if (kept !== target.id) {
      const reason =
        slideProblems(linked).find((problem) => problem.startsWith(`note ${source.id} `)) ??
        t("charter.slideInvalid");
      setStatus(reason);
      return;
    }
    update(active.key, (chart) => ({
      ...chart,
      notes: setOneNote(chart.notes, source.id, { slideTo: target.id }, chart),
    }));
    setStatus(t("charter.slideAdded"));
  };

  const removeSlide = () => {
    if (!active || !one) return;
    update(active.key, (chart) => ({
      ...chart,
      notes: setOneNote(chart.notes, one.id, { slideTo: undefined }, chart),
    }));
    setStatus(t("charter.slideRemoved"));
  };

  const startRecording = useCallback(() => {
    if (!active) return;
    const duration = project.doc?.durationMs ?? clock.durationMs;
    const at = clock.ended || clock.timeRef.current >= duration - 1
      ? 0
      : snapMs(clock.timeRef.current, grid);
    recordingKey.current = active.key;
    setStartedAt(at);
    setStatus(null);
    clock.seek(at);
    record.start(at);
    clock.play();
  }, [active, clock, grid, project.doc?.durationMs, record]);

  const stopRecording = useCallback(() => {
    if (!record.recording) return;
    // The chart the take was armed on, not whichever pane is active now.
    const key = recordingKey.current;
    recordingKey.current = null;
    const target = key
      ? (chartsRef.current.find((chart) => chart.key === key) ?? null)
      : null;
    const events = record.stop();
    const end = Math.max(startedAt, Math.round(clock.timeRef.current));
    clock.pause();
    if (!target) return;
    const take = takeNotes(events, target, {
      startMs: startedAt,
      endMs: end,
      quantize,
      grid,
    });
    if (take.length === 0) {
      setStatus(t("charter.takeEmpty"));
      return;
    }
    const merged = mergeTake(target.notes, take, {
      startMs: startedAt,
      endMs: end,
      mode: recordMode,
    });
    update(target.key, (chart) => ({ ...chart, notes: merged }));
    setSelection(new Set(take.map((note) => note.id)));
    setStatus(t("charter.takeAdded", { count: take.length }));
  }, [clock, grid, quantize, record, recordMode, startedAt, t, update]);

  // The pane's own activate calls this before switching, because it is declared
  // above the take's stop.
  useEffect(() => {
    stopTake.current = stopRecording;
  }, [stopRecording]);

  // The song reaching its end stops a take rather than leaving a record armed on a
  // stopped transport.
  useEffect(() => {
    if (record.recording && clock.ended) stopRecording();
  }, [clock.ended, record.recording, stopRecording]);

  const togglePlay = useCallback(() => {
    if (record.recording) {
      stopRecording();
      return;
    }
    clock.toggle();
  }, [clock, record.recording, stopRecording]);

  // Speed belongs to the transport and the stems together.
  useEffect(() => {
    clock.setRate(speed);
  }, [clock, speed]);

  // The record options sit in a small popover beside the split button. An outside
  // press or Escape closes it; Escape is captured so it does not also clear the
  // chart selection behind the menu.
  useEffect(() => {
    if (!recordMenu) return;
    const outside = (event: PointerEvent) => {
      if (recordMenuRef.current && !recordMenuRef.current.contains(event.target as Node)) {
        setRecordMenu(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setRecordMenu(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [recordMenu]);

  // Keyboard shortcuts. While a take is armed the recording layout owns the keys,
  // so only Escape (stop) is read here.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const focused = document.activeElement;
      if (
        isEditable(focused) ||
        (focused instanceof HTMLElement &&
          focused.matches("select, input, textarea"))
      ) {
        return;
      }
      if (record.recording) {
        if (event.key === "Escape") {
          event.preventDefault();
          stopRecording();
        }
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (mod && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelection();
        return;
      }
      if (mod && event.key.toLowerCase() === "x") {
        event.preventDefault();
        cutSelection();
        return;
      }
      if (mod && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteSelection();
        return;
      }
      if (mod && event.key.toLowerCase() === "a") {
        event.preventDefault();
        if (active) selectAll(active.key);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelection();
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        togglePlay();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        if (!active) return;
        moveSelection(active.key, 0, event.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        if (!active) return;
        const delta = event.shiftKey ? barMs(grid) : stepMs(grid);
        moveSelection(active.key, event.key === "ArrowUp" ? -delta : delta, 0);
        return;
      }
      if (event.key === "Escape") {
        setSelection(new Set());
        return;
      }
      if (!mod && event.key.toLowerCase() === "r") {
        event.preventDefault();
        startRecording();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    active,
    copySelection,
    cutSelection,
    deleteSelection,
    grid,
    moveSelection,
    pasteSelection,
    record.recording,
    redo,
    selectAll,
    startRecording,
    stopRecording,
    togglePlay,
    undo,
  ]);

  const seekTo = useCallback(
    (timeMs: number) => {
      if (record.recording) stopRecording();
      clock.seek(Math.max(0, Math.min(project.doc?.durationMs ?? clock.durationMs, timeMs)));
    },
    [clock, project.doc?.durationMs, record.recording, stopRecording],
  );

  const jumpNote = useCallback(
    (direction: 1 | -1) => {
      if (!active) return;
      const current = clock.timeRef.current;
      const notes = active.notes;
      const found =
        direction > 0
          ? notes.find((note) => note.timeMs > current + 1)
          : [...notes].reverse().find((note) => note.timeMs < current - 1);
      if (found) seekTo(found.timeMs);
    },
    [active, clock, seekTo],
  );

  const exportChart = useCallback(() => {
    const result = writeChart({
      title: project.song.title,
      artist: project.song.artist.name,
      album: project.song.album?.name ?? null,
      charts,
      grid,
      sections: project.doc?.sections ?? [],
    });
    setExportProblems(result.problems);
    if (!result.text) {
      setStatus(result.problems[0] ?? t("charter.exportProblems"));
      return;
    }
    download(result.text, result.fileName);
    setStatus(t("charter.downloaded", { name: result.fileName }));
  }, [charts, grid, project, t]);

  const problems = useMemo(
    () => [
      ...project.problems,
      ...charts.flatMap((chart) =>
        charterProblems(chart).map((problem) => `${chart.key}: ${problem}`),
      ),
    ],
    [charts, project.problems],
  );

  const preview = useMemo(() => {
    if (!record.recording || !active) return [];
    return takeNotes(record.events, active, {
      startMs: startedAt,
      endMs: Math.max(startedAt, Math.round(now)),
      quantize,
      grid,
    });
  }, [record.recording, record.events, active, startedAt, quantize, grid, now]);

  const shown = visible
    .map((key) => charts.find((chart) => chart.key === key))
    .filter((chart): chart is CharterChart => chart !== undefined);
  const columns = shown.length <= 1 ? 1 : shown.length <= 4 ? shown.length : 4;

  const changeGrid = (patch: Partial<CharterGrid>) => {
    const next = clampGrid({ ...gridRef.current, ...patch });
    if (
      next.bpm === gridRef.current.bpm &&
      next.beatsPerBar === gridRef.current.beatsPerBar &&
      next.division === gridRef.current.division
    ) {
      return;
    }
    // The grid is what every exported tick is measured from, so a mistyped BPM has
    // to be undoable like any other edit.
    past.current.push({ charts: chartsRef.current, grid: gridRef.current });
    if (past.current.length > HISTORY_LIMIT) past.current.shift();
    future.current = [];
    gridRef.current = next;
    setGrid(next);
  };

  return (
    <div className="charter">
      <header className="charter-head charter-head--workspace">
        <div className="charter-title">
          <p className="charter-badge">{t("charter.badge")}</p>
          <h1>{project.song.title}</h1>
          <p className="charter-meta">
            {project.song.artist.name} · {charts.length} {t("charter.charts").toLowerCase()}
          </p>
        </div>
        <div className="charter-head__actions">
          <div className="charter-actions">
            <button type="button" className="charter-btn" onClick={onBack}>
              {t("charter.song")}
            </button>
            <button type="button" className="charter-btn" onClick={() => setDialog(true)}>
              {t("charter.charts")}
            </button>
            <button type="button" className="charter-btn charter-btn--primary" onClick={exportChart}>
              {t("charter.download")}
            </button>
            <button type="button" className="charter-btn" onClick={onGame}>
              {t("charter.back")}
            </button>
          </div>
          <p className="charter-help">{t("charter.help")}</p>
        </div>
      </header>

      <div className="charter-toolbar">
        <div className="charter-transport">
          <button
            type="button"
            className="charter-play"
            onClick={togglePlay}
            aria-label={clock.playing ? t("charter.pause") : t("charter.play")}
          >
            {clock.playing ? "❚❚" : "▶"}
          </button>
          <div
            className={["charter-record-combo", record.recording ? "is-on" : ""].filter(Boolean).join(" ")}
            ref={recordMenuRef}
          >
            <button
              type="button"
              className={["charter-btn", "charter-btn--record", "charter-record-main", record.recording ? "is-on" : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                setRecordMenu(false);
                if (record.recording) stopRecording();
                else startRecording();
              }}
              disabled={!active}
            >
              <span className="charter-record-dot" aria-hidden="true" />
              {record.recording ? t("charter.stopRecording") : t("charter.record")}
            </button>
            <button
              type="button"
              className="charter-btn charter-btn--record charter-record-arrow"
              aria-label={t("charter.recordOptions")}
              aria-haspopup="true"
              aria-expanded={recordMenu}
              onClick={() => setRecordMenu((open) => !open)}
            >
              ▾
            </button>
            {recordMenu ? (
              <div className="charter-record-menu" role="group" aria-label={t("charter.recordOptions")}>
                <label className="charter-mini">
                  <span>{t("charter.controller")}</span>
                  <select
                    value={record.controller.on}
                    onChange={(event) => {
                      const on = event.target.value;
                      if (on === "midi") {
                        void record.requestMidi().then((ok) => {
                          if (!ok) setStatus(t("charter.midiRefused"));
                        });
                        return;
                      }
                      record.setController(
                        on === "pad" ? { on: "pad", index: 0 } : { on: "keyboard", layout: 0 },
                      );
                    }}
                  >
                    <option value="keyboard">{t("charter.keyboard")}</option>
                    <option value="pad">{t("charter.gamepad")}</option>
                    <option value="midi">{t("charter.midi")}</option>
                  </select>
                </label>
                <label className="charter-mini">
                  <span>{t("charter.recordMode")}</span>
                  <select
                    value={recordMode}
                    onChange={(event) => setRecordMode(event.target.value as "replace" | "overdub")}
                  >
                    <option value="replace">{t("charter.replace")}</option>
                    <option value="overdub">{t("charter.overdub")}</option>
                  </select>
                </label>
              </div>
            ) : null}
          </div>
          {record.recording ? (
            <span className="charter-recording" role="status">
              {t("charter.armed")} · {t("charter.notes")}: {preview.length}
            </span>
          ) : null}
          <button type="button" className="charter-btn charter-btn--small" onClick={() => seekTo(0)}>
            {t("charter.stop")}
          </button>
          <button type="button" className="charter-btn charter-btn--small" onClick={() => jumpNote(-1)}>
            ‹
          </button>
          <button type="button" className="charter-btn charter-btn--small" onClick={() => jumpNote(1)}>
            ›
          </button>
          <span className="charter-time">{clockText(now)}</span>
          <span className="charter-muted">/ {clockText(project.doc?.durationMs ?? clock.durationMs)}</span>
          <span className="charter-position">{positionLabel(now, grid)}</span>
        </div>

        <input
          className="charter-seek"
          type="range"
          min={0}
          max={Math.max(1, project.doc?.durationMs ?? clock.durationMs)}
          value={Math.min(now, Math.max(1, project.doc?.durationMs ?? clock.durationMs))}
          onChange={(event) => seekTo(Number(event.target.value))}
          aria-label={t("charter.position", { bar: 0, beat: 0 })}
        />

        <div className="charter-settings">
          <label className="charter-mini">
            <span>{t("charter.bpm")}</span>
            <input
              type="number"
              min={20}
              max={400}
              step={1}
              value={grid.bpm}
              onChange={(event) => changeGrid({ bpm: Number(event.target.value) })}
            />
          </label>
          <label className="charter-mini">
            <span>{t("charter.beatsPerBar")}</span>
            <input
              type="number"
              min={1}
              max={16}
              value={grid.beatsPerBar}
              onChange={(event) => changeGrid({ beatsPerBar: Number(event.target.value) })}
            />
          </label>
          <label className="charter-mini">
            <span>{t("charter.division")}</span>
            <select
              value={grid.division}
              onChange={(event) => changeGrid({ division: Number(event.target.value) })}
            >
              {GRID_DIVISIONS.map((entry) => (
                <option key={entry.division} value={entry.division}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="charter-mini">
            <span>{t("charter.zoom")}</span>
            <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
              {ZOOMS.map((value) => (
                <option key={value} value={value}>
                  {value}s
                </option>
              ))}
            </select>
          </label>
          <label className="charter-mini">
            <span>{t("charter.speed")}</span>
            <select value={speed} onChange={(event) => onSpeed(Number(event.target.value))}>
              {SPEEDS.map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>
          <label className="charter-mini">
            <span>{t("charter.metronome")}</span>
            <select
              value={metronome ? "on" : "off"}
              onChange={(event) => setMetronome(event.target.value === "on")}
            >
              <option value="on">{t("charter.on")}</option>
              <option value="off">{t("charter.off")}</option>
            </select>
          </label>
          <label className="charter-mini">
            <span>{t("charter.quantizeTake")}</span>
            <select
              value={quantize ? "on" : "off"}
              onChange={(event) => setQuantize(event.target.value === "on")}
            >
              <option value="on">{t("charter.on")}</option>
              <option value="off">{t("charter.off")}</option>
            </select>
          </label>
        </div>
      </div>

      <div className={`charter-grid charter-grid--${columns}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {shown.map((chart) => (
          <CharterPanel
            key={chart.key}
            chart={chart}
            active={chart.key === active?.key}
            selected={chart.key === active?.key ? selection : new Set()}
            grid={grid}
            zoom={zoom}
            drag={drag}
            take={chart.key === active?.key ? preview : []}
            onActivate={activate}
            onSelect={selectNote}
            onSelectAll={selectAll}
            onAdd={addAt}
            onDrag={setDrag}
            onMove={moveSelection}
          />
        ))}
      </div>

      <footer className="charter-inspect">
        <div className="charter-inspect__left">
          <span>
            {selection.size > 0
              ? t("charter.selected", { count: selection.size })
              : t("charter.noSelection")}
          </span>
          {one ? (
            <div className="charter-note-editor">
              <label className="charter-mini">
                <span>{t("charter.noteTime")}</span>
                <input
                  type="number"
                  value={one.timeMs}
                  onChange={(event) => patchNote({ timeMs: Number(event.target.value) })}
                />
              </label>
              <label className="charter-mini">
                <span>{t("charter.noteColumn")}</span>
                <select
                  value={one.column === null ? "open" : one.column}
                  onChange={(event) =>
                    patchNote({
                      column: event.target.value === "open" ? null : Number(event.target.value),
                    })
                  }
                >
                  {active?.instrument !== "drums" ? <option value="open">{t("charter.openNote")}</option> : null}
                  {Array.from({ length: active?.columns ?? 5 }, (_, index) => (
                    <option key={index} value={index}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="charter-mini">
                <span>{t("charter.noteLength")}</span>
                <input
                  type="number"
                  min={0}
                  value={one.lengthMs}
                  onChange={(event) => patchNote({ lengthMs: Number(event.target.value) })}
                />
              </label>
              <label className="charter-mini">
                <span>{t("charter.noteKind")}</span>
                <select
                  value={one.kind}
                  onChange={(event) => patchNote({ kind: event.target.value as LaneNote["kind"] })}
                >
                  {(active && strums(active.instrument)
                    ? ["strum", "hopo"]
                    : ["strum"]
                  ).map((kind) => (
                    <option key={kind} value={kind}>
                      {kind === "strum" ? t("charter.kindStrum") : t("charter.kindHopo")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="charter-check">
                <input
                  type="checkbox"
                  checked={one.hero}
                  onChange={(event) => patchNote({ hero: event.target.checked })}
                />
                {t("charter.hero")}
              </label>
              {slideTarget ? (
                <div className="charter-mini">
                  <span>
                    {t("charter.slideTo", {
                      time: slideTarget.timeMs,
                      column: slideTarget.column === null ? "–" : slideTarget.column + 1,
                    })}
                  </span>
                  <button
                    type="button"
                    className="charter-btn charter-btn--small"
                    onClick={removeSlide}
                  >
                    {t("charter.removeSlide")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="charter-inspect__actions">
          <button type="button" className="charter-btn charter-btn--small" onClick={undo}>
            {t("charter.undo")}
          </button>
          <button type="button" className="charter-btn charter-btn--small" onClick={redo}>
            {t("charter.redo")}
          </button>
          <button type="button" className="charter-btn charter-btn--small" onClick={copySelection}>
            {t("charter.copy")}
          </button>
          <button type="button" className="charter-btn charter-btn--small" onClick={pasteSelection}>
            {t("charter.paste")}
          </button>
          <button type="button" className="charter-btn charter-btn--small" onClick={quantizeSelection}>
            {t("charter.quantize")}
          </button>
          <button type="button" className="charter-btn charter-btn--small" onClick={linkSlide}>
            {t("charter.slide")}
          </button>
          <button type="button" className="charter-btn charter-btn--small" onClick={deleteSelection}>
            {t("charter.delete")}
          </button>
        </div>
        <div className="charter-inspect__status" role="status">
          {status ? <span>{status}</span> : null}
          {exportProblems.length > 0 ? (
            <details>
              <summary>{t("charter.exportProblems")}</summary>
              <ul>
                {exportProblems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <details>
            <summary>
              {problems.length > 0
                ? `${t("charter.problems")} (${problems.length})`
                : t("charter.noProblems")}
            </summary>
            {problems.length > 0 ? (
              <ul>
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : null}
          </details>
        </div>
      </footer>

      {dialog ? (
        <CharterChartsDialog
          charts={charts}
          visible={visibleSet}
          activeKey={active?.key ?? ""}
          onClose={() => setDialog(false)}
          onToggle={toggleVisible}
          onActivate={(key) => {
            activate(key);
            setDialog(false);
          }}
          onCreate={createChart}
        />
      ) : null}
    </div>
  );
}
