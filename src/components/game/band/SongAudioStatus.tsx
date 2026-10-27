import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  PRELOAD_READY_STATE,
  preloadProgress,
  stemSettled,
  type PreloadProgress,
} from "../../../lib/game/audio/preload";

/**
 * The song's files, as a loader can read them.
 *
 * `SongAudio` owns the media elements, because they are what plays. This provider
 * is the **read-out** around them: it watches the same elements, counts the stems
 * that are ready, and offers the one gesture a browser needs to start fetching a
 * file it would otherwise leave alone (`prime`).
 *
 * The API and the progress are two contexts on purpose. `SongAudio` registers
 * elements; it must not re-render every time a `progress` event changes the count.
 * The band screen and the loading screen read the progress, and the clock reads
 * the same `ready` before it starts a run.
 *
 * "Ready" is `HAVE_ENOUGH_DATA` (4) — the browser's own "enough to play through",
 * not merely "can start". A stem that failed counts as settled so a file that
 * will never arrive cannot trap the loader; the band names it under the song's
 * problems instead. See `lib/game/audio/preload.ts` for the pure rule.
 */
export interface SongAudioProgress extends PreloadProgress {
  /** The stems the browser refused, by the name the song gives them. */
  failed: readonly string[];
}

/** What `SongAudio` needs from the provider, stable across every progress event. */
export interface SongAudioPreload {
  /** How many stems this run will play. Zero is ready at once. */
  expect: (total: number) => void;
  /** Stems that could not even become elements — a local file that would not open. */
  missing: (count: number) => void;
  /** Watch one element. The returned function stops watching it. */
  watch: (element: HTMLAudioElement, label: string) => () => void;
  /**
   * Ask every watched, not-yet-ready element to fetch now.
   *
   * A `Play` press calls this inside the gesture: some mobile browsers ignore
   * `preload="auto"` until a media element has been played, and a muted play is
   * the one thing that starts the download without making a sound.
   */
  prime: () => void;
  /**
   * The player chose **Play anyway** after the grace. The loader's answer becomes
   * ready for this song so the clock's start gate lets the run begin without the
   * stems that are still arriving; the band's warning has already named them.
   */
  force: () => void;
}

const EMPTY: SongAudioProgress = { done: 0, total: 0, ready: true, failed: [] };

const ApiContext = createContext<SongAudioPreload | null>(null);
const ProgressContext = createContext<SongAudioProgress>(EMPTY);

interface Props {
  /**
   * Is a page up that wants the song's files fetched? The band screen and the
   * loader after it. A run's own transport owns the elements everywhere else.
   */
  preload: boolean;
  children: ReactNode;
}

/** Every media event that can change whether a stem is ready. */
const EVENTS = [
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "canplaythrough",
  "progress",
  "stalled",
  "error",
  "ended",
] as const;

export function SongAudioStatusProvider({ preload, children }: Props) {
  /** The elements on screen, by the name a warning would use for them. */
  const elements = useRef(new Map<HTMLAudioElement, string>());
  /** How many stems the run expects; set by `SongAudio` before it registers them. */
  const expected = useRef(0);
  /** Stems that could not become elements, and so have no element to watch. */
  const absent = useRef(0);
  /**
   * The stems that have been ready once.
   *
   * A latch, not a live `readyState` read: a browser may evict a buffer for a
   * paused element while the player is still choosing a band. The loader promises
   * that the run *can* start; the clock and the drift rules handle the rest.
   */
  const settled = useRef(new Set<HTMLAudioElement>());
  const preloadRef = useRef(preload);
  preloadRef.current = preload;
  const [progress, setProgress] = useState<SongAudioProgress>(EMPTY);
  /** The player has chosen to start without the stems still arriving. */
  const forced = useRef(false);

  /** Recompute the read-out, and re-render only when the answer actually moved. */
  const apply = useCallback(() => {
    const nodes = [...elements.current.keys()];
    for (const element of nodes) {
      // A new expectation (a singer joining, the full mix falling back to parts)
      // clears the latch; anything that is ready right now is ready for the new
      // count too. Without this, a stem already at HAVE_ENOUGH_DATA would only be
      // re-latched by its next media event — and a quiet element may never have one.
      if (
        stemSettled({
          readyState: element.readyState,
          failed: element.error !== null,
          ended: element.ended,
        })
      ) {
        settled.current.add(element);
      }
    }
    const states = nodes.map((element) => ({
      // A latched stem is reported as ready even if its buffer has been evicted
      // since; a live error still counts as failed and is named.
      readyState: settled.current.has(element) ? PRELOAD_READY_STATE : element.readyState,
      failed: element.error !== null,
      ended: element.ended,
    }));
    const next = preloadProgress(states, expected.current, absent.current);
    // A forced start is a promise the player made, not a readiness answer: the
    // clock must let the run go even though a stem is still arriving.
    const ready = forced.current || next.ready;
    const failed = [
      ...new Set(
        nodes
          .filter((element) => element.error !== null)
          .map((element) => elements.current.get(element) ?? "Audio"),
      ),
    ];
    setProgress((previous) =>
      previous.ready === ready &&
      previous.done === next.done &&
      previous.total === next.total &&
      previous.failed.length === failed.length &&
      previous.failed.every((name, index) => name === failed[index])
        ? previous
        : { ...next, ready, failed },
    );
  }, []);

  /**
   * Start a muted fetch for one stem.
   *
   * Muted playback is what a phone will allow before a gesture and what makes it
   * fetch at all; the element is paused and put back at zero as soon as it is
   * ready (`pausePrime`), so nothing is heard and nothing walks through the song
   * while a band is being chosen.
   */
  const primeElement = useCallback((element: HTMLAudioElement) => {
    if (element.error !== null || element.ended) return;
    element.muted = true;
    element.preload = "auto";
    try {
      void element.play().catch(() => {
        // A browser that will not even play it muted may still fetch its metadata
        // through `load`; readiness is read from the element either way.
        try {
          element.load();
        } catch {
          // The element's own error is the answer; `watch` is already listening.
        }
      });
    } catch {
      // A media element that cannot be asked anything; its error is the answer.
    }
  }, []);

  /** Stop a muted preload and leave the element at the start, unmuted. */
  const pausePrime = useCallback((element: HTMLAudioElement) => {
    // Not muted means this is the run's own playback, or an element that was never
    // primed: the loader does not own it and must not stop it.
    if (!element.muted) return;
    element.pause();
    try {
      element.currentTime = 0;
    } catch {
      // No timeline to rewind yet; the run's own seek seats it.
    }
    element.muted = false;
  }, []);

  const watch = useCallback(
    (element: HTMLAudioElement, label: string): (() => void) => {
      const check = () => {
        if (
          stemSettled({
            readyState: element.readyState,
            failed: element.error !== null,
            ended: element.ended,
          })
        ) {
          settled.current.add(element);
          // It has what it needs: pause the muted preload at the top rather than
          // letting it play through the song behind the band screen.
          if (preloadRef.current) pausePrime(element);
        }
        apply();
      };
      for (const event of EVENTS) element.addEventListener(event, check);
      elements.current.set(element, label);
      check();
      if (preloadRef.current && !settled.current.has(element)) primeElement(element);

      return () => {
        for (const event of EVENTS) element.removeEventListener(event, check);
        elements.current.delete(element);
        settled.current.delete(element);
        pausePrime(element);
        apply();
      };
    },
    [apply, pausePrime, primeElement],
  );

  const expect = useCallback(
    (total: number) => {
      const next = Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0;
      if (expected.current === next) {
        apply();
        return;
      }
      expected.current = next;
      // A new set of stems is a new wait: the missing count and the latch belong
      // to the old song, a new mix, or a singer joining and taking the guide vocal
      // out of the run. A forced start belonged to the old wait too.
      absent.current = 0;
      settled.current.clear();
      forced.current = false;
      apply();
    },
    [apply],
  );

  const missing = useCallback(
    (count: number) => {
      absent.current = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
      apply();
    },
    [apply],
  );

  const prime = useCallback(() => {
    for (const element of elements.current.keys()) {
      if (!settled.current.has(element)) primeElement(element);
    }
  }, [primeElement]);

  const force = useCallback(() => {
    forced.current = true;
    apply();
  }, [apply]);

  // A page that wants the song starts fetching; leaving it (a run, the jukebox)
  // hands the elements back to the transport and puts every muted prime to rest.
  useEffect(() => {
    if (preload) {
      for (const element of elements.current.keys()) {
        if (!settled.current.has(element)) primeElement(element);
      }
    } else {
      for (const element of elements.current.keys()) pausePrime(element);
    }
  }, [preload, pausePrime, primeElement]);

  const api = useMemo<SongAudioPreload>(
    () => ({ expect, missing, watch, prime, force }),
    [expect, missing, watch, prime, force],
  );

  return (
    <ApiContext.Provider value={api}>
      <ProgressContext.Provider value={progress}>{children}</ProgressContext.Provider>
    </ApiContext.Provider>
  );
}

/** The stable side: registration and the gesture that starts a fetch. */
export function useSongAudioPreload(): SongAudioPreload {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useSongAudioPreload needs a SongAudioStatusProvider");
  return api;
}

/** The changing side: what the band's loader and the clock's start gate read. */
export function useSongAudioProgress(): SongAudioProgress {
  return useContext(ProgressContext);
}
