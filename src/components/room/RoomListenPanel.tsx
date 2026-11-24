import { useT } from "../../i18n/react";
import type { GameSession } from "../game/useGameSession";
import { useRoom } from "./useHostRoom";

/** The host's small room card on the Jukebox: code, listeners and the queue. */
export function RoomListenPanel({ session }: { session: GameSession }) {
  const t = useT();
  const room = useRoom();
  if (!room.active || room.mode !== "listen") return null;
  const listeners = room.members.length;
  const close = () => {
    room.close();
    session.dispatch("back");
  };
  return (
    <section className="room-listen" aria-label={t("screen.roomListening")}>
      <div className="room-listen__head">
        <div>
          <p className="room__eyebrow">{t("screen.roomCode")}</p>
          <p className="room__code room__code--small">{room.code ?? "······"}</p>
        </div>
        <div>
          <p className="room__eyebrow">{t("screen.roomJoin")}</p>
          <code className="room__url">{room.joinUrl}</code>
        </div>
        <span className="room-listen__count">
          {listeners} {t("screen.roomPlayers").toLowerCase()}
        </span>
      </div>
      <p className="room-muted">{t("screen.roomListeningHint")}</p>
      {room.queue.queue.length > 0 ? (
        <ol className="room-listen__queue">
          {room.queue.queue.slice(0, 6).map((entry) => (
            <li key={entry.id}>
              <span>{entry.title}</span>
              <span className="room-muted">{entry.artist}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="room-listen__actions">
        <button
          type="button"
          className="band-btn"
          data-sound="back"
          onClick={() => session.jukebox.clearQueue()}
        >
          {t("screen.jukeboxClearQueue")}
        </button>
        <button type="button" className="band-btn" data-sound="back" onClick={close}>
          {t("screen.roomClose")}
        </button>
      </div>
    </section>
  );
}
