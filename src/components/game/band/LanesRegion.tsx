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
      className="lanes"
      style={{ height }}
      role="group"
      aria-label={t("band.playersLabel")}
    >
      {empty ? null : (
        <div
          className="lanes__grid"
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
              bare={bare}
            />
          ))}
        </div>
      )}
      {tooSmall ? (
        <p className="lanes__notice" role="note">
          {t("band.tooSmall")}
        </p>
      ) : null}
    </div>
  );
}
