/**
 * The self-hosted room server, and a static server for the built game.
 *
 * Run it after `bun run build`:
 *
 *   bun run serve
 *
 * The game and the room service share an origin, which is what lets a LAN party
 * use the same URLs it would on the website. Charts cross the relay; audio never
 * does — the host's speakers are the room's sound.
 */

import { join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { RoomCore, type RoomPeer } from "../src/lib/net/roomCore";
import { isRoomCode, type RoomServerMessage } from "../src/lib/net/protocol";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.PORT ?? 8788);
const HOST = process.env.HOST ?? "0.0.0.0";
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const ROOM_PATH = /^\/api\/room\/([A-Z0-9]{6})$/;

interface SocketData {
  peerId: string;
  code: string;
}

const rooms = new Map<string, RoomCore>();
const peers = new Map<string, RoomPeer>();
const joined = new Set<string>();

function roomFor(code: string): RoomCore {
  let room = rooms.get(code);
  if (!room) {
    room = new RoomCore({
      code,
      onEmpty: () => {
        if (room?.memberCount === 0) rooms.delete(code);
      },
    });
    rooms.set(code, room);
  }
  return room;
}

function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (ALLOWED.includes(origin)) return true;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]") {
      return true;
    }
    const host = request.headers.get("host");
    return Boolean(host && url.host === host);
  } catch {
    return false;
  }
}

function json(message: unknown, status = 200): Response {
  return new Response(JSON.stringify(message), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function staticFile(pathname: string): Promise<Response> {
  const decoded = decodeURIComponent(pathname);
  let relative = normalize(decoded).replace(/^([/\\])+/, "");
  if (relative.includes(`..${sep}`) || relative.startsWith("..")) {
    return new Response("Not found", { status: 404 });
  }
  if (relative === "" || relative.endsWith("/")) relative += "index.html";
  const candidates = [relative];
  if (!relative.includes(".")) candidates.push(`${relative}.html`);
  for (const candidate of candidates) {
    const file = Bun.file(join(DIST, candidate));
    if (await file.exists()) {
      const headers: Record<string, string> = {
        "cache-control": candidate.endsWith(".html") ? "no-cache" : "public, max-age=3600",
        "x-content-type-options": "nosniff",
      };
      return new Response(file, { headers });
    }
  }
  const notFound = Bun.file(join(DIST, "404.html"));
  if (await notFound.exists()) {
    return new Response(notFound, { status: 404, headers: { "content-type": "text/html" } });
  }
  return new Response("Build first: bun run build", { status: 404 });
}

function socketSend(ws: { send: (data: string) => void }, message: RoomServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // A closed socket is not an error the room needs to report.
  }
}

const server = Bun.serve<SocketData, never>({
  port: PORT,
  hostname: HOST,
  maxRequestBodySize: 1024,
  async fetch(request, bunServer) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return json({ ok: true, rooms: rooms.size, protocol: 1 });
    }
    const match = ROOM_PATH.exec(url.pathname);
    if (match) {
      if (!originAllowed(request)) return json({ error: "origin" }, 403);
      const code = match[1] ?? "";
      if (!isRoomCode(code)) return json({ error: "room code" }, 400);
      const peerId = crypto.randomUUID();
      const upgraded = bunServer.upgrade(request, { data: { peerId, code } });
      return upgraded ? undefined : json({ error: "upgrade" }, 400);
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    return staticFile(url.pathname);
  },
  websocket: {
    maxPayloadLength: 3 * 1024 * 1024,
    idleTimeout: 120,
    open(ws) {
      const { peerId, code } = ws.data;
      const peer: RoomPeer = {
        id: peerId,
        send: (message) => socketSend(ws, message),
        close: () => ws.close(),
      };
      peers.set(peerId, peer);
      roomFor(code);
    },
    message(ws, raw) {
      const { peerId, code } = ws.data;
      const peer = peers.get(peerId);
      if (!peer) return;
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      if (text.length > 3 * 1024 * 1024) {
        socketSend(ws, { type: "error", message: "That message is too large.", fatal: true, serverMs: Date.now() });
        ws.close();
        return;
      }
      const room = rooms.get(code);
      if (!room) return;
      if (!joined.has(peerId)) {
        if (room.join(peer, text)) joined.add(peerId);
        else ws.close();
        return;
      }
      room.message(peer, text);
    },
    close(ws) {
      const { peerId, code } = ws.data;
      const peer = peers.get(peerId);
      peers.delete(peerId);
      joined.delete(peerId);
      if (peer) rooms.get(code)?.leave(peer);
    },
  },
});

console.log(`EverythingStar rooms on http://${HOST}:${server.port}`);
console.log(`Room endpoint: ws://localhost:${server.port}/api/room/<CODE>`);
console.log(`Static: ${DIST}`);
