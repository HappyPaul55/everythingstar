/**
 * The first-run hints this browser has already shown, **per player seat**.
 *
 * A hint is a lesson, not a setting: the first time Player 3 is on stage they
 * should see the keys, even if Players 1 and 2 have been playing for weeks. A
 * single `firstRun` flag would give the whole browser one first run and leave the
 * next person with nothing, so the record is a set of seats.
 *
 * It is local state, like the band, the board and the settings: no account and no
 * server. Everything except the two storage calls is pure, so a broken store
 * cannot leave a seat permanently untaught.
 */

const STORAGE_KEY = "everythingstar:onboarding";

export interface OnboardingState {
  /** Seats whose first-run highway hints have already been shown. */
  seats: number[];
}

export const EMPTY_ONBOARDING: OnboardingState = { seats: [] };

/**
 * Read a state out of stored JSON. Anything unreadable is no seats — the player
 * sees the hints once more rather than never seeing them at all.
 */
export function parseOnboarding(raw: string | null): OnboardingState {
  if (!raw) return EMPTY_ONBOARDING;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return EMPTY_ONBOARDING;
    const seats = (value as { seats?: unknown }).seats;
    if (!Array.isArray(seats)) return EMPTY_ONBOARDING;
    const seen = new Set<number>();
    for (const seat of seats) {
      if (typeof seat === "number" && Number.isInteger(seat) && seat >= 0) {
        seen.add(seat);
      }
    }
    return { seats: [...seen].sort((a, b) => a - b) };
  } catch {
    return EMPTY_ONBOARDING;
  }
}

/** Whether this seat has already had its first-run hints. */
export function hasSeenHints(state: OnboardingState, seat: number): boolean {
  return state.seats.includes(seat);
}

/**
 * Remember that this seat has had its hints. A seat already in the record is left
 * alone, and an impossible seat is ignored rather than written down.
 */
export function markHintsSeen(
  state: OnboardingState,
  seat: number,
): OnboardingState {
  if (!Number.isInteger(seat) || seat < 0 || state.seats.includes(seat)) {
    return state;
  }
  return { seats: [...state.seats, seat].sort((a, b) => a - b) };
}

/** The state this browser has stored, or no seats when it cannot be read. */
export function loadOnboarding(): OnboardingState {
  try {
    return parseOnboarding(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY_ONBOARDING;
  }
}

/** Remember the state. A blocked store just means the hints show again. */
export function saveOnboarding(state: OnboardingState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A full or blocked store is a lesson not remembered, never a game that will
    // not start.
  }
}
