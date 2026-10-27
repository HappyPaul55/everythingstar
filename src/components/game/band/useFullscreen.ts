import { useEffect, useState, type RefObject } from "react";

/**
 * The game's own fullscreen state, from one `fullscreenchange` listener.
 *
 * The game is fullscreen whenever **anything of ours** is — the only things in
 * this document that can take the screen are the stage and its backdrop, and both
 * mean the same thing: the page should stand aside and leave the game to it. The
 * same event handles leaving, so Esc, a swipe or anything else that ends it puts
 * things back where they were.
 */

/** A document, as far as fullscreen is concerned — plain, so it can be tested. */
export interface FullscreenDocument {
  fullscreenElement?: Element | null;
  /** Older WebKit spells it differently. */
  webkitFullscreenElement?: Element | null;
}

/** The element on the whole screen, or null if there is none. */
export function fullscreenElementOf(doc: FullscreenDocument): Element | null {
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/**
 * Is **something of ours** on the whole screen?
 *
 * Anything fullscreen in this document is the game: the only candidates here are
 * the stage and the game's own backdrop, and neither is worth distinguishing from
 * the other. So there is one question — has anything of ours taken the screen —
 * and the answer decides whether the shell stands aside.
 */
export function isGameFullscreen(doc: FullscreenDocument): boolean {
  return fullscreenElementOf(doc) !== null;
}

/**
 * Should a screen be asked for again after something else took it away?
 *
 * A browser may leave fullscreen to show a permission prompt. The game remembers
 * whether it was fullscreen *before* the prompt and tries to put it back after,
 * but only when it is no longer fullscreen.
 */
export function shouldRestoreFullscreen(
  wasActive: boolean,
  doc: FullscreenDocument,
): boolean {
  return wasActive && !isGameFullscreen(doc);
}

/** Older WebKit spells the element's methods differently too. */
interface VendorElement extends Element {
  webkitRequestFullscreen?: () => void;
}

/** Whether this browser can put an element fullscreen at all. */
function fullscreenSupported(doc: Document): boolean {
  const root = doc.documentElement as VendorElement;
  return Boolean(root.requestFullscreen ?? root.webkitRequestFullscreen);
}

export interface FullscreenState {
  /** Is the game on the whole screen right now? */
  active: boolean;
  /** Whether this browser can do it — a button for it is a lie otherwise. */
  supported: boolean;
  /** Take the screen, if anything can. A gesture has to ask for it. */
  enter: () => void;
  /** Take the screen, or give it back if it is already ours. */
  toggle: () => void;
  /**
   * Try to take the screen again if it was ours before an asynchronous prompt
   * (a microphone permission, for example) and the browser stepped out to show
   * it. Best effort: the prompt's answer may not carry the gesture fullscreen
   * needs.
   */
  restore: (wasActive: boolean) => void;
}

interface VendorDocument extends FullscreenDocument {
  documentElement?: Element;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
}

/** Watch the game's fullscreen state. One listener for the whole island. */
export function useFullscreen(target: RefObject<HTMLElement | null>): FullscreenState {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const installed = window.matchMedia?.("(display-mode: fullscreen)");
    const updateSupported = () => {
      // An installed PWA launched fullscreen has no browser bars to hide; the
      // button would only ask for what is already true.
      setSupported(fullscreenSupported(document) && !(installed?.matches ?? false));
    };
    updateSupported();
    installed?.addEventListener?.("change", updateSupported);
    const update = () => {
      const on = isGameFullscreen(document);
      setActive(on);
      // The page around the game reads this to stand aside.
      document.documentElement.toggleAttribute("data-game-fullscreen", on);
    };
    update();
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      installed?.removeEventListener?.("change", updateSupported);
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
      document.documentElement.removeAttribute("data-game-fullscreen");
    };
  }, [target]);

  /**
   * Ask the browser for the screen. It only has to be *asked* while a gesture is
   * in hand — and a refusal is not worth a console error, since a browser that
   * says no simply leaves the page as it was.
   */
  const enter = () => {
    const doc = document as VendorDocument;
    const element = (target.current ?? doc.documentElement ?? null) as VendorElement | null;
    if (!element) return;
    const request = element.requestFullscreen ?? element.webkitRequestFullscreen;
    if (!request) return;
    const asked = request.call(element) as unknown;
    if (asked instanceof Promise) asked.catch(() => {});
  };

  const toggle = () => {
    const doc = document as VendorDocument;
    if (fullscreenElementOf(doc)) {
      const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
      if (exit) void exit.call(doc);
      return;
    }
    enter();
  };

  const restore = (wasActive: boolean) => {
    if (shouldRestoreFullscreen(wasActive, document)) enter();
  };

  return { active, supported, enter, toggle, restore };
}
