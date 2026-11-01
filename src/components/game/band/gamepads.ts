/**
 * Whether a gamepad is connected, without asking the browser every frame.
 *
 * `navigator.getGamepads()` is a poll: with no pad attached it returns four nulls,
 * but the stage and the menu each call it 60 times a second anyway. The browser
 * tells us when that changes (`gamepadconnected`), so the answer is cached and the
 * poll only runs while there is something to poll. The connection events also cover
 * a pad connected after the page loaded, which the initial scan would miss.
 *
 * A plain module, not a hook: both the transport and the menu need the same answer
 * and neither owns it.
 */
let present = false;

function refresh(): void {
  if (typeof navigator === "undefined") return;
  present = (navigator.getGamepads?.() ?? []).some((pad) => pad !== null);
}

/** Is a pad connected right now? Synchronous, and cached by the events. */
export function padsPresent(): boolean {
  return present;
}

/** Start watching; returns the listener teardown. */
export function watchGamepads(): () => void {
  if (typeof window === "undefined") return () => {};
  refresh();
  const changed = () => refresh();
  window.addEventListener("gamepadconnected", changed);
  window.addEventListener("gamepaddisconnected", changed);
  return () => {
    window.removeEventListener("gamepadconnected", changed);
    window.removeEventListener("gamepaddisconnected", changed);
  };
}
