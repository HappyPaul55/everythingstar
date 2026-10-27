import type { Screen } from "../../../lib/game/screens";
import { topDialog } from "./modalStack";

/**
 * The DOM side of screen focus and gamepad navigation.
 *
 * Focus itself belongs to the browser: the same outline, the same screen reader
 * announcement, the same tab order. These helpers only find the active screen's
 * controls and put focus where the screen says it should start.
 */
const SCREEN_ROOT: Record<Screen, string> = {
  welcome: ".screen--welcome",
  menu: ".screen--menu",
  options: ".screen--options",
  credits: ".screen--credits",
  songs: ".screen--songs",
  band: ".screen--band",
  loading: ".screen--loading",
  countdown: ".band__stage",
  playing: ".band__stage",
  paused: ".screen--paused",
  results: ".screen--results",
};

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Is this element something a focus ring belongs around? */
function isRingable(element: HTMLElement): boolean {
  return element.matches(FOCUSABLE);
}

/**
 * The nearest control an event landed inside, or null.
 *
 * The same list the focus layer walks, so "what can be focused" and "what can be
 * moved onto" are one definition rather than two that drift.
 */
export function controlAt(node: EventTarget | null): HTMLElement | null {
  return node instanceof Element ? node.closest<HTMLElement>(FOCUSABLE) : null;
}

/**
 * The input types that take typed characters: the text-entry family and the
 * date/time one. Everything else — a range, a checkbox, a radio, a button, a
 * colour well, a file — is a control, not a place to write.
 */
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "password",
  "tel",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

/** Enough of a field to say whether it takes characters, so the rule has no DOM. */
interface TypingField {
  tagName: string;
  isContentEditable?: boolean;
  type?: string;
}

function takesCharacters(field: TypingField): boolean {
  if (field.isContentEditable) return true;
  const tag = field.tagName.toLowerCase();
  if (tag === "textarea") return true;
  if (tag !== "input") return false;
  // A real input's `type` is already lower-case and defaults to `text`.
  return TEXT_INPUT_TYPES.has((field.type ?? "text").toLowerCase());
}

/**
 * Is this something that takes typed characters?
 *
 * A text field keeps its own keys: Escape clears a search rather than leaving the
 * screen, and the arrows move a caret rather than a cursor. Both the pad's menu
 * layer and the island's Escape handler step aside for one.
 *
 * A **range**, a **checkbox** or a **select** is not one of those: touching the
 * volume slider must not leave Escape doing nothing for the rest of the screen.
 */
export function isEditable(node: Element | null): boolean {
  return node ? takesCharacters(node) : false;
}

/** The screen a player is on, or the dialog sitting over it — the top one. */
export function activeRoot(screen: Screen): HTMLElement | null {
  const dialog = topDialog();
  if (dialog) return dialog;
  return document.querySelector<HTMLElement>(SCREEN_ROOT[screen]);
}

/** Every focusable control in a screen or dialog, in DOM order. */
export function focusablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => {
    if (element.hidden) return false;
    if (element.getClientRects().length === 0) return false;
    const style = window.getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none";
  });
}

/** Forget the marker that says the UI navigator put focus here. */
export function clearNavFocus(): void {
  for (const element of document.querySelectorAll<HTMLElement>("[data-nav-focus]")) {
    element.removeAttribute("data-nav-focus");
  }
}

/**
 * Focus an element and, when it is a control, mark it so the stage's own focus
 * ring is visible even though a gamepad is not a keyboard.
 *
 * `silent` says this focus is the game placing the player somewhere (a screen's
 * starting control, a dialog opening, a row growing back after another is
 * removed) rather than the player moving. Those are not a move to make a sound
 * for — the screen change or the dialog's own `open` cue already says it — so the
 * mixer leaves them alone.
 */
export interface FocusOptions {
  ring?: boolean;
  silent?: boolean;
}

/** How many focus moves in hand are the game's own bookkeeping. */
let silentFocus = 0;

/** Is the focus change happening now one the player did not make? */
export function focusIsSilent(): boolean {
  return silentFocus > 0;
}

export function focusStageTarget(element: HTMLElement, options: FocusOptions = {}): void {
  const ring = options.ring ?? isRingable(element);
  clearNavFocus();
  // A focus moved by the game when the page changed is not the mouse's focus. If
  // the pointer is what is driving, do not paint a control under it.
  const pointer = document.documentElement.dataset.gameInput === "pointer";
  if (ring && !pointer) element.setAttribute("data-nav-focus", "true");
  if (options.silent) silentFocus += 1;
  try {
    element.focus({ preventScroll: true });
    // A control **inside the stage** is on a screen that is already wholly in
    // view, so bringing it "into view" can only move the stage — or the page —
    // under the player. That is how a focused pad scrolled the stage's own
    // `overflow: hidden` by a few dozen pixels (and, once the stage was clipped,
    // the `/play` document to the footer), leaving the progress bar off the top
    // and a strip of backdrop at the bottom. The pages keep their scroll: the
    // jukebox's list and a dialog's first field may genuinely be below the fold.
    if (!element.closest(".band__stage")) {
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  } finally {
    if (options.silent) silentFocus -= 1;
  }
}

/**
 * The element a screen starts on, if it has said so.
 *
 * A **marked root** is the starting place itself: the stage and the loading screen
 * are places, not controls, and focusing the stage's first button instead put the
 * ring on a highway pad (and let `scrollIntoView` move the stage). A page that
 * starts on a control marks the control, not its root.
 */
export function defaultFocus(root: HTMLElement): HTMLElement | null {
  if (root.hasAttribute("data-nav-default")) return root;
  const marked = root.querySelector<HTMLElement>("[data-nav-default]");
  if (marked) return marked;
  const controls = focusablesIn(root);
  return controls[0] ?? null;
}
