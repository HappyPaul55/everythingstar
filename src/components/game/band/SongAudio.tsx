import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fullMixStems, partStems, type SourceSongDoc } from "../../../lib/game/source";
import {
  DRIFT_HOLD_MS,
  DRIFT_SEEK_MS,
  FRUITLESS_SEEK_LIMIT,
  SEEK_COOLDOWN_MS,
  driftAction,
  seekHelped,
  seekLanded,
  seekRefused,
  stemRate,
} from "../../../lib/game/audio/drift";
import { AUDIBLE_FLOOR, HELD_SHARE, familyVolume } from "../../../lib/game/audio/mix";
import {
  pausedAction,
  sourceStem,
  startSeatAction,
  stemAlignmentsTo,
  stemSpreadMs,
  type SoundingStem,
  type StemTiming,
} from "../../../lib/game/audio/stemSync";
import { heldOutStems, unplayedStems } from "../../../lib/game/audio/parts";
import { isLocalUrl, localObjectUrl } from "../library/folder";
import { usePartAudio } from "./PartAudio";
import { useSongAudioPreload } from "./SongAudioStatus";
import { useClock } from "./StageClock";

/**
 * The song's own sound: the thing a run is played against.
 *
 * A song document names its audio in **stems** and says how to put them together
 * (`mixPresets`): `full` is the whole song — the mix, or every part played at once —
 * and a part's own preset is what a player's sound drops out of when they miss. A
 * run plays `full`, and each part's stems are **ducked to a share of their level while
 * that part is out** (`usePartAudio`): a missed guitar gives way to the backing and
 * comes back by the song document's own rule — its next hit, or the end of the phrase
 * the miss fell in. A duck, never a silence, because a media element at `volume = 0`
 * leaves the browser's audio clock and comes back out of phase (`HELD_SHARE`).
 * The **master is never one of those stems** — it has no instrument — so a song
 * shipped as a single file cannot be ducked by a miss.
 *
 * A stem the run **never plays**, the guide vocal under a singer, is not loaded at all
 * (`unplayedStems`): a stream nobody hears is a download, a decoder and a clock that
 * nobody asked for.
 *
 * The elements are **streamed**, not decoded: four minutes of audio as a decoded
 * buffer is ~90MB of float samples, and the browser is very good at playing a file.
 * They are also what the **clock follows** — a rhythm game's clock is the music, so
 * the playhead is whatever the sound says rather than a count of frames.
 *
 * **The playhead is the one timeline.** The clock reads the sounding stem nearest it
 * (`sourceStem`), so a stem that started, resumed or stalled late cannot hold the song
 * back, and every correction moves a stem onto the playhead — never onto another stem,
 * which could be the one that fell behind. A start is the exception to correcting: a
 * `currentTime` write on a stem that is still starting restarts its startup, so the
 * stems are **waited for** and seated **once** (`startSeatAction`). A pause is seated
 * in the same silence, before anything plays again.
 *
 * A song read from a folder points at its audio by `folder://…`, which no element can
 * fetch: those are read and handed over as object URLs, the same as the artwork.
 */
interface Props {
  /** The song, once it is loaded. Nothing is played until there is one. */
  doc: SourceSongDoc | null;
  /** The master fader, from the settings. */
  volume: number;
  /**
   * The music family's own level under the master. A song's stems are **music**,
   * whether they are streamed or read from a folder, so they sit exactly where the
   * menu bed does: master × family.
   */
  musicLevel: number;
  /**
   * The audio lag: how far **behind** the sound the playhead reads, so a player with
   * a slow output hears a note when they are shown it.
   */
  lagMs: number;
  /**
   * Somebody is singing, so the guide vocal has no part in this run — the singer *is*
   * the voice — and its stems are **not loaded at all** (`unplayedStems`). The
   * `guideVocal` setting keeps the song's own vocal in instead, so a singer's misses
   * can be heard. A typist or Listen keeps the guide vocal either way.
   */
  sung: boolean;
  /**
   * The transport's speed: 1 for an ordinary run, 0.5–1 during practice. Every
   * stem is played at it, and a drift nudge is applied **to** it rather than
   * replacing it.
   */
  rate: number;
  /**
   * A practice run is under way. The **sound** ending is not the run ending
   * then: practice owns its end (a loop, or a pause on its span), and the
   * results screen must never open.
   */
  practice: boolean;
}

/** How often a stem that should be playing but is not is asked again. */
const RETRY_MS = 800;

/**
 * How far a stem must move between two frames before it counts as started.
 *
 * A frame at 60 Hz is ~17 ms of song at the record's speed and ~8 ms at practice's,
 * so a stem that is really advancing clears this easily; a stem whose pipeline has
 * not begun yet sits exactly still.
 */
const ADVANCED_EPSILON_S = 0.001;

/** A start's bookkeeping: where each stem stood last frame, and whether it has moved. */
interface Seating {
  /** `performance.now()` at the edge that started this. */
  at: number;
  /** Each stem's position at the previous frame, for frame-over-frame movement. */
  last: number[];
  /** Whether each stem has advanced since the edge. */
  started: boolean[];
}

export function SongAudio({
  doc,
  volume,
  musicLevel,
  lagMs,
  sung,
  rate,
  practice,
}: Props) {
  const clock = useClock();
  const partAudio = usePartAudio();
  // The band's loader watches these elements; this is the registration side, and
  // it is stable, so a progress event never re-renders the stems.
  const preload = useSongAudioPreload();
  // The clock's value changes whenever it plays, pauses or ends, so the wiring that
  // must not re-register reads it through a ref: the source is registered once per
  // set of stems, not once per transport change.
  const clockRef = useRef(clock);
  clockRef.current = clock;
  // 0 is the mix the song names; 1 is its parts, which is where a mix that will not
  // play leaves us.
  const [attempt, setAttempt] = useState(0);
  /**
   * The files to play, each with the stem it is, so a part can be taken out of it.
   *
   * A stem the run **never plays** — the guide vocal while somebody is singing — is
   * not fetched at all (`unplayedStems`): a stream nobody hears is a download, a
   * decoder and a clock that nobody asked for.
   */
  const wanted = useMemo(() => {
    if (!doc) return [];
    const byUrl = new Map(doc.audio.stems.map((stem) => [stem.url, stem.id]));
    const never = unplayedStems(doc, sung);
    return (attempt === 0 ? fullMixStems(doc) : partStems(doc))
      .map((url) => {
        const stemId = byUrl.get(url) ?? null;
        return { url, stemId, file: fileName(url, stemId) };
      })
      // A stem with no id is a preset naming a URL the document does not list:
      // nothing says it is the guide vocal, so it stays.
      .filter((stem) => stem.stemId === null || !never.has(stem.stemId));
  }, [doc, attempt, sung]);
  const [sources, setSources] = useState<
    { url: string; stemId: string | null; file: string }[]
  >([]);
  const elements = useRef<(HTMLAudioElement | null)[]>([]);
  /** The container, for the dev read-out's note about a refused `play()`. */
  const box = useRef<HTMLDivElement | null>(null);
  /**
   * The object URL made for each local file, and every one this song holds. Kept
   * across renders so a stem that stays wanted keeps its element — the guide vocal
   * toggling must not re-read and re-buffer the band.
   */
  const localUrls = useRef(new Map<string, string>());
  const objectUrls = useRef(new Set<string>());
  /** The latest wanted set, for the effect above to judge a stale file by. */
  const wantedRef = useRef(wanted);
  wantedRef.current = wanted;
  /** How many of this song's files have failed to arrive. */
  const broken = useRef(0);
  /** When each stem was last moved on its own clock, so a seek is not fought. */
  const seekedAt = useRef<number[]>([]);
  /**
   * Whether each stem takes a `currentTime` write at all. A resource that cannot be
   * seeked ignores one, and the correction rules would re-issue it for the rest of
   * the run — one a second, moving nothing. So every correction write is read
   * straight back (`seekLanded`), and a stem that did not take it is never moved
   * again: the rate nudge, which always applies, is its only muscle from there.
   */
  const seekable = useRef<boolean[]>([]);
  /**
   * How far out each stem was at its last seek, and how many seeks in a row have not
   * halved the gap (`seekHelped`, `FRUITLESS_SEEK_LIMIT` in `drift.ts`). A seek on a
   * stem whose delivery cannot keep up discards its forward buffer and costs more
   * than the flam it cured — two of those and the stem is carried by rate alone
   * until it is back inside the hold, when the count starts over.
   */
  const seekDrift = useRef<(number | null)[]>([]);
  const fruitless = useRef<number[]>([]);
  /** When each stalled stem was last asked to play again, one clock per stem. */
  const retriedAt = useRef<number[]>([]);
  /**
   * The stems a part held out on the last write, by stem id.
   *
   * Only a part's **return** needs this: a stem that comes back is checked for a
   * browser that paused it, and that check has to know which stems were out. Nothing
   * else reads it — a ducked stem is an ordinary stem to the frame loop.
   */
  const held = useRef<ReadonlySet<string>>(new Set());
  /**
   * The stem the clock was last read from, as an index.
   *
   * It is only a **preference**: the nearest sounding stem wins the next read, and a
   * stem that has fallen behind loses it, so it can never hold the song at its own,
   * earlier time. The playhead itself is the target every stem is aligned and
   * corrected against.
   */
  const sourceIndex = useRef(-1);
  /**
   * A start is in flight: every stem has been asked to move, and each begins
   * advancing at its own moment. While this is set **nothing is nudged or seeked** —
   * the stems are seated **once**, when the last of them has actually moved (or the
   * deadline passes). Chasing them frame by frame instead is what used to turn a
   * six-millisecond natural stagger into a hundred-millisecond flam: every
   * `currentTime` write on a starting element restarts its startup, so a seek per
   * frame held each late stem at the line while the one that had started ran away.
   */
  const seating = useRef<Seating | null>(null);
  /** The seek serial the seating state has reconciled with. */
  const seatSerial = useRef(0);
  // Read inside the clock's frame loop, so it must not be a value captured at a
  // render: it reads the elements and the lag as they are *now*.
  const lagRef = useRef(lagMs);
  lagRef.current = lagMs;
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const practiceRef = useRef(practice);
  practiceRef.current = practice;

  /**
   * The song's playhead, in the stems' own time: where every stem is meant to be.
   *
   * One number, read from the clock rather than from any element, because a stem's
   * own position is a candidate for being wrong and the playhead is what the run is
   * judged and drawn against.
   */
  const playheadMs = useCallback(
    () => Math.max(0, clockRef.current.timeRef.current + lagRef.current),
    [],
  );

  /**
   * Move a stem onto where the song is, and keep the bookkeeping that stops the move
   * being fought. The write is **read straight back**: a resource that cannot be
   * seeked ignores it, and a stem caught doing that is marked and never moved again
   * (`seekable` above) rather than being written to for the rest of the run.
   */
  const moveStem = useCallback((element: HTMLMediaElement, index: number, atS: number) => {
    // A stem that has turned down one move does not get another: the write it
    // ignores is a request the browser re-services, and one a second for the rest
    // of the run is exactly what the marking exists to stop.
    if (seekable.current[index] === false || !Number.isFinite(atS)) return false;
    // A stem shorter than the song ends where it ends: asking for a second past the
    // end would clamp, read back as a move that never landed, and mark the stem
    // un-seekable for the rest of the run for no reason at all.
    const target =
      element.duration > 0 ? Math.min(atS, Math.max(0, element.duration - 0.05)) : atS;
    try {
      element.currentTime = target;
    } catch {
      // No timeline to move yet (or one that has gone): the frame it gains one, the
      // alignment or the drift rule asks again. This is not a refusal to be seeked.
      return false;
    }
    seekedAt.current[index] = performance.now();
    if (seekRefused(element.currentTime, target, element.readyState, element.seeking)) {
      seekable.current[index] = false;
      return false;
    }
    return seekLanded(element.currentTime, target);
  }, []);

  /**
   * Put every stem onto the **song's own playhead**.
   *
   * This is the transport edge's rule, and it is silent by construction: it runs while
   * the song is paused — before a start and after a pause — so moving an element's
   * clock cannot be heard. The target is the playhead rather than one of the stems:
   * aligning to "the stem the clock was reading" meant a stem that was already behind
   * the song could take the rest of the band back with it, and after a long pause the
   * playhead could sit ahead of every stem. A stem with no timeline, an error, an end
   * or a seek in flight is left to `drift.ts`, which settles it once it has a clock.
   *
   * The spread is written to the container for the dev read-out: this is the number
   * the "echo when unpausing" was measured by, so it should be visible while fixing it.
   */
  const align = useCallback(() => {
    const nodes = elements.current;
    const states = nodes.map((element) =>
      element ? stemTiming(element) : { timeMs: Number.NaN, readyState: 0, failed: true },
    );
    const target = playheadMs();
    const moves = stemAlignmentsTo(states, target);
    const moved = new Map<number, number>();
    for (const move of moves) {
      const element = nodes[move.index];
      if (!element) continue;
      // A stem that does not take moves is not moved again, and the spread
      // read-out below then tells the truth about where it actually is.
      if (moveStem(element, move.index, move.timeMs / 1000)) {
        moved.set(move.index, move.timeMs);
      }
    }
    const spread = stemSpreadMs(
      states.map((state, index) => ({ ...state, timeMs: moved.get(index) ?? state.timeMs })),
    );
    if (spread === null) box.current?.removeAttribute("data-stem-spread");
    else box.current?.setAttribute("data-stem-spread", String(Math.round(spread)));
  }, [moveStem, playheadMs]);

  /**
   * Begin waiting for a start: remember where every stem stands and let each begin
   * moving on its own. A stem that is not there at all, that has broken or that has
   * already ended counts as started — there is nothing of it to wait for.
   */
  const beginSeating = useCallback(() => {
    seating.current = {
      at: performance.now(),
      last: elements.current.map((element) => (element ? element.currentTime : 0)),
      started: elements.current.map(
        (element) => !element || element.error !== null || element.ended,
      ),
    };
  }, []);

  // A different song starts over, mix first — and with it, every stem's history.
  useEffect(() => {
    broken.current = 0;
    sourceIndex.current = -1;
    seekable.current = [];
    seekedAt.current = [];
    retriedAt.current = [];
    seekDrift.current = [];
    fruitless.current = [];
    seating.current = null;
    // The last song's local files are not this song's: let their URLs go now
    // rather than carrying a few stems' bytes into the next run. The elements that
    // use them are unmounted by `setSources([])` on the next render, so the revoke
    // is deferred: an element still holding a revoked URL fires `error`, and that
    // would count against the **new** song's stems.
    setSources([]);
    const old = [...objectUrls.current];
    objectUrls.current.clear();
    localUrls.current.clear();
    setTimeout(() => {
      for (const url of old) URL.revokeObjectURL(url);
    }, 0);
    setAttempt(0);
  }, [doc]);

  // A local stem is a file, not a URL. Read it into an object URL and let it go when
  // this song does. **A stem that cannot be read is counted, not just dropped**: the
  // difference between a part that is missing from the chart folder and a file the
  // browser was not allowed to open is the difference between a fix and a puzzle, and
  // the dev read-out is where that is said.
  //
  // The object URL is **kept per file**, not per render: toggling the guide vocal
  // changes which stems are wanted, and re-reading a `.sng` member would unmount
  // every element and re-buffer the whole band mid-run. A file that is still wanted
  // keeps the same URL, so React keeps the same `<audio>` and the sound never stops.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const resolved: { url: string; stemId: string | null; file: string }[] = [];
      let unreadable = 0;
      for (const file of wanted) {
        if (!isLocalUrl(file.url)) {
          resolved.push(file);
          continue;
        }
        let objectUrl = localUrls.current.get(file.url);
        if (!objectUrl) {
          const madeUrl = await localObjectUrl(file.url);
          if (!alive) {
            if (madeUrl) URL.revokeObjectURL(madeUrl);
            return;
          }
          if (!madeUrl) {
            unreadable += 1;
            continue;
          }
          // A second resolution of the same file may have finished first while
          // this one was in flight. Keep the first, and let this one go.
          const settled = localUrls.current.get(file.url);
          if (settled) {
            URL.revokeObjectURL(madeUrl);
            objectUrl = settled;
          } else {
            localUrls.current.set(file.url, madeUrl);
            objectUrls.current.add(madeUrl);
            objectUrl = madeUrl;
          }
        }
        resolved.push({ url: objectUrl, stemId: file.stemId, file: file.file });
      }
      if (!alive) return;
      // A file nobody wants any more — the guide vocal, with somebody singing — goes
      // now rather than at the end of the song. The latest `wanted` is the judge:
      // a stem this run has not heard of may belong to a newer one.
      const stillWanted = new Set(
        wantedRef.current.filter((file) => isLocalUrl(file.url)).map((file) => file.url),
      );
      const dropped: string[] = [];
      for (const [key, url] of localUrls.current) {
        if (stillWanted.has(key)) continue;
        localUrls.current.delete(key);
        objectUrls.current.delete(url);
        dropped.push(url);
      }
      // After the commit that removes the elements, not before: see the doc effect.
      if (dropped.length > 0) {
        setTimeout(() => {
          for (const url of dropped) URL.revokeObjectURL(url);
        }, 0);
      }
      box.current?.setAttribute("data-unreadable", String(unreadable));
      // A file the browser would not hand over is settled: the loader must not
      // wait for it, and the band screen names it under the song's problems.
      preload.missing(unreadable);
      // New elements, new clocks: the old leader, its peace and its seating belong
      // to files that are about to unmount.
      sourceIndex.current = -1;
      seekable.current = [];
      seekedAt.current = [];
      retriedAt.current = [];
      seekDrift.current = [];
      fruitless.current = [];
      seating.current = null;
      setSources(resolved);
    })();
    return () => {
      alive = false;
    };
  }, [wanted, preload]);

  // Every object URL this song made goes when the stage does, whether or not a
  // later render still listed it.
  useEffect(() => {
    const urls = objectUrls.current;
    const byFile = localUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
      byFile.clear();
    };
  }, []);

  // The band screen's loader is told how many stems the run expects before any
  // element exists — a local song resolves its files a moment later — and then it
  // watches the elements that actually mounted. A stem that could not be read is
  // reported as missing, so a locked folder cannot leave the Play button waiting
  // for a file that is never coming.
  useEffect(() => {
    preload.expect(wanted.length);
    // `SongAudio` is not rendered for a YouTube-backed or silent song, and a new
    // song can change the count. Releasing the old expectation on the way out is
    // what makes the band ready at once when there is no stem to wait for.
    return () => preload.expect(0);
  }, [preload, wanted.length]);

  useEffect(() => {
    const stops = sources.map((source, index) => {
      const element = elements.current[index];
      if (!element) return null;
      return preload.watch(element, stemName(doc, source.stemId));
    });
    return () => {
      for (const stop of stops) stop?.();
    };
  }, [preload, sources, doc]);

  // A practice run slows the song down on **every** stem. `preservesPitch` stays
  // on so a slowed record does not detune the singer, and the element's own rate
  // is the base the drift correction nudges around.
  useEffect(() => {
    const base = rateRef.current;
    for (const element of elements.current) {
      if (!element) continue;
      element.preservesPitch = true;
      element.playbackRate = base;
    }
  }, [rate, sources]);

  // The master fader, the music family's level and a part's duck meet in one place:
  // an element's volume is master × music, or a **share** of it when the part it
  // belongs to is out. A **master** has no part behind it, so it is never one of
  // these — that is what keeps a miss from taking the whole song with it.
  //
  // A **cue never touches this**: a miss, a hero note or the meter is a sound beside
  // the band, not something that turns the band down. The mixer's duck is the menu
  // bed's own (`DUCK_LEVEL`), and the stems are media elements outside that graph.
  //
  // A part that is out is **ducked, never silenced**: silence takes a media element
  // off the browser's audio clock, so it free-runs and comes back out of phase, and
  // the seek-per-half-second that used to compensate cost it its pre-roll every time
  // (`HELD_SHARE`). A ducked stem is still on the clock, so nothing is owed when it
  // returns — only a stem the browser itself paused is seated and asked to play.
  useEffect(() => {
    const level = Math.max(AUDIBLE_FLOOR, familyVolume(volume, musicLevel));
    const apply = () => {
      const out = doc ? heldOutStems(doc, partAudio.muted()) : new Set<string>();
      const was = held.current;
      held.current = out;
      // The playhead is where a paused stem is put back. Every other stem never left
      // the clock, so it is not moved.
      elements.current.forEach((element, index) => {
        if (!element) return;
        const stemId = sources[index]?.stemId ?? null;
        const isHeld = stemId !== null && out.has(stemId);
        const next = isHeld ? level * HELD_SHARE : level;
        if (stemId !== null && !isHeld && was.has(stemId) && !element.ended) {
          // The part is back. Normally nothing is owed: it has been playing quietly
          // all along. The exception is a browser that paused it — a phone, a hidden
          // tab — which would otherwise come back wherever it stopped, seconds behind.
          if (clockRef.current.playing && element.paused) {
            if (element.readyState >= 1 && !element.seeking) {
              moveStem(element, index, playheadMs() / 1000);
            }
            void element.play().catch((reason: unknown) => {
              box.current?.setAttribute("data-play-error", refusal(reason));
            });
          }
        }
        element.volume = next;
      });
    };
    apply();
    return partAudio.subscribe(apply);
  }, [partAudio, doc, sources, volume, musicLevel, moveStem, playheadMs]);

  /**
   * The stem the clock should read: the sounding one **closest to the playhead**.
   *
   * Taking the first by position let a stem that started or resumed late hold the
   * whole band at its own, earlier time — a monotonic read cannot go back to meet it,
   * so the highway simply stopped until the drift rule had carried it forward. A stem
   * that has run ahead is not the answer either, because it would jump the song
   * forward. A part a miss has taken out is ducked, not silenced, so it is still a
   * real stem to read — its position is not marked "quiet" in any way.
   */
  const selectSource = useCallback((): HTMLAudioElement | null => {
    const nodes = elements.current;
    const views: SoundingStem[] = nodes.map((element) => ({
      timeMs:
        element && Number.isFinite(element.currentTime) ? element.currentTime * 1000 : Number.NaN,
      sounding: element !== null && isSounding(element),
    }));
    const index = sourceStem(views, playheadMs(), sourceIndex.current);
    sourceIndex.current = index;
    return index >= 0 ? nodes[index] : null;
  }, [playheadMs]);

  // The clock follows the sound whenever there is sound to follow. Registered once
  // per song: the reader looks at the elements as they are, so a stem that is still
  // buffering simply holds the playhead until it is not. The read comes from the stem
  // nearest the playhead (`selectSource`), never the first by position, which used to
  // mean a slow, late or resumed first file held the whole band back.
  useEffect(() => {
    const live = clockRef.current;
    if (sources.length === 0) {
      live.followSource(null);
      return;
    }
    const read = (): number | null => {
      const at = selectSource();
      return at ? at.currentTime * 1000 - lagRef.current : null;
    };
    /**
     * Every stem has errored, so the sound is not late — it is never coming. The
     * clock gives up on that at the short window; a stem that is only buffering
     * gets the long one.
     */
    const failed = (): boolean => {
      const nodes = elements.current;
      return (
        nodes.some((element) => element !== null) &&
        nodes.every((element) => element !== null && element.error !== null)
      );
    };
    // The clock's seek has to reach the sound as well, or the next frame reads
    // the old position straight back and the scrubber snaps home.
    const seek = (timeMs: number) => {
      const at = Math.max(0, timeMs + lagRef.current) / 1000;
      elements.current.forEach((element, index) => {
        if (!element || element.error !== null) return;
        // Metadata is not ready: there is nothing to move yet, and the drift
        // correction settles it once the element has a timeline.
        if (element.readyState < 1) return;
        moveStem(element, index, at);
        // A seek is not a change of speed: put the stem back to the plan's base
        // rate (1 for an ordinary run), not to the record.
        element.playbackRate = rateRef.current;
        // A loop seeks a stem that has just ended; it needs asking to move again,
        // and the transport is still playing.
        if (clockRef.current.playing) {
          void element.play().catch((reason: unknown) => {
            box.current?.setAttribute("data-play-error", refusal(reason));
          });
        }
      });
    };
    live.followSource(read, seek, failed);
    // A seek can happen before the stems exist — a practice count-in moves to its
    // section while the files are still being read — and the elements would then
    // start at 0, so the run plays from the top of the song. Put them where the
    // transport already is. This is registration, not the transport: a play or a
    // pause never seeks the sound.
    seek(live.timeRef.current);
    return () => live.followSource(null);
  }, [sources, moveStem, selectSource]);

  // The transport moves the sound: the stage plays, the sound plays; a pause is a
  // pause and not a slower song.
  useEffect(() => {
    const playing = clock.playing;
    if (playing) {
      // Put the stems on the playhead **before** any of them starts: while the song
      // stands still a moved element cannot be heard. If they are already moving (a
      // source arriving mid-run), they were seated by the registration seek and the
      // drift rule takes it from there.
      const standing = elements.current.every((element) => !element || element.paused);
      if (standing) {
        align();
        // The browser starts each element a moment of its own later, and those
        // moments differ — so the stems are **waited for**, and seated together once
        // the last of them is actually moving (`beginSeating`). They are not chased
        // frame by frame: a `currentTime` write on a starting element restarts its
        // startup, and the chasing is what used to spread a six-millisecond stagger
        // into a hundred-millisecond flam that outlived the run.
        beginSeating();
      }
    }
    for (const element of elements.current) {
      if (!element) continue;
      if (playing) {
        // An ended stem stays ended: a part a chart folder cut short must not restart from
        // the top in the middle of the song.
        if (element.error !== null || element.ended) continue;
        void element.play().then(
          () => box.current?.removeAttribute("data-play-error"),
          // A browser is allowed to refuse, and a refusal is the one silent cause that
          // says nothing anywhere else. The dev panel reads this off the container.
          (reason: unknown) => box.current?.setAttribute("data-play-error", refusal(reason)),
        );
      } else {
        // A muted element is the band's preload, not this transport: leave it
        // playing so a download that has started can finish. The status provider
        // stops it when the band screen leaves.
        if (!element.muted) element.pause();
      }
    }
    // Pause first, then line them up with the playhead. Doing it in this order means
    // the elements are still where they stopped, and nothing is playing while they
    // are moved. A pause also ends any start still being waited for: there is
    // nothing to seat until the song moves again.
    if (!playing) {
      seating.current = null;
      align();
    }
  }, [clock.playing, sources, align, beginSeating]);

  /**
   * The stems and the playhead are the same thing, so they are kept together here:
   * a stem that has fallen out is asked back, one that is close enough is left alone,
   * one that is out of line is **nudged by its rate**, and one the room can already
   * hear as a flam is moved onto the playhead — rarely, and never while it is still
   * recovering from the last time.
   *
   * The one moment none of this runs is a **start**: the stems are waited for and
   * seated once (`seating` above), because a rate cannot close the stagger a start
   * leaves and a seek per frame makes it worse.
   *
   * A part a miss has taken out is not a special case: it is **ducked, not silenced**
   * (`HELD_SHARE`), so it is on the same clock and carried by the same rule. Pinning
   * it with a seek every half second — which this used to do — was the bug that made a
   * part come back about 40 ms behind and hear as a flam.
   *
   * The target is the **playhead**, never a stem. The clock sampled it immediately
   * before this callback, so it is the freshest answer there is; a stem can be behind
   * — a late start, a resume after a pause, a browser that stalled a quiet stem — and
   * correcting the others onto *it* would move a perfectly good band backwards to
   * meet it, while leaving the stem itself uncorrected.
   */
  useEffect(() => {
    return clock.subscribe(() => {
      const now = performance.now();
      const playing = clock.playing;
      const base = rateRef.current;
      const target = playheadMs();
      // A deliberate seek while the song runs moves every stem at once, and each one
      // begins advancing again at its own moment — the same start a play is, so it
      // is waited for the same way. While the song stands still there is nothing to
      // seat: the pause's own rule keeps the stems on the playhead.
      if (!playing) {
        seatSerial.current = clock.seekSerialRef.current;
      } else if (clock.seekSerialRef.current !== seatSerial.current) {
        seatSerial.current = clock.seekSerialRef.current;
        beginSeating();
      }
      // A start's stems, watched until the last of them actually moves — and then
      // seated together, once. Nothing is nudged or seeked while this is pending.
      const pending = seating.current;
      if (pending) {
        elements.current.forEach((element, index) => {
          if (!element || pending.started[index]) return;
          const at = element.currentTime;
          if (at > pending.last[index] + ADVANCED_EPSILON_S) pending.started[index] = true;
          pending.last[index] = at;
        });
        if (startSeatAction(pending.started, now - pending.at) === "seat") {
          seating.current = null;
          align();
        }
      }
      elements.current.forEach((element, index) => {
        if (!element) return;
        // An ended stem has nothing more to say in this run: it is not a clock, not a
        // stem to carry and not one to restart — a chart folder may cut a part short, and
        // `play()` on an ended element starts its opening bars over the song's middle.
        if (element.error !== null || element.ended) return;
        if (!playing) {
          const write = pausedAction(
            base,
            element.currentTime * 1000 - target,
            now - (seekedAt.current[index] ?? Number.NEGATIVE_INFINITY),
          );
          if (element.playbackRate !== write.playbackRate) {
            element.playbackRate = write.playbackRate;
          }
          // A stem that is mid-seek, broken or has no timeline cannot be moved: the
          // alignment left it alone for the same reason, and asking again every frame
          // is what re-issued its range request for the whole pause. Nor is a stem
          // whose writes have never landed: it is marked, and left to play.
          if (!(element.duration > 0) || element.seeking) return;
          if (!write.seek) return;
          moveStem(element, index, Math.max(0, target / 1000));
          return;
        }
        if (element.readyState < 2) return;
        // A stem that should be playing but is not — a refused start, a play the
        // browser interrupted, a media element a phone paused while its part was
        // ducked — is asked again rather than left silent for the rest of the song.
        // Each stem has its own retry clock: one stalled file must not be the only
        // one asked while another waits its turn. It is **seated on the playhead
        // before it starts**, because a stem that stopped seconds ago would
        // otherwise resume where it stopped and spend the run being chased.
        if (element.paused) {
          const retried = retriedAt.current[index] ?? Number.NEGATIVE_INFINITY;
          if (now - retried < RETRY_MS) return;
          retriedAt.current[index] = now;
          // Not while a start is still being waited for: that is the one window a
          // `currentTime` write must not land on a starting stem, and the seat that
          // ends the window puts this one where it belongs anyway.
          if (!seating.current && !element.seeking) {
            const drift = element.currentTime * 1000 - target;
            if (Math.abs(drift) > DRIFT_HOLD_MS) {
              moveStem(element, index, Math.max(0, target / 1000));
            }
          }
          void element.play().catch((reason: unknown) => {
            box.current?.setAttribute("data-play-error", refusal(reason));
          });
          return;
        }
        if (element.seeking) return;
        // A start's stems are seated once, by the rule above, and never carried: the
        // drift rules here are for a song already running as one.
        if (seating.current) return;
        const driftMs = element.currentTime * 1000 - target;
        const sinceSeek = now - (seekedAt.current[index] ?? Number.NEGATIVE_INFINITY);
        // A stem that will not take a move is carried by its rate alone — so it is
        // told the seek cannot happen rather than handed one that never lands. And
        // when a stem whose last seek did not halve the gap comes round for another,
        // that is judged first: a seek can cost more than the flam it cures (it
        // discards the stem's forward buffer), and two in a row say so. From then on
        // this stem is carried until it recovers inside the hold, which is when the
        // count starts over — the nudge always works, only slower.
        const taken = fruitless.current[index] ?? 0;
        const lastDrift = seekDrift.current[index] ?? null;
        if (
          taken < FRUITLESS_SEEK_LIMIT &&
          lastDrift !== null &&
          sinceSeek >= SEEK_COOLDOWN_MS &&
          Math.abs(driftMs) >= DRIFT_SEEK_MS
        ) {
          fruitless.current[index] = seekHelped(lastDrift, driftMs) ? 0 : taken + 1;
        }
        const canSeek =
          seekable.current[index] !== false &&
          (fruitless.current[index] ?? 0) < FRUITLESS_SEEK_LIMIT;
        const action = driftAction(driftMs, sinceSeek, canSeek);
        // The nudge is a fraction of the plan's base rate, never a flat 1: at 80%
        // a stem 2% fast is 81.6%, not 102%.
        const next = stemRate(base, action);
        if (element.playbackRate !== next) element.playbackRate = next;
        if (action.kind === "seek") {
          seekDrift.current[index] = Math.abs(driftMs);
          moveStem(element, index, Math.max(0, target / 1000));
        } else if (Math.abs(driftMs) <= DRIFT_HOLD_MS && sinceSeek >= SEEK_COOLDOWN_MS) {
          // Inside the hold again: the stem is well, whatever it was, and the next
          // episode may use the seek twice more.
          seekDrift.current[index] = null;
          fruitless.current[index] = 0;
        }
      });
    });
  }, [clock, align, sources, beginSeating, moveStem, playheadMs]);

  return (
    <div
      className="song-audio"
      aria-hidden="true"
      ref={box}
      // What this run plays, and what the browser got: the two counts the dev
      // read-out prints, so "no sound" can be told from "nothing to play".
      data-stems={wanted.length}
      data-sources={sources.length}
    >
      {sources.map((source, index) => (
        <audio
          key={source.url}
          ref={(element) => {
            elements.current[index] = element;
          }}
          src={source.url}
          preload="auto"
          playsInline
          // What the dev read-out calls this stem: an object URL has lost the file
          // name, and a stem without one is a row nobody can identify.
          data-file={source.file}
          // The sound ending the run is the **last** stem ending, not the first: a
          // chart folder may cut a part short, and a band is not over because one file is.
          onEnded={() => {
            const sounding = elements.current.some(
              (element) =>
                element &&
                element.error === null &&
                element.duration > 0 &&
                !element.ended &&
                !element.paused &&
                element.currentTime < element.duration - 0.2,
            );
            // A practice run owns its own end; the sound reaching its own is not
            // the results screen's cue.
            if (!sounding && !practiceRef.current) clock.finish();
          }}
          onError={() => {
            // A file that never arrives is a file the song can do without: try the
            // parts instead of playing nothing at all. (Some folders ship a 0-byte mix.)
            broken.current += 1;
            if (attempt === 0 && broken.current >= sources.length) {
              const parts = doc ? partStems(doc) : [];
              if (parts.length > 0) setAttempt(1);
            }
          }}
        />
      ))}
    </div>
  );
}

/** Why a browser refused to play, in a line, for the dev read-out. */
function refusal(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  return String(reason);
}

/**
 * The name the band's loader uses for one stem.
 *
 * The song document names its own stems ("Drums 1", "Lead Guitar"), which is what
 * a warning under the band should say. A preset may name a URL the document does
 * not list; that is still audio, just one with no better name.
 */
function stemName(doc: SourceSongDoc | null, stemId: string | null): string {
  if (!stemId) return "Audio";
  return doc?.audio.stems.find((stem) => stem.id === stemId)?.name ?? stemId;
}

/**
 * The file name the dev read-out uses for a stem.
 *
 * A remote or folder URL still names its file; an object URL (`blob:…`, a `.sng`
 * member or a local file read into memory) has lost it, so the stem's id is the
 * best label there is. The query and fragment are not part of a file name.
 */
function fileName(url: string, stemId: string | null): string {
  const clean = url.split(/[?#]/)[0];
  if (clean.startsWith("blob:")) return stemId ?? "audio";
  const at = clean.lastIndexOf("/");
  const raw = at < 0 ? clean : clean.slice(at + 1);
  if (!raw) return stemId ?? "audio";
  try {
    return decodeURIComponent(raw) || stemId || "audio";
  } catch {
    return raw || stemId || "audio";
  }
}

/** Whether an element is playing and has a position worth reading. */
function isSounding(element: HTMLAudioElement): boolean {
  return (
    element.error === null &&
    !element.ended &&
    element.readyState >= 2 &&
    !element.paused &&
    !element.seeking &&
    Number.isFinite(element.currentTime)
  );
}

/** One element as the pure leader and alignment rules see it (`audio/stemSync.ts`). */
function stemTiming(element: HTMLAudioElement): StemTiming {
  return {
    timeMs: Number.isFinite(element.currentTime)
      ? element.currentTime * 1000
      : Number.NaN,
    readyState: element.readyState,
    failed: element.error !== null,
    seeking: element.seeking,
    paused: element.paused,
    ended: element.ended,
  };
}
