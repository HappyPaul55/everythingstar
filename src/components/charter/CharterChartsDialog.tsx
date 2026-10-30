import { useState } from "react";
import { useT } from "../../i18n/react";
import {
  DIFFICULTIES,
  INSTRUMENT_KINDS,
  LANE_ROLES,
  type Difficulty,
  type InstrumentKind,
  type LaneRole,
} from "../../lib/game/track";
import type { CharterChart } from "../../lib/game/charter/edit";
import { chartLabel } from "../../lib/game/charter/edit";
import { NativeDialog } from "../game/ui/NativeDialog";

interface Props {
  charts: readonly CharterChart[];
  visible: ReadonlySet<string>;
  activeKey: string;
  onClose: () => void;
  onToggle: (key: string) => void;
  onActivate: (key: string) => void;
  onCreate: (instrument: InstrumentKind, difficulty: Difficulty, role?: LaneRole) => void;
}

/**
 * Every chart the song carries, and the eight that can be up at once.
 *
 * A song can have more than eight (four guitar levels, four bass levels, drums…),
 * so this list is the whole set while the panes are the chosen window onto it.
 */
export function CharterChartsDialog({
  charts,
  visible,
  activeKey,
  onClose,
  onToggle,
  onActivate,
  onCreate,
}: Props) {
  const t = useT();
  const [instrument, setInstrument] = useState<InstrumentKind>("guitar");
  const [difficulty, setDifficulty] = useState<Difficulty>("expert");
  const [role, setRole] = useState<LaneRole | "">("");

  return (
    <NativeDialog
      title={t("charter.charts")}
      onClose={onClose}
      panelClassName="config__panel--wide"
      initialFocus="[data-dialog-focus]"
    >
      <div className="charter-dialog">
        <p className="charter-message">
          {t("charter.chartCount", { count: charts.length })} ·{" "}
          {t("charter.visible", { count: visible.size })}
        </p>
        <div className="charter-chart-list">
          {charts.map((chart) => (
            <div
              key={chart.key}
              className={["charter-chart-row", chart.key === activeKey ? "is-active" : ""]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                className="charter-chart-row__name"
                onClick={() => onActivate(chart.key)}
              >
                {chartLabel(chart)}
                <span>{chart.notes.length}</span>
              </button>
              <button
                type="button"
                className="charter-btn charter-btn--small"
                aria-pressed={visible.has(chart.key)}
                onClick={() => onToggle(chart.key)}
              >
                {visible.has(chart.key) ? t("charter.hide") : t("charter.show")}
              </button>
            </div>
          ))}
        </div>

        <h3 className="charter-subhead">{t("charter.newChart")}</h3>
        <div className="charter-new">
          <label className="charter-field">
            <span>{t("charter.instrument")}</span>
            <select
              value={instrument}
              onChange={(event) => setInstrument(event.target.value as InstrumentKind)}
            >
              {INSTRUMENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          {instrument === "guitar" ? (
            <label className="charter-field">
              <span>{t("charter.role")}</span>
              <select value={role} onChange={(event) => setRole(event.target.value as LaneRole | "")}>
                <option value="">{t("charter.none")}</option>
                {LANE_ROLES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry === "lead" ? t("charter.lead") : t("charter.rhythm")}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="charter-field">
            <span>{t("charter.difficulty")}</span>
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as Difficulty)}
            >
              {DIFFICULTIES.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="charter-btn charter-btn--primary"
            data-dialog-focus
            onClick={() => onCreate(instrument, difficulty, role || undefined)}
          >
            {t("charter.create")}
          </button>
        </div>
        <p className="charter-message">{t("charter.maxVisible")}</p>
      </div>
    </NativeDialog>
  );
}
