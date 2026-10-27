/**
 * Gamepads, as a snapshot and its edges.
 *
 * The browser hands a gamepad's **whole state** every time it is asked, so there
 * are no events to subscribe to: a source polls it on the frame it is already
 * running (the stage's one loop) and diffs against the last look. That is why a
 * gamepad costs no plumbing at all — it is the same shape as the frames running
 * anyway.
 *
 * Pure, so the diffing is testable without a pad in the room.
 */

/** A gamepad's buttons, pressed or not, in the standard mapping's order. */
export type PadButtons = readonly boolean[];

/** A gamepad's axes, in the standard mapping's order (`-1` … `1`). */
export type PadAxes = readonly number[];

/** Which way each axis is held, from the last look: `0` is at rest. */
export type PadAxisHeld = readonly (0 | 1 | -1)[];

/** One button changing state. */
export interface PadEdge {
  /** The button's index, as the standard mapping numbers them. */
  button: number;
  down: boolean;
}

/** One axis crossing its threshold, in one direction. */
export interface PadAxisEdge {
  /** The axis's index, as the standard mapping numbers it. */
  axis: number;
  /** Which way it moved: `1` is positive, `-1` negative. */
  direction: 1 | -1;
  down: boolean;
}

/** How far an axis has to travel before it means a press, and to release. */
export interface PadAxisOptions {
  /** A crossing of this magnitude presses. Defaults to {@link PAD_AXIS_PRESS}. */
  press?: number;
  /** Falling back inside this magnitude releases. Defaults to {@link PAD_AXIS_RELEASE}. */
  release?: number;
}

/** A strum bar is a switch, so half its travel is a deliberate push. */
export const PAD_AXIS_PRESS = 0.5;

/** The way back has to come most of the way home before it is a release. */
export const PAD_AXIS_RELEASE = 0.35;

/**
 * What changed since the last look. A pad that has only just appeared has no
 * "before", and every button it is holding down then counts as a press — which is
 * what a player who was already holding it means.
 */
export function padEdges(buttons: PadButtons, before: PadButtons | undefined): PadEdge[] {
  const edges: PadEdge[] = [];
  for (let button = 0; button < buttons.length; button += 1) {
    const down = buttons[button] === true;
    const was = before?.[button] === true;
    if (down !== was) edges.push({ button, down });
  }
  return edges;
}

/**
 * Which way each axis is held **now**, from the last look's hold.
 *
 * An axis is not a button: it rests somewhere in the middle and a small drift is
 * not a press. So a press needs most of the travel (`press`, 0.5), while a release
 * only needs the axis to come back inside a smaller band (`release`, 0.35) —
 * **hysteresis**, which is what stops a stick breathing around its threshold from
 * firing a strum every frame. Crossing straight from one side to the other is a
 * release and a press, in that order, which is what a spring-return bar does.
 *
 * A first look latches what the pad is holding without producing an edge: a bar
 * at rest is not a press, and a bar held over from before the stage looked is a
 * press nobody made.
 */
export function padAxisState(
  axes: PadAxes,
  before: PadAxisHeld | undefined,
  options: PadAxisOptions = {},
): PadAxisHeld {
  const press = Math.abs(options.press ?? PAD_AXIS_PRESS);
  const release = Math.min(Math.abs(options.release ?? PAD_AXIS_RELEASE), press);
  const state: (0 | 1 | -1)[] = [];
  for (let axis = 0; axis < axes.length; axis += 1) {
    const value = axes[axis] ?? 0;
    const was = before?.[axis] ?? 0;
    if (was === 1) {
      if (value <= release) {
        // Released, and possibly thrown all the way the other way in one look.
        state.push(value <= -press ? -1 : 0);
      } else {
        state.push(1);
      }
    } else if (was === -1) {
      if (value >= -release) {
        state.push(value >= press ? 1 : 0);
      } else {
        state.push(-1);
      }
    } else if (value >= press) {
      state.push(1);
    } else if (value <= -press) {
      state.push(-1);
    } else {
      state.push(0);
    }
  }
  return state;
}

/**
 * What changed on the axes since the last look, one edge per direction.
 *
 * A release always comes before the press that replaces it, so applying the edges
 * in order leaves the axis where the player is actually holding it. The first look
 * says nothing: an axis at rest is not a press, and there is no "before" to have
 * moved from.
 */
export function padAxisEdges(
  axes: PadAxes,
  before: PadAxisHeld | undefined,
  options: PadAxisOptions = {},
): PadAxisEdge[] {
  if (!before) return [];
  const state = padAxisState(axes, before, options);
  const edges: PadAxisEdge[] = [];
  const count = Math.max(axes.length, before.length);
  for (let axis = 0; axis < count; axis += 1) {
    const was = before[axis] ?? 0;
    const now = state[axis] ?? 0;
    if (was === now) continue;
    if (was !== 0) edges.push({ axis, direction: was, down: false });
    if (now !== 0) edges.push({ axis, direction: now, down: true });
  }
  return edges;
}

/**
 * Forget every per-pad entry for a pad that is no longer connected.
 *
 * The per-pad maps the poll loops keep are keyed by the **index** a pad reports,
 * and the browser reuses an index: a pad that goes away while a button is held and
 * comes back at the same index would otherwise be diffed against the old pad's last
 * look. That is a stale "before", and it reads as a swallowed first press on a
 * button the old pad was holding, or as a direction that keeps repeating because
 * the cursor still thinks it is down. An index no pad reports is nobody's, so it is
 * dropped, and a pad that appears again starts from no previous state at all.
 *
 * `connected` is the indices the browser reports right now: an empty set prunes
 * everything, and an entry whose pad is still there is left exactly as it was. The
 * map is pruned in place rather than rebuilt, because the poll loops hold theirs in
 * refs and read them again on the next frame.
 */
export function retainConnected<K, V>(map: Map<K, V>, connected: Iterable<K>): void {
  const keep = new Set(connected);
  for (const key of map.keys()) {
    if (!keep.has(key)) map.delete(key);
  }
}

/**
 * Which entries a map is holding for something that is no longer connected.
 *
 * `retainConnected` forgets them; this says **what** was forgotten, so the input
 * route can let go of the controls those entries were holding. A pad unplugged
 * mid-hold sends no release — the browser has nothing left to report — and the
 * fret would otherwise stay down for the rest of the run, which is a free sustain
 * and a hopo chain that never closes.
 *
 * Pure and non-destructive: the caller prunes with `retainConnected` and uses the
 * names here to synthesize the releases.
 */
export function droppedKeys<K>(map: ReadonlyMap<K, unknown>, connected: Iterable<K>): K[] {
  const keep = new Set(connected);
  const dropped: K[] = [];
  for (const key of map.keys()) {
    if (!keep.has(key)) dropped.push(key);
  }
  return dropped;
}
