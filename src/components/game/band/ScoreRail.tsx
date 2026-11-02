import { useT } from "../../../i18n/react";
import { formatScore, multiplier, type RunSummary } from "../../../lib/game/scoring";
import { INSTRUMENTS, type Difficulty, type InstrumentKind } from "../../../lib/game/track";

/**
 * The left rail of a player panel: which instrument this is, who plays it, how
 * hard their chart is, and how their run is going.
 *
 * Every size is `cqmin`, the panel's smaller side: a rail reads the same in a
 * 300px square as in a 1080px one, and the score is the thing a player reads from
 * across a room, so it is the biggest type in the panel.
 *
 * On a portrait phone a **bare** panel (one player, the stage to themselves) turns
 * this rail into a row: the labels and the numbers sit across the top, and the
 * highway gets the whole width below. It is the only place the rail is a row, and
 * it is why the parts are laid out here rather than by the panel.
 */
interface Props {
  name: string;
  kind: InstrumentKind;
  difficulty: Difficulty;
  auto: boolean;
  run: RunSummary;
  /** A lone player on an empty stage: the rail may take the top row. */
  bare?: boolean;
}

const KICKER =
  "font-mono text-[clamp(0.4rem,3cqmin,0.9rem)] font-bold tracking-[0.14em] uppercase";
const TAG =
  "panel-tag rounded-pill border border-[rgba(250,250,244,0.28)] px-[0.5em] py-[0.1em] font-mono text-[clamp(0.35rem,2.2cqmin,0.65rem)] font-bold tracking-[0.12em] text-[rgba(250,250,244,0.75)] uppercase";

/** The row a bare rail takes on a portrait phone, and nothing at any other size. */
const BARE_ROW = [
  "max-[40rem]:portrait:flex-row max-[40rem]:portrait:flex-wrap",
  "max-[40rem]:portrait:items-baseline max-[40rem]:portrait:overflow-visible",
  "max-[40rem]:portrait:[--rail-w:auto] max-[40rem]:portrait:gap-x-[0.65rem]",
  "max-[40rem]:portrait:gap-y-[0.2rem]",
].join(" ");

const label = (bare: boolean) =>
  [
    "panel-stat__label font-mono font-bold tracking-[0.12em] uppercase",
    "text-[rgba(250,250,244,0.55)]",
    "text-[clamp(0.4rem,3cqmin,0.9rem)]",
    bare && "max-[40rem]:portrait:text-[clamp(0.35rem,2.4cqmin,0.6rem)]",
  ]
    .filter(Boolean)
    .join(" ");

const value = (bare: boolean) =>
  [
    "panel-stat__value font-display leading-[0.95] tracking-[-0.01em] text-cream tabular-nums",
    "text-[clamp(1rem,7cqmin,3rem)]",
    bare && "max-[40rem]:portrait:text-[clamp(0.8rem,4.6cqmin,1.5rem)]",
  ]
    .filter(Boolean)
    .join(" ");

export function ScoreRail({ name, kind, difficulty, auto, run, bare = false }: Props) {
  const t = useT();

  return (
    <div
      className={[
        "panel-rail panel-rail--score flex min-h-0 min-w-0 shrink-0 flex-col items-start gap-[0.8cqmin] overflow-hidden text-left",
        "w-[var(--rail-w,clamp(5rem,28%,12.5rem))]",
        bare && BARE_ROW,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={`panel-rail__kind text-yellow ${KICKER}`}>
        {t(INSTRUMENTS[kind].labelKey)}
      </span>
      <span className="panel-rail__name font-display text-[clamp(0.5rem,4cqmin,1.3rem)] leading-none text-cream">
        {name}
      </span>
      <span
        className={[
          "panel-rail__tags flex flex-wrap gap-[0.3em]",
          bare && "max-[40rem]:portrait:gap-[0.25em]",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className={TAG}>{t(`band.${difficulty}` as "band.easy")}</span>
        {auto ? (
          <span className={`${TAG} panel-tag--auto border-transparent bg-accent text-ink`}>
            {t("band.auto")}
          </span>
        ) : null}
      </span>
      <span
        className={[
          "panel-rail__spacer flex-1 basis-0",
          bare && "max-[40rem]:portrait:hidden",
        ]
          .filter(Boolean)
          .join(" ")}
      />
      <span className={label(bare)}>{t("band.score")}</span>
      <span className={value(bare)}>{formatScore(run.score)}</span>
      <span className={label(bare)}>{t("band.combo")}</span>
      <span className={`${value(bare)} panel-stat__value--combo text-yellow`}>{run.combo}</span>
      <span className={label(bare)}>{t("band.multiplier")}</span>
      <span className={`${value(bare)} panel-stat__value--combo text-yellow`}>
        ×{multiplier(run.combo)}
      </span>
    </div>
  );
}
