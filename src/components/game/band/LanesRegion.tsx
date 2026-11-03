import { useT } from "../../../i18n/react";
import type { PanelGrid } from "../../../lib/game/band/layout";
import { lanePlayers, type BandSetup } from "../../../lib/game/band/types";
import type { HighwayView, NoteStyle } from "../../../lib/game/settings";
import { PlayerPanel } from "./PlayerPanel";

/**
 * The lanes region: the grid of player panels. The column count and the panel
 * size come from the layout engine, so the grid is exact rather than left to
 * wrapping. The row stands on the floor of the region however much of it it
 * fills. When the band will not fit, the panels stay mounted — a run is judged
 * through its panel, so unmounting them would stop the instruments playing — and
 * a small chip over the region says why they are cramped.
 *
 * Only the **instruments** are here: a singer or a typist has no panel, they share
 * the melody region above.
 */
interface Props {
  setup: BandSetup;
  height: number;
  grid: PanelGrid;
  gap: number;
  bare: boolean;
  tooSmall: boolean;
  /** Which way each highway is drawn. */
  view: HighwayView;
  /** What each note's face looks like: a bar, a gem or an arrow. */
  noteStyle: NoteStyle;
  /** How fast notes travel down each highway; drawing only. */
  noteSpeed: number;
  /** How far ahead of the audio clock the highways are drawn; drawing only. */
  visualLagMs: number;
  /** Whether a hit marker is also a control: a tap plays the note above it. */
  tap: boolean;
  /** Whether each panel's misses and star power are felt. Feedback only. */
  haptics: boolean;
}

export function LanesRegion({
  setup,
  height,
  grid,
  gap,
  bare,
  tooSmall,
  view,
  noteStyle,
  noteSpeed,
  visualLagMs,
  tap,
  haptics,
}: Props) {
  const t = useT();

  // Before the first measurement there is no grid yet; render nothing rather
  // than a zero-width grid. A tight stage still has the grid it was given, so
  // it mounts its panels and only adds the explanation over them.
  const empty = grid.columns === 0 || grid.width === 0;
  if (empty && !tooSmall) return null;

  return (
    // A **group**, not a region: the thing that is a landmark here is each
    // player's own panel, and a region around them would name the same place a
    // second time. The group says what the panels are together — the band's
    // players — which is what its label was always for.
    <div
      className="relative z-1 grid min-h-0 flex-none content-end justify-center overflow-hidden"
      style={{ height }}
      role="group"
      aria-label={t("band.playersLabel")}
    >
      {empty ? null : (
        <div
          className="grid content-center justify-center"
          style={{
            gridTemplateColumns: `repeat(${grid.columns}, ${grid.width}px)`,
            gap,
          }}
        >
          {lanePlayers(setup).map((player) => (
            <PlayerPanel
              key={player.id}
              player={player}
              width={grid.width}
              height={grid.height}
              view={view}
              noteStyle={noteStyle}
              noteSpeed={noteSpeed}
              visualLagMs={visualLagMs}
              tap={tap}
              haptics={haptics}
              bare={bare}
            />
          ))}
        </div>
      )}
      {tooSmall ? (
        <p
          className="pointer-events-none absolute bottom-[0.9rem] left-1/2 z-2 max-w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 rounded-pill border border-[rgba(250,250,244,0.24)] bg-[rgba(12,13,10,0.88)] px-[0.9rem] py-[0.45rem] text-center font-mono text-[0.72rem] leading-[1.45] text-[rgba(250,250,244,0.9)] shadow-[0_0.25rem_1rem_rgba(0,0,0,0.45)]"
          role="note"
        >
          {t("band.tooSmall")}
        </p>
      ) : null}
    </div>
  );
}
