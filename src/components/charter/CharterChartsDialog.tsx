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

/** A labelled control: the label over the input, both hugging their content. */
const field = "flex min-w-0 flex-col gap-[0.15rem]";
const label = "charter-label";
const message = "my-[0.6rem] text-[0.8rem] text-[rgba(251,251,243,0.55)]";

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
      <div className="flex w-full max-h-[min(70dvh,38rem)] flex-col gap-[0.6rem] overflow-auto">
        <p className={message}>
          {t("charter.chartCount", { count: charts.length })} ·{" "}
          {t("charter.visible", { count: visible.size })}
        </p>
        <div className="flex max-h-[18rem] flex-col overflow-auto rounded-inner border border-line-ink">
          {charts.map((chart) => (
            <div
              key={chart.key}
              className={[
                "flex items-center gap-[0.4rem] border-t border-t-[rgba(251,251,243,0.07)] px-[0.35rem] py-[0.25rem] first:border-t-0",
                chart.key === activeKey && "bg-[rgba(255,212,0,0.08)]",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent text-left font-mono text-[0.64rem] text-cream uppercase"
                onClick={() => onActivate(chart.key)}
              >
                {chartLabel(chart)}
                <span className="ml-auto text-[rgba(251,251,243,0.4)]">{chart.notes.length}</span>
              </button>
              <button
                type="button"
                className="charter-btn charter-btn-small"
                aria-pressed={visible.has(chart.key)}
                onClick={() => onToggle(chart.key)}
              >
                {visible.has(chart.key) ? t("charter.hide") : t("charter.show")}
              </button>
            </div>
          ))}
        </div>

        <h3 className="mt-[0.3rem] mb-0 font-mono text-[0.66rem] tracking-[0.08em] text-yellow uppercase">
          {t("charter.newChart")}
        </h3>
        <div className="flex flex-wrap items-end gap-[0.4rem]">
          <label className={`${field} basis-[8rem]`}>
            <span className={label}>{t("charter.instrument")}</span>
            <select
              className="charter-input"
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
            <label className={`${field} basis-[8rem]`}>
              <span className={label}>{t("charter.role")}</span>
              <select
                className="charter-input"
                value={role}
                onChange={(event) => setRole(event.target.value as LaneRole | "")}
              >
                <option value="">{t("charter.none")}</option>
                {LANE_ROLES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry === "lead" ? t("charter.lead") : t("charter.rhythm")}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className={`${field} basis-[8rem]`}>
            <span className={label}>{t("charter.difficulty")}</span>
            <select
              className="charter-input"
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
            className="charter-btn charter-btn-primary"
            data-dialog-focus
            onClick={() => onCreate(instrument, difficulty, role || undefined)}
          >
            {t("charter.create")}
          </button>
        </div>
        <p className={message}>{t("charter.maxVisible")}</p>
      </div>
    </NativeDialog>
  );
}
