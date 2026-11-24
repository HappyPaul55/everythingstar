import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chartProblems } from "../../lib/game/track";
import {
  type RoomChart,
  type RoomLibrarySong,
  type RoomMember,
  type RoomQueueState,
  type RoomRunEntry,
  type RoomServerMessage,
  type RoomSlot,
  type RoomState,
} from "../../lib/net/protocol";
import type { PitchSample } from "../../lib/net/protocol";
import { useRoomSocket } from "./useRoomSocket";

export interface GuestRoom {
  status: ReturnType<typeof useRoomSocket>["status"];
  error: string | null;
  joined: boolean;
  code: string;
  name: string;
  members: RoomMember[];
  youId: string | null;
  you: RoomMember | null;
  state: RoomState | null;
  library: RoomLibrarySong[];
  queue: RoomQueueState;
  chart: RoomChart | null;
  chartError: string | null;
  ready: boolean;
  /** The host's latest playhead, for the room clock. */
  playhead: { songMs: number; playing: boolean; serverMs: number; atMs: number } | null;
  claim: (seat: number | null) => void;
  setSlot: (slot: RoomSlot | null) => void;
  setReady: (ready: boolean) => void;
  sendReport: (entry: RoomRunEntry) => void;
  sendPitch: (samples: PitchSample[]) => void;
  addLibrary: (kind: "playlist" | "song", url: string) => void;
  queueOp: (op: "add" | "next" | "playNext" | "playNow" | "remove" | "clear", songId?: string) => void;
  setName: (name: string) => void;
  serverNow: () => number;
  rttMs: number;
  leave: () => void;
}

function guestToken(code: string): string {
  const key = `everythingstar.room.guest.${code}`;
  try {
    const found = sessionStorage.getItem(key);
    if (found) return found;
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    sessionStorage.setItem(key, token);
    return token;
  } catch {
    return "";
  }
}

function storedName(): string {
  try {
    return localStorage.getItem("everythingstar.room.name")?.slice(0, 24) || "";
  } catch {
    return "";
  }
}

interface Options {
  code: string;
  enabled: boolean;
  name: string;
}

export function useGuestRoom({ code, enabled, name }: Options): GuestRoom {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [youId, setYouId] = useState<string | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [library, setLibrary] = useState<RoomLibrarySong[]>([]);
  const [queue, setQueue] = useState<RoomQueueState>({ current: null, queue: [] });
  const [chart, setChart] = useState<RoomChart | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [playhead, setPlayhead] = useState<GuestRoom["playhead"]>(null);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(name || storedName() || "Guest");
  const want = useRef("");
  const socketRef = useRef<ReturnType<typeof useRoomSocket> | null>(null);
  const chartKey = useRef("");

  const hello = useMemo(
    () =>
      enabled && code
        ? {
            type: "hello" as const,
            protocol: 1,
            name: name || displayName,
            guestToken: guestToken(code),
          }
        : null,
    [enabled, code, displayName, name],
  );

  const onMessage = useCallback((message: RoomServerMessage) => {
    switch (message.type) {
      case "welcome":
        setYouId(message.you.id);
        setMembers(message.members);
        setState(message.state);
        setLibrary(message.library ?? []);
        setQueue(message.queue ?? { current: null, queue: [] });
        setJoined(true);
        setError(null);
        // A reconnect may have outlived the relay's in-memory copy of the chart.
        // Ask again; a host that still has it answers, and one that has not loaded
        // the song yet will send it when the track is ready.
        want.current = "";
        socketRef.current?.send({ type: "needsChart" });
        break;
      case "members":
        setMembers(message.members);
        break;
      case "state":
        setState(message.state);
        break;
      case "library":
        setLibrary(message.songs);
        break;
      case "queueState":
        setQueue(message.queue);
        break;
      case "chart": {
        if (message.chart.lane) {
          const problems = chartProblems(message.chart.lane);
          if (problems.length > 0) {
            setChartError(`The chart for this seat is broken (${problems[0]}).`);
            setChart(null);
            return;
          }
        }
        setChart(message.chart);
        setChartError(null);
        break;
      }
      case "playhead":
        setPlayhead({
          songMs: message.songMs,
          playing: message.playing,
          serverMs: message.serverMs,
          atMs: Date.now(),
        });
        break;
      case "closed":
        setJoined(false);
        setError(message.reason);
        break;
      case "error":
        setError(message.message);
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    if (name && name !== displayName) setDisplayName(name);
  }, [name, displayName]);

  const socket = useRoomSocket({ code, enabled, hello, onMessage });
  socketRef.current = socket;
  const clockRef = useRef(socket.clock);
  clockRef.current = socket.clock;
  const serverNow = useCallback(() => clockRef.current.now(), []);
  const you = members.find((member) => member.id === youId) ?? null;

  // A chart belongs to a seat and a slot. A new song or a different choice asks
  // the host for the notes again; until they arrive the stage has nothing to run.
  useEffect(() => {
    if (!joined) return;
    const key = state?.song
      ? `${state.song.id}:${state.song.durationMs}:${you?.seat ?? "-"}:${you?.slot ? JSON.stringify(you.slot) : "-"}`
      : "";
    if (chartKey.current !== key) {
      chartKey.current = key;
      setChart(null);
      setChartError(null);
      // A new song or seat is not ready until its own notes arrive. Tell the host
      // before asking, or its Start could race the chart.
      setReady(false);
      socketRef.current?.send({ type: "ready", ready: false });
    }
    if (!state?.song || !you?.slot || you.seat === null) return;
    if (want.current === key) return;
    want.current = key;
    socketRef.current?.send({ type: "needsChart" });
  }, [joined, state?.song, you?.seat, you?.slot]);

  // A chart that arrived is a seat that is ready to play. The guest can still
  // turn it off; the host waits for the explicit state.
  const autoReady = useRef("");
  useEffect(() => {
    if (!chart) return;
    const key = `${chart.hash}:${chart.seat}`;
    if (autoReady.current === key) return;
    autoReady.current = key;
    setReady(true);
    socketRef.current?.send({ type: "ready", ready: true });
  }, [chart]);

  const claim = useCallback((seat: number | null) => {
    socketRef.current?.send({ type: "claim", seat });
  }, []);
  const setSlot = useCallback((slot: RoomSlot | null) => {
    setReady(false);
    setChart(null);
    socketRef.current?.send({ type: "slot", slot });
  }, []);
  const markReady = useCallback((next: boolean) => {
    setReady(next);
    socketRef.current?.send({ type: "ready", ready: next });
  }, []);
  const sendReport = useCallback((entry: RoomRunEntry) => {
    socketRef.current?.send({ type: "report", entry });
  }, []);
  const sendPitch = useCallback((samples: PitchSample[]) => {
    if (samples.length === 0) return;
    socketRef.current?.send({ type: "pitch", samples });
  }, []);
  const addLibrary = useCallback((kind: "playlist" | "song", url: string) => {
    socketRef.current?.send({ type: "libraryAdd", kind, url });
  }, []);
  const queueOp = useCallback(
    (op: "add" | "next" | "playNext" | "playNow" | "remove" | "clear", songId?: string) => {
      socketRef.current?.send({ type: "queue", op, ...(songId ? { songId } : {}) });
    },
    [],
  );
  const setName = useCallback((next: string) => {
    const clean = next.slice(0, 24);
    setDisplayName(clean);
    try {
      localStorage.setItem("everythingstar.room.name", clean);
    } catch {
      // Private mode is a name that lasts the visit.
    }
  }, []);
  const leave = useCallback(() => {
    setJoined(false);
    setChart(null);
  }, []);

  return {
    status: socket.status,
    error: error ?? socket.error,
    joined,
    code,
    name: displayName,
    members,
    youId,
    you,
    state,
    library,
    queue,
    chart,
    chartError,
    ready,
    playhead,
    claim,
    setSlot,
    setReady: markReady,
    sendReport,
    sendPitch,
    addLibrary,
    queueOp,
    setName,
    serverNow,
    rttMs: socket.rttMs,
    leave,
  };
}
