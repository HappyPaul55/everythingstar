// @ts-nocheck — Cloudflare runtime types are not a dependency of the app's tsconfig;
// `wrangler deploy --dry-run` is this adapter's build gate.
/// <reference lib="webworker" />
/**
 * The Cloudflare Worker and Durable Object adapter for the room relay.
 *
 * One Durable Object per room code. The object is ephemeral: it holds the
 * membership book and the host's snapshot while the room is alive, and stores
 * nothing. Charts are forwarded and kept in memory for a reconnect; the host
 * re-sends if the object is ever restarted.
 *
 * This file is intentionally thin: the rules live in `src/lib/net/roomCore.ts`
 * and `src/lib/net/protocol.ts`, which the Bun server uses unchanged.
 */

import { RoomCore, type RoomPeer } from "../src/lib/net/roomCore";
import { isRoomCode, type RoomServerMessage } from "../src/lib/net/protocol";

interface Env {
  ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
}

function allowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (allowed.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
    const host = request.headers.get("host");
    return Boolean(host && url.host === host);
  } catch {
    return false;
  }
}

function codeFrom(request: Request): string {
  const path = new URL(request.url).pathname;
  const match = /\/api\/room\/([A-Z0-9]{6})$/.exec(path);
  return match?.[1] ?? "";
}

function json(message: unknown, status = 200): Response {
  return new Response(JSON.stringify(message), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export class RoomDurableObject {
  private core: RoomCore | null = null;
  private readonly peers = new Map<string, RoomPeer>();
  private readonly joined = new Set<string>();

  constructor(private readonly state: DurableObjectState, private readonly env: Env) {}

  private room(code: string): RoomCore {
    this.core ??= new RoomCore({ code });
    return this.core;
  }

  async fetch(request: Request): Promise<Response> {
    const code = codeFrom(request);
    if (!isRoomCode(code)) return json({ error: "room code" }, 400);
    if (!allowedOrigin(request, this.env)) return json({ error: "origin" }, 403);
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ ok: true, room: code });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as unknown as WebSocket & {
      accept: () => void;
      addEventListener: (type: string, listener: (event: MessageEvent) => void) => void;
    };
    server.accept();
    const peerId = crypto.randomUUID();
    const peer: RoomPeer = {
      id: peerId,
      send: (message: RoomServerMessage) => {
        try {
          server.send(JSON.stringify(message));
        } catch {
          // A closed socket is not a room error.
        }
      },
      close: () => {
        try {
          server.close(1000, "closed");
        } catch {
          // Already gone.
        }
      },
    };
    this.peers.set(peerId, peer);
    const core = this.room(code);
    server.addEventListener("message", (event) => {
      const text = typeof event.data === "string" ? event.data : "";
      if (!text) return;
      if (text.length > 3 * 1024 * 1024) {
        peer.send({ type: "error", message: "That message is too large.", fatal: true, serverMs: Date.now() });
        peer.close();
        return;
      }
      if (!this.joined.has(peerId)) {
        if (core.join(peer, text)) this.joined.add(peerId);
        else peer.close();
        return;
      }
      core.message(peer, text);
    });
    server.addEventListener("close", () => {
      this.peers.delete(peerId);
      this.joined.delete(peerId);
      core.leave(peer);
    });
    server.addEventListener("error", () => {
      this.peers.delete(peerId);
      this.joined.delete(peerId);
      core.leave(peer);
    });
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return json({ ok: true, protocol: 1 });
    }
    const code = codeFrom(request);
    if (!isRoomCode(code)) return json({ error: "not found" }, 404);
    const id = env.ROOMS.idFromName(code);
    return env.ROOMS.get(id).fetch(request);
  },
};
