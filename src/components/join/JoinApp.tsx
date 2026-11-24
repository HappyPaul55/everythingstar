import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useT, withLocale } from "../../i18n/react";
import type { MessageKey } from "../../i18n";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "../../lib/game/settings";
import { nextSlot, type BandSetup, type Player } from "../../lib/game/band/types";
import { songHasPart } from "../../lib/game/song";
import type { Difficulty, MelodyChart, Track } from "../../lib/game/track";
import type { RoomSlot } from "../../lib/net/protocol";
import { isRoomCode } from "../../lib/net/protocol";
import { DEFAULT_BACKDROP } from "../../lib/game/band/media";
import { formatScore } from "../../lib/game/scoring";
import { GameProviders } from "../game/GameProviders";
import { BandStage } from "../game/band/BandStage";
import { useWakeLock } from "../game/band/useWakeLock";
import { DEFAULT_SOUNDS, useSounds } from "../game/audio/useSounds";
import { RoomClockDirector } from "./RoomClockDirector";
import { RoomReporter } from "./RoomReporter";
import { RoomSlotPicker } from "../room/RoomSlotPicker";
import { slotLabel } from "../../lib/game/roomSlot";
import { useGuestRoom, type GuestRoom } from "../room/useGuestRoom";

const EMPTY_MELODY: MelodyChart = {
  parts: 1,
  hasPitch: false,
  rows: 6,
  rootMidi: 57,
  lines: [],
  notes: [],
};

function slotFromChoice(choice: { kind: Player["kind"]; difficulty: Difficulty; role?: Player["role"]; wordsMode?: Player["wordsMode"] }): RoomSlot {
  return {
    kind: choice.kind,
    difficulty: choice.difficulty,
    ...(choice.role ? { role: choice.role } : {}),
    ...(choice.wordsMode ? { wordsMode: choice.wordsMode } : {}),
  };
}

function trackFromRoom(room: GuestRoom): { track: Track; setup: BandSetup; singing: boolean } | null {
  const chart = room.chart;
  const you = room.you;
  if (!chart || !you || you.seat === null || !chart.slot) return null;
  const track: Track = {
    id: chart.song.id,
    title: chart.song.title,
    durationMs: chart.song.durationMs,
    melody: chart.melody ?? EMPTY_MELODY,
    charts: chart.lane ? [chart.lane] : [],
  };
  const player: Player = {
    id: you.id,
    seat: you.seat,
    kind: chart.slot.kind,
    difficulty: chart.slot.difficulty,
    ...(chart.slot.role ? { role: chart.slot.role } : {}),
    ...(chart.slot.wordsMode ? { wordsMode: chart.slot.wordsMode } : {}),
    name: you.name,
    auto: false,
  };
  return {
    track,
    setup: { players: [player] },
    singing: chart.slot.kind === "words" && chart.slot.wordsMode !== "type" && track.melody.hasPitch,
  };
}

function JoinApp() {
  const t = useT();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [entered, setEntered] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requested = (query.get("room") ?? "").trim().toUpperCase();
    if (requested) setCode(requested);
    try {
      setName(localStorage.getItem("everythingstar.room.name") ?? "");
    } catch {
      // A name is not worth failing a join over.
    }
    setSettings(loadSettings());
  }, []);

  const room = useGuestRoom({ code, enabled: entered, name });
  const sounds = useSounds(DEFAULT_SOUNDS, entered);
  const phase = room.state?.phase ?? "lobby";
  useWakeLock({
    enabled: settings.keepAwake,
    screen: entered && phase === "playing" ? "playing" : "welcome",
    native: false,
  });

  const changeSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  const submit = () => {
    const clean = code.trim().toUpperCase();
    if (!isRoomCode(clean)) {
      setFormError(t("join.wrongCode"));
      return;
    }
    const display = name.trim().slice(0, 24) || "Guest";
    setName(display);
    setCode(clean);
    try {
      localStorage.setItem("everythingstar.room.name", display);
    } catch {
      // Private mode still plays.
    }
    setFormError(null);
    setEntered(true);
  };

  if (!entered) {
    return (
      <JoinShell title={t("join.title")}>
        <p className="comment join__comment">
          <span className="slash" aria-hidden="true">//</span> {t("join.comment")}
        </p>
        <label className="join__field" htmlFor="join-code">
          <span>{t("join.code")}</span>
          <input
            id="join-code"
            className="song-list__input"
            value={code}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={6}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </label>
        <label className="join__field" htmlFor="join-name">
          <span>{t("join.name")}</span>
          <input
            id="join-name"
            className="song-list__input"
            value={name}
            maxLength={24}
            autoComplete="nickname"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {formError ? <p className="is-warn">{formError}</p> : null}
        <button
          type="button"
          className="band-btn band-btn--primary band-btn--big"
          data-sound="select"
          disabled={!code.trim() || !name.trim()}
          onClick={submit}
        >
          {t("join.enter")}
        </button>
        <a className="join__home" href="/play">
          {t("join.backHome")}
        </a>
      </JoinShell>
    );
  }

  if (!room.joined) {
    return (
      <JoinShell title={t("join.title")}>
        <p className="join__status" role="status">
          {room.error ?? t("join.connecting")}
        </p>
        <p className="room-muted">{t("join.room", { code })}</p>
        {room.error ? (
          <a className="band-btn" href="/join">
            {t("join.enter")}
          </a>
        ) : null}
      </JoinShell>
    );
  }

  if (room.state?.mode === "listen") {
    return (
      <JoinShell title={t("join.modeListen")} room={room}>
        <JoinListen room={room} />
      </JoinShell>
    );
  }

  if (phase === "countdown" || phase === "playing" || phase === "paused") {
    const stage = trackFromRoom(room);
    if (!stage) {
      return (
        <JoinShell title={t("join.modePlay")} room={room}>
          <p className="join__status" role="status">
            {room.chartError ?? t("join.waitingChart")}
          </p>
        </JoinShell>
      );
    }
    return (
      <JoinStage
        room={room}
        settings={settings}
        turn={stage}
        sounds={sounds}
        onChangeSettings={changeSettings}
        settingsOpen={settingsOpen}
        onSettings={() => setSettingsOpen((open) => !open)}
      />
    );
  }

  if (phase === "results") {
    return (
      <JoinShell title={t("join.results")} room={room}>
        <JoinResults room={room} />
      </JoinShell>
    );
  }

  return (
    <JoinShell title={t("join.modePlay")} room={room}>
      <JoinLobby room={room} settings={settings} onChangeSettings={changeSettings} />
    </JoinShell>
  );
}

function JoinShell({
  title,
  room,
  children,
}: {
  title: string;
  room?: GuestRoom;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="screen screen--join">
      <div className="screen__panel screen__panel--page join">
        <header className="join__head">
          <div>
            <p className="join__eyebrow">
              {room ? t("join.room", { code: room.code }) : t("join.title")}
            </p>
            <h1 className="screen__title">{title}</h1>
          </div>
          {room ? <span className="join__who">{t("join.who", { name: room.you?.name ?? room.name })}</span> : null}
        </header>
        {room && (room.error || room.state?.notice) ? (
          <p className="room__notice is-warn" role="status">
            {room.error ?? room.state?.notice}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function JoinLobby({
  room,
  settings,
  onChangeSettings,
}: {
  room: GuestRoom;
  settings: Settings;
  onChangeSettings: (patch: Partial<Settings>) => void;
}) {
  const t = useT();
  const song = room.state?.song ?? null;
  const you = room.you;
  const seat = you?.seat ?? null;
  const slot = you?.slot ?? null;
  const members = room.members;

  // A seat with no part yet takes the song's first sensible choice. Changing the
  // song later leaves the choice with the player, not with the form.
  useEffect(() => {
    if (!song || seat === null || !slot) return;
    const offered =
      slot.kind === "words"
        ? Boolean(song.offer.voice)
        : songHasPart({ offer: song.offer }, slot.kind, slot.role);
    if (offered) return;
    const next = slotFromChoice(nextSlot(song, seat));
    const playable =
      next.kind === "words"
        ? Boolean(song.offer.voice)
        : songHasPart({ offer: song.offer }, next.kind, next.role);
    if (playable) room.setSlot(next);
  }, [room, song, seat, slot]);

  useEffect(() => {
    if (!song || seat === null || slot) return;
    const next = slotFromChoice(nextSlot(song, seat));
    const playable =
      next.kind === "words"
        ? Boolean(song.offer.voice)
        : songHasPart({ offer: song.offer }, next.kind, next.role);
    if (playable) room.setSlot(next);
  }, [room, song, seat, slot]);

  const ready = room.ready && Boolean(room.chart);
  return (
    <div className="join-lobby">
      <p className="comment join__comment">
        <span className="slash" aria-hidden="true">//</span> {t("join.hostSpeakers")}
      </p>

      {!song ? (
        <p className="join__status" role="status">{t("join.waitingSong")}</p>
      ) : (
        <section className="join-lobby__song">
          <p className="join__eyebrow">{t("screen.roomSong")}</p>
          <h2>{song.title}</h2>
          <p className="room-muted">{song.artist}</p>
        </section>
      )}

      <section className="join-lobby__seats">
        <h2>{t("screen.roomPlayers")}</h2>
        <div className="join-lobby__seat-grid">
          {Array.from({ length: 8 }, (_, at) => {
            const member = members.find((entry) => entry.seat === at) ?? null;
            const mine = member?.id === you?.id;
            return (
              <button
                key={at}
                type="button"
                className={
                  mine
                    ? "join-seat is-mine"
                    : member
                      ? "join-seat is-taken"
                      : "join-seat"
                }
                data-sound="select"
                disabled={Boolean(member) && !mine}
                onClick={() => room.claim(at)}
              >
                <span className="join-seat__number">{t("join.seat", { n: at + 1 })}</span>
                <span className="join-seat__name">
                  {member ? member.name : t("screen.roomEmptySeat")}
                </span>
                {member ? (
                  <span className="join-seat__part">
                    {member.slot ? t(slotLabel(member.slot)) : t("screen.roomSitOut")}
                  </span>
                ) : null}
                {member && !member.isHost ? (
                  <span className={member.ready ? "join-seat__ready is-ready" : "join-seat__ready"}>
                    {member.ready ? t("join.ready") : t("join.notReady")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="join-lobby__part">
        <h2>{t("join.choosePart")}</h2>
        <RoomSlotPicker
          slot={slot}
          song={song}
          seat={seat ?? 0}
          onChange={(next) => room.setSlot(next)}
        />
      </section>

      <JoinSettings settings={settings} onChange={onChangeSettings} />

      <div className="join-lobby__actions">
        <button
          type="button"
          className={ready ? "band-btn band-btn--primary" : "band-btn"}
          data-sound="select"
          disabled={!room.chart}
          onClick={() => room.setReady(!ready)}
        >
          {ready ? t("join.ready") : t("join.notReady")}
        </button>
        <a className="band-btn" href="/play">{t("join.leave")}</a>
        <span className="room-muted">
          {room.chart ? null : room.chartError ?? t("join.waitingChart")}
        </span>
      </div>
    </div>
  );
}

function JoinStage({
  room,
  settings,
  turn,
  sounds,
  onChangeSettings,
  settingsOpen,
  onSettings,
}: {
  room: GuestRoom;
  settings: Settings;
  turn: { track: Track; setup: BandSetup; singing: boolean };
  sounds: ReturnType<typeof useSounds>;
  onChangeSettings: (patch: Partial<Settings>) => void;
  settingsOpen: boolean;
  onSettings: () => void;
}) {
  const t = useT();
  return (
    <div className="screen screen--join-stage">
      <GameProviders
        screen="playing"
        sounds={sounds}
        volume={settings.volume}
        onVolume={(volume) => onChangeSettings({ volume })}
        levels={settings.levels}
        crowd={false}
        setup={turn.setup}
        track={turn.track}
        seed={room.chart?.song.seed ?? 0}
        doc={null}
        perfect={false}
        audio
        room
      >
        <RoomClockDirector room={room} settings={settings} />
        <RoomReporter room={room} singing={turn.singing} />
        <BandStage
          setup={turn.setup}
          media={{ kind: "image", src: DEFAULT_BACKDROP }}
          view={settings.view}
          noteStyle={settings.noteStyle}
          noteSpeed={settings.noteSpeed}
          visualLagMs={settings.visualLagMs}
          backdropDim={settings.backdropDim}
          tap={settings.tap}
          haptics={settings.haptics}
          youtube={null}
          practice={null}
        >
          <div className="join-stage__hud">
            <span className="join-stage__code">{room.code}</span>
            <span>{room.you?.name}</span>
            <span className="join-stage__part">
              {room.you?.slot ? t(slotLabel(room.you.slot)) : ""}
            </span>
            <button type="button" className="band-btn" data-sound="open" onClick={onSettings}>
              {t("join.settings")}
            </button>
            <button
              type="button"
              className="band-btn"
              data-sound="back"
              onClick={() => {
                window.location.href = "/play";
              }}
            >
              {t("join.leave")}
            </button>
            {room.error ? (
              <span className="join-stage__error" role="status">
                {room.error}
              </span>
            ) : null}
          </div>
        </BandStage>
      </GameProviders>
      {settingsOpen ? (
        <div className="join-stage__settings">
          <JoinSettings settings={settings} onChange={onChangeSettings} />
        </div>
      ) : null}
    </div>
  );
}

function JoinSettings({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const t = useT();
  return (
    <details className="join-settings">
      <summary>{t("join.settings")}</summary>
      <div className="join-settings__body">
        <label className="join-settings__row">
          <span>{t("join.volume")}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.volume}
            onChange={(event) => onChange({ volume: Number(event.target.value) })}
          />
        </label>
        <label className="join-settings__row">
          <span>{t("join.sync")}</span>
          <input
            type="range"
            min={-300}
            max={300}
            step={5}
            value={settings.audioLagMs}
            onChange={(event) => onChange({ audioLagMs: Number(event.target.value) })}
          />
          <small>{settings.audioLagMs} ms</small>
        </label>
        <p className="room-muted">{t("join.syncHint")}</p>
        <label className="join-settings__row">
          <span>{t("join.pictureLag")}</span>
          <input
            type="range"
            min={-300}
            max={300}
            step={5}
            value={settings.visualLagMs}
            onChange={(event) => onChange({ visualLagMs: Number(event.target.value) })}
          />
          <small>{settings.visualLagMs} ms</small>
        </label>
        <label className="join-settings__row">
          <span>{t("join.noteSpeed")}</span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={settings.noteSpeed}
            onChange={(event) => onChange({ noteSpeed: Number(event.target.value) })}
          />
          <small>{settings.noteSpeed.toFixed(1)}×</small>
        </label>
        <label className="join-settings__check">
          <input
            type="checkbox"
            checked={settings.tap}
            onChange={(event) => onChange({ tap: event.target.checked })}
          />
          <span>{t("join.tap")}</span>
        </label>
        <label className="join-settings__check">
          <input
            type="checkbox"
            checked={settings.haptics}
            onChange={(event) => onChange({ haptics: event.target.checked })}
          />
          <span>{t("join.haptics")}</span>
        </label>
      </div>
    </details>
  );
}

function JoinListen({ room }: { room: GuestRoom }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [playlist, setPlaylist] = useState("");
  const [song, setSong] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const current = room.queue.current;
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    return (words
      ? room.library.filter(
          (entry) =>
            entry.title.toLowerCase().includes(words) ||
            entry.artist.toLowerCase().includes(words),
        )
      : room.library
    ).slice(0, 60);
  }, [room.library, query]);

  const addPlaylist = () => {
    const url = playlist.trim();
    if (!url) return;
    room.addLibrary("playlist", url);
    setPlaylist("");
    setStatus(t("join.songAdded"));
  };
  const addSong = () => {
    const url = song.trim();
    if (!url) return;
    room.addLibrary("song", url);
    setSong("");
    setStatus(t("join.songAdded"));
  };

  return (
    <div className="join-listen">
      <p className="comment join__comment">
        <span className="slash" aria-hidden="true">//</span> {t("join.hostSpeakers")}
      </p>
      <section className="join-listen__now">
        <p className="join__eyebrow">{t("join.nowPlaying")}</p>
        <h2>{current?.title ?? t("screen.jukeboxLoading")}</h2>
        <p className="room-muted">{current?.artist ?? ""}</p>
      </section>

      <section className="join-listen__queue">
        <h2>{t("join.queue")}</h2>
        {room.queue.queue.length === 0 ? (
          <p className="room-muted">{t("join.queueEmpty")}</p>
        ) : (
          <>
            <ol>
              {room.queue.queue.map((entry) => (
                <li key={entry.id}>
                  <span>{entry.title}</span>
                  <span className="room-muted">{entry.artist}</span>
                  <button
                    type="button"
                    className="band-btn join-listen__row-action"
                    data-sound="back"
                    onClick={() => room.queueOp("remove", entry.id)}
                  >
                    {t("screen.jukeboxRemove")}
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="band-btn join__home"
              data-sound="back"
              onClick={() => room.queueOp("clear")}
            >
              {t("screen.jukeboxClearQueue")}
            </button>
          </>
        )}
      </section>

      <section className="join-listen__library">
        <h2>{t("join.library")}</h2>
        <input
          className="song-list__input"
          type="search"
          placeholder={t("screen.searchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="join-listen__songs">
          {shown.length === 0 ? <p className="room-muted">{t("join.noSongs")}</p> : null}
          {shown.map((entry) => (
            <div key={entry.id} className="join-listen__song">
              <div>
                <strong>{entry.title}</strong>
                <span className="room-muted">{entry.artist}</span>
              </div>
              <div className="join-listen__row-actions">
                <button
                  type="button"
                  className="band-btn join-listen__row-action"
                  data-sound="select"
                  onClick={() => {
                    room.queueOp("playNow", entry.id);
                    setStatus(t("screen.jukeboxPlayNow"));
                  }}
                >
                  {t("screen.jukeboxPlayNow")}
                </button>
                <button
                  type="button"
                  className="band-btn join-listen__row-action"
                  data-sound="select"
                  onClick={() => {
                    room.queueOp("playNext", entry.id);
                    setStatus(t("screen.jukeboxPlayNext"));
                  }}
                >
                  {t("screen.jukeboxPlayNext")}
                </button>
                <button
                  type="button"
                  className="band-btn"
                  data-sound="select"
                  onClick={() => {
                    room.queueOp("add", entry.id);
                    setStatus(t("join.added"));
                  }}
                >
                  {t("join.addQueue")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <a className="band-btn join__home" href="/play">{t("join.leave")}</a>

      <p className="room-muted">{t("room.urlOnly")}</p>

      <section className="join-listen__add">
        <h2>{t("screen.roomAddLibrary")}</h2>
        <div className="join-listen__url">
          <input
            className="song-list__input"
            type="url"
            placeholder="https://…/playlist.json"
            value={playlist}
            onChange={(event) => setPlaylist(event.target.value)}
          />
          <button type="button" className="band-btn" data-sound="select" onClick={addPlaylist}>
            {t("join.addPlaylist")}
          </button>
        </div>
        <div className="join-listen__url">
          <input
            className="song-list__input"
            type="url"
            placeholder="https://…/song.json"
            value={song}
            onChange={(event) => setSong(event.target.value)}
          />
          <button type="button" className="band-btn" data-sound="select" onClick={addSong}>
            {t("join.addSong")}
          </button>
        </div>
        {status ? <p className="room-muted" role="status">{status}</p> : null}
      </section>
    </div>
  );
}

export default withLocale(JoinApp);

function JoinResults({ room }: { room: GuestRoom }) {
  const t = useT();
  const results = room.state?.results;
  const you = room.you;
  const mine = results?.entries.find((entry) => entry.seat === you?.seat) ?? null;
  return (
    <div className="join-results">
      {!results ? (
        <p className="join__status" role="status">{t("join.starting")}</p>
      ) : (
        <>
          <div className="join-results__band">
            <p className="join__eyebrow">{t("join.bandScore")}</p>
            <p className="join-results__score">{formatScore(results.score)}</p>
            <p className="room-muted">
              {"★".repeat(results.stars)}
              {results.gold ? " · gold" : ""} · {results.accuracy}%
            </p>
          </div>
          <div className="join-results__cards">
            {results.entries.map((entry) => (
              <div key={entry.key} className={entry.seat === you?.seat ? "join-result is-mine" : "join-result"}>
                <strong>{entry.label}</strong>
                <span>{formatScore(entry.score)}</span>
                <span className="room-muted">
                  {entry.kind === "words"
                    ? entry.wordsMode === "type"
                      ? t("join.type")
                      : t("join.sing")
                    : t(`band.${entry.kind}` as MessageKey)}
                </span>
              </div>
            ))}
          </div>
          {mine ? (
            <div className="join-results__mine">
              <p className="join__eyebrow">{t("join.yourRun")}</p>
              <p>
                {formatScore(mine.score)} · {mine.hits}/{mine.judged} · ×{mine.bestCombo}
              </p>
            </div>
          ) : null}
        </>
      )}
      <a className="band-btn join__home" href="/play">{t("join.backHome")}</a>
    </div>
  );
}
