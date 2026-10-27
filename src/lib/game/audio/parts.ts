/**
 * Which stems a part's misses duck, and the registry that holds them out.
 *
 * A song document already says what a part does to the mix
 * (`parts[].audioControl`): the stems it owns, and the rule that puts them back —
 * on the part's next hit, or at the end of the phrase the miss fell in. This module
 * turns that into three things the stage can use — a **part key → stems** map
 * (`controlledStems`), the **rule** a part asks for (`restoreRuleFor`) and a
 * **per-seat registry** (`createPartAudio`) — and keeps all of them pure, so the
 * part rule is tested rather than trusted to a component.
 *
 * A **part key** is a player's kind, except for the guitar: a song may carry a lead
 * and a rhythm guitar, and each is a seat with its own stems. Those are keyed
 * `guitar:lead` and `guitar:rhythm`; every other kind is its own key. A key with a
 * role falls back to the roleless kind when the document only names a plain guitar
 * part, so a remembered seat cannot be left with nothing to duck.
 *
 * Nothing here is ever read back into judging: it flows **one way**, from a run's
 * misses to the song's volume.
 */

import type { PlayerKind } from "../band/types";
import { laneRoleOf, roleKind, type SongRole } from "../song";
import type { SourcePart, SourceSongDoc } from "../source";
import type { LaneRole } from "../track";

/**
 * What a part is to the mix: a player's kind, or one of the guitar's two roles.
 *
 * `words` is the voice, whatever the song calls it; the two guitar roles are the
 * only kinds a song can split in two today.
 */
export type PartKey = PlayerKind | "guitar:lead" | "guitar:rhythm";

/** The key a seat's part is under: its kind, with the guitar's role when it has one. */
export function partKeyOf(kind: PlayerKind, role?: LaneRole): PartKey {
  return kind === "guitar" && role ? `guitar:${role}` : kind;
}

/** The key a document's own part is under. */
function documentKey(role: SongRole): PartKey {
  const lane = laneRoleOf(role);
  return lane ? `guitar:${lane}` : roleKind(role);
}

/** A stretch of the song a part's mute can end at: a phrase, or a melody line. */
export interface PartSpan {
  startMs: number;
  endMs: number;
}

/** How a part is put back after a miss. */
export type RestoreRule = "next_hit" | "phrase_end";

/**
 * The stems each part controls, from the song document's own rule.
 *
 * Three things are settled here:
 *
 * - a part's **role** becomes a **part key**: a lead and a rhythm guitar are their
 *   own keys (`guitar:lead`, `guitar:rhythm`), while every other part is its
 *   player's kind and the two voices are both the `words`;
 * - **the master is never controlled.** It has no instrument — it is the whole
 *   song, or the backing around the parts — so a miss that silenced it would
 *   silence everything. A song shipped as one master therefore controls nothing
 *   at all, which is exactly right: there is no channel to drop out;
 * - **a key has one entry.** Two parts of one key (a vocals and a harmony, or a
 *   plain and a roleless guitar) add their stems together.
 *
 * A document that names no stems on a part controls nothing, and the same goes
 * for a part the document does not carry: silence is the safe answer.
 */
export function controlledStems(
  doc: Pick<SourceSongDoc, "parts" | "audio">,
): Map<PartKey, readonly string[]> {
  const instruments = new Set(
    doc.audio.stems.filter((stem) => stem.instrument !== null).map((stem) => stem.id),
  );
  const byKey = new Map<PartKey, Set<string>>();
  for (const part of doc.parts) {
    const stems = part.audioControl?.stems ?? [];
    if (stems.length === 0) continue;
    const key = documentKey(part.role);
    const set = byKey.get(key) ?? new Set<string>();
    for (const id of stems) if (instruments.has(id)) set.add(id);
    if (set.size > 0) byKey.set(key, set);
  }
  return new Map([...byKey].map(([key, ids]) => [key, [...ids]]));
}

/**
 * The document's parts that answer for a key.
 *
 * A role key asks for its own part first. When the song only names a plain
 * `guitar` part, the role key falls back to **that** part: a seat is remembered
 * across songs, and a lead seat from one song must still find the guitar on the
 * next. A roleless key does not reach into a role part — a chart and a seat that
 * name no role are the plain guitar, and taking both roles' stems would duck a
 * second guitarist along with them.
 */
function partsForKey(doc: Pick<SourceSongDoc, "parts">, key: PartKey): SourcePart[] {
  const direct = doc.parts.filter((part) => documentKey(part.role) === key);
  if (direct.length > 0) return direct;
  if (key === "guitar:lead" || key === "guitar:rhythm") {
    return doc.parts.filter((part) => part.role === "guitar");
  }
  return [];
}

/** The stems of one part key, with the same fallback a role key has. */
function stemsForKey(
  controls: ReadonlyMap<PartKey, readonly string[]>,
  key: PartKey,
): readonly string[] {
  const direct = controls.get(key);
  if (direct) return direct;
  if (key === "guitar:lead" || key === "guitar:rhythm") {
    return controls.get("guitar") ?? [];
  }
  return [];
}

/**
 * When a part's miss puts it back, from the song document's own rule.
 *
 * The document says `onMiss.restore`; `phrase_end` is the only value that changes
 * the answer, because the stage plays a duck until the **next hit** by default.
 * A part with no rule, or an unknown one, is therefore next hit — the behaviour
 * the game has always had rather than a guess at what a new word might mean.
 */
export function restoreRuleFor(
  doc: Pick<SourceSongDoc, "parts">,
  key: PartKey,
): RestoreRule {
  return partsForKey(doc, key).some(
    (part) => part.audioControl?.onMiss?.restore === "phrase_end",
  )
    ? "phrase_end"
    : "next_hit";
}

/**
 * The end of the span a moment falls in, or null when it falls between spans.
 *
 * The spans are a chart's phrases or a melody's lines. They do not overlap in the
 * ordinary case, but a source may nest them; the **earliest end still ahead** is
 * the phrase the moment is actually in. A moment exactly on a span's end belongs
 * to the one that starts there, not to the one that has just finished — a miss on
 * the boundary is a miss in the next phrase.
 */
export function phraseEndAt(
  spans: readonly PartSpan[],
  atMs: number,
): number | null {
  let end: number | null = null;
  for (const span of spans) {
    if (span.startMs > atMs || span.endMs <= atMs) continue;
    if (end === null || span.endMs < end) end = span.endMs;
  }
  return end;
}

/**
 * The stems this run **never plays at all**, so it never loads them.
 *
 * A singer replaces the song's voice: with the guide vocal off, there is no moment
 * in the run when the vocal stem is heard, so it is simply not fetched. That is a
 * different thing from a miss — a part a miss takes out is heard again, and it has to
 * stay on the clock (see `HELD_SHARE` in the mixer) — and not loading is the one way
 * to be sure a stream nobody hears costs nothing and cannot disagree with the band.
 *
 * The master is never here: it is the whole song or the backing, and a song shipped
 * as one file has its voice inside it.
 */
export function unplayedStems(
  doc: Pick<SourceSongDoc, "parts" | "audio">,
  sung = false,
): ReadonlySet<string> {
  if (!sung) return new Set();
  return new Set(controlledStems(doc).get("words") ?? []);
}

/**
 * The stems to hold out right now: the parts a run has taken out.
 *
 * They are **ducked, not silenced** — `SongAudio` writes a share of the part's own
 * level — because a media element at nothing leaves the browser's audio clock. The
 * master is never in the set (`controlledStems` drops it), so a song shipped as one
 * file is never touched.
 */
export function heldOutStems(
  doc: Pick<SourceSongDoc, "parts" | "audio">,
  muted: Iterable<PartKey>,
): ReadonlySet<string> {
  const controls = controlledStems(doc);
  const out = new Set<string>();
  for (const key of muted) {
    for (const id of stemsForKey(controls, key)) out.add(id);
  }
  return out;
}

/** What one seat's part is doing: which key is out, and when it comes back. */
export interface PartMute {
  part: PartKey;
  /** The song time it comes back at; null means the seat's next hit puts it back. */
  restoreAtMs: number | null;
}

/**
 * Which parts are out right now, and who said so.
 *
 * A registry is **per seat** rather than per key because two players on one
 * instrument are two runs over the same stems: the stems are out while *any* of
 * them is out, and put back when the last of them hits again — or when the last
 * of their phrase-end mutes expires. It holds no state of its own for React: a
 * miss publishes and `SongAudio` listens, so a run ducking its part never
 * re-renders a screen.
 */
export interface PartAudio {
  /**
   * One seat's part is out, or back.
   *
   * `restoreAtMs` is the one rule a component does not decide for itself: a
   * `phrase_end` duck is put back by the **clock** (`tick`) rather than by the
   * seat's next hit, so it is recorded here as an absolute song time.
   */
  set(seat: number, part: PartKey, muted: boolean, restoreAtMs?: number | null): void;
  /** The parts whose stems should be out right now. */
  muted(): ReadonlySet<PartKey>;
  /** What this seat's part is doing, or null when it is in. */
  mute(seat: number): PartMute | null;
  /** Put back every part whose restore time the clock has reached. */
  tick(timeMs: number): void;
  /** Put every part back: a seek, a new run, or leaving the stage. */
  clear(): void;
  /** Called whenever the set changes. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createPartAudio(): PartAudio {
  const out = new Map<number, PartMute>();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    set(seat, part, muted, restoreAtMs = null) {
      if (!muted) {
        if (!out.has(seat)) return;
        out.delete(seat);
        notify();
        return;
      }
      const at = restoreAtMs ?? null;
      const current = out.get(seat);
      if (current && current.part === part && current.restoreAtMs === at) return;
      out.set(seat, { part, restoreAtMs: at });
      notify();
    },
    muted() {
      return new Set([...out.values()].map((entry) => entry.part));
    },
    mute(seat) {
      return out.get(seat) ?? null;
    },
    tick(timeMs) {
      let changed = false;
      for (const [seat, entry] of out) {
        if (entry.restoreAtMs === null || timeMs < entry.restoreAtMs) continue;
        out.delete(seat);
        changed = true;
      }
      if (changed) notify();
    },
    clear() {
      if (out.size === 0) return;
      out.clear();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
