/**
 * The install prompt, captured once for the whole session.
 *
 * Chromium fires `beforeinstallprompt` **once**, early, and only if the page is
 * installable. Options is several screens away by the time a player looks for an
 * Install button, so a hook mounted there would miss the event entirely. This
 * module watches from the moment the island mounts and keeps the event; the hook
 * only reads the snapshot.
 *
 * Pure state and browser listeners; no React.
 */

/** What the game can say about installing right now. */
export type InstallStatus =
  | "available" // a prompt is in hand
  | "installed" // already standalone
  | "ios" // Safari: no prompt, but Add to Home Screen works
  | "unsupported" // the browser's own menu is the only way
  | "native"; // the Android/iOS shell: nothing to install

export interface InstallSnapshot {
  status: InstallStatus;
  /** The browser's prompt is open; a second press would do nothing. */
  busy: boolean;
  /** The last prompt's answer, when it said something worth repeating. */
  message: "dismissed" | "failed" | null;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

/** The early stash `src/components/pwa/InstallPrompt.astro` writes in the head. */
interface InstallWindow extends Window {
  __everythingstarInstallPrompt?: BeforeInstallPromptEvent;
}

function earlyPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  const early = (window as InstallWindow).__everythingstarInstallPrompt;
  return early && typeof early.prompt === "function" ? early : null;
}

function forgetEarlyPrompt(): void {
  if (typeof window === "undefined") return;
  try {
    delete (window as InstallWindow).__everythingstarInstallPrompt;
  } catch {
    // The property may be non-configurable in an unusual embedder; the spent
    // event is harmless there because `deferred` is still the only one used.
  }
}

/** The pure decision, so the states can be tested without a browser. */
export function installStatus(env: {
  standalone: boolean;
  native: boolean;
  ios: boolean;
  promptAvailable: boolean;
}): InstallStatus {
  if (env.native) return "native";
  if (env.standalone) return "installed";
  if (env.promptAvailable) return "available";
  if (env.ios) return "ios";
  return "unsupported";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches
  ) {
    return true;
  }
  return (navigator as NavigatorWithStandalone).standalone === true;
}

function isNative(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.native !== undefined
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const agent = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(agent)) return true;
  // iPadOS reports a Mac; the touch points are what make it a tablet.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

let snapshot: InstallSnapshot = {
  status: "unsupported",
  busy: false,
  message: null,
};
let deferred: BeforeInstallPromptEvent | null = null;
let watching = false;
const listeners = new Set<() => void>();

function emit(patch: Partial<InstallSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

function currentStatus(promptAvailable: boolean): InstallStatus {
  return installStatus({
    standalone: isStandalone(),
    native: isNative(),
    ios: isIos(),
    promptAvailable,
  });
}

/**
 * Start watching, once.
 *
 * Called by the session as the island mounts, which is early enough for the
 * browser's one prompt event, and by the hook as a fallback for a screen opened
 * before the session's effect ran.
 */
export function watchInstall(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  // The inline head listener may already have caught the one event; adopt it
  // before the status is decided, or the row would say "unsupported" forever.
  const early = earlyPrompt();
  if (early) deferred = early;
  snapshot = { ...snapshot, status: currentStatus(deferred !== null) };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    forgetEarlyPrompt();
    emit({ status: "available", message: null });
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    forgetEarlyPrompt();
    emit({ status: "installed", busy: false, message: null });
  });

  if (typeof window.matchMedia === "function") {
    const media = window.matchMedia("(display-mode: standalone)");
    const changed = () => {
      if (media.matches) emit({ status: "installed", message: null });
    };
    media.addEventListener?.("change", changed);
  }
}

/** The current install state, for `useSyncExternalStore`. */
export function installSnapshot(): InstallSnapshot {
  return snapshot;
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Open the browser's install prompt and record what it answered.
 *
 * The event can only be used once, so it is spent whether the player accepts,
 * dismisses or the browser throws. A dismissal is not a failure: the browser may
 * offer the prompt again later, and the button is still there.
 */
export async function promptInstall(): Promise<void> {
  if (!deferred || snapshot.busy) return;
  const event = deferred;
  emit({ busy: true, message: null });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    deferred = null;
    forgetEarlyPrompt();
    if (choice.outcome === "accepted") {
      emit({ status: "installed", busy: false });
    } else {
      emit({
        status: currentStatus(false),
        busy: false,
        message: "dismissed",
      });
    }
  } catch {
    deferred = null;
    forgetEarlyPrompt();
    emit({ busy: false, message: "failed" });
  }
}
