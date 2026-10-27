/**
 * The **sound manifest**: every sound the game can play, and where each one is.
 *
 * `AUDIO.md` is the list of what the game needs; this is the file that says what it
 * has. It lives beside the sounds themselves (`public/audio/sounds.json`) and is
 * **fetched like everything else**, so adding a sound is dropping a file next to it
 * and writing a line — no rebuild, no code.
 *
 * ## What the game asks for is a **type**, not an id
 *
 * An `id` is one file. A `type` is a **role** the game plays — `click`,
 * `background`, `miss_guitar` — and a type may have several files behind it. The
 * game never says "play `click_2`"; it says **play a click**, and the picker hands
 * out the next one. That is what keeps a bank of four clicks from sounding like a
 * tic, and what lets six background beds stand in for "the menu music" without
 * anybody naming which screen gets which.
 *
 * An entry with no `file` is a sound that has not arrived yet, so the manifest is
 * **also the checklist**: the dev panel reads its own tally, and a test checks that
 * every file it names is on disk.
 *
 * Pure: reading a manifest and picking from it are functions of their inputs.
 */

import {
  isObject,
  list,
  num,
  oneOf,
  resolveUrl,
  schemaVersion,
  SCHEMA_VERSION,
  text,
} from "../read";

/**
 * What a file *is*, which is what decides how it plays.
 *
 * - **`track`** — a whole piece: played through, and then the type's bank moves on to
 *   the next one. A bank of tracks is a **playlist**, which is what the menu music is:
 *   start somewhere random, and when it finishes, the next.
 * - **`loop`** — a texture with no end: seam-free, repeated, never advanced. Crowd
 *   murmur, a room tone, the meter's hum.
 * - **`oneshot`** — a sound that happens: a click, a sting, a missed note.
 */
export type SoundKind = "track" | "loop" | "oneshot";

const SOUND_KINDS: SoundKind[] = ["track", "loop", "oneshot"];

/** One sound the game can play: one file, and the role it plays. */
export interface Sound {
  /** `background_1`, `click_3` — this file's own name. Unique in a manifest. */
  id: string;
  /** What it is *for*: `background`, `click`, `miss_guitar`. Many files may share it. */
  type: string;
  /** Its file, absolute, resolved against the manifest that listed it. */
  url: string;
  kind: SoundKind;
  /** A trim, in dB, applied on top of its channel's own level. */
  gainDb: number;
  /** Who to thank, and under what terms. Null when we have not said. */
  credit: string | null;
  /** Loop points in seconds, for a loop that is not the whole file. */
  loopStart: number | null;
  loopEnd: number | null;
}

export interface SoundsRead {
  /** What there is a file for, in the order the manifest lists it. */
  sounds: Sound[];
  /** Listed with no file yet: what is still to buy or record. */
  missing: string[];
  problems: string[];
}

/**
 * Read a sound manifest.
 *
 * `url` is its own absolute URL: a `file` is resolved against it, so the manifest
 * and the sounds can be moved together.
 */
export function readSounds(body: unknown, url: string): SoundsRead {
  const empty = { sounds: [], missing: [] };
  if (!isObject(body)) {
    return { ...empty, problems: ["not a sound manifest we can read"] };
  }
  const version = schemaVersion(body);
  if (version !== SCHEMA_VERSION) {
    return {
      ...empty,
      problems: [
        `sound manifest schemaVersion ${version ?? "missing"}, this reader is ${SCHEMA_VERSION}`,
      ],
    };
  }

  const problems: string[] = [];
  const sounds: Sound[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  /** What kind each type has been declared as, so a bank cannot disagree with itself. */
  const kinds = new Map<string, SoundKind>();

  for (const entry of list(body.sounds)) {
    if (!isObject(entry)) {
      problems.push("a sound that is not an object");
      continue;
    }
    const id = text(entry.id);
    if (!id) {
      problems.push("a sound with no id");
      continue;
    }
    if (seen.has(id)) {
      problems.push(`${id}: listed twice`);
      continue;
    }
    seen.add(id);

    // The type is what the game plays, so an entry without one can never be asked
    // for: it is a sound nobody can reach, which is worth saying out loud.
    const type = text(entry.type);
    if (!type) {
      problems.push(`${id}: no type, so nothing could ever play it`);
      continue;
    }

    const kind = oneOf(entry.kind, SOUND_KINDS);
    if (!kind) {
      problems.push(`${id}: “${String(entry.kind)}” is not a track, a loop or a one-shot`);
      continue;
    }
    // A type is played one way, so its files have to agree on what they are —
    // otherwise a bank would half-advance and half-loop.
    const already = kinds.get(type);
    if (already && already !== kind) {
      problems.push(`${id}: ${type} is ${already}, and this one is ${kind}`);
      continue;
    }
    kinds.set(type, kind);

    // No file is not a fault: it is a sound we have not been given yet.
    const ref = text(entry.file);
    if (!ref) {
      missing.push(id);
      continue;
    }
    const file = resolveUrl(ref, url);
    if (!file) {
      problems.push(`${id}: “${ref}” is not a URL`);
      continue;
    }

    sounds.push({
      id,
      type,
      url: file,
      kind,
      gainDb: clampGain(num(entry.gainDb) ?? 0),
      credit: text(entry.credit),
      loopStart: seconds(entry.loopStart),
      loopEnd: seconds(entry.loopEnd),
    });
  }

  return { sounds, missing, problems };
}

/** Every file behind a type, in the order the manifest lists them. */
export function soundsOfType(sounds: readonly Sound[], type: string): Sound[] {
  return sounds.filter((sound) => sound.type === type);
}

/** Every type the manifest can play, in a stable order — for a read-out. */
export function typesOf(sounds: readonly Sound[]): string[] {
  return [...new Set(sounds.map((sound) => sound.type))].sort();
}

/**
 * What to have in hand **before the first press**.
 *
 * The **cues** are the point: a click is milliseconds and is heard the moment a
 * player asks for it, so its first use must not wait for a fetch — and there are a
 * dozen small ones, together less than a single bed. Every one-shot is warmed.
 *
 * The **beds** are megabytes, and a track bank is a playlist: only the file the
 * picker will open on is warmed — always the manifest's first `background`, the
 * same rule the picker follows — plus any **loop**, which is one texture with no
 * successor. The rest of the bank arrives when the piece before it ends, which is
 * not a wait anybody hears.
 *
 * Deduplicated by id, because a manifest is somebody else's file.
 */
export function soundsToWarm(sounds: readonly Sound[]): Sound[] {
  const opening = soundsOfType(sounds, "background")[0];
  const warm = new Map<string, Sound>();
  if (opening) warm.set(opening.id, opening);
  for (const sound of sounds) {
    if (sound.kind === "loop" || sound.kind === "oneshot") warm.set(sound.id, sound);
  }
  return [...warm.values()];
}

/**
 * The picker: what plays for a type, and which one.
 *
 * Which strategy a type gets is decided by **what its files are**:
 *
 * - A **track** bank is a **playlist**: it opens on the first file the manifest lists
 *   — a known start, so the game sounds like itself when you arrive — and then picks at
 *   random, never repeating the one before. That is not a bag (which deals them all
 *   before repeating) nor a walk (which goes in order): a fixed opening, a shuffle
 *   behind it.
 * - Everything else is dealt from a **shuffled bag**: never the same file twice
 *   running, and no pattern to notice. That is what a bank of clicks needs — a strict
 *   rotation would give you A-B-A-B on a steady hand — and it is harmless for a loop,
 *   which picks once and then repeats itself for as long as it plays.
 *
 * Its own state, so one picker serves the whole game; `random` is injected, so a test
 * can pin the order.
 */
export interface SoundPicker {
  /** The next sound of this type, or null when nothing can play it. */
  next: (type: string) => Sound | null;
}

export function createPicker(
  sounds: readonly Sound[],
  random: () => number = Math.random,
): SoundPicker {
  const strategies = new Map<string, () => Sound | null>();

  return {
    next(type) {
      let strategy = strategies.get(type);
      if (!strategy) {
        const all = soundsOfType(sounds, type);
        if (all.length === 0) return null;
        strategy =
          all[0].kind === "track" ? rotation(all, random) : bag(all, random);
        strategies.set(type, strategy);
      }
      return strategy();
    },
  };
}

/**
 * A bank of **tracks**: the manifest's first one, then random after that.
 *
 * A session **opens on a known piece** — the first the manifest lists, so the welcome
 * always sounds like the game — and from there it wanders, never repeating the one
 * before. Not a bag (that deals them all before repeating) and not a walk (that goes in
 * order): a playlist with a fixed opening and a shuffle behind it.
 */
function rotation(all: readonly Sound[], random: () => number): () => Sound {
  let at = -1;
  return () => {
    at = at < 0 ? 0 : otherThan(at, all.length, random);
    return all[at];
  };
}

/**
 * A random index that is never the one given.
 *
 * The range is mapped onto "everything except `current`" rather than drawing and
 * retrying, so it is one call to `random` and every other entry is equally likely.
 */
export function otherThan(current: number, size: number, random: () => number): number {
  if (size < 2) return current;
  const pick = Math.floor(random() * (size - 1));
  return pick >= current ? pick + 1 : pick;
}

/** A shuffled bag, whose first pick is never the one just played. */
function bag(all: readonly Sound[], random: () => number): () => Sound | null {
  let bank: Sound[] = [];
  let last: Sound | null = null;
  return () => {
    if (bank.length === 0) bank = deal(all, last, random);
    // A bank with no sounds in it is silence, not a crash: the caller treats a null
    // as "nothing can play this type", exactly as it does for a type with no file.
    const sound = bank.pop() ?? null;
    if (sound) last = sound;
    return sound;
  };
}

/** A shuffled bag, whose first pick is never the one just played. */
function deal(
  all: readonly Sound[],
  last: Sound | null,
  random: () => number,
): Sound[] {
  const bag = [...all];
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  // Played from the end, so the end is the next one out: if that is the sound that
  // just finished, swap it for its neighbour rather than repeating it.
  if (last && bag.length > 1 && bag[bag.length - 1].id === last.id) {
    [bag[bag.length - 1], bag[bag.length - 2]] = [bag[bag.length - 2], bag[bag.length - 1]];
  }
  return bag;
}

/** A trim that can be asked for but cannot be absurd. */
function clampGain(db: number): number {
  return Math.max(-60, Math.min(24, db));
}

/** A moment in a file, in seconds, or null. */
function seconds(value: unknown): number | null {
  const at = num(value);
  return at !== null && at >= 0 ? at : null;
}
