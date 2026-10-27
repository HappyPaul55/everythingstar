/**
 * What the mixer decides, without the mixer.
 *
 * Three rules, kept apart from the audio graph so they can be tested: **which
 * channel a type plays on** (so a bed and a click can be turned up and down
 * separately, and a menu's music can duck under a sting), **whether a screen wants a
 * bed at all**, and **which cues are big enough to dip that bed under them**. None of
 * it reaches a song: a run's stems live outside the graph, so nothing played on the
 * stage ever turns the band down.
 */

import { clamp01 } from "../math";
import { onStage, type Screen } from "../screens";

/** The three things that can be mixed apart. */
export type Channel = "music" | "ambience" | "sfx";

/** A level per channel, 0..1 — the settings' shape and the graph's own. */
export type ChannelLevels = Record<Channel, number>;

/**
 * Where each channel sits by default, as a fraction of the master.
 *
 * The **beds** — the menu music and the room's murmur while paused — are the room,
 * not the subject: **half**. The **cues** are what the player is being told, so they
 * are louder: **70%** — still under the master, because a game whose feedback is at
 * full scale has nowhere left to shout. A file's own `gainDb` normalises it *within*
 * its family; these are where the family sits. They are also the defaults Options
 * starts a player on, and the engine's own level until a setting says otherwise.
 */
export const CHANNEL_LEVEL: ChannelLevels = {
  music: 0.5,
  ambience: 0.5,
  sfx: 0.7,
};

/**
 * How far music and ambience fall under a sting.
 *
 * This is the **menu's own bed** giving way to a cue over it — a click, a
 * confirmation, a screen change — so the sting reads as the front of the mix. A
 * song's stems are media elements outside the graph and are **never** touched by it:
 * a run's feedback (a miss, a hero note, the meter) is a sound *beside* the band, not
 * something that turns the band down. Ducking the song under a cue pumps the music
 * with the player's own hands, and after a few misses it reads as a fault in the mix.
 */
export const DUCK_LEVEL = 0.35;

/**
 * The cues that are big enough to dip the **menu's** music and room under them.
 *
 * A sting is a moment — a confirmation, a failure, a milestone — and hearing it
 * *over* a menu bed rather than inside it is the point. A click, a keystroke or a
 * missed note is feedback a screen makes constantly: ducking for those would pump
 * the bed with the player's own hands, which is worse than not ducking at all. The
 * distinction is a property of the **type**, not of how loud a particular file
 * happens to be, so it stays testable and does not depend on the manifest.
 *
 * Every type here belongs to a **page**: the menu and its branches, and the results
 * (which keeps the menu's bed under its own fanfare). Nothing played **during a run**
 * is on this list — not a miss, not a hero note, not the meter — and nothing here
 * reaches a song anyway: the stems are media elements that `SongAudio` owns, outside
 * this graph, so `DUCK_LEVEL` can only ever move a bed.
 */
const DUCKING_TYPES = new Set([
  "select",
  "back",
  "refuse",
  "open",
  "screen",
  "win",
  "fail",
  "best",
]);

/**
 * Does this type dip the menu's music and the room while it plays?
 *
 * A crowd swell is ambience, not a sting: it belongs *in* the room rather than over
 * it, and `crowd*` types are deliberately absent. The band's `hype_*` entrances are
 * the band starting, so they are absent too. An unknown type is not a sting either —
 * a manifest can grow a new click without asking the mixer first.
 */
export function ducksMusic(type: string): boolean {
  return DUCKING_TYPES.has(type);
}

/**
 * The lowest a song's own sound is ever turned down to.
 *
 * **Never zero.** A media element at `volume = 0` leaves the browser's audio clock
 * and free-runs: measured in Chromium, a silent stem walked ~30 ms ahead in five
 * seconds and snapped back only when it was heard again — so anything coming back
 * from silence arrives out of phase with the band. At the floor (about −60 dB) a
 * stem is inaudible and still on the song's clock. The master fader's own floor
 * (`masterVolume` in `settings.ts`) is this same number, so no path writes a zero.
 */
export const AUDIBLE_FLOOR = 0.001;

/**
 * How much of its own level a part keeps while a miss has it out of the mix.
 *
 * A miss **ducks** its part; it does not silence it. Silence takes the element off
 * the audio clock (`AUDIBLE_FLOOR`), and the seek-per-half-second that used to
 * compensate made it worse: every seek costs a streamed element its pre-roll, so a
 * "pinned" part came back ~40 ms behind and the room heard a flam. A tenth is quiet
 * enough to hear the backing and the mistake, and loud enough that the part never
 * leaves the clock. It is a **share**, never an absolute level, so a ducked part is
 * never louder than it was when it was hit.
 */
export const HELD_SHARE = 0.1;

/**
 * A channel's effective level outside the Web Audio graph: the master fader times
 * the family's own level. A song's stems and a YouTube stream are media elements,
 * not nodes under the mixer, so this is how they sit at the same level as a bed.
 *
 * The result is floored, not clamped to zero: a family fader dragged to nothing is
 * a mute by intent, and it still has to leave a media element on the clock
 * (`AUDIBLE_FLOOR`).
 */
export function familyVolume(master: number, family: number): number {
  return Math.max(AUDIBLE_FLOOR, clamp01(master) * clamp01(family));
}

/**
 * Which channel a type plays on.
 *
 * A **bed** is music; the **crowd** is ambience — it runs while the run is paused
 * on its own family, but a sting ducks it with the music because the room is part
 * of the mix; everything else is **sound effects**.
 */
export function channelOf(type: string): Channel {
  if (type === "background") return "music";
  if (type === "crowd") return "ambience";
  return "sfx";
}

/**
 * The bed a screen wants.
 *
 * Every page wants `background` — the same bank, wherever you are, because the bag
 * deals the next one and it does not matter which menu is up. **The stage wants
 * none**: the song is what plays there, and a menu bed over the top of it is the one
 * thing the mixer must never do.
 */
export function bedFor(screen: Screen): string | null {
  // The jukebox is a preview booth, not a room with a house band: a song's own
  // preview is the only music there. A song with nothing to preview is silent,
  // rather than falling back to the menu bed behind the list.
  if (screen === "songs") return null;
  return onStage(screen) ? null : "background";
}

/**
 * The room's own bed: a quiet venue, and only while the run is **paused**.
 *
 * A crowd over a song competes with the thing the player is listening to and is
 * the first sound to grow tiresome; a crowd under the pause is the room waiting
 * for you to come back. So the stage's playing screens ask for nothing, and the
 * pause menu alone gets the murmur, on the ambience family. The setting is the
 * player's: off leaves the pause in silence.
 */
export function crowdFor(screen: Screen, crowd: boolean): string | null {
  return screen === "paused" && crowd ? "crowd" : null;
}

/**
 * A sound's own trim, as a gain multiplier.
 *
 * Packs are not mastered to each other — one library's click and a commissioned sting
 * can sit 12dB apart — so each sound carries a `gainDb` and the mixer applies it. The
 * numbers in the manifest came from **measuring each file**, not from taste.
 */
export function soundGain(gainDb: number): number {
  return 10 ** (gainDb / 20);
}
