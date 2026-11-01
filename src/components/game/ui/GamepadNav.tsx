import { useEffect, useRef } from "react";
import { uiButtonActions, uiDirection, UI_REPEAT_DELAY_MS, UI_REPEAT_RATE_MS } from "../../../lib/game/controls/uiPad";
import { retainConnected } from "../../../lib/game/controls/pad";
import { backEventFor, type Screen, type ScreenEvent } from "../../../lib/game/screens";
import { nextFocus, type Direction, type FocusRect } from "../../../lib/game/ui/focus";
import { pageIndex } from "../../../lib/game/ui/paging";
import { useClock } from "../band/StageClock";
import { useStageControls } from "../band/StageControls";
import {
  activeRoot,
  clearNavFocus,
  defaultFocus,
  focusablesIn,
  focusStageTarget,
  isEditable,
} from "./nav";
import { closeTopDialog, topDialog } from "./modalStack";

/**
 * The pad as a menu control.
 *
 * It drives the **same DOM focus** as the keyboard and the screen reader: A presses
 * the focused control, B goes back, the D-pad or the left stick moves focus by its
 * geometry. There is no second cursor to keep in step — the control the browser
 * says is focused is the control the pad is on.
 *
 * It is deliberately inert while a song is moving: then the pad is playing frets
 * and strums, and only Start is read, because a pause has to be reachable without
 * leaving the stage.
 */
interface Props {
  screen: Screen;
  dispatch: (event: ScreenEvent) => void;
}

type InputMode = "pointer" | "keyboard" | "pad";

/**
 * What is driving the game right now. The stylesheet uses it to keep a focus that
 * was moved by code on a screen change from painting a second active control under
 * a mouse hover; a real keyboard or pad still gets its focus treatment.
 */
function setInputMode(mode: InputMode): void {
  if (document.documentElement.dataset.gameInput !== mode) {
    document.documentElement.dataset.gameInput = mode;
  }
}

/** The arrows, in the same four words the spatial rule uses. */
function arrowDirection(key: string): Direction | null {
  if (key === "ArrowUp") return "up";
  if (key === "ArrowDown") return "down";
  if (key === "ArrowLeft") return "left";
  if (key === "ArrowRight") return "right";
  return null;
}

/** One direction held, and when the hold is allowed to repeat. */
interface HeldDirection {
  direction: Direction | null;
  repeatAt: number;
}

export function GamepadNav({ screen, dispatch }: Props) {
  const clock = useClock();
  const { learningDevice } = useStageControls();
  const screenRef = useRef(screen);
  const learningRef = useRef(learningDevice);
  /** The previous button state of each pad, for the UI's own edges. */
  const previous = useRef(new Map<number, boolean[]>());
  /** The direction each pad is holding, and its repeat clock. */
  const held = useRef(new Map<number, HeldDirection>());

  useEffect(() => {
    screenRef.current = screen;
    // A direction held across a screen change is not a direction in the new
    // screen; ask for a fresh press rather than walking through the menu.
    held.current.clear();
  }, [screen]);

  useEffect(() => {
    learningRef.current = learningDevice;
  }, [learningDevice]);

  // A keyboard press or the mouse takes the mode back. Moving the pointer is
  // enough: otherwise a screen's starting control keeps its pad marker while a
  // different door is hovered, and two controls look selected at once. The mode
  // also lets the stylesheet tell a real keyboard focus from a focus that was
  // moved by code when the page changed under the mouse.
  useEffect(() => {
    const pointer = () => {
      setInputMode("pointer");
      if (document.querySelector("[data-nav-focus]")) clearNavFocus();
    };
    const keyboard = () => {
      setInputMode("keyboard");
      if (document.querySelector("[data-nav-focus]")) clearNavFocus();
    };
    window.addEventListener("pointermove", pointer, true);
    window.addEventListener("pointerdown", pointer, true);
    window.addEventListener("keydown", keyboard, true);
    return () => {
      window.removeEventListener("pointermove", pointer, true);
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("keydown", keyboard, true);
    };
  }, []);

  // The main menu is the one place the keyboard's arrows are navigation rather
  // than scrolling. They go through the same spatial rule as the pad, so a player
  // can move from Quick Play to the wordmark with Left and back with Right.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (screenRef.current !== "menu" || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (topDialog()) return;
      if (isEditable(document.activeElement)) return;
      const direction = arrowDirection(event.key);
      if (!direction) return;
      event.preventDefault();
      setInputMode("keyboard");
      move("menu", direction);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    return clock.subscribe(() => {
      const gamepads = navigator.getGamepads?.() ?? [];
      const live: Gamepad[] = [];
      for (const pad of gamepads) {
        if (!pad) continue;
        live.push(pad);
      }
      // A pad that went away is forgotten here too: its last look and any held
      // direction are not the new pad's. An empty poll forgets every pad.
      const indices = live.map((pad) => pad.index);
      retainConnected(previous.current, indices);
      retainConnected(held.current, indices);
      const now = performance.now();

      for (const pad of live) {
        const buttons = pad.buttons.map((button) => button.pressed);
        const before = previous.current.get(pad.index);
        previous.current.set(pad.index, buttons);

        // A **pad** being learned is not a cursor: every button is the answer to
        // the question, and nothing is the game's until it stops. A keyboard or
        // MIDI session leaves the pad as a cursor, so B can still cancel it — a
        // player whose only controller is a pad must not be trapped.
        if (learningRef.current?.on === "pad") {
          held.current.delete(pad.index);
          continue;
        }

        const actions = uiButtonActions(buttons, before);
        // What this pad held at the last look: the stick's release threshold needs
        // it, or a worn stick just inside the deadzone would twitch the cursor.
        const state = held.current.get(pad.index) ?? { direction: null, repeatAt: 0 };
        const direction = uiDirection(buttons, pad.axes, state.direction);
        const current = screenRef.current;
        if (actions.length > 0 || direction) setInputMode("pad");

        if (current === "playing") {
          // The only menu action during a song. Everything else belongs to the
          // players' frets, strums and whammy.
          if (actions.includes("start") && !topDialog()) dispatch("pause");
          continue;
        }

        if (current === "loading" || current === "countdown") {
          // B is a fret on every chart with four or more columns, and a player's
          // hand is already on them during the entrance. Abandoning the run to the
          // jukebox from a button that also plays a note is a trap; leaving is
          // Escape's, or the pause's.
          if (actions.includes("back") && current === "loading") dispatch("quit");
          continue;
        }

        if (actions.includes("back")) {
          if (closeTopDialog()) return;
          const event = backEventFor(current);
          if (event) dispatch(event);
          continue;
        }
        if (actions.includes("start")) {
          // Start belongs to an open dialog, not to the screen underneath it: a
          // player choosing a practice stretch must not have the run resumed
          // under the dialog by the same press. The pause's **own** dialog is the
          // exception — Start is its documented toggle, and its only way back.
          const dialog = topDialog();
          if (dialog && !dialog.matches(".screen--paused")) continue;
          if (current === "paused") dispatch("resume");
          continue;
        }
        if (actions.includes("confirm")) {
          activate();
          continue;
        }
        if (actions.includes("pagePrev")) {
          page(current, -1);
          continue;
        }
        if (actions.includes("pageNext")) {
          page(current, 1);
          continue;
        }

        if (direction !== state.direction) {
          state.direction = direction;
          if (direction) {
            move(current, direction);
            state.repeatAt = now + UI_REPEAT_DELAY_MS;
          }
        } else if (direction && now >= state.repeatAt) {
          move(current, direction);
          state.repeatAt = now + UI_REPEAT_RATE_MS;
        }
        held.current.set(pad.index, state);
      }
    });
  }, [clock, dispatch]);

  return null;
}

/** Press the focused control. Text fields stay for the operating system's keyboard. */
function activate(): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  // A text field keeps its keys, but a checkbox, a range or a select is a control
  // the pad must be able to press — otherwise the practice Loop box is focusable
  // and unpressed, which is a cursor with a dead A button.
  if (isEditable(active)) return;
  active.click();
}

/**
 * A range is the one control a direction changes instead of leaving. Left steps
 * it down and right steps it up; up and down still move focus. The `input` event
 * is what React listens to, so the setting keeps up exactly as it does under a
 * mouse.
 */
function adjustRange(direction: Direction): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement) || active.type !== "range") return false;
  // Left and right are the slider's own axis. Up and down still move focus, or a
  // range would be the one control a pad could never leave.
  if (direction !== "left" && direction !== "right") return false;
  if (direction === "left") active.stepDown();
  else active.stepUp();
  active.dispatchEvent(new Event("input", { bubbles: true }));
  active.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/**
 * The controls a screen offers, including the corner's fullscreen button. A modal
 * is its own world: while one is open, the corner and the screen behind it are
 * inert and not part of the walk.
 */
function uiControls(screen: Screen): { root: HTMLElement; controls: HTMLElement[] } | null {
  const root = activeRoot(screen);
  if (!root) return null;
  const controls = focusablesIn(root);
  if (!topDialog()) {
    const corner = document.querySelector<HTMLElement>(".stage-corner");
    if (corner && !root.contains(corner)) controls.push(...focusablesIn(corner));
  }
  return { root, controls };
}

function move(screen: Screen, direction: Direction): void {
  if (adjustRange(direction)) return;
  const scope = uiControls(screen);
  if (!scope) return;
  const { root, controls } = scope;
  if (controls.length === 0) return;

  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) {
    const first = defaultFocus(root);
    if (first) {
      focusStageTarget(first);
      return;
    }
  }
  const currentRect =
    active instanceof HTMLElement
      ? ((active instanceof HTMLDialogElement
          ? (active.querySelector<HTMLElement>(".config__panel") ?? active)
          : active
        ).getBoundingClientRect() as FocusRect)
      : (root.getBoundingClientRect() as FocusRect);
  const index = nextFocus(
    controls.map((control) => control.getBoundingClientRect() as FocusRect),
    currentRect,
    direction,
  );
  if (index !== null) focusStageTarget(controls[index]!);
}

/**
 * Move through the controls in DOM order. A short screen wraps at the ends; the
 * jukebox does not, because only the mounted rows are in `controls` and wrapping
 * from the last of them to the screen's first control is a teleport rather than
 * a page. Its own arrows and Tab step through the rest of the window.
 */
function page(screen: Screen, delta: -1 | 1): void {
  const scope = uiControls(screen);
  if (!scope) return;
  const { controls } = scope;
  if (controls.length === 0) return;
  const active = document.activeElement;
  const currentIndex = active instanceof HTMLElement ? controls.indexOf(active) : -1;
  const next = pageIndex(currentIndex, controls.length, delta, screen !== "songs");
  if (next === null) return;
  focusStageTarget(controls[next]!);
}
