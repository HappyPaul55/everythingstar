import { useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { useT } from "../../i18n/react";
import type { RoomMode } from "../../lib/net/protocol";
import { NativeDialog } from "../game/ui/NativeDialog";
import { slotLabel } from "../../lib/game/roomSlot";
import { useRoom } from "./useHostRoom";

/**
 * The room's invitation: code, link and QR, over whatever screen opened it.
 *
 * It is the same dialog from the band's **Invite players** button and from the
 * Jukebox's **Invite listeners** button. Closing it does not close the room; the
 * host goes back to the band or the Jukebox with the phones still attached.
 */
export function InviteDialog({
  mode,
  onClose,
}: {
  mode: RoomMode;
  onClose: () => void;
}) {
  const t = useT();
  const room = useRoom();
  const opened = useRef(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (!room.active) room.open(mode);
    else if (room.mode !== mode) room.setMode(mode);
  }, [mode, room]);

  const qr = useMemo(() => {
    if (!room.joinUrl) return "";
    try {
      const code = qrcode(0, "M");
      code.addData(room.joinUrl);
      code.make();
      return code.createSvgTag({ cellSize: 5, margin: 0, scalable: true });
    } catch {
      return "";
    }
  }, [room.joinUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.joinUrl);
      setError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(room.joinUrl);
    }
  };

  const end = () => {
    room.close();
    onClose();
  };

  const guests = room.members.filter((member) => !member.isHost);

  return (
    <NativeDialog
      title={t(mode === "play" ? "room.invitePlayers" : "room.titleListen")}
      panelClassName="config__panel--wide invite"
      initialFocus="#room-copy"
      onClose={onClose}
    >
      <p className="comment on-ink invite__comment">
        <span className="slash" aria-hidden="true">//</span>{" "}
        {t(mode === "play" ? "room.playHint" : "room.listenHint")}
      </p>

      <div className="invite__top">
        <div className="invite__details">
          <p className="room__eyebrow">{t("room.code")}</p>
          <p className="room__code invite__code">{room.code ?? "······"}</p>
          <p className="room__eyebrow">{t("room.link")}</p>
          <code className="room__url">{room.joinUrl || t("room.connecting")}</code>
          <div className="invite__actions">
            <button
              id="room-copy"
              type="button"
              className="band-btn"
              data-sound="select"
              disabled={!room.joinUrl}
              onClick={copy}
            >
              {copied ? t("room.copied") : t("room.copy")}
            </button>
            <span className="room-muted" role="status">
              {room.status === "open"
                ? t("room.connected")
                : room.status === "reconnecting"
                  ? t("room.reconnecting")
                  : t("room.connecting")}
            </span>
          </div>
          {error ? <p className="room-muted is-warn">{error}</p> : null}
          {room.error ? <p className="room__notice is-warn">{room.error}</p> : null}
        </div>
        {qr ? (
          <div
            className="invite__qr"
            role="img"
            aria-label={t("room.qrAlt", { code: room.code ?? "" })}
            dangerouslySetInnerHTML={{ __html: qr }}
          />
        ) : null}
      </div>

      <section className="invite__people" aria-live="polite">
        <h3>{t(mode === "play" ? "room.players" : "room.listeners")}</h3>
        {guests.length === 0 ? (
          <p className="room-muted">{t("room.noOne")}</p>
        ) : (
          <ul>
            {guests.map((member) => (
              <li key={member.id}>
                <span>
                  {member.name}
                  {member.seat !== null ? ` · ${t("join.seat", { n: member.seat + 1 })}` : ""}
                </span>
                {member.slot ? (
                  <span className="room-muted">{t(slotLabel(member.slot))}</span>
                ) : null}
                {mode === "play" ? (
                  <span className={member.ready ? "invite__ready is-ready" : "invite__ready"}>
                    {member.ready ? t("room.ready") : t("room.waiting")}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="band-btn invite__kick"
                  aria-label={t("room.removeNamed", { name: member.name })}
                  data-sound="back"
                  onClick={() => room.kick(member.id)}
                >
                  {t("room.remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {mode === "listen" ? (
        <p className="room-muted">{t("room.urlOnly")}</p>
      ) : null}

      <div className="invite__foot">
        <button type="button" className="band-btn" data-sound="back" onClick={onClose}>
          {t("room.keepOpen")}
        </button>
        <button
          type="button"
          className="band-btn invite__end"
          data-sound="back"
          onClick={end}
        >
          {t("room.end")}
        </button>
      </div>
    </NativeDialog>
  );
}
