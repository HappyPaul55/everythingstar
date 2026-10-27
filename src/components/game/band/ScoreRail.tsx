import { useT } from "../../../i18n/react";
import { formatScore, multiplier, type RunSummary } from "../../../lib/game/scoring";
import { INSTRUMENTS, type Difficulty, type InstrumentKind } from "../../../lib/game/track";

/**
 * The left rail of a player panel: which instrument this is, who plays it, how
 * hard their chart is, and how their run is going.
 */
interface Props {
  name: string;
  kind: InstrumentKind;
  difficulty: Difficulty;
  auto: boolean;
  run: RunSummary;
}

export function ScoreRail({ name, kind, difficulty, auto, run }: Props) {
  const t = useT();

  return (
    <div className="panel-rail panel-rail--score">
      <span className="panel-rail__kind">{t(INSTRUMENTS[kind].labelKey)}</span>
      <span className="panel-rail__name">{name}</span>
      <span className="panel-rail__tags">
        <span className="panel-tag">{t(`band.${difficulty}` as "band.easy")}</span>
        {auto ? <span className="panel-tag panel-tag--auto">{t("band.auto")}</span> : null}
      </span>
      <span className="panel-rail__spacer" />
      <span className="panel-stat__label">{t("band.score")}</span>
      <span className="panel-stat__value">{formatScore(run.score)}</span>
      <span className="panel-stat__label">{t("band.combo")}</span>
      <span className="panel-stat__value panel-stat__value--combo">{run.combo}</span>
      <span className="panel-stat__label">{t("band.multiplier")}</span>
      <span className="panel-stat__value panel-stat__value--combo">
        ×{multiplier(run.combo)}
      </span>
    </div>
  );
}
