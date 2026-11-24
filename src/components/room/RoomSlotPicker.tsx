import type { MessageKey } from "../../i18n";
import { useT } from "../../i18n/react";
import type { BandSlot } from "../../lib/game/band/types";
import { nextSlot } from "../../lib/game/band/types";
import type { Song } from "../../lib/game/song";
import { songDifficulties, songHasPitch } from "../../lib/game/song";
import type { RoomSlot } from "../../lib/net/protocol";
import { DIFFICULTIES, INSTRUMENTS, nearestDifficulty } from "../../lib/game/track";

/** The part a room slot is playing, in words a phone can read. */
export function slotLabel(slot: RoomSlot): MessageKey {
  if (slot.kind === "words") {
    return slot.wordsMode === "type" ? "band.type" : "band.sing";
  }
  if (slot.kind === "guitar" && slot.role === "lead") return "band.leadGuitar";
  if (slot.kind === "guitar" && slot.role === "rhythm") return "band.rhythmGuitar";
  return INSTRUMENTS[slot.kind].labelKey;
}

function fromBandSlot(slot: BandSlot): RoomSlot {
  return {
    kind: slot.kind,
    difficulty: slot.difficulty,
    ...(slot.role ? { role: slot.role } : {}),
    ...(slot.wordsMode ? { wordsMode: slot.wordsMode } : {}),
  };
}

function nearest(slot: RoomSlot, song: Pick<Song, "offer">): RoomSlot {
  const levels = songDifficulties(song, slot.kind, slot.role);
  if (levels.length === 0) return slot;
  return { ...slot, difficulty: nearestDifficulty(levels, slot.difficulty) };
}

export function RoomSlotPicker({
  slot,
  song,
  seat,
  onChange,
  disabled = false,
}: {
  slot: RoomSlot | null;
  song: Pick<Song, "offer"> | null;
  seat: number;
  onChange: (slot: RoomSlot | null) => void;
  disabled?: boolean;
}) {
  const t = useT();
  if (!song) {
    return <p className="room-muted">{t("join.waitingSong")}</p>;
  }
  if (!slot) {
    return (
      <button
        type="button"
        className="band-btn"
        data-sound="select"
        disabled={disabled}
        onClick={() => onChange(fromBandSlot(nextSlot(song, seat)))}
      >
        {t("screen.roomJoinBand")}
      </button>
    );
  }
  const levels = songDifficulties(song, slot.kind, slot.role);
  const levelIndex = Math.max(0, levels.indexOf(slot.difficulty));
  const nextLevel = levels[(levelIndex + 1) % Math.max(1, levels.length)] ?? slot.difficulty;
  const canChooseWords = slot.kind === "words" && songHasPitch(song);

  return (
    <div className="room-slot">
      <span className="room-slot__part">{t(slotLabel(slot))}</span>
      {slot.kind === "words" ? (
        <span className="room-slot__level">{t(slotLabel(slot))}</span>
      ) : levels.length > 0 ? (
        <span className="room-slot__level">{t(`band.${slot.difficulty}` as MessageKey)}</span>
      ) : null}
      <div className="room-slot__actions">
        <button
          type="button"
          className="band-btn room-slot__button"
          data-sound="select"
          disabled={disabled}
          onClick={() => onChange(nearest(fromBandSlot(nextSlot(song, seat)), song))}
        >
          {t("join.changePart")}
        </button>
        {levels.length > 1 ? (
          <button
            type="button"
            className="band-btn room-slot__button"
            data-sound="select"
            disabled={disabled}
            onClick={() => onChange({ ...slot, difficulty: nextLevel })}
          >
            {t("join.level")}: {t(`band.${nextLevel}` as MessageKey)}
          </button>
        ) : null}
        {canChooseWords ? (
          <button
            type="button"
            className="band-btn room-slot__button"
            data-sound="select"
            disabled={disabled}
            onClick={() =>
              onChange({
                ...slot,
                wordsMode: slot.wordsMode === "type" ? "sing" : "type",
                difficulty:
                  slot.wordsMode === "type"
                    ? nearestDifficulty(DIFFICULTIES, slot.difficulty)
                    : slot.difficulty,
              })
            }
          >
            {slot.wordsMode === "type" ? t("join.sing") : t("join.type")}
          </button>
        ) : null}
        <button
          type="button"
          className="band-btn room-slot__button room-slot__button--quiet"
          data-sound="back"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          {t("screen.roomSitOut")}
        </button>
      </div>
    </div>
  );
}
