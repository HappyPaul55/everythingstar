/**
 * What a song's own audio is doing, said by the sound rather than guessed at.
 *
 * "I hear nothing" has a dozen causes and only one of them is a bug in the game: a
 * fader at zero, a file the browser refused to decode, an element that never started, a
 * tab the operating system muted, a page that was loaded without the gesture an
 * autoplay policy wants. Every one of those leaves a different mark on the element, so
 * the dev read-out **asks the element** instead of inventing a theory — which is the
 * whole reason this module exists, and why its answers are pure enough to be tested.
 */

/** The members of a media element this read-out needs. Structural, so a test can fake it. */
export interface AudioElementLike {
  src?: string;
  currentSrc?: string;
  readyState?: number;
  paused?: boolean;
  muted?: boolean;
  volume?: number;
  error?: { code?: number } | null;
  currentTime?: number;
  duration?: number;
  /** Chrome's count of decoded audio bytes: zero means the stream has no sound in it. */
  webkitAudioDecodedByteCount?: number;
}

export interface AudioFacts {
  /** The scheme actually loaded — `blob:` for a local file, `https:` for a hosted one. */
  scheme: string;
  readyState: number;
  paused: boolean;
  muted: boolean;
  volume: number;
  /** `MediaError.code`, or 0 when the browser has not complained. */
  error: number;
  timeMs: number;
  durationMs: number;
  /** Decoded audio bytes, or null where the browser does not say. */
  decodedAudio: number | null;
}

/** The browser's own names for what went wrong with a media element. */
export const MEDIA_ERRORS: Record<number, string> = {
  1: "aborted",
  2: "network",
  3: "decode",
  4: "unsupported",
};

/** The four `readyState` values, named, because a number in a panel means nothing. */
export const READY_STATES: Record<number, string> = {
  0: "nothing",
  1: "metadata",
  2: "current",
  3: "future",
  4: "enough",
};

export function audioFacts(element: AudioElementLike): AudioFacts {
  const asked = element.currentSrc || element.src || "";
  const at = asked.indexOf(":");
  return {
    scheme: at > 0 ? asked.slice(0, at) : "",
    readyState: number(element.readyState),
    paused: element.paused !== false,
    muted: element.muted === true,
    volume: typeof element.volume === "number" ? element.volume : 1,
    error: number(element.error?.code),
    timeMs: ms(element.currentTime),
    durationMs: ms(element.duration),
    decodedAudio:
      typeof element.webkitAudioDecodedByteCount === "number"
        ? element.webkitAudioDecodedByteCount
        : null,
  };
}

/**
 * One element, in one line.
 *
 * The first thing is **which file** and **how far through it is** — `drums_1.ogg
 * 1m12s / 3m10s` — because that is the question a dev panel is asked when a part is
 * missing or late. Trouble follows the clock: a reader wants "error decode" or
 * "muted" after they know which stem has it, not instead of knowing which stem it is.
 *
 * `name` is the source's own file name when the caller knows it (an object URL has
 * lost the original name). Without one the scheme is the best label there is.
 */
export function audioLine(facts: AudioFacts, name?: string): string {
  const label = name || facts.scheme || "none";
  const parts: string[] = [
    facts.durationMs > 0
      ? `${label} ${progressText(facts.timeMs)} / ${progressText(facts.durationMs)}`
      : `${label} ${progressText(facts.timeMs)}`,
  ];
  if (facts.error > 0) parts.push(`error ${MEDIA_ERRORS[facts.error] ?? facts.error}`);
  if (facts.readyState < 4) {
    // `enough` is the healthy answer and the one worth leaving unsaid; anything
    // less is why a stem is silent or late.
    parts.push(READY_STATES[facts.readyState] ?? `?${facts.readyState}`);
  }
  if (facts.paused) parts.push("paused");
  if (facts.muted) parts.push("muted");
  if (facts.volume !== 1) parts.push(`vol ${Math.round(facts.volume * 100)}%`);
  if (facts.decodedAudio === 0) parts.push("no audio decoded");
  return parts.join(" · ");
}

/**
 * A position as a dev read-out says it: `1m12s`, or `12s` under a minute.
 *
 * Whole seconds because this is a read-out for a person watching a song, not a
 * clock the game judges against; the stage's own `formatClock` (`1:12`) is for the
 * transport, and a media element's fractional position is noise in a list of stems.
 */
export function progressText(timeMs: number): string {
  if (!Number.isFinite(timeMs) || timeMs < 0) return "0s";
  const total = Math.round(timeMs / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

/**
 * Whether this page may start a sound at all, as the browser itself answers it.
 *
 * `navigator.getAutoplayPolicy` is Chrome's own answer and the only one available —
 * `allowed`, `allowed-muted` or `disallowed`. A page loaded without a gesture says
 * `disallowed`, and that is a cause of silence nobody can hear from the outside.
 */
export function autoplayPolicy(target: unknown): string {
  const asked = target as { getAutoplayPolicy?: (type: string) => string } | null;
  try {
    return asked?.getAutoplayPolicy?.("mediaelement") ?? "unknown";
  } catch {
    return "unknown";
  }
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function ms(value: unknown): number {
  const seconds = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.round(seconds * 1000);
}
