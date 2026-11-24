import type { MessageKey } from "../../i18n";
import type { RoomSlot } from "../net/protocol";
import { INSTRUMENTS } from "./track";

/** The part a room slot is playing, in words a phone can read. */
export function slotLabel(slot: RoomSlot): MessageKey {
  if (slot.kind === "words") {
    return slot.wordsMode === "type" ? "band.type" : "band.sing";
  }
  if (slot.kind === "guitar" && slot.role === "lead") return "band.leadGuitar";
  if (slot.kind === "guitar" && slot.role === "rhythm") return "band.rhythmGuitar";
  return INSTRUMENTS[slot.kind].labelKey;
}
