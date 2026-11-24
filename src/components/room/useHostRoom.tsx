import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { chartFor } from "../../lib/game/track";
import type { BandPlan, BandSlot } from "../../lib/game/band/types";
import { hashString } from "../../lib/game/hash";
import { fetchableUrl } from "../../lib/game/url";
import { roomLibrarySongs } from "../../lib/game/roomLibrary";
import { MAX_SEATS, type RoomChart, type RoomLibrarySong, type RoomMember, type RoomMode, type RoomPhase, type RoomQueueState, type RoomResults, type RoomRunEntry, type RoomServerMessage, type RoomSlot, type RoomSong, type RoomState } from "../../lib/net/protocol";
import { newRoomCode } from "../../lib/net/protocol";
import type { GameSession } from "../game/useGameSession";
import { useRoomSocket } from "./useRoomSocket";

export interface HostRoom {
  active: boolean;
  code: string | null;
  mode: RoomMode;
  status: ReturnType<typeof useRoomSocket>["status"];
  error: string | null;
  rttMs: number;
  members: RoomMember[];
  you: RoomMember | null;
  roomState: RoomState | null;
  library: RoomLibrarySong[];
  queue: RoomQueueState;
  /** The latest report per member, for the host's roster and the results board. */
  remoteRuns: Map<string, RoomRunEntry>;
  /** The latest pitch each remote seat reported, for the roster's own cursor. */
  pitch: Map<string, number | null>;
  runVersion: number;
  open: (mode: RoomMode) => void;
  close: () => void;
  setMode: (mode: RoomMode) => void;
  setSlot: (slot: RoomSlot | null) => void;
  setSeat: (seat: number | null) => void;
  /** Merge a host edit into the room's local band and re-apply the remote seats. */
  updateLocalPlan: (next: BandPlan) => void;
  kick: (memberId: string) => void;
  addLibrary: (kind: "playlist" | "song", url: string) => void;
  setResults: (results: RoomResults | null) => void;
  sendPlayhead: (songMs: number, playing: boolean) => void;
  joinUrl: string;
}

const RoomContext = createContext<HostRoom | null>(null);

function hostName(): string {
  try {
    return localStorage.getItem("everythingstar.room.name")?.slice(0, 24) || "Host";
  } catch {
    return "Host";
  }
}

function newToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function songInfo(session: GameSession): RoomSong | null {
  const song = session.song;
  if (!song) return null;
  const art = fetchableUrl(song.art ?? "");
  return {
    id: song.id,
    title: song.title,
    artist: song.artist.name,
    durationMs: song.durationMs,
    seed: song.seed,
    accent: song.accent,
    art,
    offer: song.offer,
  };
}

function phaseFor(screen: GameSession["screen"]): RoomPhase {
  if (screen === "loading" || screen === "countdown") return "countdown";
  if (screen === "playing") return "playing";
  if (screen === "paused") return "paused";
  if (screen === "results") return "results";
  return "lobby";
}

function queueSongs(session: GameSession): RoomQueueState {
  const summary = (song: { id: string; title: string; artist: { name: string }; durationMs: number; art: string | null; accent: string | null } | null): RoomLibrarySong | null =>
    song
      ? {
          id: song.id,
          title: song.title,
          artist: song.artist.name,
          durationMs: song.durationMs,
          art: fetchableUrl(song.art ?? ""),
          accent: song.accent,
        }
      : null;
  return {
    current: summary(session.jukebox.current),
    queue: session.jukebox.queue.map((song) => summary(song)).filter((song): song is RoomLibrarySong => song !== null),
  };
}

const EMPTY_SLOT: BandSlot = {
  kind: "guitar",
  difficulty: "normal",
  active: false,
};

function emptySlots(): BandSlot[] {
  return Array.from({ length: MAX_SEATS }, () => ({ ...EMPTY_SLOT }));
}

/**
 * The host's local band with the room's phones laid over it.
 *
 * The host's own boxes stay exactly as they are on the band screen: a phone claims
 * a seat and sits in it, and when it leaves the local player it covered comes back.
 * The host is not overlaid — the host's own seat is theirs to edit.
 */
function mergeRemote(base: BandPlan, members: readonly RoomMember[]): BandPlan {
  const slots = emptySlots();
  for (let index = 0; index < MAX_SEATS; index += 1) {
    const local = base.slots[index];
    if (local) slots[index] = { ...local, active: local.active !== false };
  }
  for (const member of members) {
    if (member.isHost) continue;
    if (member.seat === null || member.seat < 0 || member.seat >= MAX_SEATS || !member.slot) continue;
    slots[member.seat] = {
      ...member.slot,
      id: member.id,
      name: member.name,
      remote: true,
      active: true,
    };
  }
  return { slots };
}

/**
 * A plan the Band screen just edited, with the remote seats put back to the
 * host's local plan. A host cannot edit a phone's box from the TV; the phone does.
 */
function localOnly(
  next: BandPlan,
  previous: BandPlan | null,
  members: readonly RoomMember[],
): BandPlan {
  const slots = emptySlots();
  for (let index = 0; index < MAX_SEATS; index += 1) {
    const remote = members.some(
      (member) => !member.isHost && member.seat === index,
    );
    const chosen = next.slots[index];
    const old = previous?.slots[index];
    slots[index] = remote ? { ...(old ?? EMPTY_SLOT) } : { ...(chosen ?? EMPTY_SLOT) };
  }
  return { slots };
}

export function RoomProvider({ session, children }: { session: GameSession; children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [mode, setModeState] = useState<RoomMode>("play");
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [you, setYou] = useState<RoomMember | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [library, setLibrary] = useState<RoomLibrarySong[]>([]);
  const [queue, setQueue] = useState<RoomQueueState>({ current: null, queue: [] });
  const [remoteRuns, setRemoteRuns] = useState<Map<string, RoomRunEntry>>(new Map());
  const [pitch, setPitch] = useState<Map<string, number | null>>(new Map());
  const [runVersion, setRunVersion] = useState(0);
  const [results, setResultsState] = useState<RoomResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [welcomed, setWelcomed] = useState(0);
  const token = useRef("");
  const name = useRef(hostName());
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const planJson = useRef("");
  const localPlan = useRef<BandPlan | null>(null);
  const libraryJson = useRef("");
  const queueJson = useRef("");
  const stateJson = useRef("");
  const chartsSent = useRef(new Map<string, string>());
  const socketRef = useRef<ReturnType<typeof useRoomSocket> | null>(null);

  const sendChart = useCallback(
    (
      member: RoomMember,
      send: (message: Parameters<ReturnType<typeof useRoomSocket>["send"]>[0]) => boolean,
      force = false,
    ) => {
      if (member.isHost || member.seat === null || !member.slot) return;
      const current = sessionRef.current;
      if (current.load.status !== "ready") return;
      const track = current.track;
      const lane =
        member.slot.kind === "words"
          ? null
          : chartFor(track, member.slot.kind, member.slot.difficulty, member.slot.role) ?? null;
      const melody = member.slot.kind === "words" ? track.melody : null;
      if (lane === null && melody === null) return;
      const payload = JSON.stringify({ lane, melody });
      // The relay's frame cap is 3 MB. A chart that cannot fit is a chart the
      // guest cannot run; say so rather than waiting for a message that will fail.
      if (payload.length > 3 * 1024 * 1024) {
        setError("This seat's chart is too large to send to a phone.");
        return;
      }
      const hash = String(hashString(payload));
      if (!force && chartsSent.current.get(member.id) === hash) return;
      const chart: RoomChart = {
        seat: member.seat,
        song: {
          id: track.id,
          title: track.title,
          durationMs: track.durationMs,
          seed: current.playback.song?.seed ?? 0,
        },
        slot: member.slot,
        lane,
        melody,
        hash,
      };
      if (send({ type: "chart", to: member.id, chart })) {
        chartsSent.current.set(member.id, hash);
      }
    },
    [],
  );

  const onMessage = useCallback(
    (message: RoomServerMessage) => {
      const current = sessionRef.current;
      switch (message.type) {
        case "welcome":
          setYou(message.you);
          setMembers(message.members);
          setRoomState(message.state);
          setLibrary(message.library ?? []);
          setQueue(message.queue ?? { current: null, queue: [] });
          setError(null);
          stateJson.current = "";
          libraryJson.current = "";
          queueJson.current = "";
          setWelcomed((value) => value + 1);
          break;
        case "members":
          setMembers(message.members);
          break;
        case "state":
          setRoomState(message.state);
          break;
        case "library":
          setLibrary(message.songs);
          break;
        case "queueState":
          setQueue(message.queue);
          break;
        case "report": {
          setRemoteRuns((previous) => {
            const next = new Map(previous);
            next.set(message.from, message.entry);
            return next;
          });
          setRunVersion((value) => value + 1);
          break;
        }
        case "pitch":
          setPitch((previous) => {
            const next = new Map(previous);
            const last = message.samples[message.samples.length - 1];
            next.set(message.from, last ? last.midi : null);
            return next;
          });
          break;
        case "chartRequest": {
          const member = members.find((entry) => entry.id === message.from);
          const send = socketRef.current?.send;
          if (member && send) sendChart(member, send, true);
          break;
        }
        case "queue": {
          if (mode !== "listen") break;
          if (message.op === "add" && message.songId) current.jukebox.enqueue(message.songId);
          else if (message.op === "remove") current.jukebox.removeFromQueue(message.songId ?? message.entryId ?? "");
          else if (message.op === "clear") current.jukebox.clearQueue();
          else if (message.op === "next") current.jukebox.next();
          else if (message.op === "playNext" && message.songId) current.jukebox.playNext(message.songId);
          else if (message.op === "playNow" && message.songId) current.jukebox.playNow(message.songId);
          break;
        }
        case "libraryAdd": {
          if (message.kind === "playlist") current.library.add(message.url);
          else void current.library.pinSong(message.url).then((result) => {
            if (!result.ok) setError(result.problem);
          });
          break;
        }
        case "closed":
          setActive(false);
          setError(message.reason);
          break;
        case "error":
          setError(message.message);
          break;
        default:
          break;
      }
    },
    [members, mode, sendChart],
  );

  const hello = useMemo(
    () =>
      active && code
        ? {
            type: "hello" as const,
            protocol: 1,
            name: name.current,
            mode,
            hostToken: token.current,
          }
        : null,
    [active, code, mode],
  );

  const socket = useRoomSocket({ code, enabled: active, hello, onMessage });
  socketRef.current = socket;

  const open = useCallback((nextMode: RoomMode) => {
    if (active) {
      setModeState(nextMode);
      return;
    }
    token.current = newToken();
    setCode(newRoomCode());
    setModeState(nextMode);
    // The band before the room is the host's local band. Phones are laid over it.
    localPlan.current = nextMode === "play" ? sessionRef.current.plan : null;
    setError(null);
    setActive(true);
  }, [active]);

  const close = useCallback(() => {
    socket.send({ type: "close" });
    setActive(false);
    setCode(null);
    setMembers([]);
    setYou(null);
    setRoomState(null);
    setLibrary([]);
    setQueue({ current: null, queue: [] });
    setRemoteRuns(new Map());
    setPitch(new Map());
    setResultsState(null);
    setError(null);
    // Only a play room replaced the band; a listening room never touched it.
    if (localPlan.current) sessionRef.current.restorePlan();
    chartsSent.current.clear();
    planJson.current = "";
    localPlan.current = null;
  }, [socket]);

  const setMode = useCallback((next: RoomMode) => {
    setModeState(next);
  }, []);

  const setSlot = useCallback(
    (slot: RoomSlot | null) => {
      socket.send({ type: "slot", slot });
    },
    [socket],
  );
  const setSeat = useCallback(
    (seat: number | null) => {
      socket.send({ type: "claim", seat });
    },
    [socket],
  );
  const kick = useCallback(
    (memberId: string) => {
      socket.send({ type: "kick", memberId });
    },
    [socket],
  );
  const addLibrary = useCallback((kind: "playlist" | "song", url: string) => {
    const current = sessionRef.current;
    if (kind === "playlist") current.library.add(url);
    else {
      void current.library.pinSong(url).then((result) => {
        if (!result.ok) setError(result.problem);
      });
    }
  }, []);
  const setResults = useCallback((next: RoomResults | null) => {
    setResultsState(next);
  }, []);
  const sendPlayhead = useCallback(
    (songMs: number, playing: boolean) => {
      socket.send({ type: "playhead", songMs, playing });
    },
    [socket],
  );

  const applyPlan = useCallback((base: BandPlan, current: readonly RoomMember[]) => {
    const merged = mergeRemote(base, current);
    const json = JSON.stringify(merged);
    if (planJson.current === json) return;
    planJson.current = json;
    sessionRef.current.setPlan(merged);
  }, []);

  /**
   * The Band screen edited its boxes. Keep the host's local plan — including any
   * local player a phone has temporarily covered — and lay the phones back over it.
   * A phone's box is not the host's to edit; the phone changes it.
   */
  const updateLocalPlan = useCallback(
    (next: BandPlan) => {
      if (!active || mode !== "play") return;
      const base = localOnly(next, localPlan.current, members);
      localPlan.current = base;
      applyPlan(base, members);
    },
    [active, mode, members, applyPlan],
  );

  // The host's band is the room's band. It is redrawn when a phone takes or
  // changes a seat, but only on the band screen: a guest dropping out mid-run
  // must not reload the host's charts and reset its run.
  useEffect(() => {
    if (!active || mode !== "play" || session.screen !== "band") return;
    if (!localPlan.current) localPlan.current = sessionRef.current.plan;
    applyPlan(localPlan.current, members);
  }, [active, mode, members, session.screen, applyPlan, welcomed]);

  // The host's snapshot. It is sent on every meaningful change; the relay keeps
  // the latest so a guest who reloads sees the room it is joining.
  useEffect(() => {
    if (!active) return;
    const current = sessionRef.current;
    const state: RoomState = {
      mode,
      phase: phaseFor(current.screen),
      song: songInfo(current),
      results,
      notice: error,
    };
    const json = JSON.stringify(state);
    if (stateJson.current === json) return;
    if (socket.send({ type: "state", state })) stateJson.current = json;
  }, [active, mode, session.screen, session.song, results, error, socket, welcomed]);

  // The Jukebox's index and queue. They are only useful in a listening room, and
  // a library of thousands is a message of its own rather than part of state.
  useEffect(() => {
    if (!active || mode !== "listen") return;
    const songs = roomLibrarySongs(sessionRef.current.library.songs);
    const json = JSON.stringify(songs);
    if (libraryJson.current === json) return;
    if (socket.send({ type: "library", songs })) libraryJson.current = json;
  }, [active, mode, session.library.songs, socket, welcomed]);

  useEffect(() => {
    if (!active) return;
    const state = queueSongs(sessionRef.current);
    const json = JSON.stringify(state);
    if (queueJson.current === json) return;
    setQueue(state);
    if (socket.send({ type: "queueState", queue: state })) queueJson.current = json;
  }, [active, session.jukebox.current, session.jukebox.queue, socket, welcomed]);

  // A chart is sent when a guest asks, and again when the band or the track
  // changes. The hash stops a render from re-sending the same notes.
  useEffect(() => {
    if (!active || mode !== "play") return;
    for (const member of members) {
      if (!member.isHost) sendChart(member, socket.send);
    }
  }, [active, mode, members, session.track, session.load.status, sendChart, socket, welcomed]);

  // A room belongs to the Quick Play or Jukebox flow it was invited from. Leaving
  // either flow for the menu or the welcome ends it; moving between Songs, the
  // band, the Jukebox and a run keeps it.
  useEffect(() => {
    if (!active) return;
    if (session.screen === "menu" || session.screen === "welcome") close();
  }, [active, session.screen, close]);

  const joinUrl = useMemo(() => {
    if (!code || typeof window === "undefined") return "";
    const url = new URL("/join", window.location.href);
    url.searchParams.set("room", code);
    const rooms = new URLSearchParams(window.location.search).get("rooms");
    if (rooms) url.searchParams.set("rooms", rooms);
    return url.toString();
  }, [code]);

  const value: HostRoom = {
    active,
    code,
    mode,
    status: socket.status,
    error: error ?? socket.error,
    rttMs: socket.rttMs,
    members,
    you,
    roomState,
    library,
    queue,
    remoteRuns,
    pitch,
    runVersion,
    open,
    close,
    setMode,
    setSlot,
    setSeat,
    updateLocalPlan,
    kick,
    addLibrary,
    setResults,
    sendPlayhead,
    joinUrl,
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): HostRoom {
  const room = useContext(RoomContext);
  if (!room) throw new Error("useRoom needs a RoomProvider");
  return room;
}

/** The room, when there is one. The stage and the join paths are also rendered outside it. */
export function useRoomOptional(): HostRoom | null {
  return useContext(RoomContext);
}
