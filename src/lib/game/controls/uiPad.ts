import type { Direction } from "../ui/focus";
import { padEdges, type PadButtons } from "./pad";

/**
 * The gamepad's UI layer, as buttons and a direction.
 *
 * Playing and navigating are two different jobs for the same pad. While a song is
 * moving, the stage's own mapping owns the buttons; while a menu, a page or a pause
 * is up, this is what the pad means: a D-pad or the left stick is a **spatial
 * cursor**, A confirms, B goes back, Start pauses, and the shoulders move through
 * the controls in tab order.
 *
 * The standard mapping is the browser's, so nothing here invents a layout.
 */
export const UI_BUTTON = {
  confirm: 0,
  back: 1,
  pagePrev: 4,
  pageNext: 5,
  start: 9,
  // The dedicated Back button some pads carry, beside B.
  systemBack: 8,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

/** How far the stick has to travel before it means a direction. */
export const UI_STICK_DEADZONE = 0.55;

/**
 * How far home the stick has to come before the direction it was holding is let go.
 *
 * One threshold for both directions makes a worn stick that rests near it alternate
 * between a step and a release on every poll — a cursor that twitches instead of
 * walking. Entering needs `UI_STICK_DEADZONE`, leaving only `UI_STICK_RELEASE`, the
 * same hysteresis a strum bar's axis gets in `pad.ts`.
 */
export const UI_STICK_RELEASE = 0.4;

/** What a button press means to the UI, in the order it should be handled. */
export type UiButtonAction = "confirm" | "back" | "start" | "pagePrev" | "pageNext";

/**
 * The UI actions whose buttons went down since the last look. Releases are not UI
 * actions: a menu does not care that A came back up.
 */
export function uiButtonActions(
  buttons: PadButtons,
  before: PadButtons | undefined,
): UiButtonAction[] {
  const actions = new Set<UiButtonAction>();
  for (const edge of padEdges(buttons, before)) {
    if (!edge.down) continue;
    if (edge.button === UI_BUTTON.confirm) actions.add("confirm");
    else if (edge.button === UI_BUTTON.back || edge.button === UI_BUTTON.systemBack)
      actions.add("back");
    else if (edge.button === UI_BUTTON.start) actions.add("start");
    else if (edge.button === UI_BUTTON.pagePrev) actions.add("pagePrev");
    else if (edge.button === UI_BUTTON.pageNext) actions.add("pageNext");
  }
  return [...actions];
}

/** The stick's direction at a threshold, or `null` when it is inside it. */
function stickDirection(x: number, y: number, threshold: number): Direction | null {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax < threshold && ay < threshold) return null;
  if (ax >= ay) return x < 0 ? "left" : "right";
  return y < 0 ? "up" : "down";
}

/**
 * Which way a D-pad or left stick is held, if any.
 *
 * The D-pad wins over a drifting stick, because it is the deliberate control. On a
 * stick with both axes pushed, the one pushed further is the direction; a tie goes
 * to the horizontal, which is the axis a menu usually travels first.
 *
 * `held` is the direction this pad was holding at the last poll. A direction already
 * held is kept until the stick falls inside `UI_STICK_RELEASE`, rather than having to
 * cross `UI_STICK_DEADZONE` again — and a stick that crosses to another direction
 * still has to press for it, because a held direction is only ever kept while the
 * stick stays on its own side.
 */
export function uiDirection(
  buttons: PadButtons,
  axes: readonly number[],
  held: Direction | null = null,
): Direction | null {
  if (buttons[UI_BUTTON.up]) return "up";
  if (buttons[UI_BUTTON.down]) return "down";
  if (buttons[UI_BUTTON.left]) return "left";
  if (buttons[UI_BUTTON.right]) return "right";

  const x = axes[0] ?? 0;
  const y = axes[1] ?? 0;
  const pressed = stickDirection(x, y, UI_STICK_DEADZONE);
  if (pressed) return pressed;
  if (held === null) return null;
  const kept = stickDirection(x, y, UI_STICK_RELEASE);
  return kept === held ? kept : null;
}

/** The first press and the held repeat of a direction, in milliseconds. */
export const UI_REPEAT_DELAY_MS = 360;
export const UI_REPEAT_RATE_MS = 110;
