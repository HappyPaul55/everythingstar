import { useMemo } from "react";
import { useT } from "../../../i18n/react";
import type { Translate } from "../../../i18n";
import {
  melodyPlayers,
  melodyRoles,
  melodyView,
  wordsCount,
  type BandSetup,
} from "../../../lib/game/band/types";
import type { Track } from "../../../lib/game/track";
import { formatScore } from "../../../lib/game/scoring";
import { FREE_PLAY } from "../../../lib/game/typing";
import { keyboardTypistSeat } from "../../../lib/game/controls/plan";
import type { PartSpan } from "../../../lib/game/audio/parts";
import { useAudio } from "../audio/StageAudio";
import { KeysView } from "./KeysView";
import { LyricsView } from "./LyricsView";
import { usePartMute } from "./PartAudio";
import { useSong } from "./SongContext";
import { useStageControls } from "./StageControls";
import { useSinging } from "./useSinging";
import { useTyping } from "./useTyping";

/**
 * The full-width melody region, always at the top of the stage.
 *
 * It shows one of two views, never both: the keys view when the song carries pitch
 * (a piano roll with the words riding the roll's own layer, beneath the bars), the
 * lyrics view otherwise — and a pitched song with no singers shows the lyrics
 * view, because typists want the words rather than the pitch. Lyrics mode is for fun: nothing about the singing is
 * scored there.
 *
 * **Every melody player is scored on their own run.** A duet keeps two scores, a
 * typist keeps theirs alongside the singers', and a note two parts sing is judged
 * for each of them — which is what two singers are, and what the one microphone
 * between them makes literal. Both kinds of run live here rather than in the view:
 * the roll draws the singers' own verdicts, so what a note says is what it was.
 */
interface Props {
  setup: BandSetup;
  height: number;
  track: Track;
  /** How far ahead of the audio clock the roll is drawn; drawing only. */
  visualLagMs: number;
  /** Render the song's words as a read-along when the band chose Listen. */
  listenOnly?: boolean;
}

export function MelodyRegion({
  setup,
  height,
  track,
  visualLagMs,
  listenOnly = false,
}: Props) {
  const t = useT();
  const { seed } = useSong();
  const { mic, plan } = useStageControls();
  // Parts belong to the song; on pitched songs, each words player chooses whether
  // to sing or type. Lyrics-only songs remain typing-only.
  const roles = useMemo(
    () => melodyRoles(setup, { parts: track.melody.parts, hasPitch: track.melody.hasPitch }),
    [setup, track.melody.parts, track.melody.hasPitch],
  );
  // A pitched song is only a piano roll when somebody is actually singing it.
  // A words player who chose Type wants the whole words, so the view follows the
  // roles as well as the song.
  const hasSingers = roles.players.some((role) => role.role === "sing");
  const view = listenOnly ? "lyrics" : melodyView(track.melody.hasPitch, hasSingers);
  const words = wordsCount(setup);
  // The band seat each of the words' players sits in, in the same order the roles
  // come back: it is what their typing input is routed to.
  const wordsSeats = useMemo(
    () => melodyPlayers(setup).map((player) => player.seat),
    [setup],
  );
  // The typists, in their own order. The first has the keyboard; the rest type
  // themselves. A lyrics song has no levels, so they all type their free play.
  // Held still: the clock re-renders this region every 80ms, and anything the
  // typing engine is handed as a *new array* every frame is a run started over
  // every frame — which is what makes a word impossible to finish.
  const typists = useMemo(
    () =>
      roles.players
        .map((role, index) => ({ role, index }))
        .filter((entry) => entry.role.role === "type"),
    [roles],
  );
  const typingPlayers = useMemo(
    () => typists.map((entry) => ({ part: entry.role.part, level: FREE_PLAY })),
    [typists],
  );
  const typingSeats = useMemo(
    () => typists.map((entry) => wordsSeats[entry.index] ?? entry.index),
    [typists, wordsSeats],
  );
  // What the results screen calls each typist. It is identity only — the score
  // comes from the run's own refs — so it can be rebuilt as the region re-renders.
  const typistIdentities = typists.map((entry, index) => ({
    key: `type-${index}`,
    label: melodyLabel(t, "type", index, entry.role.part, roles.parts),
    kind: "words" as const,
    wordsMode: "type" as const,
    seat: entry.role.seat ?? index,
    // Free play has no difficulty to report.
    difficulty: null,
    unit: "words" as const,
  }));
  const typed = useTyping({
    melody: track.melody,
    players: typingPlayers,
    seats: typingSeats,
    seed,
    // The keyboard is the plan's to give: a machine typist in the lower box leaves
    // it to the first one a person is actually playing.
    keyboardSeat: keyboardTypistSeat(plan),
    identities: typistIdentities,
  });

  // The singers, judged from the microphone when it is listening. The microphone
  // belongs to the stage (it is one between all of them), and it is only handed
  // here while it is actually hearing something: otherwise they play themselves.
  // **Who** it judges is per singer, and the answer is the plan's: a seat the plan
  // gives the microphone is live, and a seat it gives the machine plays itself.
  const singers = useMemo(
    () =>
      roles.players
        .map((role, index) => ({ role, index }))
        .filter((entry) => entry.role.role === "sing"),
    [roles],
  );
  const singingPlayers = useMemo(
    () =>
      singers.map((entry) => ({
        part: entry.role.part,
        level: entry.role.difficulty ?? "normal",
        live:
          plan.seats.find((seat) => seat.seat === entry.role.seat)?.controller.on ===
          "mic",
      })),
    [singers, plan],
  );
  // What the results screen calls each singer. Identity only; the run supplies
  // the score from its own refs, including on a flush.
  const singerIdentities = singers.map((entry, index) => ({
    key: `sing-${index}`,
    label: melodyLabel(t, "sing", index, entry.role.part, roles.parts),
    kind: "words" as const,
    wordsMode: "sing" as const,
    seat: entry.role.seat ?? index,
    difficulty: entry.role.difficulty ?? "normal",
  }));
  const sung = useSinging({
    notes: track.melody.notes,
    players: singingPlayers,
    rootMidi: track.melody.rootMidi,
    seed,
    trail: mic.status === "listening" ? mic.trail : null,
    identities: singerIdentities,
  });

  // The melody's lines are the words' phrases: a `phrase_end` mute lasts until the
  // line the missed word was in has run out. One list, read by every words card.
  const wordSpans = useMemo<PartSpan[]>(
    () =>
      track.melody.lines.map((line) => ({
        startMs: line.timeMs,
        endMs: line.endMs,
      })),
    [track.melody.lines],
  );

  return (
    // The melody is a **region** of the stage, named for what it is. Its two views
    // are the same place drawn two ways — one is ever mounted — so each is a
    // **group** inside it rather than a second landmark saying the melody again.
    <div className="melody" style={{ height }} role="region" aria-label={t("band.melody")}>
      {view === "keys" ? (
        <KeysView
          words={words}
          height={height}
          track={track}
          typing={typed}
          singing={sung}
          level={FREE_PLAY}
          visualLagMs={visualLagMs}
        />
      ) : (
        <LyricsView
          words={words}
          height={height}
          track={track}
          typing={typed}
          level={FREE_PLAY}
          parts={track.melody.parts}
        />
      )}

      {/* Scores: the singers' only where there is pitch to judge, the typists'
          wherever they are, since typing is scored in either mode. Each player on
          the words has one, and those sharing a part say so by their own number. */}
      <div className={roles.parts > 1 ? "melody-scores is-duet" : "melody-scores"}>
        {track.melody.hasPitch
          ? sung.singers.map((singer, index) => (
              <PartScore
                key={`sing-${index}`}
                part={singer.part}
                parts={roles.parts}
                player={index}
                players={sung.singers.length}
                role="sing"
                seat={singers[index]?.role.seat ?? index}
                hits={singer.hits}
                misses={singer.misses}
                spans={wordSpans}
                score={singer.score}
                combo={singer.combo}
                auto={!singer.live}
              />
            ))
          : null}
        {typed.typists.map((typist, index) => (
          <PartScore
            key={`type-${index}`}
            part={typist.part}
            parts={roles.parts}
            player={index}
            players={typed.typists.length}
            role="type"
            seat={typists[index]?.role.seat ?? index}
            hits={typist.hits}
            misses={typist.misses}
            spans={wordSpans}
            score={typist.score}
            combo={typist.combo}
            auto={typist.auto}
          />
        ))}
      </div>
    </div>
  );
}

/** How a melody player is named on the results screen: who, and which part. */
function melodyLabel(
  t: Translate,
  role: "sing" | "type",
  player: number,
  part: number,
  parts: number,
): string {
  const who = t(role === "sing" ? "screen.singer" : "screen.typist", { n: player + 1 });
  return parts > 1 ? `${who} · part ${part + 1}` : who;
}

interface ScoreProps {
  part: number;
  parts: number;
  /** Which of their role this player is, so shared parts can be told apart. */
  player: number;
  /** How many share the role: one player needs no number. */
  players: number;
  role: "sing" | "type";
  /** The band seat whose part is ducked by this card's misses. */
  seat: number;
  hits: number;
  misses: number;
  /** The melody's lines: where a `phrase_end` mute comes back. */
  spans: readonly PartSpan[];
  score: number;
  combo: number;
  auto: boolean;
}

function PartScore({
  part,
  parts,
  player,
  players,
  role,
  seat,
  hits,
  misses,
  spans,
  score,
  combo,
  auto,
}: ScoreProps) {
  const t = useT();
  const label = t(role === "sing" ? "band.sing" : "band.type");
  const { play } = useAudio();
  // The words' own part, held out by this player's misses exactly as a lane's is.
  // One card per singer or typist and one seat each, so nobody's miss can duck
  // anybody else's part; the `error` cue is the part going out, once per stop.
  usePartMute(seat, "words", { hits, misses }, {
    spans,
    onOut: () => play("error"),
  });
  return (
    <div
      className={`melody-score is-part-${part}`}
      role="group"
      aria-label={t("band.partScore", { n: part + 1, role: label })}
    >
      {/* A number when there is more than one of this role — a pair of singers
          on a solo song are told apart by it, as well as by the colour. */}
      {players > 1 ? <span className="melody-score__part">{player + 1}</span> : null}
      {parts > 1 ? <span className="melody-score__role-part">part {part + 1}</span> : null}
      <span className="melody-score__role">
        {label}
        {auto ? ` · ${t("band.auto")}` : ""}
      </span>
      <span className="melody-score__value">{formatScore(score)}</span>
      <span className="melody-score__combo">
        {t("band.combo")} ×{combo}
      </span>
    </div>
  );
}
