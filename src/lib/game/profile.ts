/**
 * A **player's profile**: the four local records this browser keeps, as one JSON
 * file somebody can carry to another browser.
 *
 * It is deliberately not a backup of the *game*. **The library, the downloads and
 * the audio are not in it** — those are not records a player owns, they are other
 * people's files fetched through a URL — so a profile is small, portable and safe
 * to paste anywhere. What it carries is exactly the four things AGENTS.md calls a
 * player's own: the settings (how the game behaves), the band (who plays with what,
 * per seat), the board (what runs were played) and the first-run hints (which seats
 * have already seen the keys).
 *
 * The envelope is versioned and its shape is checked **before anything is written**
 * to this browser: a wrong format, a wrong version, a missing record or a file over
 * a megabyte is a sentence rather than a half-import. The records themselves are
 * read through their own pure parsers rather than a second copy of their rules, so
 * an imported profile cannot put a value on the stage that a stored one could not.
 *
 * Everything here is pure; `Options` is the only thing that writes the result.
 */

import { BOARD_LIMIT, parseBoard, type SavedRun } from "./scores";
import { parsePlan } from "./band/store";
import type { BandPlan } from "./band/types";
import { parseOnboarding, type OnboardingState } from "./onboarding";
import { parseSettings, type Settings } from "./settings";

/** What a profile says it is. The string is the first check, before its shape. */
export const PROFILE_FORMAT = "everythingstar-profile";

/** The envelope's shape. A different number is a file this build cannot read. */
export const PROFILE_VERSION = 1;

/**
 * The most a profile may be, before it is parsed.
 *
 * The four records are kilobytes — a board of fifty runs is tens of them — so a
 * megabyte is already far past a real profile and catches a file that is really a
 * library or a video before it is read into an object.
 */
export const PROFILE_LIMIT_BYTES = 1_000_000;

/** The file, as it is written and read. */
export interface Profile {
  format: typeof PROFILE_FORMAT;
  version: number;
  /** When it was exported, in ms since the epoch. */
  exportedAt: number;
  settings: Settings;
  band: BandPlan;
  board: SavedRun[];
  onboarding: OnboardingState;
}

/** What a caller hands `buildProfile`: the live records and the clock. */
export interface ProfileSource {
  settings: Settings;
  plan: BandPlan;
  board: SavedRun[];
  onboarding: OnboardingState;
  /** The export's moment, passed in so the builder stays pure. */
  now: number;
}

/** Why a file was not a profile, in the words the UI says. */
export type ProfileProblem =
  | "tooLarge"
  | "notJson"
  | "notObject"
  | "wrongFormat"
  | "wrongVersion"
  | "missingSettings"
  | "missingBand"
  | "missingBoard"
  /**
   * The file could not be read at all. `readProfile` never returns it — it takes
   * text — but the screen that reads the file does, and one union means one place
   * says what every failure reads as.
   */
  | "readFailed";

/** Either the profile, or the one reason it could not be read. */
export type ProfileResult =
  | { ok: true; profile: Profile }
  | { ok: false; problem: ProfileProblem };

/** A value that is an object and not an array. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Plain JSON data, so a profile is a copy rather than a view of the live records:
 * a caller that edited what it handed over could not change the game's state, and
 * what is written is exactly what a later `JSON.stringify` sees.
 */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The profile a player's records make, ready to be `JSON.stringify`d. */
export function buildProfile(source: ProfileSource): Profile {
  return {
    format: PROFILE_FORMAT,
    version: PROFILE_VERSION,
    exportedAt: source.now,
    settings: plain(source.settings),
    // The band is a plan, not a setup: it is the remembered choice, and the seat
    // numbering is the plan's own order.
    band: plain(source.plan),
    // The same cap the board itself keeps, so exporting a board that somehow grew
    // past it does not make a file this build would then trim.
    board: plain(source.board.slice(0, BOARD_LIMIT)),
    onboarding: plain(source.onboarding),
  };
}

/**
 * Read a profile out of a file's text.
 *
 * The checks are the envelope's, then each record goes through the parser that owns
 * it — `parseSettings`, `parsePlan`, `parseBoard`, `parseOnboarding` — so the import
 * is held to the same tolerance as a store read. A missing onboarding is an empty
 * one (a profile from a build before hints existed is still a profile); the other
 * three are required, because a profile without a board or a band is a different
 * file rather than an older one.
 */
export function readProfile(raw: string): ProfileResult {
  if (new TextEncoder().encode(raw).length > PROFILE_LIMIT_BYTES) {
    return { ok: false, problem: "tooLarge" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, problem: "notJson" };
  }
  if (!isRecord(parsed)) return { ok: false, problem: "notObject" };
  if (parsed.format !== PROFILE_FORMAT) return { ok: false, problem: "wrongFormat" };
  if (parsed.version !== PROFILE_VERSION) {
    return { ok: false, problem: "wrongVersion" };
  }
  if (!isRecord(parsed.settings)) return { ok: false, problem: "missingSettings" };
  if (!isRecord(parsed.band)) return { ok: false, problem: "missingBand" };
  if (!Array.isArray(parsed.board)) return { ok: false, problem: "missingBoard" };

  const exportedAt =
    typeof parsed.exportedAt === "number" && Number.isFinite(parsed.exportedAt)
      ? parsed.exportedAt
      : 0;

  return {
    ok: true,
    profile: {
      format: PROFILE_FORMAT,
      version: PROFILE_VERSION,
      exportedAt,
      settings: parseSettings(JSON.stringify(parsed.settings)),
      band: parsePlan(JSON.stringify(parsed.band)),
      board: parseBoard(JSON.stringify(parsed.board)).slice(0, BOARD_LIMIT),
      onboarding: parseOnboarding(
        parsed.onboarding === undefined ? null : JSON.stringify(parsed.onboarding),
      ),
    },
  };
}

/**
 * The name a profile downloads as: the game's own prefix and the day it was made.
 *
 * The date comes from the export's own `exportedAt` rather than a second `Date.now`,
 * so the file a player saved is named for the moment inside it.
 */
export function profileFilename(exportedAt: number): string {
  const date = new Date(exportedAt);
  const day = Number.isNaN(date.getTime())
    ? "profile"
    : date.toISOString().slice(0, 10);
  return `everythingstar-profile-${day}.json`;
}
