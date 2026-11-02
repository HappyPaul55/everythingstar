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
 *
 * The tube is the panel's smallest control and is sized in `cqmin` like the rest
 * of the rail, so it stays slim at every stage size.
 */
export function InfoRail({
  run,
  starActive = false,
  bare = false,
}: {
  run: RunSummary;
  starActive?: boolean;
  /** A lone player on an empty stage: the tube fills the top-right cell. */
  bare?: boolean;
}) {
  const t = useT();
  const level = Math.round(run.meter);
  const star = t("band.starPower");

  const meter = [
    "panel-meter relative flex h-full w-[clamp(0.5rem,4cqmin,1.75rem)] items-end overflow-hidden rounded-brand border p-px",
    bare && "max-[40rem]:portrait:h-full max-[40rem]:portrait:w-full",
    starActive
      ? "border-accent shadow-[0_0_0.5cqmin_color-mix(in_srgb,var(--color-accent)_45%,transparent)]"
      : "border-[rgba(250,250,244,0.35)]",
  ].join(" ");

  const fill = [
    "panel-meter__fill h-full w-full origin-bottom rounded-brand",
    starActive
      ? "bg-[linear-gradient(to_top,var(--color-accent),var(--color-yellow))]"
      : "bg-[linear-gradient(to_top,var(--color-yellow),var(--color-accent))]",
  ].join(" ");

  return (
    <div
      className={[
        "panel-rail panel-rail--info flex min-h-0 min-w-0 shrink-0 flex-col items-end gap-[0.8cqmin] overflow-hidden",
        bare && "w-[clamp(5rem,28%,12.5rem)]",
      ]
        .filter(Boolean)
        .join(" ")}
      data-star={starActive ? "on" : "off"}
    >
      <div
        className={meter}
        role="meter"
        aria-label={t("band.success")}
        aria-valuenow={level}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={starActive ? `${level}%, ${star}` : `${level}%`}
      >
        <span className={fill} style={{ transform: `scaleY(${level / 100})` }} />
        {starActive ? (
          <span
            className="panel-meter__star absolute top-[0.2em] left-1/2 -translate-x-1/2 rounded-inner bg-accent p-[0.1em] font-mono text-[clamp(0.3rem,2.2cqmin,0.55rem)] leading-none font-bold text-ink [writing-mode:vertical-rl]"
            aria-hidden="true"
          >
            ×2
          </span>
        ) : null}
      </div>
    </div>
  );
}
