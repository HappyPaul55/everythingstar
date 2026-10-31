import {
  FILL_POINTS,
  HIT_WINDOW_MS,
  STAR_MULTIPLE,
  holdBasePoints,
  multiplier,
  notePoints,
} from "./scoring";
import { isOpen, momentAt, strums, type ChartPhrase, type LaneChart, type LaneNote } from "./track";
import {
  STAR_POWER_MS,
  canActivateStar,
  drainMeter,
  fillMeter,
  missMeter,
  starPowerActive,
} from "./meter";

/**
 * Judging a player's highway: one pure reducer per player, advanced from the
 * clock and fed that player's own input. Nothing here reads another player's
 * state — ever — so no one's run can be blocked by anyone else's miss.
 *
 * The rules:
 *
 * - **Note kinds.** A note is a `strum` or a `hopo`. A strum needs the strum
 *   gesture with its frets held; a hopo is hammered while its chain holds and
 *   strummed once it does not. **Tapping is not a note kind**: a tapped
 *   instrument (keys, dance, or a guitar on a phone) plays every note by pressing
 *   its fret, with the tap supplying the strum.
 * - **Tapping the hit line.** A `touch` trigger is a tap on a pad: it carries its
 *   own strum, so it plays **any** note under that column — strum, hopo or
 *   open — without asking about the hopo chain. That is the playing style for a
 *   phone, where there is no strum bar to press and no second hand to press it.
 * - **A slide is a finger, not a note kind.** A chart may **link** one fretted
 *   note to a later one (`LaneNote.slideTo`), and a run that already hit the
 *   source may glide the finger from its column to the target's without lifting.
 *   The arrival plays the target as a touch — no new press, and no
 *   `TAP_CHORD_MS`, because it is one finger arriving rather than two taps of a
 *   chord — and the target's sustain is held from there. The glide pays the hold
 *   value of the span it crossed (`holdBasePoints`), at the arrival's streak and
 *   the star power over that span, and records it as `slidePoints` so the rating
 *   can take it back out: only a touch screen can play it, and a stars rating must
 *   not reward the controller. A glide with no link, off a source that has not
 *   landed, or onto a note already played does nothing at all — it is not an
 *   error, and it is not a fill hit either. A strum, keyboard, gamepad or MIDI
 *   player never earns one, and the machine player is unchanged.
 * - **Chords.** Notes sharing a moment are one chord, judged together on a
 *   strum: the whole chord is hit when every fret is held, and missed when one is
 *   not. A chord is not partly played — one hand short is a miss for the gesture.
 *   Taps are the exception a touch screen needs: each landed column wins its own
 *   note, but the taps of one chord must fall within `TAP_CHORD_MS` of the first,
 *   because two fingers are never quite simultaneous. A tap later than that is not
 *   part of the chord and does nothing; the note it aimed at is left to pass.
 * - **Errors are the player's.** A strum with a fret missing — or a strum with
 *   nothing to judge — counts an `error`; a note whose window closes without a
 *   strum is a miss and not an error. The judging is the same either way; the count
 *   is what lets a mistake be heard as one. A tap at nothing is a hand moving on a
 *   touch screen, and is not an error.
 * - **A fill is a freestyle window.** A drum chart marks its fills
 *   (`LaneChart.fills`). The notes inside one are judged exactly as any other note
 *   — a fill is not a licence to skip them — but a strike that has nothing to judge
 *   is a **fill hit** rather than an error. It pays `FILL_POINTS` flat, fills the
 *   meter by a note, and does not touch the combo or the counts a player's accuracy
 *   is read from; at most one every `FILL_HIT_MS`, so holding a key down cannot
 *   turn a fill into a score fountain.
 * - **Open notes.** Strummed with no frets at all, and alone by construction.
 * - **Sustains.** The hit pays the note's base value, and the hold pays
 *   `HOLD_POINTS_PER_MEASURE` per note for each measure held, prorated and
 *   multiplied by the current multiplier. A chord can hold several at once, each
 *   on its own fret, and letting one go stops only that one.
 * - **Star power.** A wave of the whammy with the meter at the top spends the whole
 *   gauge and buys `STAR_POWER_MS` of double points; every note gesture and every
 *   hold payment inside that window is worth `STAR_MULTIPLE` on top of the streak.
 *   The whammy adds no points of its own, and a wave at any other time does nothing
 *   — a hidden source of score would make score over base stop meaning "the
 *   multiplier this run sustained".
 * - **Chords are one scoring gesture.** A strummed chord takes the multiplier at
 *   the moment it lands, so the table's 50-per-note totals are exact even when the
 *   chord crosses a multiplier step. Taps share the first tap's multiplier for the
 *   same reason.
 * - **Hero notes** are worth `HERO_MULTIPLE` times as much, on the note's own
 *   value — the combo multiplier applies after, exactly as for any other note. A
 *   hero note that lands is also counted in `heroHits`, a read-out for its cue and
 *   never part of judging.
 */

/**
 * How far apart the taps of one chord may land, in ms.
 *
 * Two fingers are never quite simultaneous — and on a phone they are not even the
 * same hand — so a chord's taps are held to one gesture rather than to a sample.
 * It is deliberately shorter than `HIT_WINDOW_MS`: a chord is still played *together*,
 * it is only allowed to be a little ragged.
 */
export const TAP_CHORD_MS = 90;

/**
 * How often a **fill hit** can pay, in ms. A fill is a place to play freely, so
 * every strike that has no note to judge is one; this is what keeps a held key, a
 * gamepad's repeat or a very busy hand from turning the window into a score
 * fountain. About eight hits a second — fast enough to feel like drumming, far too
 * slow to matter beside the notes.
 */
export const FILL_HIT_MS = 120;

/** Whether a moment falls inside one of the chart's fills. */
export function inFill(fills: readonly ChartPhrase[] | undefined, timeMs: number): boolean {
  if (!fills) return false;
  return fills.some((fill) => timeMs >= fill.startMs && timeMs <= fill.endMs);
}

export type NoteOutcome = "pending" | "hit" | "miss";

/**
 * Something the player did. `strum` is the strum bar, `fret` is pressing a fret
 * (which is all a tapped instrument has, and how a hopo is hammered), `whammy` is
 * the extra key waving while a note is held, `touch` is a tap on a pad — a
 * fret and a strum in one gesture — and `slide` is that finger arriving on
 * another pad, still down.
 */
export interface LaneTrigger {
  timeMs: number;
  signal: "strum" | "fret" | "whammy" | "touch" | "slide";
  /** Which columns are held, by column. */
  frets: boolean[];
  /**
   * The column pressed, for a `fret` or a `touch` signal — or the column a
   * `slide` **arrives on**. An open note has none, but a slide can never target
   * one: both ends of a link are fretted.
   */
  column: number | null;
  /**
   * The column the finger left, for a `slide` only. It is where the source note
   * must have been: the link is played from that pad, not from any other, so a
   * glide that started somewhere else is not this target's slide.
   */
  from?: number;
}

export interface LaneRun {
  /** One per note of the chart. */
  outcomes: NoteOutcome[];
  /** Notes whose window has closed. */
  cursor: number;
  judged: number;
  hits: number;
  misses: number;
  /**
   * Mistakes the **player** made: a strum with a fret missing, or a strum at
   * nothing. A note that simply passes is a miss and not an error — the player did
   * not do it, the window closed — which is why the two are counted apart: the error
   * is the one worth a sound of its own.
   */
  errors: number;
  combo: number;
  bestCombo: number;
  score: number;
  meter: number;
  /**
   * How many **hero notes** this run has hit. A chord with two hero notes counts
   * two, because two notes landed; it is a read-out for the cue that marks one,
   * never a judging rule.
   */
  heroHits: number;
  /**
   * The sustains being held, by note index: a chord can hold several at once, and
   * each is let go on its own fret rather than as one.
   */
  holding: number[];
  /**
   * When each note **landed**, in song time, and `null` for one that has not been
   * hit. A miss never gets a time: nothing landed. It is a read-out for the hit's
   * own feedback (the burst on the line), never a judging rule, and a chord shares
   * the one moment its gesture was played at.
   */
  hitTimes: (number | null)[];
  /**
   * When each note was **tapped**, and `null` for one that was strummed or has not
   * been played. It is how a chord's taps are kept to one gesture: the first tap of
   * a moment starts the clock, and a tap later than `TAP_CHORD_MS` is not part of it.
   */
  tapTimes: (number | null)[];
  /**
   * The multiplier each tapped note was scored at. A chord's taps are one
   * gesture, so its later taps use the multiplier the first tap landed on.
   */
  tapMultipliers: number[];
  /**
   * When the star-power window bought from the meter ends, in song time, or `0`
   * when one has never been bought.
   */
  starUntilMs: number;
  /** Whether that window is live at the moment the run was last advanced to. */
  starActive: boolean;
  /**
   * How many **fill hits** this run has landed: strikes inside a freestyle window
   * that had no note to judge. It is a read-out of its own and **not** a note
   * judged: a fill hit is not in `hits`, `judged` or the accuracy, so a player who
   * plays with the kit during a fill does not appear more accurate for it.
   */
  fillHits: number;
  /**
   * When the last fill hit was paid, in song time. `-Infinity` before the first,
   * so a song that opens on a fill can pay at once. It is the whole rate limit:
   * `FILL_HIT_MS` is measured from here.
   */
  lastFillMs: number;
  /**
   * What this run has earned from **slides**: the hold value of every span a
   * finger glided across, at the multiplier and star power it arrived with. It is
   * in `score` but **not** in `laneBaseScore`, because only a touch screen can
   * play a slide and the star rating must not prefer one controller over another;
   * the results screen takes it back out with `ratingScore`.
   */
  slidePoints: number;
  /**
   * How many slides this run has landed. A read-out like `fillHits`: it is not a
   * note judged, so it is not in `hits`, `judged` or the accuracy.
   */
  slideHits: number;
  /** The moment the run was last advanced to. */
  atMs: number;
}

/**
 * A run that starts at `fromMs` rather than at the top of the song.
 *
 * A practice count-in seeks to the section the player chose, so a run seeded at
 * zero would judge everything before the section the moment its first frame
 * advanced the clock. The cursor starts at the first note **at or after**
 * `fromMs`: those earlier notes keep a `pending` outcome and are never judged,
 * which is why they do not count as hits or misses. `fromMs` is also the run's
 * own clock, so the first advance has no gap to drain.
 */
export function emptyLaneRun(
  chart: Pick<LaneChart, "notes">,
  fromMs = 0,
): LaneRun {
  const atMs = Math.max(0, fromMs);
  const start = chart.notes.findIndex((note) => note.timeMs >= atMs);
  return {
    outcomes: chart.notes.map(() => "pending"),
    cursor: start < 0 ? chart.notes.length : start,
    judged: 0,
    hits: 0,
    misses: 0,
    errors: 0,
    combo: 0,
    bestCombo: 0,
    score: 0,
    meter: 0,
    heroHits: 0,
    holding: [],
    hitTimes: chart.notes.map(() => null),
    tapTimes: chart.notes.map(() => null),
    tapMultipliers: chart.notes.map(() => 1),
    starUntilMs: 0,
    starActive: false,
    fillHits: 0,
    lastFillMs: Number.NEGATIVE_INFINITY,
    slidePoints: 0,
    slideHits: 0,
    atMs,
  };
}

/**
 * May the note at `index` be hammered on rather than strummed?
 *
 * Yes unless the note before it in this player's chart was **missed** — that is
 * the whole gate. While the chain is still undecided the hopo keeps its ring, so
 * an upcoming one reads as hammerable rather than only becoming so the instant
 * the note before it lands.
 *
 * `nowMs` is the moment the trigger is being judged at. Triggers are applied
 * before `advanceLanes` in a frame, so a predecessor can still read `pending`
 * after its window has closed; without the trigger's own time the hopo would be
 * hammerable off a note the run was about to drop. With it, a pending predecessor
 * whose window has gone is broken. Without it — a caller asking only what the run
 * says so far — the undecided chain keeps its ring.
 */
export function hopoTappable(
  chart: { notes: readonly LaneNote[] },
  run: Pick<LaneRun, "outcomes">,
  index: number,
  nowMs?: number,
): boolean {
  if (index <= 0) return false;
  const note = chart.notes[index];
  if (!note || note.kind !== "hopo") return false;
  const previous = chart.notes[index - 1];
  const outcome = run.outcomes[index - 1];
  if (outcome === "miss") return false;
  if (outcome === "pending" && nowMs !== undefined && previous) {
    // The same edge `advanceLanes` closes a note on: strictly past the window.
    if (previous.timeMs + HIT_WINDOW_MS < nowMs) return false;
  }
  return true;
}

/**
 * Whether a note is held by the frets the player has down.
 *
 * An open note is held by **no frets** — but a tapped one is held by a finger on
 * any pad, which is the same "no fret" said on a touch screen. `touching` is the
 * pads, never the keys, so a key held for another reason cannot hold an open note.
 */
function held(
  note: LaneNote,
  frets: readonly boolean[],
  touching?: readonly boolean[],
): boolean {
  if (isOpen(note)) {
    return frets.every((down) => !down) || (touching?.some(Boolean) ?? false);
  }
  return note.column !== null && Boolean(frets[note.column]);
}

/**
 * Apply a trigger. A strum judges the whole chord at the nearest moment — every
 * note lands when every fret is held, and none of them when one is not — while a
 * fret judges only the note in that column (which is what hammering one note of
 * anything means).
 */
export function applyTrigger(
  run: LaneRun,
  chart: Pick<LaneChart, "instrument" | "notes" | "fills" | "bpm">,
  trigger: LaneTrigger,
): LaneRun {
  // A wave of the whammy spends a full meter and buys a window of double points.
  // At any other time it does nothing at all: the whammy is not a source of points
  // of its own, and a wave while a window is already live does not extend it. The
  // window is read from its end rather than from the published `starActive`, so a
  // press on the frame the window ran out cannot spend the meter on a dead window.
  if (trigger.signal === "whammy") {
    if (starPowerActive(run.starUntilMs, trigger.timeMs)) return run;
    if (!canActivateStar(run.meter)) return run;
    return {
      ...run,
      meter: 0,
      starUntilMs: Math.max(0, trigger.timeMs) + STAR_POWER_MS,
      starActive: true,
    };
  }

  // A glide is not a strike: it only lands through the link its source note
  // carries, and when that link cannot be played it does nothing. In particular it
  // is never an error and never a fill hit — the finger is still on the screen,
  // moving, which is exactly what a touch surface is for. It is judged before the
  // ordinary strike rules, so a missing fret or an empty column cannot reach it.
  if (trigger.signal === "slide") {
    const target = nearestPending(chart.notes, run, trigger, false);
    if (target < 0) return run;
    return slideArrival(run, chart, target, trigger);
  }

  const index = nearestPending(chart.notes, run, trigger, !strums(chart.instrument));
  if (index < 0) {
    // A strike inside a fill has nothing wrong with it: the window is freestyle,
    // so it is a fill hit (rate-limited and unmultiplied) rather than an error.
    if (inFill(chart.fills, trigger.timeMs)) return fillHit(run, trigger.timeMs);
    // A strum with nothing to judge is an **overstrum** — the player did that. A
    // fret landing on nothing is just a hand moving, and is not an error at all;
    // neither is a tap, which on a touch screen is often a finger finding its place.
    return trigger.signal === "strum" ? { ...run, errors: run.errors + 1 } : run;
  }

  if (trigger.signal === "fret") {
    return hitNotes(run, chart, [index], multiplier(run.combo), trigger.timeMs);
  }

  if (trigger.signal === "touch") {
    return tapped(run, chart, index, trigger.timeMs);
  }

  // A strum takes the chord at that moment, all of it or none of it: every note
  // whose fret is down lands together, and one hand short drops the whole chord.
  // That is the player's own mistake — one error for the gesture, however many
  // notes it dropped — while a chord that lands is nobody's error.
  const moment = momentAt(chart.notes, index);
  const pending = moment
    .map((note) => ({ note, at: chart.notes.indexOf(note) }))
    // A seek leaves the notes before its cursor alone. They can only meet this
    // moment on a chart that is not sorted, but the rule is the run's own: nothing
    // before the cursor is ever judged, however the chord is grouped.
    .filter(({ at }) => at >= run.cursor && run.outcomes[at] === "pending");
  const complete = pending.every(({ note }) => held(note, trigger.frets));

  if (complete) {
    // One gesture, one multiplier: the chord's base total is multiplied by the
    // streak it was played at, and only then does the combo grow by its notes.
    return hitNotes(
      run,
      chart,
      pending.map(({ at }) => at),
      multiplier(run.combo),
      trigger.timeMs,
    );
  }

  let next = run;
  for (const { at } of pending) next = miss(next, at);
  return { ...next, errors: next.errors + 1 };
}

/**
 * A strike inside a **fill** that had no note to judge.
 *
 * It is not a note: the combo, the hit and judged counts and the accuracy are all
 * left exactly where they were, because a fill is a place to play rather than a
 * second chart. What it does is pay `FILL_POINTS` flat, fill the meter by one
 * note, and count itself in `fillHits`; `FILL_HIT_MS` is measured from the last
 * one, so a held key or a repeating pad cannot farm it.
 */
function fillHit(run: LaneRun, atMs: number): LaneRun {
  const time = Math.max(0, atMs);
  if (time - run.lastFillMs < FILL_HIT_MS) return run;
  return {
    ...run,
    fillHits: run.fillHits + 1,
    lastFillMs: time,
    score: run.score + FILL_POINTS,
    meter: fillMeter(run.meter, 1),
  };
}

/**
 * The note a trigger is aimed at: the nearest one still pending within the hit
 * window that this trigger could judge at all.
 *
 * Only notes at or after the run's **cursor** are candidates, because everything
 * before it belongs to the stretch a seek started past: those notes keep a
 * `pending` outcome and are never judged. Without this, a strum shortly after a
 * seek could reach back into the section the player has already left.
 */
function nearestPending(
  notes: readonly LaneNote[],
  run: LaneRun,
  trigger: LaneTrigger,
  tapped: boolean,
): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  notes.forEach((note, index) => {
    if (index < run.cursor) return;
    if (run.outcomes[index] !== "pending") return;
    const distance = Math.abs(note.timeMs - trigger.timeMs);
    if (distance > HIT_WINDOW_MS || distance >= bestDistance) return;
    if (!canJudge(note, run, notes, index, trigger, tapped)) return;
    best = index;
    bestDistance = distance;
  });
  return best;
}

/** Whether this trigger could judge this note at all. */
function canJudge(
  note: LaneNote,
  run: LaneRun,
  notes: readonly LaneNote[],
  index: number,
  trigger: LaneTrigger,
  tapped: boolean,
): boolean {
  if (trigger.signal === "fret") {
    // On a tapped instrument the fret *is* the note: every note is played by
    // pressing its key. On a strummed one a fret only hammers a hopo.
    if (note.column === null || note.column !== trigger.column) return false;
    return tapped || hopoTappable({ notes }, run, index, trigger.timeMs);
  }
  if (trigger.signal === "touch") {
    // A pad is a column, and an open note spans them all — so any pad takes it.
    // A tap carries its own strum, so the note's kind never refuses one.
    return note.column === null || note.column === trigger.column;
  }
  if (trigger.signal === "slide") {
    // A glide arrives on one pad, and only a fretted note waits there: an open
    // target spans the neck, so it is no more a slide's target than an open
    // source is its origin. The chart refuses both; this is the run's own guard.
    return note.column !== null && note.column === trigger.column;
  }
  // A strum judges any note whatever its chain says.
  return true;
}

/**
 * Hit one or more notes as a single gesture.
 *
 * `gestureMultiplier` is the streak the gesture is scored at. A chord passes the
 * multiplier from before the chord, so its table value is exact; a single note
 * passes the current one. The combo still grows by the number of notes hit, which
 * is what makes the next gesture's multiplier climb. `atMs` is the moment the
 * gesture happened, which is what decides whether star power was live for it.
 */
function hitNotes(
  run: LaneRun,
  chart: Pick<LaneChart, "notes">,
  indices: readonly number[],
  gestureMultiplier: number,
  atMs: number,
): LaneRun {
  if (indices.length === 0) return run;

  const outcomes = run.outcomes.slice();
  const holding = run.holding.slice();
  const hitTimes = run.hitTimes.slice();
  let points = 0;
  let heroHits = 0;
  for (const index of indices) {
    const note = chart.notes[index];
    if (!note) continue;
    outcomes[index] = "hit";
    hitTimes[index] = atMs;
    points += notePoints(note.hero);
    if (note.hero) heroHits += 1;
    // A hold starts here, beside any the chord already started; an open one is
    // always "held" (no frets is the hold).
    if (note.lengthMs > 0) holding.push(index);
  }

  const combo = run.combo + indices.length;
  const star = starPowerActive(run.starUntilMs, atMs) ? STAR_MULTIPLE : 1;
  return {
    ...run,
    outcomes,
    hitTimes,
    judged: run.judged + indices.length,
    hits: run.hits + indices.length,
    heroHits: run.heroHits + heroHits,
    combo,
    bestCombo: Math.max(run.bestCombo, combo),
    score: run.score + points * gestureMultiplier * star,
    meter: fillMeter(run.meter, indices.length),
    holding,
  };
}

/**
 * A tap on a pad: the note in that column is hit as if it had been strummed with
 * its own fret down, whatever kind it is.
 *
 * The one rule it keeps is that a chord is played together. The first tap of a
 * moment starts the clock, every landed note of that chord records its own tap, and
 * a tap that arrives later than `TAP_CHORD_MS` after the first belongs to no gesture
 * — it does not hit, and it is not an error either. The note it aimed at is simply
 * left to pass, which is what "you did not play the chord" looks like on a screen
 * with no strum bar.
 */
function tapped(run: LaneRun, chart: Pick<LaneChart, "notes">, index: number, atMs: number): LaneRun {
  const moment = momentAt(chart.notes, index);
  let first = atMs;
  let gesture = multiplier(run.combo);
  for (const note of moment) {
    const at = chart.notes.indexOf(note);
    // As in a strum, a note behind the run's cursor is not part of this gesture.
    if (at < run.cursor) continue;
    const tappedAt = run.tapTimes[at];
    if (tappedAt === null) continue;
    if (tappedAt < first) first = tappedAt;
    // Every tap of a moment is one chord, so its siblings use the multiplier the
    // first of them landed on rather than whatever the combo is by the next finger.
    gesture = run.tapMultipliers[at] ?? gesture;
  }
  if (atMs - first > TAP_CHORD_MS) return run;

  // The chord's taps are one gesture, so they share the first tap's multiplier
  // **and** star-power window; a chord straddling the window's edge is paid the
  // way it was started, not one note at each rate.
  const next = hitNotes(run, chart, [index], gesture, first);
  const tapTimes = next.tapTimes.slice();
  tapTimes[index] = atMs;
  const tapMultipliers = next.tapMultipliers.slice();
  tapMultipliers[index] = gesture;
  return { ...next, tapTimes, tapMultipliers };
}

/**
 * A finger arriving on a **slide**'s target, still down.
 *
 * The target is played as a touch — `hitNotes` starts it, and a tail is recorded
 * in `holding` from there — and its tap is stamped like any other touch, so a
 * chord's later arrivals share the first tap's multiplier. `TAP_CHORD_MS` is
 * deliberately not applied: a glide is one finger arriving rather than two taps
 * that have to be kept together.
 *
 * The source must be the note that links here (`slideTo`), in the column the
 * finger left (`trigger.from`), and it must have **landed** in this run. A chain
 * is that rule twice: each target becomes the next slide's source once it lands.
 * Without such a source there is nothing to play, and the run is returned exactly
 * as it was — no judged note, no combo break and no error.
 */
function slideArrival(
  run: LaneRun,
  chart: Pick<LaneChart, "notes" | "bpm">,
  index: number,
  trigger: LaneTrigger,
): LaneRun {
  const target = chart.notes[index];
  if (!target || trigger.from === undefined) return run;

  let source = -1;
  for (let at = 0; at < index; at += 1) {
    const candidate = chart.notes[at];
    if (candidate.slideTo !== target.id) continue;
    if (candidate.column !== trigger.from) continue;
    if (run.outcomes[at] !== "hit") continue;
    source = at;
    break;
  }
  if (source < 0) return run;

  const sourceNote = chart.notes[source];
  const gesture = multiplier(run.combo);
  const next = hitNotes(run, chart, [index], gesture, trigger.timeMs);
  const tapTimes = next.tapTimes.slice();
  tapTimes[index] = trigger.timeMs;
  const tapMultipliers = next.tapMultipliers.slice();
  tapMultipliers[index] = gesture;
  // The span runs from where the source **ended** (its tail, on a sustain) to
  // where the target begins, so a held tail is never paid for twice. Star power
  // is paid over that span rather than at one edge, exactly as a hold is.
  const fromMs = sourceNote.timeMs + sourceNote.lengthMs;
  const points =
    holdBasePoints(target.timeMs - fromMs, chart.bpm) *
    gesture *
    starFactor(fromMs, target.timeMs, run.starUntilMs);
  return {
    ...next,
    tapTimes,
    tapMultipliers,
    score: next.score + points,
    slidePoints: next.slidePoints + points,
    slideHits: next.slideHits + 1,
  };
}

/**
 * A note the player dropped. The score is untouched — a miss can only break the
 * chain — and the run's clock is left where the frame put it.
 *
 * It deliberately does **not** step `atMs` to the note's own time. A strum may be
 * early (the hit window reaches into the future), so a missed chord would leave
 * `atMs` ahead of the clock; the next frame would read that as a rewind and throw
 * the whole run away.
 */
function miss(run: LaneRun, index: number): LaneRun {
  const outcomes = run.outcomes.slice();
  outcomes[index] = "miss";
  return {
    ...run,
    outcomes,
    judged: run.judged + 1,
    misses: run.misses + 1,
    combo: 0,
    meter: missMeter(run.meter),
    holding: run.holding.filter((heldIndex) => heldIndex !== index),
  };
}

/**
 * Move the run on to `nowMs`: anything whose window has closed is a miss, a
 * sustain being held keeps scoring until it is released or runs out, the meter
 * drains between notes, and a spent star-power window is retired when its end is
 * reached. `frets` is the player's own held set; `touching` is the pads a finger
 * is on, which is how a **tapped** open note is held (its "no frets" is a finger
 * on the line rather than the absence of a key).
 */
export function advanceLanes(
  run: LaneRun,
  chart: Pick<LaneChart, "notes" | "bpm">,
  nowMs: number,
  frets: readonly boolean[],
  touching?: readonly boolean[],
): LaneRun {
  let next = run;

  // Every held sustain scores while its own fret is down, and stops the moment it
  // is let go. A chord's holds are independent: releasing blue leaves yellow on.
  if (next.holding.length > 0) {
    let score = next.score;
    const holding: number[] = [];
    const holdMultiplier = multiplier(next.combo);
    for (const index of next.holding) {
      const note = chart.notes[index];
      if (!note) continue;
      const stillHeld = held(note, frets, touching);
      const from = Math.max(next.atMs, note.timeMs);
      const to = Math.min(nowMs, note.timeMs + note.lengthMs);
      if (stillHeld && to > from) {
        // The same helper the base score uses, so a hold and what it is rated
        // against cannot drift apart. Star power is applied to the paid span, not
        // to the note's onset: a hold that began before a window still earns the
        // double while the window is up.
        score +=
          holdBasePoints(to - from, chart.bpm) *
          holdMultiplier *
          starFactor(from, to, next.starUntilMs);
      }
      if (stillHeld && nowMs < note.timeMs + note.lengthMs) holding.push(index);
    }
    next = { ...next, score, holding };
  }

  const missed: number[] = [];
  let cursor = next.cursor;
  while (
    cursor < chart.notes.length &&
    // Strictly past the window: a note played at exactly `time + HIT_WINDOW_MS` is
    // still legal (the trigger refuses at `> HIT_WINDOW_MS`), so the two rules meet
    // at the same edge rather than one closing the note the other could still hit.
    chart.notes[cursor].timeMs + HIT_WINDOW_MS < nowMs
  ) {
    if (next.outcomes[cursor] === "pending") missed.push(cursor);
    cursor += 1;
  }

  if (missed.length > 0) {
    const outcomes = next.outcomes.slice();
    for (const index of missed) outcomes[index] = "miss";
    next = {
      ...next,
      outcomes,
      judged: next.judged + missed.length,
      misses: next.misses + missed.length,
      combo: 0,
      meter: missMeter(next.meter, missed.length),
    };
  }

  return drained({ ...next, cursor }, nowMs);
}

/**
 * What star power makes of a span of hold: `STAR_MULTIPLE` for the milliseconds the
 * window covers, ×1 for the rest. The window runs from `untilMs - STAR_POWER_MS` to
 * `untilMs`, so a frame that straddles either edge is paid at both rates rather
 * than flipping the whole frame on one comparison.
 */
function starFactor(fromMs: number, toMs: number, untilMs: number): number {
  const span = toMs - fromMs;
  if (untilMs <= 0 || !(span > 0)) return 1;
  const covered =
    Math.min(toMs, untilMs) - Math.max(fromMs, untilMs - STAR_POWER_MS);
  if (!(covered > 0)) return 1;
  return 1 + (STAR_MULTIPLE - 1) * (covered / span);
}

/** Let the meter fall as time passes with nothing played, and retire a spent window. */
function drained(run: LaneRun, toMs: number): LaneRun {
  const gap = Math.max(0, toMs - run.atMs);
  const starActive = starPowerActive(run.starUntilMs, toMs);
  if (gap === 0) {
    // The run's clock has not moved, but the window's edge may have passed: the
    // panel reads `starActive`, so it has to go out even on a still frame.
    return starActive === run.starActive ? run : { ...run, starActive };
  }
  return {
    ...run,
    atMs: toMs,
    meter: drainMeter(run.meter, gap),
    starActive,
  };
}
