import type { Translate } from "../../../i18n";
import {
  isMelodyKind,
  type BandSlot,
  type PlayerKind,
  type WordsMode,
} from "../../../lib/game/band/types";
import { INSTRUMENTS, type LaneRole } from "../../../lib/game/track";

/**
 * The two small things a *player* is drawn with, wherever a player is drawn.
 *
 * They live here rather than in the band screen because two screens need them now —
 * the band screen's boxes and the options page's player setup — and a player called
 * one thing in one place and something else in the other would be a lie about them.
 */

/**
 * The colour a part is drawn in: **vocals are the blue part**, every instrument is
 * the default schema. **Typing is not vocals**: a typist is at the words' place but
 * plays the Typing way, so the accent belongs to a *singer* alone. `wordsMode`
 * settles that; without one, the words' place defaults to singing.
 */
export function kindTone(
  kind: PlayerKind,
  wordsMode?: WordsMode,
): "vocals" | "default" {
  return isMelodyKind(kind) && wordsMode !== "type" ? "vocals" : "default";
}

/**
 * What a player takes, in the words of the screen.
 *
 * `words` is the one kind with no name of its own: the **song** says whether the player
 * at the words sings or types, so the label is a question about the song rather than
 * about the kind. `hasPitch` is the answer, and is why this cannot be a constant.
 */
export function kindLabel(
  t: Translate,
  kind: PlayerKind,
  hasPitch: boolean,
  role?: LaneRole,
): string {
  if (isMelodyKind(kind)) return t(hasPitch ? "band.vocals" : "band.type");
  if (role === "lead") return t("band.leadGuitar");
  if (role === "rhythm") return t("band.rhythmGuitar");
  return t(INSTRUMENTS[kind].labelKey);
}

/**
 * A slot's label includes its explicit singing/typing choice, and a guitarist's
 * **role** where the song names one — they are a lead or a rhythm player, not just
 * "a guitar".
 */
export function slotLabel(t: Translate, slot: BandSlot, hasPitch: boolean): string {
  if (isMelodyKind(slot.kind) && hasPitch && slot.wordsMode === "type") {
    return t("band.type");
  }
  return kindLabel(t, slot.kind, hasPitch, slot.role);
}

/** The gear: one player's controller settings. A ring and eight teeth, so it reads
 *  as a gear at the size it is drawn rather than as a smudge. */
function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <rect
          key={angle}
          x="7.15"
          y="0.7"
          width="1.7"
          height="2.9"
          rx="0.6"
          fill="currentColor"
          transform={`rotate(${angle} 8 8)`}
        />
      ))}
    </svg>
  );
}

/**
 * The gear button itself: the same control in a box on the band screen and on the
 * options page, so the way into a player's controller is one control rather than
 * two that look alike.
 */
export function GearButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="slot__gear"
      aria-label={label}
      aria-haspopup="dialog"
      data-sound="open"
      onClick={onClick}
    >
      <GearIcon />
    </button>
  );
}
