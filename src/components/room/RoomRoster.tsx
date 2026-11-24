import { useT } from "../../i18n/react";
import type { MessageKey } from "../../i18n";
import { activeLineIndex } from "../../lib/game/run";
import { useClockMs } from "../game/band/StageClock";
import { useSong } from "../game/band/SongContext";
import { slotLabel } from "../../lib/game/roomSlot";
import { useRoom } from "./useHostRoom";

/** The host/TV's view of the players on phones: names, parts, scores and pitch. */
export function RoomRoster() {
  const t = useT();
  const room = useRoom();
  const { track } = useSong();
  const timeMs = useClockMs(200);
  const remote = room.members.filter((member) => !member.isHost && member.seat !== null && member.slot);
  const words = remote.filter((member) => member.slot?.kind === "words");
  const lineIndex = activeLineIndex(track.melody.lines, timeMs);
  const line = lineIndex >= 0 ? track.melody.lines[lineIndex] : null;

  if (!room.active || remote.length === 0) return null;

  return (
    <aside className="room-roster" aria-label={t("screen.roomPlayers")}>
      {words.length > 0 && line ? (
        <div className="room-roster__lyric" aria-live="off">
          <span className="room-roster__eyebrow">{t("screen.roomLyrics")}</span>
          <p>{line.words.map((word) => word.text).join(" ")}</p>
        </div>
      ) : null}
      <div className="room-roster__cards">
        {remote.map((member) => {
          const run = room.remoteRuns.get(member.id);
          const pitch = room.pitch.get(member.id) ?? null;
          return (
            <div key={member.id} className="room-roster__card">
              <div className="room-roster__who">
                <strong>{member.name}</strong>
                <span>
                  {member.slot ? t(slotLabel(member.slot)) : t("screen.roomSitOut")}
                  {member.slot && member.slot.kind !== "words"
                    ? ` · ${t(`band.${member.slot.difficulty}` as MessageKey)}`
                    : ""}
                </span>
              </div>
              <div className="room-roster__numbers">
                <span className="room-roster__score">
                  {run ? run.score.toLocaleString("en-GB") : member.ready ? t("screen.roomReady") : t("screen.roomWaiting")}
                </span>
                {run ? (
                  <span className="room-roster__combo">×{run.combo}</span>
                ) : null}
                {member.slot?.kind === "words" && member.slot.wordsMode !== "type" && pitch !== null ? (
                  <span className="room-roster__pitch" aria-label="pitch">
                    ♪
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
