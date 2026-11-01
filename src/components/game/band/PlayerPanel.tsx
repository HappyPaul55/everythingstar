import { useEffect, useRef } from "react";
import { useT } from "../../../i18n/react";
import type { LanePlayer } from "../../../lib/game/band/types";
import type { HighwayView, NoteStyle } from "../../../lib/game/settings";
import { INSTRUMENTS, chartFor } from "../../../lib/game/track";
import { useAudio } from "../audio/StageAudio";
import { partKeyOf } from "../../../lib/game/audio/parts";
import { controllerLabels } from "../../../lib/game/controls/plan";
import { Highway } from "./Highway";
import { useCoarsePointer } from "./useCoarsePointer";
import { useFirstRunHint } from "./useFirstRunHint";
import { InfoRail } from "./InfoRail";
import { usePartMute } from "./PartAudio";
import { ScoreRail } from "./ScoreRail";
import { useSong } from "./SongContext";
import { useStageControls } from "./StageControls";
import { useLaneRun } from "./useLaneRun";
import { useHaptics } from "./useHaptics";

/**
 * One instrument panel: the score (left), the note highway (centre) and the info
 * rail (right). It is an instrument-agnostic shell — the instrument decides the
 * kit and the chart decides the columns — and it owns its own run, fed by its
 * own chart and its own input. Nothing here reads another player's state.
 */
interface Props {
  player: LanePlayer;
  width: number;
  height: number;
  /** Which way the highway is drawn. */
  view: HighwayView;
  /** What a note's face looks like: a bar, a gem or an arrow. Drawing only. */
  noteStyle: NoteStyle;
  /** How fast the notes travel; drawing only. */
  noteSpeed: number;
  /** How far ahead of the audio clock the highway is drawn; drawing only. */
  visualLagMs: number;
  /** Whether tapping a hit marker plays the note above it. */
  tap: boolean;
  /** Whether this panel's misses and spent star power are felt. Feedback only. */
  haptics: boolean;
  /** A lone player on an empty stage: no panel frame, just its parts. */
  bare?: boolean;
}

export function PlayerPanel({ player, width, height, view, noteStyle, noteSpeed, visualLagMs, tap, haptics, bare = false }: Props) {
  const t = useT();
  const coarse = useCoarsePointer();
  const { track, seed } = useSong();
  const { play } = useAudio();
  // Who is playing this panel is the control plan's to say, because it is what
  // routes input. A seat the machine is covering has no hands, even if the dev
  // panel's count is what put it there rather than the player's own flag.
  const { plan } = useStageControls();
  const seatControl = plan.seats.find((entry) => entry.seat === player.seat);
  const auto = seatControl ? seatControl.controller.on === "none" : player.auto;
  const chart = chartFor(track, player.kind, player.difficulty, player.role);
  // The first few notes carry their own controls, read from this seat's **resolved**
  // mapping — a second keyboard player's `H J K L ;`, a pad's buttons, a MIDI kit's
  // notes. A machine seat has no hands to teach, so it gets none.
  //
  // A coarse pointer with tap on is played by **tapping the pads**, so the keys a
  // keyboard would use are not the player's controls; the lesson says that instead
  // (`Highway`'s own coach), and no key caps are drawn.
  const touch = tap && coarse && !auto;
  const labels = auto || !seatControl || touch ? null : controllerLabels(seatControl);
  // Each **seat** gets the lesson once. Player 3 still gets it when Players 1 and
  // 2 have already played; it is not one browser-wide first run.
  const lesson = (labels !== null || touch) && (chart?.notes.length ?? 0) > 0;
  const firstRun = useFirstRunHint(player.seat, lesson);
  const name = player.name ?? t("band.player", { n: player.seat + 1 });
  // What the chart says the seat is: a lead and a rhythm guitar are both guitars,
  // and the panel says which one this is.
  // A loaded chart is the truth: a roleless guitar chart says "Guitar" even if the
  // remembered seat was once a rhythm player on another song.
  const role = chart ? chart.role : player.role;
  const label = role
    ? t(role === "lead" ? "band.leadGuitar" : "band.rhythmGuitar")
    : t(INSTRUMENTS[player.kind].labelKey);
  const { run, held, tapDown, tapUp, slide } = useLaneRun({
    chart: chart ?? null,
    seed,
    // The player's own place in the band: their controller's input, and the run
    // that answers for it.
    seat: player.seat,
    auto,
    // What the results screen calls this run. The hook reports it from its own
    // refs, so the entry is as current as the judging — including on a flush.
    identity: {
      key: `lane-${player.id}`,
      label: `${name} · ${label}`,
      kind: player.kind,
      seat: player.seat,
      difficulty: player.difficulty,
    },
  });

  // A miss takes the stems this player's instrument owns out of the song, and the
  // song document's own rule puts them back — on the next hit, or at the end of the
  // phrase the miss fell in. A lead and a rhythm guitar are their own keys, so a
  // missed lead note leaves the rhythm playing. A song shipped as one master has no
  // stem to duck, so nothing actually drops — but the cue still plays, because
  // that is the moment the player's channel *would* have stopped. It is the sound of
  // the part going out, once per stop, not once per miss.
  usePartMute(
    player.seat,
    partKeyOf(player.kind, role),
    run,
    { spans: chart?.phrases, onOut: () => play("error") },
  );

  // A note that simply passes is still a `miss` (silent until a file arrives); it is
  // watched apart from the part going out, which is what `usePartMute` reports.
  const misses = useRef(0);
  useEffect(() => {
    if (run.misses > misses.current) play("miss");
    misses.current = run.misses;
  }, [run.misses, play]);

  // The same two moments, felt rather than heard: a miss is a short tap and a spent
  // meter is the longer pattern. A seat the machine is covering has no hands, so it
  // gets neither — and the gap between device buzzes is shared across the band.
  useHaptics({
    enabled: haptics && !auto,
    seat: player.seat,
    misses: run.misses,
    starUntilMs: run.starUntilMs,
  });

  // A hero note landing is its own small event: a sparkle for the note. A chord
  // with two hero notes rises by two at once, so it is one gesture and one cue; a
  // rewind or a new run drops the count and only resets what this effect remembers.
  const heroRef = useRef(0);
  useEffect(() => {
    if (run.heroHits > heroRef.current) {
      play("sparkle");
    }
    heroRef.current = run.heroHits;
  }, [run.heroHits, play]);

  // The gauge filling makes no sound of its own: the rail already draws it, and a
  // swell every time a streak topped it up sat over the song rather than in it. The
  // one star-power cue left is spending the thing (`meter_activate` below).

  // A spent meter is its own moment: the whammy bought a window, and the cue says
  // so once. The window is a song-time stamp, so a run that starts over — a seek, a
  // new chart, a new band — is remembered as a rewind (the hits go backwards, the
  // same rule the parts use) and the ref starts clean rather than comparing two
  // runs' clocks.
  const starRef = useRef({ until: 0, hits: 0 });
  useEffect(() => {
    const seen = starRef.current;
    const previous = run.hits < seen.hits ? 0 : seen.until;
    if (run.starUntilMs > previous) play("meter_activate");
    starRef.current = { until: run.starUntilMs, hits: run.hits };
  }, [run.starUntilMs, run.hits, play]);

  return (
    <section
      className={bare ? "player-panel player-panel--bare" : "player-panel"}
      style={{ width, height }}
      aria-label={`${name} — ${label}`}
    >
      <ScoreRail name={name} kind={player.kind} difficulty={player.difficulty} auto={auto} run={run} />
      {chart ? (
        <Highway
          chart={chart}
          run={run}
          held={held}
          labels={labels}
          touch={touch}
          firstRun={firstRun}
          view={view}
          noteStyle={noteStyle}
          noteSpeed={noteSpeed}
          visualLagMs={visualLagMs}
          /* The pads are someone's hands. A player the machine is covering has
             none, so there is nothing there to press. */
          tap={tap && !auto}
          onTapDown={tapDown}
          onTapUp={tapUp}
          onSlide={slide}
        />
      ) : (
        <div className="highway highway--empty" role="note">
          {t("band.noChart")}
        </div>
      )}
      <InfoRail run={run} starActive={run.starActive} />
    </section>
  );
}
