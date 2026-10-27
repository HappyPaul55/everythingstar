/**
 * The official YouTube IFrame Player API, loaded once.
 *
 * The interface here is only what the stage uses. The API is a third-party script
 * from `www.youtube.com`; the game's content policy has to allow it (`_headers`),
 * and the loader is deliberately a promise so a blocked script is a failed run's
 * problem rather than a thrown import.
 */
export interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getIframe?(): HTMLIFrameElement;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  /** The video's own rate. Optional: not every embed exposes it. */
  setPlaybackRate?(suggestedRate: number, preservePitch?: boolean): void;
  destroy(): void;
  /** Legacy modules: used to keep the video's own captions out of the game's lyrics. */
  unloadModule?(module: string): void;
  setOption?(module: string, option: string, value: unknown): void;
}

export interface YouTubePlayerOptions {
  videoId: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: () => void;
    onStateChange?: (event: { data: number }) => void;
    onError?: (event: { data: number }) => void;
  };
}

export interface YouTubeApi {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** The API's player states, named so the stage does not use bare numbers. */
export const YOUTUBE_STATE = {
  ended: 0,
  playing: 1,
  paused: 2,
  buffering: 3,
  cued: 5,
} as const;

/**
 * How long a script gets to make the API ready before the attempt is abandoned.
 * A tag that never calls back is a dead end: giving up on it lets the next
 * gesture put a fresh one on the page.
 */
const API_TIMEOUT_MS = 15_000;

let loading: Promise<YouTubeApi> | null = null;

/**
 * Load the IFrame API, or hand back the one already on the page.
 *
 * Concurrent callers share one attempt. A failed attempt — a script error or a
 * tag that never called back — forgets itself, because a rejected promise kept in
 * `loading` is a retry that can never happen.
 */
export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("the YouTube player needs a browser"));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;

  let self: Promise<YouTubeApi> | null = null;
  const attempt = new Promise<YouTubeApi>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let script: HTMLScriptElement | null = null;
    const previous = window.onYouTubeIframeAPIReady;

    const forget = () => {
      if (self && loading === self) loading = null;
    };

    const stop = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (window.onYouTubeIframeAPIReady === ready) {
        window.onYouTubeIframeAPIReady = previous;
      }
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      stop();
      // A script that never answered is dead; taking it out of the page is what
      // lets the next attempt add a fresh one instead of waiting on it again.
      script?.remove();
      forget();
      reject(new Error(message));
    };

    const ready = () => {
      previous?.();
      if (settled) return;
      if (!window.YT?.Player) {
        fail("the YouTube player did not start");
        return;
      }
      settled = true;
      stop();
      forget();
      resolve(window.YT);
    };

    // The API calls this global when it is ready, whether we added the script or
    // found somebody else's. Setting it before the script is appended means a
    // fast callback cannot land before there is something to call.
    window.onYouTubeIframeAPIReady = ready;
    timer = setTimeout(() => fail("the YouTube player did not start"), API_TIMEOUT_MS);

    script =
      document.querySelector<HTMLScriptElement>(
        'script[src*="youtube.com/iframe_api"]',
      ) ?? null;
    if (script) {
      // An existing tag has not called back yet. Wait on the same callback and
      // the timeout rather than returning a promise that never settles.
      script.addEventListener("error", () =>
        fail("the YouTube player could not be loaded"),
      );
      return;
    }

    script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.addEventListener("error", () =>
      fail("the YouTube player could not be loaded"),
    );
    document.head.appendChild(script);
  });

  self = attempt;
  loading = attempt;
  return attempt;
}
