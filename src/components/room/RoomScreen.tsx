import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../i18n/react";
import { nextSlot } from "../../lib/game/band/types";
import { chartFor } from "../../lib/game/track";
import { songHasPart } from "../../lib/game/song";
import type { RoomMember, RoomSlot } from "../../lib/net/protocol";
import { useSongAudioProgress } from "../game/band/SongAudioStatus";
import type { GameSession } from "../game/useGameSession";
import { ScreenBackButton } from "../game/screens/ScreenBackButton";
import { RoomSlotPicker, slotLabel } from "./RoomSlotPicker";
import { RoomSongPicker } from "./RoomSongPicker";
import { useRoom } from "./useHostRoom";

function memberSlot(member: RoomMember): RoomSlot | null {
  return member.slot;
}

/**
 * The host's room page: the code, the seats, the song and the start.
 *
 * It is a page rather than a dialog because a host needs the room's whole width
 * for a band and a song list. The room itself lives above the screens, so going
 * on to the stage or the Jukebox does not drop the connection.
 */
export function RoomScreen({ session }: { session: GameSession }) {
  const t = useT();
  const room = useRoom();
  const audio = useSongAudioProgress();
  const [picker, setPicker] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [songUrl, setSongUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const { active: roomActive, open: openRoom } = room;
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (!roomActive) openRoom("play");
  }, [roomActive, openRoom]);

  const song = session.song;
  const members = room.members;
  const you = room.you ? members.find((member) => member.id === room.you?.id) ?? room.you : null;
  const remote = members.filter(
    (member) => !member.isHost && member.seat !== null && member.slot !== null,
  );

  // A remembered slot can be for a song that does not carry it. The host's own
  // seat resolves to the song's first offered choice, exactly as a guest's does.
  useEffect(() => {
    if (!song || !you?.slot || you.seat === null) return;
    const slot = you.slot;
    const offered =
      slot.kind === "words"
        ? Boolean(song.offer.voice)
        : songHasPart({ offer: song.offer }, slot.kind, slot.role);
    if (offered) return;
    const choice = nextSlot(song, you.seat);
    const next = {
      kind: choice.kind,
      difficulty: choice.difficulty,
      ...(choice.role ? { role: choice.role } : {}),
      ...(choice.wordsMode ? { wordsMode: choice.wordsMode } : {}),
    };
    const playable =
      next.kind === "words"
        ? Boolean(song.offer.voice)
        : songHasPart({ offer: song.offer }, next.kind, next.role);
    if (playable) room.setSlot(next);
  }, [room, song, you]);
  const playing = members.filter((member) => member.seat !== null && member.slot);
  const allReady = remote.every((member) => member.ready && member.connected);
  const chartsReady = session.load.status === "ready";
  const everySeatHasNotes = playing.every((member) => {
    const slot = member.slot;
    if (!slot) return false;
    if (slot.kind === "words") {
      return session.track.melody.lines.length > 0 || session.track.melody.notes.length > 0;
    }
    return Boolean(chartFor(session.track, slot.kind, slot.difficulty, slot.role));
  });
  const canStart =
    room.active &&
    room.status === "open" &&
    room.mode === "play" &&
    Boolean(song) &&
    playing.length > 0 &&
    chartsReady &&
    everySeatHasNotes &&
    (audio.ready || Boolean(session.playback.youtubeAudio)) &&
    allReady;

  const setYourSlot = (slot: RoomSlot | null) => {
    room.setSlot(slot);
  };
  const takeSeat = () => {
    if (!song) return;
    room.setSeat(you?.seat ?? 0);
    room.setSlot(
      you?.slot ??
        (() => {
          const choice = nextSlot(song, you?.seat ?? 0);
          const slot: RoomSlot = {
            kind: choice.kind,
            difficulty: choice.difficulty,
            ...(choice.role ? { role: choice.role } : {}),
            ...(choice.wordsMode ? { wordsMode: choice.wordsMode } : {}),
          };
          return slot;
        })(),
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice(room.joinUrl);
    }
  };

  const addPlaylist = () => {
    const url = playlistUrl.trim();
    if (!url) return;
    room.addLibrary("playlist", url);
    setPlaylistUrl("");
    setNotice(t("join.songAdded"));
  };
  const addSong = () => {
    const url = songUrl.trim();
    if (!url) return;
    room.addLibrary("song", url);
    setSongUrl("");
    setNotice(t("join.songAdded"));
  };

  const start = () => {
    if (!canStart) return;
    session.startRun();
  };

  const close = () => {
    room.close();
    session.dispatch("back");
  };

  const openJukebox = () => {
    room.setMode("listen");
    session.dispatch("jukebox");
  };

  const joinLine = useMemo(() => room.joinUrl, [room.joinUrl]);

  return (
    <div className="screen screen--room">
      <div className="screen__panel screen__panel--page room-screen">
        <div className="room__heading">
          <ScreenBackButton label={t("screen.backToMenu")} onBack={close} />
          <h2 className="screen__title">{t("screen.roomTitle")}</h2>
          <button
            type="button"
            className="band-btn room__close"
            data-sound="back"
            onClick={close}
          >
            {t("screen.roomClose")}
          </button>
        </div>

        <p className="comment on-ink screen__comment">
          <span className="slash" aria-hidden="true">//</span>{" "}
          {t("screen.roomComment")}
        </p>

        <div className="room__modes" role="group" aria-label={t("screen.roomTitle")}>
          <button
            type="button"
            className={room.mode === "play" ? "band-btn is-active" : "band-btn"}
            data-sound="select"
            onClick={() => room.setMode("play")}
          >
            {t("screen.roomModePlay")}
          </button>
          <button
            type="button"
            className={room.mode === "listen" ? "band-btn is-active" : "band-btn"}
            data-sound="select"
            onClick={() => room.setMode("listen")}
          >
            {t("screen.roomModeListen")}
          </button>
        </div>

        <section className="room__code-card">
          <div>
            <p className="room__eyebrow">{t("screen.roomCode")}</p>
            <p className="room__code" aria-label={t("screen.roomCode")}>
              {room.code ?? "······"}
            </p>
          </div>
          <div className="room__link">
            <p className="room__eyebrow">{t("screen.roomJoin")}</p>
            <code className="room__url">{joinLine || "—"}</code>
          </div>
          <button type="button" className="band-btn" data-sound="select" onClick={copy}>
            {copied ? t("screen.roomCopied") : t("screen.roomCopy")}
          </button>
        </section>

        {room.error ? (
          <p className="room__notice is-warn" role="status">
            {room.error}
          </p>
        ) : null}
        {notice ? (
          <p className="room__notice" role="status">{notice}</p>
        ) : null}

        {room.mode === "play" ? (
          <>
            <section className="room__section">
              <div className="room__section-heading">
                <h3>{t("screen.roomSong")}</h3>
                <button
                  type="button"
                  className="band-btn"
                  data-sound="open"
                  onClick={() => setPicker(true)}
                >
                  {t("screen.roomPickSong")}
                </button>
              </div>
              {song ? (
                <div className="room__song">
                  <span className="room__song-title">{song.title}</span>
                  <span className="room__song-artist">{song.artist.name}</span>
                </div>
              ) : (
                <p className="room-muted">{t("screen.roomNoSong")}</p>
              )}
              {!chartsReady && song ? (
                <p className="room-muted">{t("screen.roomWaiting", { name: t("screen.loading") })}</p>
              ) : null}
            </section>

            <section className="room__section">
              <h3>{t("screen.roomPlayers")}</h3>
              <div className="room__seats">
                {Array.from({ length: 8 }, (_, seat) => {
                  const member = members.find((entry) => entry.seat === seat) ?? null;
                  return (
                    <div key={seat} className={member ? "room__seat is-taken" : "room__seat"}>
                      <p className="room__seat-number">
                        {t("join.seat", { n: seat + 1 })}
                      </p>
                      {member ? (
                        <>
                          <p className="room__seat-name">
                            {member.name}
                            {member.isHost ? ` · ${t("join.host")}` : ""}
                          </p>
                          <p className="room__seat-part">
                            {memberSlot(member)
                              ? t(slotLabel(memberSlot(member)!))
                              : t("screen.roomSitOut")}
                          </p>
                          <p
                            className={
                              member.isHost || member.ready
                                ? "room__seat-ready is-ready"
                                : "room__seat-ready"
                            }
                          >
                            {member.isHost || member.ready
                              ? t("screen.roomReady")
                              : t("screen.roomWaiting")}
                          </p>
                          {!member.isHost ? (
                            <button
                              type="button"
                              className="band-btn room__kick"
                              data-sound="back"
                              onClick={() => room.kick(member.id)}
                            >
                              {t("screen.roomKick")}
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <p className="room__seat-empty">{t("screen.roomEmptySeat")}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="room__section room__you">
              <h3>{t("screen.roomYou")}</h3>
              {you ? (
                <>
                  <p className="room-muted">
                    {you.seat !== null
                      ? t("join.seat", { n: you.seat + 1 })
                      : t("screen.roomSitOut")}
                  </p>
                  <RoomSlotPicker
                    slot={you.slot}
                    song={song}
                    seat={you.seat ?? 0}
                    onChange={setYourSlot}
                  />
                  {you.seat === null ? (
                    <button type="button" className="band-btn" data-sound="select" onClick={takeSeat}>
                      {t("screen.roomJoinBand")}
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="room-muted">{t("screen.roomConnecting")}</p>
              )}
            </section>

            <div className="room__start">
              <button
                type="button"
                className="band-btn band-btn--primary band-btn--big"
                data-sound="select"
                disabled={!canStart}
                onClick={start}
              >
                {t("screen.roomStart")}
              </button>
              <p className="room-muted">
                {!song
                  ? t("screen.roomNoSong")
                  : !chartsReady
                    ? t("screen.roomWaiting", { name: t("screen.loading") })
                    : !allReady
                      ? t("screen.roomStartHint")
                      : t("screen.roomStartHint")}
              </p>
            </div>
          </>
        ) : (
          <>
            <section className="room__section">
              <h3>{t("screen.roomListening")}</h3>
              <p className="room-muted">{t("screen.roomListeningHint")}</p>
              <div className="room__listen-actions">
                <button
                  type="button"
                  className="band-btn band-btn--primary"
                  data-sound="select"
                  onClick={openJukebox}
                >
                  {t("screen.roomOpenJukebox")}
                </button>
              </div>
            </section>
            <section className="room__section">
              <h3>{t("screen.roomAddLibrary")}</h3>
              <div className="room__url-row">
                <label className="room-muted" htmlFor="room-playlist-url">
                  {t("screen.roomPlaylistUrl")}
                </label>
                <div className="room__url-field">
                  <input
                    id="room-playlist-url"
                    className="song-list__input"
                    type="url"
                    placeholder="https://…/playlist.json"
                    value={playlistUrl}
                    onChange={(event) => setPlaylistUrl(event.target.value)}
                  />
                  <button type="button" className="band-btn" data-sound="select" onClick={addPlaylist}>
                    {t("screen.roomAdd")}
                  </button>
                </div>
              </div>
              <div className="room__url-row">
                <label className="room-muted" htmlFor="room-song-url">
                  {t("screen.roomSongUrl")}
                </label>
                <div className="room__url-field">
                  <input
                    id="room-song-url"
                    className="song-list__input"
                    type="url"
                    placeholder="https://…/song.json"
                    value={songUrl}
                    onChange={(event) => setSongUrl(event.target.value)}
                  />
                  <button type="button" className="band-btn" data-sound="select" onClick={addSong}>
                    {t("screen.roomAdd")}
                  </button>
                </div>
              </div>
            </section>
            {room.queue.queue.length > 0 ? (
              <section className="room__section">
                <h3>{t("screen.roomQueue")}</h3>
                <ol className="room__queue">
                  {room.queue.queue.map((entry) => (
                    <li key={entry.id}>
                      <span>{entry.title}</span>
                      <span className="room-muted">{entry.artist}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </>
        )}
      </div>

      {picker ? (
        <RoomSongPicker
          songs={session.library.songs}
          current={song}
          onPick={(id) => {
            session.setWantedId(id);
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      ) : null}
    </div>
  );
}
