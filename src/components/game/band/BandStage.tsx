import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useT } from "../../../i18n/react";
import {
  DEFAULT_GAP,
  STAGE_GUTTER,
  computeBandLayout,
} from "../../../lib/game/band/layout";
import { hasLanes, type BandSetup } from "../../../lib/game/band/types";
import { ENTRANCE_LEAD_MS, ENTRANCE_SLIDE_MS } from "../../../lib/game/audio/hype";
import type { HighwayView, NoteStyle } from "../../../lib/game/settings";
import type { PracticePlan } from "../../../lib/game/practice";
import { LanesRegion } from "./LanesRegion";
import { MelodyRegion } from "./MelodyRegion";
import { PracticeReadout } from "./PracticeReadout";
import { SongProgress } from "./SongProgress";
import { useSong } from "./SongContext";
import { StageBackground } from "./StageBackground";
import { StageNotice } from "./StageNotice";
import type { StageMedia } from "../../../lib/game/band/media";
import { useElementSize } from "./useElementSize";

/**
 * The stage: measures itself, asks the layout engine where everything goes, and
 * renders the backdrop, the melody region and the lanes region.
 *
 * It is up for the song and nothing else, and it owns the two things that happen
 * *during* one: `children` are the countdown and the pause, drawn over the stage
 * because the stage is what they are about. Every other screen is a page of its own
 * (see `onStage`), which is why this is rendered conditionally rather than always.
 */
interface Props {
  setup: BandSetup;
  media: StageMedia;
  /** Which way the highways are drawn: flat buttons, or a neck in perspective. */
  view: HighwayView;
  /** What a note's face looks like on every highway. Drawing only. */
  noteStyle: NoteStyle;
  /** How fast notes travel down a highway; drawing only. */
  noteSpeed: number;
  /** How far ahead of the audio clock the scrolling note layers are drawn. */
  visualLagMs: number;
  /** How far the backdrop is dimmed, 0..0.8. The notes and panels are not. */
  backdropDim: number;
  /** Whether a hit marker is also a control: a tap plays the note above it. */
  tap: boolean;
  /** Whether a miss and a spent star power are felt. Feedback, never judging. */
  haptics: boolean;
  /** The song's video when it is also the music, rather than a muted backdrop. */
  youtube?: {
    videoId: string;
    volume: number;
    musicLevel: number;
    lagMs: number;
    rate: number;
    practice: boolean;
  } | null;
  /** The active practice plan, for the compact stage read-out. */
  practice?: PracticePlan | null;
  children?: ReactNode;
}

export function BandStage({
  setup,
  media,
  view,
  noteStyle,
  noteSpeed,
  visualLagMs,
  backdropDim,
  tap,
  haptics,
  youtube,
  practice,
  children,
}: Props) {
  const t = useT();
  const { track } = useSong();
  // The **content box**: the stage's padding is its gutter plus the device's own
  // safe-area insets, and those are the frame of the play area rather than part of
  // it. Measuring the border box here would make the layout reserve the padding
  // again and push the lanes off the bottom of a notched screen, which is the same
  // mistake in the other direction as drawing the score rail under the status bar.
  const { ref, size } = useElementSize<HTMLDivElement>(true);
  // Listen has words on screen but nobody on them: the melody is still a region,
  // and the layout engine owns its height like any other band's.
  const listenOnly = setup.players.length === 0 && track.melody.lines.length > 0;
  const layout = useMemo(
    () => computeBandLayout(setup, { w: size.width, h: size.height }, { listenOnly }),
    [setup, size.width, size.height, listenOnly],
  );
  const melody = layout.melody !== null;
  const lanes = hasLanes(setup);

  return (
    // The padding is the stage's gutter (the shared constant, through a custom
    // property) **plus the device's safe-area insets**: in fullscreen and in the
    // installed app the page reaches under the status bar, the notch and the home
    // indicator (`viewport-fit=cover`), and without this the top rail of a lone
    // player's panel is literally off the top of the screen. The JS above measures
    // the space inside it, so the two can never disagree.
    //
    // It is a **region** rather than a plain box: the stage is the thing a run
    // happens in, its label is the name a screen reader is given for it, and the
    // role is what makes that label mean something rather than being an attribute
    // on a div. The melody and the lanes inside it are their own, smaller regions
    // and groups — one landmark per thing, never two saying the same.
    <div
      className="band__stage"
      ref={ref}
      style={
        {
          "--stage-gutter": `${STAGE_GUTTER}px`,
          // The quiet beat before the highways and the words move, and how long the
          // slide takes. `hype.ts` owns the numbers (the song waits for them) and
          // `band.css` reads them, so the sound and the picture cannot drift.
          "--entrance-lead": `${ENTRANCE_LEAD_MS}ms`,
          "--entrance-slide": `${ENTRANCE_SLIDE_MS}ms`,
        } as CSSProperties
      }
      tabIndex={-1}
      role="region"
      aria-label={`${t("screen.playingNow")}: ${track.title}`}
      data-nav-default="true"
    >
      <StageBackground media={media} youtube={youtube} dim={backdropDim} />
      <SongProgress />
      <StageNotice />
      {practice ? <PracticeReadout plan={practice} track={track} /> : null}
      {melody ? (
        <MelodyRegion
          setup={setup}
          height={layout.melody?.h ?? 0}
          track={track}
          listenOnly={listenOnly}
          visualLagMs={visualLagMs}
          haptics={haptics}
        />
      ) : null}
      {lanes ? (
        <LanesRegion
          setup={setup}
          height={layout.lanes.h}
          grid={layout.grid}
          gap={DEFAULT_GAP}
          bare={layout.bare}
          tooSmall={layout.tooSmall}
          view={view}
          noteStyle={noteStyle}
          noteSpeed={noteSpeed}
          visualLagMs={visualLagMs}
          tap={tap}
          haptics={haptics}
        />
      ) : null}
      {children ? <div className="band__overlay">{children}</div> : null}
    </div>
  );
}
