/**
 * The relay's room core.
 *
 * It is deliberately a **relay and a membership book**, not a game server: it
 * knows who is in the room, which seat they claimed, what a guest brought, and
 * the host's latest snapshot. It forwards charts and reports; it never parses a
 * chart, judges a note, or stores audio. The Bun server and the Cloudflare
 * Durable Object both wrap this class.
 */

import { fetchableUrl } from "../game/url";
import {
  EMPTY_ROOM_STATE,
  MAX_MEMBERS,
  MAX_NAME_CHARS,
  PROTOCOL_VERSION,
  parseClientMessage,
  sanitizeName,
  sanitizeSlot,
  type RoomChart,
  type RoomLibrarySong,
  type RoomMember,
  type RoomMode,
  type RoomQueueState,
  type RoomServerMessage,
  type RoomState,
} from "./protocol";

const MEMBER_GRACE_MS = 2 * 60 * 1000;
const HOST_GRACE_MS = 2 * 60 * 1000;

export interface RoomPeer {
  id: string;
  send: (message: RoomServerMessage) => void;
  close: () => void;
}

interface Connection {
  peer: RoomPeer;
  memberId: string;
}

interface StoredMember extends RoomMember {
  token: string;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

export interface RoomCoreOptions {
  code: string;
  now?: () => number;
  onEmpty?: () => void;
}

export class RoomCore {
  readonly code: string;
  private readonly now: () => number;
  private readonly onEmpty?: () => void;
  private hostToken: string | null = null;
  private hostId: string | null = null;
  private readonly members = new Map<string, StoredMember>();
  private readonly connections = new Map<string, Connection>();
  private readonly charts = new Map<string, RoomChart>();
  private state: RoomState = { ...EMPTY_ROOM_STATE };
  private library: RoomLibrarySong[] = [];
  private queue: RoomQueueState = { current: null, queue: [] };
  private closed = false;
  private readonly created = Date.now();

  constructor(options: RoomCoreOptions) {
    this.code = options.code;
    this.now = options.now ?? Date.now;
    this.onEmpty = options.onEmpty;
  }

  get memberCount(): number {
    return this.members.size;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get ageMs(): number {
    return this.now() - this.created;
  }

  get hostMemberId(): string | null {
    return this.hostId;
  }

  get snapshot(): RoomState {
    return this.state;
  }

  get librarySongs(): RoomLibrarySong[] {
    return this.library;
  }

  get queueState(): RoomQueueState {
    return this.queue;
  }

  /** A connection says who it is. Returns false when the room refuses it. */
  join(peer: RoomPeer, raw: string): boolean {
    if (this.closed) {
      this.sendError(peer, "This room has closed.", true);
      return false;
    }
    const message = parseClientMessage(raw);
    if (!message || message.type !== "hello") {
      this.sendError(peer, "Say hello before anything else.", true);
      return false;
    }
    if (message.protocol !== PROTOCOL_VERSION) {
      this.sendError(peer, "This room runs a different protocol version. Reload the game.", true);
      return false;
    }

    const wantsHost = Boolean(message.hostToken);
    if (wantsHost) {
      if (this.hostId === null) {
        if (!message.hostToken) {
          this.sendError(peer, "A host needs a room token.", true);
          return false;
        }
        this.hostToken = message.hostToken;
        this.hostId = this.addHost(peer, message.name, message.mode ?? "play");
      } else if (message.hostToken && message.hostToken === this.hostToken) {
        this.reconnectHost(peer, message.name);
      } else {
        this.sendError(peer, "That room belongs to another host.", true);
        return false;
      }
    } else {
      if (this.hostId === null) {
        this.sendError(peer, "That room is not open yet.", true);
        return false;
      }
      if (this.members.size >= MAX_MEMBERS) {
        this.sendError(peer, "This room is full.", true);
        return false;
      }
      this.addGuest(peer, message.name, message.guestToken ?? "");
    }

    this.sendWelcome(peer);
    this.broadcastMembers();
    return true;
  }

  private addHost(peer: RoomPeer, name: string, mode: RoomMode): string {
    const id = "host";
    this.members.set(id, {
      id,
      name: sanitizeName(name) || "Host",
      isHost: true,
      seat: 0,
      slot: { kind: "guitar", difficulty: "normal" },
      ready: true,
      connected: true,
      token: "",
      disconnectTimer: null,
    });
    this.state = { ...this.state, mode };
    this.bind(peer, id);
    return id;
  }

  private reconnectHost(peer: RoomPeer, name: string): void {
    const host = this.hostId ? this.members.get(this.hostId) : null;
    if (!host) return;
    this.clearDisconnect(host);
    this.connections.set(peer.id, { peer, memberId: host.id });
    host.connected = true;
    if (name) host.name = sanitizeName(name);
  }

  private addGuest(peer: RoomPeer, name: string, token: string): void {
    const existing = token
      ? [...this.members.values()].find((member) => !member.isHost && member.token === token)
      : null;
    const member =
      existing ??
      ({
        id: `guest-${crypto.randomUUID().slice(0, 8)}`,
        name: sanitizeName(name) || "Guest",
        isHost: false,
        seat: null,
        slot: null,
        ready: false,
        connected: true,
        token,
        disconnectTimer: null,
      } satisfies StoredMember);
    this.clearDisconnect(member);
    member.connected = true;
    if (name) member.name = sanitizeName(name);
    this.members.set(member.id, member);
    this.bind(peer, member.id);
  }

  private bind(peer: RoomPeer, memberId: string): void {
    for (const [connectionId, connection] of this.connections) {
      if (connection.memberId !== memberId) continue;
      this.connections.delete(connectionId);
    }
    this.connections.set(peer.id, { peer, memberId });
  }

  private clearDisconnect(member: StoredMember): void {
    if (member.disconnectTimer !== null) {
      clearTimeout(member.disconnectTimer);
      member.disconnectTimer = null;
    }
  }

  leave(peer: RoomPeer): void {
    const connection = this.connections.get(peer.id);
    if (!connection) return;
    this.connections.delete(peer.id);
    const member = this.members.get(connection.memberId);
    if (!member) return;
    // Another connection may already be carrying this member after a reload.
    const stillConnected = [...this.connections.values()].some(
      (entry) => entry.memberId === member.id,
    );
    if (stillConnected) return;
    member.connected = false;
    this.broadcastMembers();
    this.clearDisconnect(member);
    member.disconnectTimer = setTimeout(() => {
      member.disconnectTimer = null;
      if (member.connected) return;
      this.members.delete(member.id);
      this.charts.delete(member.id);
      if (member.isHost) {
        this.close("The host left the room.");
      } else {
        this.broadcastMembers();
        if (this.members.size === 0) this.onEmpty?.();
      }
    }, member.isHost ? HOST_GRACE_MS : MEMBER_GRACE_MS);
    setTimeout(() => {
      if (this.connections.size === 0 && this.members.size === 0) this.onEmpty?.();
    }, 0);
  }

  message(peer: RoomPeer, raw: string): void {
    if (this.closed) return;
    const message = parseClientMessage(raw);
    if (!message) {
      this.sendError(peer, "That message could not be read.");
      return;
    }
    const connection = this.connections.get(peer.id);
    const member = connection ? this.members.get(connection.memberId) : null;
    if (!connection || !member) {
      this.sendError(peer, "Join the room first.", true);
      return;
    }
    const host = member.isHost;

    switch (message.type) {
      case "hello":
        this.sendError(peer, "Already in the room.");
        return;
      case "ping": {
        const t1 = this.now();
        const t2 = this.now();
        peer.send({ type: "pong", id: message.id, t0: message.t0, t1, t2 });
        return;
      }
      case "slot": {
        member.slot = sanitizeSlot(message.slot);
        member.ready = false;
        this.broadcastMembers();
        return;
      }
      case "claim": {
        if (message.seat !== null) {
          const taken = [...this.members.values()].find(
            (entry) => entry.id !== member.id && entry.seat === message.seat,
          );
          if (taken) {
            this.sendError(peer, `Seat ${message.seat + 1} is already taken.`);
            return;
          }
        }
        member.seat = message.seat;
        member.ready = false;
        this.broadcastMembers();
        return;
      }
      case "ready":
        member.ready = message.ready === true;
        this.broadcastMembers();
        return;
      case "needsChart":
        this.hostPeer()?.send({
          type: "chartRequest",
          from: member.id,
          serverMs: this.now(),
        });
        return;
      case "report":
        this.hostPeer()?.send({
          type: "report",
          from: member.id,
          entry: message.entry,
          serverMs: this.now(),
        });
        return;
      case "pitch":
        this.hostPeer()?.send({
          type: "pitch",
          from: member.id,
          samples: message.samples,
          serverMs: this.now(),
        });
        return;
      case "queue":
        if (!host) {
          this.hostPeer()?.send({
            type: "queue",
            from: member.id,
            op: message.op,
            ...(message.songId ? { songId: message.songId } : {}),
            ...(message.entryId ? { entryId: message.entryId } : {}),
            serverMs: this.now(),
          });
        }
        return;
      case "libraryAdd": {
        if (!host) {
          const url = fetchableUrl(message.url);
          if (!url) {
            this.sendError(peer, "That is not a library address the game can read.");
            return;
          }
          this.hostPeer()?.send({
            type: "libraryAdd",
            from: member.id,
            kind: message.kind,
            url,
            serverMs: this.now(),
          });
        }
        return;
      }
      case "state":
        if (!host) return this.deny(peer);
        this.state = message.state;
        this.broadcast({ type: "state", state: this.state, serverMs: this.now() }, peer.id);
        return;
      case "playhead":
        if (!host) return this.deny(peer);
        this.broadcast(
          {
            type: "playhead",
            songMs: message.songMs,
            playing: message.playing,
            serverMs: this.now(),
          },
          peer.id,
        );
        return;
      case "chart": {
        if (!host) return this.deny(peer);
        const target = this.members.get(message.to);
        if (!target) return;
        this.charts.set(target.id, message.chart);
        const targetPeer = this.peerFor(target.id);
        targetPeer?.send({
          type: "chart",
          from: member.id,
          chart: message.chart,
          serverMs: this.now(),
        });
        return;
      }
      case "library":
        if (!host) return this.deny(peer);
        this.library = message.songs.slice(0, 4000);
        this.broadcast({ type: "library", songs: this.library, serverMs: this.now() }, peer.id);
        return;
      case "queueState":
        if (!host) return this.deny(peer);
        this.queue = message.queue;
        this.broadcast({ type: "queueState", queue: this.queue, serverMs: this.now() }, peer.id);
        return;
      case "kick": {
        if (!host) return this.deny(peer);
        const target = this.members.get(message.memberId);
        if (!target || target.isHost) return;
        this.members.delete(target.id);
        this.charts.delete(target.id);
        const targetPeer = this.peerFor(target.id);
        targetPeer?.send({ type: "closed", reason: "The host removed you from the room." });
        targetPeer?.close();
        for (const [id, entry] of this.connections) {
          if (entry.memberId === target.id) this.connections.delete(id);
        }
        this.broadcastMembers();
        return;
      }
      case "close":
        if (!host) return this.deny(peer);
        this.close("The host closed the room.");
        return;
      default:
        this.sendError(peer, "That message means nothing here.");
    }
  }

  close(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    for (const connection of this.connections.values()) {
      connection.peer.send({ type: "closed", reason });
      connection.peer.close();
    }
    this.connections.clear();
    for (const member of this.members.values()) this.clearDisconnect(member);
    this.members.clear();
    this.onEmpty?.();
  }

  private hostPeer(): RoomPeer | null {
    return this.hostId ? this.peerFor(this.hostId) : null;
  }

  private peerFor(memberId: string): RoomPeer | null {
    for (const connection of this.connections.values()) {
      if (connection.memberId === memberId) return connection.peer;
    }
    return null;
  }

  private sendWelcome(peer: RoomPeer): void {
    const connection = this.connections.get(peer.id);
    const member = connection ? this.members.get(connection.memberId) : null;
    if (!member) return;
    peer.send({
      type: "welcome",
      protocol: PROTOCOL_VERSION,
      you: publicMember(member),
      code: this.code,
      members: this.publicMembers(),
      state: this.state,
      library: this.library,
      queue: this.queue,
      serverMs: this.now(),
    });
    const chart = this.charts.get(member.id);
    if (chart) {
      peer.send({ type: "chart", from: this.hostId ?? "host", chart, serverMs: this.now() });
    }
  }

  private publicMembers(): RoomMember[] {
    return [...this.members.values()].map(publicMember);
  }

  private broadcastMembers(): void {
    const members = this.publicMembers();
    this.broadcast({ type: "members", members, serverMs: this.now() });
  }

  private broadcast(message: RoomServerMessage, exceptConnectionId?: string): void {
    for (const [connectionId, connection] of this.connections) {
      if (connectionId === exceptConnectionId) continue;
      connection.peer.send(message);
    }
  }

  private sendError(peer: RoomPeer, message: string, fatal = false): void {
    peer.send({ type: "error", message, fatal, serverMs: this.now() });
  }

  private deny(peer: RoomPeer): void {
    this.sendError(peer, "Only the host can do that.", true);
  }
}

function publicMember(member: StoredMember): RoomMember {
  return {
    id: member.id,
    name: member.name.slice(0, MAX_NAME_CHARS),
    isHost: member.isHost,
    seat: member.seat,
    slot: member.slot,
    ready: member.ready,
    connected: member.connected,
  };
}

