import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import {
  createPartAudio,
  phraseEndAt,
  restoreRuleFor,
  type PartAudio,
  type PartKey,
  type PartSpan,
} from "../../../lib/game/audio/parts";
import type { LaneRun } from "../../../lib/game/lanes";
import { useSong } from "./SongContext";
import { useClock } from "./StageClock";

/**
 * The line between a run's misses and the song's stems.
 *
 * **One way, always**: a panel or a words card says its part is out, and
 * `SongAudio` ducks those stems. Nothing here is ever read back into a run, so the
 * rule that no player can be affected by another still holds by construction.
 *
 * The registry is an **object outside React state** for the same reason the run
 * board is: a miss is a music event, not a screen event, and re-rendering the
 * stage on every one of them would cost a frame for a volume change. `SongAudio`
 * subscribes and writes `element.volume` itself.
 */
const PartAudioContext = createContext<PartAudio | null>(null);

/**
 * The registry's own clock, mounted once for **every** song path.
 *
 * A `phrase_end` duck is put back by song time, and a seek is a new attempt. This
 * used to live in `SongAudio`, which is not rendered for a YouTube-backed song, so
 * that path never expired a phrase-end duck or cleared one on a seek. It is a
 * headless part of the provider instead: no second frame loop, and no React state.
 */
function PartAudioClock({ audio }: { audio: PartAudio }) {
  const clock = useClock();
  const { doc } = useSong();
  // The serial outlives a re-subscribe: the clock object changes when the transport
  // does, and a seek that landed just before that must still clear the parts.
  const lastSeek = useRef(clock.seekSerialRef.current);
  useEffect(() => {
    return clock.subscribe(() => {
      if (clock.seekSerialRef.current !== lastSeek.current) {
        lastSeek.current = clock.seekSerialRef.current;
        audio.clear();
      }
      audio.tick(clock.timeRef.current);
    });
  }, [clock, audio]);
  useEffect(() => {
    audio.clear();
  }, [audio, doc]);
  return null;
}

export function PartAudioProvider({ children }: { children: ReactNode }) {
  const ref = useRef<PartAudio | null>(null);
  ref.current ??= createPartAudio();
  return (
    <PartAudioContext.Provider value={ref.current}>
      <PartAudioClock audio={ref.current} />
      {children}
    </PartAudioContext.Provider>
  );
}

export function usePartAudio(): PartAudio {
  const audio = useContext(PartAudioContext);
  if (!audio) throw new Error("usePartAudio needs a PartAudioProvider");
  return audio;
}

/** The few things a part's own screen knows about its duck. */
export interface PartMuteOptions {
  /**
   * The spans the part's own chart or melody marks — a highway's phrases, or the
   * melody's lines. Only `restore: "phrase_end"` reads them: the miss is held
   * until the phrase it fell in has run out.
   */
  spans?: readonly PartSpan[];
  /** The part **went out** — the first miss of a streak, whether or not anything drops. */
  onOut?: () => void;
}

/** One empty list, so a caller with no spans hands the hook the same value twice. */
const NO_SPANS: readonly PartSpan[] = [];

/**
 * One player's part, ducked by their own misses.
 *
 * A miss takes the part's stems out, and the song document says what puts them
 * back (`onMiss.restore`):
 *
 * - **`next_hit`** — the next hit restores it. This is the default, and the rule a
 *   part without one gets;
 * - **`phrase_end`** — the mute lasts until the end of the phrase the miss fell
 *   in, on the **song clock**. A hit in between does not shorten it, and the
 *   registry's `tick` restores it; a later miss extends it to that miss's own
 *   phrase. When no phrase contains the miss, there is nothing to wait for and it
 *   behaves as next hit.
 *
 * A miss wins over a hit in the same breath, because a chord with one fret short
 * is a broken chord; a rewind or a new run puts everything back, and leaving the
 * stage never leaves a part muted for the next screen.
 *
 * `onOut` is called the moment the part **goes out** — the first miss of a streak —
 * whether or not the song has a stem to silence. That is when a player's channel
 * stops, so it is where the cue for it belongs; a miss while the part is already out
 * does not call it again. A song shipped as one master has nothing to duck and still
 * calls it, because the part *would* have gone out.
 *
 * The hook reads the registry rather than remembering whether it muted: a
 * phrase-end mute is taken back by the clock, which the hook does not render on.
 */
export function usePartMute(
  seat: number,
  part: PartKey,
  run: Pick<LaneRun, "hits" | "misses">,
  { spans = NO_SPANS, onOut }: PartMuteOptions = {},
): void {
  const audio = usePartAudio();
  const clock = useClock();
  const { doc } = useSong();
  const timeRef = clock.timeRef;
  const last = useRef({ hits: run.hits, misses: run.misses });
  const out = useRef(onOut);
  out.current = onOut;
  // The spans are read at the miss, not at the render: a chart's phrases and a
  // melody's lines are one array for the whole run, and rebuilding the effect on
  // their identity would make a re-render a reason to lose a mute.
  const spansRef = useRef(spans);
  spansRef.current = spans;
  const rule = doc ? restoreRuleFor(doc, part) : "next_hit";

  useEffect(() => {
    const state = last.current;
    const rewound = run.hits < state.hits || run.misses < state.misses;
    const missed = run.misses > state.misses;
    const hit = run.hits > state.hits;
    state.hits = run.hits;
    state.misses = run.misses;

    // A rewind or a new run starts with everything back in.
    if (rewound) {
      audio.set(seat, part, false);
      return;
    }

    const live = audio.mute(seat);
    if (missed) {
      // The document's own rule: next hit by default, or the phrase the miss fell
      // in. `null` is "no phrase contains this", which behaves as next hit.
      const at =
        rule === "phrase_end" ? phraseEndAt(spansRef.current, timeRef.current) : null;
      if (!live) {
        audio.set(seat, part, true, at);
        out.current?.();
      } else if (at !== null && (live.restoreAtMs === null || at > live.restoreAtMs)) {
        // A later miss while the part is already out keeps it out until *its* own
        // phrase ends. A next-hit mute has no clock to move.
        audio.set(seat, part, true, at);
      }
      return;
    }

    if (hit && live && live.restoreAtMs === null) {
      // The next hit is the rule for a mute that waits for one. A phrase-end mute
      // belongs to the clock, so a hit in the phrase does not shorten it.
      audio.set(seat, part, false);
    }
  }, [audio, timeRef, seat, part, rule, run.hits, run.misses]);

  // Leaving the stage is not a miss: a part never stays out for the next screen.
  useEffect(() => () => audio.set(seat, part, false), [audio, seat, part]);
}
