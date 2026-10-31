import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MessageKey } from "../../../i18n";
import { useT } from "../../../i18n/react";
import { lineupPlayers, type BandSetup } from "../../../lib/game/band/types";
import { COUNT_UP_MS, countUpSteps, countUpValue } from "../../../lib/game/countUp";
import type { Song } from "../../../lib/game/song";
import { shortDate } from "../../../lib/game/when";
import {
  bestFor,
  LINEUP_FREE_PLAY,
  lineupKey,
  saveRun,
  shouldSaveRun,
  topFor,
  type SavedRun,
} from "../../../lib/game/scores";
import {
  formatScore,
  hitRate,
  lostRun,
  ratingScore,
  starRating,
} from "../../../lib/game/scoring";
import { useAudio } from "../audio/StageAudio";
import { useReducedMotion } from "../band/useReducedMotion";
import {
  useRunBoard,
  useRunBoardVersion,
  type RunEntry,
} from "../band/RunBoard";
import { kindTone } from "./playerBits";
import type { BragRun } from "./BragCardDialog";

/**
 * The brag card is opened by one press on a finished run, so its chunk — the SVG
 * builder and the fonts it inlines — is fetched then rather than with the results.
 * The fallback is nothing: a dialog arriving a moment later is invisible, while a
 * whole-screen spinner is not.
 */
const BragCardDialog = lazy(() =>
  import("./BragCardDialog").then((module) => ({
    default: module.BragCardDialog,
  })),
);

/**
 * The end of a run: what the band made of the song, who made what of it, and
 * where that sits against this browser's own history for the song.
 *
 * The numbers are the runs' own — every player kept its own run, so this adds up
 * what they reported rather than inventing a band figure — and then hands the song
 * to **one card per player**, drawn like their box on the band screen, because the
 * question after a song is "how did each of us do" rather than what the total was.
 * The run is saved to the **local** board as the screen opens, which is also what
 * makes "new best" mean something — unless nobody played, as in Listen: there is
 * no run then, and a zero written down would become the song's best — or unless
 * the band **lost** it, because a lost run is a verdict rather than a score. A run
 * is kept against its song, and compared against the runs of the **same lineup** —
 * each player's instrument and difficulty, and what the words player did — because
 * difficulty is each player's and an Expert band is not playing the same game as an
 * Easy one. The history below is still the song's own, across lineups, because a
 * run is still a run.
 */
interface Props {
  song: Song;
  /** The band that just played it, so the run can be keyed by its lineup. */
  setup: BandSetup;
  /** The board as it was before this run. */
  saved: SavedRun[];
  onSaved: (board: SavedRun[]) => void;
  onReplay: () => void;
  onMenu: () => void;
  /**
   * Whether this run belongs on the board. The attract demo shows the same screen
   * but is nobody's run: a machine score written down would become a song's best
   * and would greet the next player as something they have to beat.
   */
  save?: boolean;
}

export function Results({
  song,
  setup,
  saved,
  onSaved,
  onReplay,
  onMenu,
  save = true,
}: Props) {
  const t = useT();
  const board = useRunBoard();
  const { play } = useAudio();
  // What this run is compared against. A stable key rather than the variables: the
  // same band is the same string however the seats are ordered. `lineupPlayers` is
  // what settles a slot's difficulty against the song — a singer's Expert is the
  // microphone's Hard, a typist has none — so the key names the band the runs were
  // judged as, not the band the slots asked for.
  const lineup = useMemo(
    () => lineupKey(lineupPlayers(setup, song)),
    [setup, song],
  );
  // The runs are over by now: `StageDirector` flushed every mounted run's last
  // frame before it changed the screen, and the board's revision changes with that
  // flush. Keying the snapshot on both the board and its revision means a report
  // that lands while this screen is up is visible too, without making every run
  // report re-render anything. **In band order**: the runs report in whatever order
  // they were published, and the band is the one order they were standing in.
  const version = useRunBoardVersion();
  const runs = useMemo(
    () => [...board.entries()].sort((a, b) => a.seat - b.seat),
    [board, version],
  );

  const score = runs.reduce((total, run) => total + run.score, 0);
  const hits = runs.reduce((total, run) => total + run.hits, 0);
  const misses = runs.reduce((total, run) => total + run.misses, 0);
  const judged = runs.reduce((total, run) => total + run.judged, 0);
  const bestCombo = runs.reduce((best, run) => Math.max(best, run.bestCombo), 0);
  const accuracy = hitRate(hits, judged);
  const baseScore = runs.reduce((total, run) => total + run.baseScore, 0);
  const totalNotes = runs.reduce((total, run) => total + run.total, 0);
  // A fill is paid but is not in the song's base score, so it must not buy stars.
  // The score shown below still includes it — the drummer played it — while the
  // rating is read against what was actually played. A **slide** is the same shape
  // for a different reason: only a finger gliding on a touch screen can earn one,
  // so leaving it in the rating would make stars a controller advantage.
  const fillHits = runs.reduce((total, run) => total + (run.fillHits ?? 0), 0);
  const slidePoints = runs.reduce(
    (total, run) => total + (run.slidePoints ?? 0),
    0,
  );
  const rating = starRating(
    ratingScore(score, fillHits, slidePoints),
    baseScore,
    hits,
    judged,
    totalNotes,
  );
  // A loss is the runs' own verdict now: enough judged to mean something, and
  // fewer than half of those hit. It is read from the published totals, never a
  // session flag, so the results screen cannot disagree with the numbers over it.
  const failed = lostRun(hits, judged);

  /** Whether the brag card is over the screen. */
  const [bragOpen, setBragOpen] = useState(false);

  const [verdict, setVerdict] = useState<{
    best: number | null;
    newBest: boolean;
  } | null>(null);
  const recorded = useRef(false);

  // The run's own moment for the card's date, kept still across re-renders.
  const playedAt = useRef(Date.now()).current;
  /*
   * A card is only for a run the board actually kept: the demo's machine score is
   * nobody's, Listen published no run, a lost run is a verdict and a stage that
   * judged nothing has no performance to post. `verdict` is the screen's own answer
   * to "was this recorded", so the button cannot appear over a run that is not.
   */
  const canBrag = save && !failed && verdict !== null && runs.length > 0;
  const brag = useMemo<BragRun>(
    () => ({
      title: song.title,
      artist: song.artist.name,
      score,
      stars: rating.stars,
      gold: rating.gold,
      accuracy,
      bestCombo,
      players: runs.length,
      at: playedAt,
      accent: song.accent,
    }),
    [
      song.title,
      song.artist.name,
      song.accent,
      score,
      rating.stars,
      rating.gold,
      accuracy,
      bestCombo,
      runs.length,
      playedAt,
    ],
  );

  // Record the run, once. The guard matters: a re-render must not record it twice.
  //
  // **Nothing was played, nothing is saved.** An empty band is Listen: no player
  // publishes a run, so there is no score to keep — and writing the zero down would
  // make it the song's best, which is the one thing a history must not say. The
  // screen then says nothing about a best, and the history below is left as it was.
  // The dev screen jumper lands here too, and must not pollute the board either.
  // **A panel that judged nothing is the same kind of nothing**: a chart that never
  // arrived, or a folder the browser would not open, publishes a run of zeroes, and
  // `shouldSaveRun` is what keeps those off the board.
  //
  // **A lost run is not a score either.** It happened, and the screen says so, but
  // it does not go on the board: a band that hit fewer than half of what it judged
  // gets a verdict rather than a number to beat. The verdict is still made, so the
  // line under the totals can say the band lost it.
  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    // The demo's numbers are a read-out, not a score. There is no verdict either:
    // "new best" is a claim about a board this run did not join.
    if (!save) {
      setVerdict(null);
      return;
    }
    const previous = bestFor(saved, song.id, lineup);
    if (!shouldSaveRun({ runs: runs.length, failed, judged, score })) {
      // A lost run still gets its verdict. A stage that judged nothing gets none:
      // there was no run to be better or worse than the song's best.
      if (failed) setVerdict({ best: previous, newBest: false });
      return;
    }
    onSaved(
      saveRun({
        song: song.id,
        title: song.title,
        failed: false,
        score,
        bestCombo,
        hits,
        misses,
        baseScore,
        stars: rating.stars,
        gold: rating.gold,
        average: rating.average,
        lineup,
        players: runs.map((run) => ({
          label: run.label,
          score: run.score,
          difficulty: run.difficulty,
        })),
        at: Date.now(),
      }),
    );
    // A saved run is never a zero, so a first run is a best and a later one has
    // something to beat.
    setVerdict({ best: previous, newBest: previous === null || score > previous });
  }, [
    song.id,
    song.title,
    failed,
    judged,
    score,
    bestCombo,
    hits,
    misses,
    baseScore,
    rating.stars,
    rating.gold,
    rating.average,
    runs,
    lineup,
    saved,
    onSaved,
    save,
  ]);

  // The history stays the song's own, across lineups: a run is still a run. Its rows
  // say which band played it, so a reader can see why the scores differ.
  const table = topFor(saved, song.id);

  // The sting for how the run went. It is silent until the stings are bought — a
  // type nothing can play is silence, not an error — and the moment one lands it is
  // already in the right place.
  useEffect(() => {
    play(failed ? "fail" : "win");
  }, [failed, play]);

  // A personal best gets its sting as soon as the verdict is in. The room no longer
  // answers with applause: the run is the game's own sound, and the pause's crowd is
  // the only crowd in the mix.
  useEffect(() => {
    if (!verdict || failed) return;
    if (verdict.newBest) play("best");
  }, [verdict, failed, play]);

  return (
    <div className="screen screen--results">
      <div className="screen__panel screen__panel--page">
        {/* A page, not a dialog: it is labelled like one, and the way out of it is
            the way out of any screen — the action at the end. */}
        <section
          className={failed ? "results results--failed" : "results"}
          aria-labelledby="results-title"
        >
          <div className="results__titles">
            {/* The tag over the title, the way every other screen is headed: the
                results are the screen, and the song is what it is about. */}
            <p className="comment on-ink screen__comment">
              <span className="slash" aria-hidden="true">
                //
              </span>{" "}
              {t("screen.resultsComment")}
            </p>
            <h2
              className="screen__title"
              id="results-title"
              tabIndex={-1}
              data-nav-default="true"
            >
              {t(failed ? "screen.runOver" : "screen.results")}
            </h2>
          </div>

          <p className="results__song">
            <span className="results__song-title">{song.title}</span>{" "}
            <span className="results__song-by">
              {t("screen.resultsBy", { artist: song.artist.name })}
            </span>
          </p>

          {/* The run's rating: the stars are what a player reads first after the
              score, and the average multiplier says why they got them. */}
          <div className="results__rating">
            <Rating stars={rating.stars} gold={rating.gold} average={rating.average} />
          </div>

          {/* The row below is the reason for the screen. A player whose focus
              starts on Replay should still hear the numbers without hunting. */}
          <p className="sr-only" role="status" aria-live="polite">
            {t("screen.total")} {formatScore(score)}.{" "}
            {rating.stars === 0
              ? t("screen.noRating")
              : rating.gold
                ? t("screen.goldStars")
                : t("screen.stars", { n: rating.stars })}
            . {t("screen.accuracy")} {accuracy}%. {t("screen.bestCombo")} ×{bestCombo}.
          </p>

          {/* The band's numbers, one read each — and the score is a read like the
              rest rather than a headline with a field of nothing beside it. "0/42
              notes" says both halves of the same thing, so the hits are one tile. */}
          <dl className="results__summary">
            <Metric label={t("screen.total")} value={<CountUp value={score} />} total />
            <Metric
              label={t("screen.hits")}
              value={`${formatScore(hits)}/${formatScore(judged)}`}
            />
            <Metric label={t("screen.accuracy")} value={`${accuracy}%`} />
            <Metric label={t("screen.bestCombo")} value={`${bestCombo}`} />
          </dl>

          <p className="results__best" role="status" aria-live="polite">
            {verdict === null
              ? ""
              : failed
                ? t("screen.failed")
                : verdict.newBest
                  ? t("screen.newBest")
                  : verdict.best !== null
                    ? t("screen.best", { score: formatScore(verdict.best) })
                    : t("screen.noBest")}
          </p>

          {runs.length > 0 ? (
            <div className="results__section results__section--cards">
              <p className="results__heading">{t("screen.whoPlayed")}</p>
              <ul className="results__players" aria-label={t("screen.playersLabel")}>
                {runs.map((run) => (
                  <PlayerCard key={run.key} run={run} />
                ))}
              </ul>
            </div>
          ) : null}

          {table.length > 0 ? (
            <div className="results__section">
              <p className="results__heading">
                {t("screen.savedTop", { count: table.length })}
              </p>
              <ol className="results__board-list">
                {table.map((run, index) => (
                  <li className="results__saved" key={`${run.at}-${index}`}>
                    <span className="results__saved-rank">{index + 1}</span>
                    {/* Every row is the same song, so the song is what the heading
                        already said: what tells them apart is when it was played —
                        unless it was lost, which is worth saying. And how many were
                        on stage, with the lineup under it: why an Expert score can
                        sit above an Easy one without either being the other's
                        better. */}
                    <span className="results__saved-meta">
                      <span className="results__saved-when">
                        {run.failed ? t("screen.lost") : shortDate(run.at)}
                      </span>
                      <span className="results__saved-band">
                        {t("screen.savedBand", { count: run.players.length })}
                      </span>
                      {run.lineup ? (
                        <span className="results__saved-lineup">
                          <LineupText lineup={run.lineup} />
                        </span>
                      ) : null}
                    </span>
                    {run.stars ? (
                      <span className="results__saved-stars">
                        <Stars stars={run.stars} gold={run.gold ?? false} />
                      </span>
                    ) : null}
                    <span className="results__saved-score">{formatScore(run.score)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="results__actions">
            <button
              type="button"
              className="band-btn band-btn--primary"
              data-sound="select"
              onClick={onReplay}
            >
              {t("screen.replay")}
            </button>
            <button type="button" className="band-btn" data-sound="back" onClick={onMenu}>
              {t("screen.changeSong")}
            </button>
            {/* Only for a run the board kept: see `canBrag`. The card is a dialog,
                so it says so and takes the game's open cue. */}
            {canBrag ? (
              <button
                type="button"
                className="band-btn"
                aria-haspopup="dialog"
                data-sound="open"
                onClick={() => setBragOpen(true)}
              >
                {t("brag.action")}
              </button>
            ) : null}
          </div>
        </section>
      </div>

      {/* The brag card, over the results. It is a native dialog with a focus trap
          and the opener back on close, exactly like the game's other modals. */}
      {bragOpen && canBrag ? (
        <Suspense fallback={null}>
          <BragCardDialog run={brag} onClose={() => setBragOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}

/**
 * One player's card: who they were, what they were playing at, what they made, and
 * the small print under a dashed rule — the same shape as their box on the band
 * screen, so the run reads as the band that played it.
 */
function PlayerCard({ run }: { run: RunEntry }) {
  const t = useT();
  const hitRatePercent = hitRate(run.hits, run.judged);
  const rating = starRating(
    ratingScore(run.score, run.fillHits ?? 0, run.slidePoints ?? 0),
    run.baseScore,
    run.hits,
    run.judged,
    run.total,
  );
  // A highway counts notes; a typist types words. The run says which, so the card
  // can name the right thing rather than calling every count a note.
  const unit = t(run.unit === "words" ? "screen.words" : "screen.notes");

  return (
    <li className="results__player">
      <div className="results__player-head">
        <span
          className={`results__player-who${
            kindTone(run.kind, run.wordsMode) === "vocals" ? " is-vocals" : ""
          }`}
        >
          {run.label}
        </span>
        <span className="results__tag">
          {run.difficulty
            ? t(`band.${run.difficulty}` as "band.easy")
            : t("screen.freePlay")}
        </span>
      </div>
      <p className="results__player-score">{formatScore(run.score)}</p>
      <div className="results__player-rating">
        <Rating stars={rating.stars} gold={rating.gold} average={rating.average} />
      </div>
      <p className="results__player-stats">
        {t("screen.countOf", { hits: run.hits, total: run.judged, unit })}
        <span className="results__dot" aria-hidden="true">
          ·
        </span>
        {hitRatePercent}% {t("screen.accuracy")}
        <span className="results__dot" aria-hidden="true">
          ·
        </span>
        {run.bestCombo} {t("band.combo")}
        {run.typing ? (
          <>
            <span className="results__dot" aria-hidden="true">
              ·
            </span>
            {t("screen.typingWpm", { wpm: run.typing.wpm })}
            <span className="results__dot" aria-hidden="true">
              ·
            </span>
            {t("screen.typingAccuracy", { accuracy: run.typing.accuracy })}
          </>
        ) : null}
      </p>
    </li>
  );
}

/**
 * The lineup a saved run was played by, in words: the stored key is storage, not
 * something a player reads. Each player is their instrument and level, and the words
 * player also says whether they sang or typed.
 */
function LineupText({ lineup }: { lineup: string }) {
  const t = useT();
  const parts = lineup
    .split("+")
    .filter(Boolean)
    .map((entry) => {
      const [kind, difficulty, extra] = entry.split(":");
      const bits: string[] = [];
      // A guitar says which part it played rather than naming the instrument twice:
      // "Lead guitar · Expert", not "Lead guitar · Guitar · Expert".
      if (kind === "guitar" && (extra === "lead" || extra === "rhythm")) {
        bits.push(t(extra === "lead" ? "band.leadGuitar" : "band.rhythmGuitar"));
      } else if (kind) {
        bits.push(t(`band.${kind}` as MessageKey));
      }
      if (difficulty) {
        bits.push(
          difficulty === LINEUP_FREE_PLAY
            ? t("screen.freePlay")
            : t(`band.${difficulty}` as MessageKey),
        );
      }
      if (kind === "words" && extra) bits.push(t(`band.${extra}` as MessageKey));
      return bits.join(" · ");
    });
  return <>{parts.join(" + ")}</>;
}

/**
 * A run's stars, as glyphs and one accessible label. Gold is not a sixth star:
 * it is the same five, lit in the brand's yellow, for the run that hit everything.
 */
function Stars({ stars, gold }: { stars: number; gold: boolean }) {
  const t = useT();
  const filled = Math.max(0, Math.min(5, Math.round(stars)));
  if (filled === 0) {
    return <span className="results__stars results__stars--none">{t("screen.noRating")}</span>;
  }
  return (
    <span
      className={gold ? "results__stars is-gold" : "results__stars"}
      role="img"
      aria-label={gold ? t("screen.goldStars") : t("screen.stars", { n: filled })}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={index < filled ? "results__star is-on" : "results__star"}
          aria-hidden="true"
        >
          ★
        </span>
      ))}
    </span>
  );
}

/**
 * A rating: the stars and, when there is any rating to speak of, the average
 * multiplier that earned them. One block wherever a run is rated — the band's own
 * and each player's card — because two ratings drawn two ways would read as two
 * different things.
 */
function Rating({
  stars,
  gold,
  average,
}: {
  stars: number;
  gold: boolean;
  average: number;
}) {
  const t = useT();
  return (
    <>
      <Stars stars={stars} gold={gold} />
      {stars > 0 ? (
        <span className="results__average">
          {t("screen.averageMultiplier")} ×{average.toFixed(2)}
        </span>
      ) : null}
    </>
  );
}

/**
 * The band's total, counting up to itself.
 *
 * The number is a moment, so it lands over about a second with a `tick` on each
 * step rather than appearing whole. The steps are the pure part (`countUp.ts`):
 * twenty at most over that second, never a tick per frame, and fewer for a very
 * small total. The
 * figure the screen announces is the **final** one — the live region above says it
 * once — so the counting figure itself is decorative and hidden from a reader.
 *
 * Reduced motion shows the final number at once and plays no ticks. The animation
 * is cancelled when it finishes, when the total changes, or when the screen goes,
 * and it is keyed on the total rather than on a render, so a `Results` re-render
 * for anything else does not start it again.
 */
function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const { play } = useAudio();
  // A reduced-motion reader opens on the final number; everyone else counts to it.
  // The preference is known on the first render, so no tick can slip out first.
  const [shown, setShown] = useState(() => (reduced ? value : 0));

  useEffect(() => {
    if (reduced || value <= 0) {
      setShown(value);
      return;
    }
    const steps = countUpSteps(value);
    const start = performance.now();
    let step = 0;
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - start) / COUNT_UP_MS);
      const at = Math.round(progress * steps);
      if (at !== step) {
        step = at;
        setShown(countUpValue(value, at, steps));
        play("tick");
      }
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    setShown(0);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced, play]);

  return (
    <>
      <span aria-hidden="true">{formatScore(shown)}</span>
      <span className="sr-only">{formatScore(value)}</span>
    </>
  );
}

function Metric({
  label,
  value,
  total = false,
}: {
  label: string;
  value: ReactNode;
  /** The band's own score: the first tile, and the one worth reading first. */
  total?: boolean;
}) {
  return (
    <div className={total ? "results__metric results__metric--total" : "results__metric"}>
      <dt className="results__metric-label">{label}</dt>
      <dd className="results__metric-value">{value}</dd>
    </div>
  );
}
