/**
 * The band model: who is on stage.
 *
 * A band is **one list of players**, and a player is a **slot**: what they take on
 * stage — a lane instrument (guitar, bass, drums, keys, dance) or the place at the
 * words — and how hard they take it. There is no separate "melody" section and no
 * band-wide difficulty: if a band is a guitar and a bass, it is a guitar and a
 * bass, and if somebody is singing or typing, that is a slot like any other.
 * `makeBand` turns the plan a screen edits into the setup the
 * stage renders, and the two only differ by a player's `auto` flag.
 *
 * The two families are laid out differently, which is why the kinds are split:
 *
 * - **Lane players** each get a 1:1 panel in the lanes region. They all share one
 *   panel shape; the instrument decides the kit (its glyph, its hit marker) and
 *   their **chart** decides the column count.
 * - **Words players** share the full-width melody region. The *song* decides which
 *   view is shown: keys (a piano roll with lyrics) for pitched songs, lyrics for
 *   songs without pitch. On a pitched song each player may sing or type; lyrics-only
 *   songs are typed. Typing feedback rides on the words, so nothing needs a second
 *   region.
 *
 * How many parts the melody has, and whether its words carry pitch, are the
 * **song's** own facts and live in the track.
 */

import {
  INSTRUMENT_KINDS,
  MAX_PARTS,
  VOCAL_DIFFICULTIES,
  nearestDifficulty,
  type Difficulty,
  type InstrumentKind,
  type LaneRole,
  type VocalDifficulty,
} from "../track";
import {
  songDifficulties,
  songHasPitch,
  songRoles,
  type Song,
  type SongOffer,
} from "../song";
import type { Controller } from "../controls/layout";

export type { Difficulty, InstrumentKind };

/** What a lane player takes on stage: an instrument, played as notes arrive. */
export type LaneKind = InstrumentKind;

/**
 * The melody's one place: the words. What that *means* is the song's — **pitch
 * decides it** — so `words` is a singer on a pitched song (Vocals) and a typist on
 * one without (Lyrics). There is no separate slot for each: one place at the words,
 * and the song says whether it is sung or typed.
 */
export type MelodyKind = "words";

/** Everything a player can be. */
export type PlayerKind = LaneKind | MelodyKind;

/**
 * Every kind on offer, in the order the band screen shows them: the instruments a
 * band plays, then the words.
 */
export const PLAYER_KINDS: PlayerKind[] = [...INSTRUMENT_KINDS, "words"];

export function isMelodyKind(kind: PlayerKind): kind is MelodyKind {
  return kind === "words";
}

export function isLaneKind(kind: PlayerKind): kind is LaneKind {
  return !isMelodyKind(kind);
}

/** One player: their slot, how hard it is, and whether a person is playing it. */
export interface Player {
  id: string;
  /**
   * Their place in the band — their box on the band screen, their panel on the
   * stage, their controller and their run. It is **one number everywhere**, so
   * "Player 3" never means two different people.
   */
  seat: number;
  kind: PlayerKind;
  /**
   * Which guitar part they take, when the song ships a lead and a rhythm. It is
   * part of the seat's identity, so two guitars at one level get their own charts.
   */
  role?: LaneRole;
  /** A words player may type even when the song also has pitched vocals. */
  wordsMode?: WordsMode;
  /** Their own difficulty: a chart's for an instrument, what they type for lyrics. */
  difficulty: Difficulty;
  /** What they play with, when they have said so; the stage decides otherwise. */
  controller?: Controller;
  /**
   * Played by the machine rather than by a person: said by the player's own
   * `{ on: "none" }` controller, or — without one — by the dev count of who is
   * playing. A real player's panel takes real input.
   */
  auto: boolean;
  name?: string;
}

/** A player with an instrument: they get a panel in the lanes region. */
export interface LanePlayer extends Player {
  kind: LaneKind;
}

/** A player with a role in the melody: they share the melody region. */
export interface MelodyPlayer extends Player {
  kind: MelodyKind;
}

/** The whole band: everyone sharing the stage, in the order they were added. */
export interface BandSetup {
  players: Player[];
}

/** One player's place on the band screen. */
export interface BandSlot {
  kind: PlayerKind;
  /** Which guitar part this seat takes, when the song names one. */
  role?: LaneRole;
  difficulty: Difficulty;
  /** `false` reserves this seat number without putting a player on stage. */
  active?: boolean;
  /** Pitched songs can be sung or typed; lyrics-only songs always type. */
  wordsMode?: WordsMode;
  /**
   * What this player plays with, once they have said so in the settings: a device
   * and, if they have learned one, their own mapping. Left out, the stage decides
   * for them — their own keys by their place, or the next gamepad (see
   * `controlPlan`).
   */
  controller?: Controller;
}

export type WordsMode = "sing" | "type";

/**
 * A band as the band screen works in: **a slot per player** and nothing else. It
 * is what is remembered between visits, so it is plain data.
 */
export interface BandPlan {
  slots: BandSlot[];
}

export const MAX_PLAYERS = 8;

/** The band a session starts with: one guitar, and somebody on the words. */
export function firstBand(): BandPlan {
  return {
    slots: [
      { kind: "guitar", difficulty: "normal" },
      { kind: "words", difficulty: "normal" },
    ],
  };
}

/** A rectangle in CSS pixels, as the layout engine produces. */
export interface Box {
  w: number;
  h: number;
}

/** The players with an instrument, in the order they were added. */
export function lanePlayers(setup: BandSetup): LanePlayer[] {
  return setup.players.filter((player): player is LanePlayer => isLaneKind(player.kind));
}

/** The player with the words, if the band has one. */
export function melodyPlayers(setup: BandSetup): MelodyPlayer[] {
  return setup.players.filter((player): player is MelodyPlayer =>
    isMelodyKind(player.kind),
  );
}

/** Are there any lane players? (i.e. does the lanes region render?) */
export function hasLanes(setup: BandSetup): boolean {
  return lanePlayers(setup).length > 0;
}

/** Is anybody on the words? (i.e. does the melody region render?) */
export function hasMelody(setup: BandSetup): boolean {
  return melodyPlayers(setup).length > 0;
}

/** How many are on the words. What they do with them is the song's business. */
export function wordsCount(setup: BandSetup): number {
  return melodyPlayers(setup).length;
}

/**
 * How the melody region shows.
 *
 * A song with pitch and **somebody singing it** is the keys view — a piano roll
 * with the lyrics beneath it. Everything else is the lyrics view: a song whose
 * words carry no pitch, a pitched song whose words players all chose to type
 * (they want the whole words, not a roll they are not singing), and Listen.
 */
export type MelodyMode = "lyrics" | "keys";

export function melodyView(hasPitch: boolean, hasSingers = true): MelodyMode {
  return hasPitch && hasSingers ? "keys" : "lyrics";
}

/** What one of the words' players is doing, and on which part. */
export interface MelodyRole {
  /** `sing` on a song with pitch; `type` on one whose words are only words. */
  role: "sing" | "type";
  /** Their place in the band, so a screen can put them back in band order. */
  seat: number;
  /** Which of the song's parts they take (0 for a solo). */
  part: number;
  /**
   * A **singer's** difficulty, from the three a voice always has — the microphone's
   * tolerance rather than a chart's. A typist has none: a lyrics song is free play,
   * with no levels to choose.
   */
  difficulty: VocalDifficulty | null;
}

/**
 * Which part each of the words' players takes, and what they do with it.
 *
 * The song's parts are the **song's** own (1 is a solo, and `MAX_PARTS` is the
 * most a track can carry — a duet is the common case, not the ceiling) and never
 * a count of the players. A pitched song lets each words player choose to sing or
 * type; lyrics-only songs always type. When more players turn up than there are
 * parts they **share** one.
 */
export function melodyRoles(
  setup: BandSetup,
  melody: { parts: number; hasPitch: boolean },
): { parts: number; players: MelodyRole[] } {
  const parts = Math.max(1, Math.min(MAX_PARTS, Math.trunc(melody.parts) || 1));
  return {
    parts,
    players: melodyPlayers(setup).map((player, index) => {
      const role = melody.hasPitch && player.wordsMode !== "type" ? "sing" : "type";
      return {
        role,
        seat: player.seat,
        part: index % parts,
        difficulty:
          role === "sing"
            ? nearestDifficulty(VOCAL_DIFFICULTIES, player.difficulty)
            : null,
      };
    }),
  };
}

/**
 * The player fields a score board keys a lineup by, at the level each player is
 * **really judged at** rather than the level their slot asked for.
 */
export type LineupPlayer = Pick<Player, "kind" | "role" | "wordsMode"> & {
  /** `null` for a typist: a lyric has no levels to be judged at. */
  difficulty: Difficulty | null;
};

/**
 * The band as a score board keys it.
 *
 * A slot's difficulty is a **wish about the song**: a singer's Expert is the
 * microphone's Hard (the three a voice carries), a typist has no level at all, and
 * an instrument is judged on the nearest chart the song actually carries. Keying a
 * run by the wish split one judged band into two lineups — and put "Expert" in the
 * history over a card that said "Hard". This is the one place the wish is settled
 * against the song's offer, so the board and the runs tell the same story.
 *
 * A kind the song carries nothing for keeps the slot's value: that is all there is
 * to go on, and it keeps a remembered band a stable key rather than a crash.
 */
export function lineupPlayers(
  setup: BandSetup,
  song: Pick<Song, "offer">,
): LineupPlayer[] {
  const melody = melodyRoles(setup, {
    parts: song.offer.voice?.parts ?? 1,
    hasPitch: songHasPitch(song),
  });
  const settled = new Map(melody.players.map((role) => [role.seat, role]));
  return setup.players.map((player) => {
    if (isMelodyKind(player.kind)) {
      const role = settled.get(player.seat);
      return {
        kind: player.kind,
        difficulty: role?.difficulty ?? null,
        ...(role ? { wordsMode: role.role } : {}),
      };
    }
    const carried = songDifficulties(song, player.kind, player.role);
    return {
      kind: player.kind,
      ...(player.role ? { role: player.role } : {}),
      difficulty:
        carried.length > 0
          ? nearestDifficulty(carried, player.difficulty)
          : player.difficulty,
    };
  });
}

/**
 * Change the player in one seat: what they hold, how hard, or what they take.
 *
 * Nothing else moves — a seat is a place, and changing one player must not
 * renumber the band. An **empty box is left empty**: there is no player there to
 * patch, and filling it is `setSlotAt`'s job.
 */
export function patchSlot(plan: BandPlan, at: number, patch: Partial<BandSlot>): BandPlan {
  return {
    ...plan,
    slots: plan.slots.map((slot, index) =>
      index === at && slot.active !== false ? { ...slot, ...patch } : slot,
    ),
  };
}

/** Fill the requested seat without shifting anybody already in the band. */
export function setSlotAt(plan: BandPlan, at: number, slot: BandSlot): BandPlan {
  const index = Math.max(0, Math.min(MAX_PLAYERS - 1, Math.trunc(at) || 0));
  const slots = plan.slots.slice(0, MAX_PLAYERS);
  while (slots.length <= index) {
    slots.push({ kind: "guitar", difficulty: "normal", active: false });
  }
  slots[index] = { ...slot, active: true };
  return { ...plan, slots };
}

/**
 * Put a player into an empty box, from what the song offers there.
 *
 * The plan patched is the **remembered** one, never the plan a song's offer forced
 * into shape (`withOfferedRoles`): joining a seat on a lead-only song must not
 * write that fallback down, or the rhythm a player chose for a song with both is
 * forgotten the moment somebody sits beside them.
 */
export function joinSlotAt(plan: BandPlan, at: number, song: Pick<Song, "offer">): BandPlan {
  return setSlotAt(plan, at, nextSlot(song, at));
}

/** The next playable choice for one seat, cycling through every available mode. */
export function nextSlot(
  song: Pick<Song, "offer">,
  at: number,
): BandSlot {
  const choices: BandSlot[] = song.offer.instruments.map(({ kind, role }) => ({
    kind,
    ...(role ? { role } : {}),
    difficulty: "normal",
  }));
  if (song.offer.voice?.chartType === "vocals") {
    choices.push(
      { kind: "words", difficulty: "normal", wordsMode: "sing" },
      { kind: "words", difficulty: "normal", wordsMode: "type" },
    );
  } else if (song.offer.voice) {
    choices.push({ kind: "words", difficulty: "normal", wordsMode: "type" });
  }
  if (choices.length === 0) return { kind: "guitar", difficulty: "normal" };
  const index = Math.abs(Math.trunc(at)) % choices.length;
  return choices[index] ?? { kind: "guitar", difficulty: "normal" };
}

/**
 * A plan whose guitar seats take a role the song actually offers.
 *
 * The band is remembered across songs, and a song may ship one guitar role, two, or
 * none. A seat whose role the song does not carry takes what it has — the lead when
 * both are there, the only one when there is one — and an instrument that is not a
 * guitar carries no role at all. The same plan is returned when nothing changes, so
 * a caller can use it in an effect without writing the store on every render.
 */
export function withOfferedRoles(plan: BandPlan, offer: SongOffer): BandPlan {
  let changed = false;
  const slots = plan.slots.map((slot) => {
    if (slot.active === false) return slot;
    const roles = slot.kind === "guitar" ? songRoles({ offer }, slot.kind) : [];
    const plain =
      slot.kind === "guitar" &&
      offer.instruments.some((entry) => entry.kind === "guitar" && !entry.role);
    const role =
      slot.kind === "guitar"
        ? slot.role !== undefined && roles.includes(slot.role)
          ? slot.role
          : plain
            ? undefined
            : roles[0]
        : undefined;
    if (role === slot.role) return slot;
    changed = true;
    if (role === undefined) {
      const next = { ...slot };
      delete next.role;
      return next;
    }
    return { ...slot, role };
  });
  return changed ? { ...plan, slots } : plan;
}

/**
 * Build the band a stage renders from a plan.
 *
 * **A controller a player chose decides who plays them**: `{ on: "none" }` is the
 * machine, and anything else is a person, whatever the dev panel's count says.
 * Without one, the first `humans` lane players take a keyboard (one keyboard, one
 * layout each, by their place on stage) and the rest are played by the machine.
 * Melody players are not marked here: the melody region gives the keyboard to the
 * first typist.
 */
export function makeBand(plan: BandPlan, humans = 1): BandSetup {
  let lane = 0;
  return {
    players: plan.slots.slice(0, MAX_PLAYERS).flatMap((slot, index) => {
      if (slot.active === false) return [];
      const auto = slot.controller
        ? slot.controller.on === "none"
        : isLaneKind(slot.kind) && lane >= humans;
      if (isLaneKind(slot.kind)) lane += 1;
      return [{
        id: `player-${index + 1}`,
        seat: index,
        kind: slot.kind,
        ...(slot.role ? { role: slot.role } : {}),
        difficulty: slot.difficulty,
        ...(slot.wordsMode ? { wordsMode: slot.wordsMode } : {}),
        ...(slot.controller ? { controller: slot.controller } : {}),
        auto,
      }];
    }),
  };
}
