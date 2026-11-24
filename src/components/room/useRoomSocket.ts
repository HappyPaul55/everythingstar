import { useCallback, useEffect, useRef, useState } from "react";
import { ServerClock } from "../../lib/net/clock";
import { roomEndpoint } from "../../lib/net/endpoint";
import {
  parseServerMessage,
  type RoomClientMessage,
  type RoomServerMessage,
} from "../../lib/net/protocol";

export type RoomStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed" | "error";

export interface RoomSocket {
  status: RoomStatus;
  /** The last error the relay or the socket gave us. */
  error: string | null;
  send: (message: RoomClientMessage) => boolean;
  /** The relay's clock, sampled by this socket's own pings. */
  clock: ServerClock;
  rttMs: number;
}

interface Options {
  code: string | null;
  enabled: boolean;
  /** The hello this end sends on every (re)connect. */
  hello: RoomClientMessage | null;
  onMessage: (message: RoomServerMessage) => void;
  /** Stop retrying after this many attempts. */
  attempts?: number;
}

/** One room connection, with the clock's own pings and a small reconnect ladder. */
export function useRoomSocket({
  code,
  enabled,
  hello,
  onMessage,
  attempts = 6,
}: Options): RoomSocket {
  const [status, setStatus] = useState<RoomStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [rttMs, setRttMs] = useState(Number.POSITIVE_INFINITY);
  const socket = useRef<WebSocket | null>(null);
  const clock = useRef(new ServerClock());
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const helloRef = useRef(hello);
  helloRef.current = hello;
  const retry = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingId = useRef(0);
  const stopped = useRef(false);

  const clearTimers = useCallback(() => {
    if (retryTimer.current !== null) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    if (pingTimer.current !== null) {
      clearInterval(pingTimer.current);
      pingTimer.current = null;
    }
  }, []);

  const send = useCallback((message: RoomClientMessage): boolean => {
    const live = socket.current;
    if (!live || live.readyState !== WebSocket.OPEN) return false;
    live.send(JSON.stringify(message));
    return true;
  }, []);

  const hasHello = hello !== null;
  useEffect(() => {
    if (!enabled || !code || !hasHello) {
      clearTimers();
      stopped.current = true;
      socket.current?.close();
      socket.current = null;
      setStatus("idle");
      return;
    }
    stopped.current = false;
    retry.current = 0;
    clock.current.clear();
    const endpoint = `${roomEndpoint().replace(/\/$/, "")}/${code}`;

    const connect = () => {
      if (stopped.current) return;
      setStatus(retry.current === 0 ? "connecting" : "reconnecting");
      let live: WebSocket;
      try {
        live = new WebSocket(endpoint);
      } catch {
        setStatus("error");
        setError("The room service is not available at this address.");
        return;
      }
      socket.current = live;

      live.addEventListener("open", () => {
        if (socket.current !== live) return;
        retry.current = 0;
        setStatus("open");
        setError(null);
        const greeting = helloRef.current;
        if (greeting) live.send(JSON.stringify(greeting));
        if (pingTimer.current !== null) clearInterval(pingTimer.current);
        pingTimer.current = setInterval(() => {
          if (live.readyState !== WebSocket.OPEN) return;
          const id = ++pingId.current;
          live.send(JSON.stringify({ type: "ping", id, t0: Date.now() }));
        }, 2000);
        const id = ++pingId.current;
        live.send(JSON.stringify({ type: "ping", id, t0: Date.now() }));
      });

      live.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        const message = parseServerMessage(event.data);
        if (!message) return;
        if (message.type === "pong") {
          const sample = clock.current;
          const t3 = Date.now();
          // The clock class owns the window; the NTP arithmetic is inline here
          // because a pong is the only place all four stamps exist.
          const offset = ((message.t1 - message.t0) + (message.t2 - t3)) / 2;
          const rtt = Math.max(0, (t3 - message.t0) - (message.t2 - message.t1));
          sample.add({ offsetMs: offset, rttMs: rtt, atMs: t3 });
          setRttMs(Math.round(rtt));
          return;
        }
        if (message.type === "error") {
          setError(message.message);
          if (message.fatal) {
            stopped.current = true;
            setStatus("error");
          }
        }
        if (message.type === "closed") {
          stopped.current = true;
          setStatus("closed");
          setError(message.reason);
        }
        onMessageRef.current(message);
      });

      const gone = () => {
        if (socket.current !== live) return;
        socket.current = null;
        if (pingTimer.current !== null) {
          clearInterval(pingTimer.current);
          pingTimer.current = null;
        }
        if (stopped.current) return;
        if (retry.current >= attempts) {
          setStatus("error");
          setError("Lost the room. Check the room service and reload.");
          return;
        }
        retry.current += 1;
        setStatus("reconnecting");
        const wait = Math.min(8000, 600 * 2 ** (retry.current - 1));
        retryTimer.current = setTimeout(connect, wait);
      };
      live.addEventListener("close", gone);
      live.addEventListener("error", () => {
        setError("Room connection error.");
      });
    };

    connect();
    return () => {
      stopped.current = true;
      clearTimers();
      socket.current?.close();
      socket.current = null;
      setStatus("idle");
    };
  }, [code, enabled, hasHello, attempts, clearTimers]);

  return { status, error, send, clock: clock.current, rttMs };
}
