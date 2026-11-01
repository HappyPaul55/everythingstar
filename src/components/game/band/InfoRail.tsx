import { useT } from "../../../i18n/react";
import type { RunSummary } from "../../../lib/game/scoring";

/**
 * The right rail of a player panel: the power meter. It runs the full height of
 * the rail, fills as the player plays clean and drains when they drop notes (and
 * between them).
 *
 * Star power is not a second gauge. Spending the meter empties it, and the rail
 * only says that the window is live: `data-star` colours the rail, and a small ×2
 * sits in the tube — which is empty at the moment it is bought and refills under
 * the mark. The accessible value says so too, so a reader is not told a silent
 * gauge is merely low.
 */
export function InfoRail({
  run,
  starActive = false,
}: {
  run: RunSummary;
  starActive?: boolean;
}) {
  const t = useT();
  const level = Math.round(run.meter);
  const star = t("band.starPower");

  return (
    <div
      className="panel-rail panel-rail--info"
      data-star={starActive ? "on" : "off"}
    >
      <div
        className="panel-meter"
        role="meter"
        aria-label={t("band.success")}
        aria-valuenow={level}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={starActive ? `${level}%, ${star}` : `${level}%`}
      >
        <span
          className="panel-meter__fill"
          style={{ transform: `scaleY(${level / 100})` }}
        />
        {starActive ? (
          <span className="panel-meter__star" aria-hidden="true">
            ×2
          </span>
        ) : null}
      </div>
    </div>
  );
}
