import { describe, expect, test } from "bun:test";
import { RoomCore, type RoomPeer } from "./roomCore";
import type { RoomServerMessage } from "./protocol";

function peer(id: string): RoomPeer & { messages: RoomServerMessage[] } {
  const messages: RoomServerMessage[] = [];
  return {
    id,
    messages,
    send: (message) => messages.push(message),
    close: () => {},
  };
}

function hello(name: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ type: "hello", protocol: 1, name, ...extra });
}

describe("room relay", () => {
  test("a host opens a room and a guest joins a seat", () => {
    const room = new RoomCore({ code: "ABC234", now: () => 1000 });
    const host = peer("conn-host");
    expect(room.join(host, hello("Host", { hostToken: "host-token-1" }))).toBe(true);
    expect(host.messages[0]?.type).toBe("welcome");

    const guest = peer("conn-guest");
    expect(
      room.join(guest, hello("Phone", { guestToken: "guest-token-1" })),
    ).toBe(true);
    const welcome = guest.messages.find((message) => message.type === "welcome");
    expect(welcome?.type).toBe("welcome");
    if (welcome?.type === "welcome") {
      expect(welcome.members.some((member) => member.isHost)).toBe(true);
      expect(welcome.members.some((member) => member.name === "Phone")).toBe(true);
    }

    room.message(guest, JSON.stringify({ type: "claim", seat: 1 }));
    room.message(
      guest,
      JSON.stringify({
        type: "slot",
        slot: { kind: "guitar", difficulty: "normal" },
      }),
    );
    room.message(guest, JSON.stringify({ type: "ready", ready: true }));
    const members = host.messages
      .filter((message) => message.type === "members")
      .at(-1);
    expect(members?.type).toBe("members");
    if (members?.type === "members") {
      const phone = members.members.find((member) => member.name === "Phone");
      expect(phone?.seat).toBe(1);
      expect(phone?.slot?.kind).toBe("guitar");
      expect(phone?.ready).toBe(true);
    }
  });

  test("the host's state is kept for a late guest", () => {
    const room = new RoomCore({ code: "ABC235", now: () => 1000 });
    const host = peer("host-a");
    room.join(host, hello("Host", { hostToken: "host-token-2" }));
    room.message(
      host,
      JSON.stringify({
        type: "state",
        state: {
          mode: "play",
          phase: "lobby",
          song: null,
          results: null,
          notice: "ready",
        },
      }),
    );
    const guest = peer("guest-b");
    room.join(guest, hello("Late", { guestToken: "guest-token-2" }));
    const welcome = guest.messages.find((message) => message.type === "welcome");
    if (welcome?.type === "welcome") {
      expect(welcome.state?.notice).toBe("ready");
    } else {
      throw new Error("no welcome");
    }
  });

  test("a chart request and a report go only to the host", () => {
    const room = new RoomCore({ code: "ABC236", now: () => 1000 });
    const host = peer("host-c");
    const guest = peer("guest-c");
    room.join(host, hello("Host", { hostToken: "host-token-3" }));
    room.join(guest, hello("Phone", { guestToken: "guest-token-3" }));
    room.message(guest, JSON.stringify({ type: "needsChart" }));
    expect(host.messages.some((message) => message.type === "chartRequest")).toBe(true);
    expect(guest.messages.some((message) => message.type === "chartRequest")).toBe(false);

    room.message(
      guest,
      JSON.stringify({
        type: "report",
        entry: {
          key: "lane-guest",
          label: "Phone",
          kind: "guitar",
          seat: 1,
          difficulty: "normal",
          score: 10,
          baseScore: 10,
          total: 1,
          combo: 1,
          bestCombo: 1,
          hits: 1,
          misses: 0,
          judged: 1,
        },
      }),
    );
    expect(host.messages.some((message) => message.type === "report")).toBe(true);
  });

  test("a guest cannot send the host's state", () => {
    const room = new RoomCore({ code: "ABC237", now: () => 1000 });
    const host = peer("host-d");
    const guest = peer("guest-d");
    room.join(host, hello("Host", { hostToken: "host-token-4" }));
    room.join(guest, hello("Phone", { guestToken: "guest-token-4" }));
    room.message(
      guest,
      JSON.stringify({
        type: "state",
        state: { mode: "play", phase: "lobby", song: null, results: null, notice: null },
      }),
    );
    expect(
      guest.messages.some((message) => message.type === "error" && message.fatal === true),
    ).toBe(true);
  });

  test("a ping answers with the relay's two timestamps", () => {
    const room = new RoomCore({ code: "ABC238", now: () => 5000 });
    const host = peer("host-e");
    room.join(host, hello("Host", { hostToken: "host-token-5" }));
    room.message(host, JSON.stringify({ type: "ping", id: 7, t0: 100 }));
    const pong = host.messages.find((message) => message.type === "pong");
    expect(pong).toEqual({ type: "pong", id: 7, t0: 100, t1: 5000, t2: 5000 });
  });
});
