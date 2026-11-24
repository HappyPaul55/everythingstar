---
title: Networking
description: "The room relay and the host-led stage: what the server owns, what the host owns, how charts and clocks travel, and how to run the service yourself."
updated: "2026-11-24"
order: 22
---

EverythingStar's site is still static files. **Play together** adds one optional service: a **room relay** that carries membership, seats, the host's snapshot, each seat's chart, the playhead and the scores. It carries **no audio**, and it never judges a note.

The invite link is `/join?room=CODE`; the host's room is a page in the game island, and the relay is a separate deployable.

## The split

- **Host device** — a browser. It owns the library, the song's audio, the charts, the band, the clock and the results. Its speakers are the room's sound.
- **Room relay** — `server/bun.ts` or `server/worker.ts` around `src/lib/net/roomCore.ts`. It owns the room code, membership, seat claims, the latest host snapshot, the latest per-seat chart and the queue. It does not fetch or parse a song.
- **Guest device** — `/join`. It receives one seat's chart, the host's playhead and the room's queue. It renders the same highway or words the host would, judges them locally, and reports its numbers.

The relay's protocol is `src/lib/net/protocol.ts` (version 1). The wire is JSON over one WebSocket per device. The host is authoritative for the room's state; the relay stores the latest state so a guest who reloads can rejoin.

## Why charts, not songs

A guest does not need the host's library. `useSongTrack` already assembles the charts for the band; the host serialises the `LaneChart` or `MelodyChart` for each seat and sends it directed at that member. Any song works — a playlist, a local folder, an OPFS import, a download, a `.sng` package or a YouTube-backed song — because the guest never sees the source.

- Only the seat's chart is sent: a lane chart or the melody with its words.
- A lane chart is validated with `chartProblems` on arrival; the melody is the host's own parsed, bounded track.
- A new song or part asks for the notes again; the relay keeps the last chart per member in memory for a reconnect.
- The guest has **no `SongAudio`**. Its `StageClock` follows a `RoomClock`: the host's `playhead` message, extrapolated with the server clock, minus the guest's own room sync (`audioLagMs`). The pause/resume correction uses `StageClock.syncTo`, which does **not** bump the deliberate-seek serial, so a room correction never wipes a run's combo.

## Sound is local

A guest's mixer plays cues only. The host's `SongAudio` plays the song. The host does not render a remote player's highway or play their miss/hero cues; their own phone does. The host does duck the guest's part on its own speakers from the guest's reported misses, so the room's mix still responds.

The `cheer` cue was added for a run's first ×4 streak. It is a local cue like `miss`, `error`, `sparkle` and `meter_activate`.

## Running it

Development runs two processes:

```bash
bun run dev          # Astro on :4321
bun run dev:rooms    # room relay on :8788
```

`src/lib/net/endpoint.ts` uses `ws://localhost:8788/api/room` in dev and the page's own origin in a build.

The self-hosted server serves the built site and the room endpoint on one origin:

```bash
bun run build
bun run serve        # http://localhost:8788; also serves dist/
```

Environment: `PORT` (default `8788`), `HOST` (default `0.0.0.0`), `ALLOWED_ORIGINS` (comma-separated extra origins). A LAN party needs the host's LAN address, and **HTTPS** for phone microphones: serve the Bun process behind a TLS reverse proxy (Caddy, nginx) or use the public HTTPS site.

The public site's relay is a separate Cloudflare Worker + Durable Object:

```bash
bunx wrangler deploy --config wrangler.rooms.jsonc
```

`wrangler.rooms.jsonc` binds one `RoomDurableObject` per six-character code and routes `/api/*` on the site's zone to it. The site's own `wrangler.jsonc` stays static. If you prefer a second hostname, point the client at it with `?rooms=wss://…/api/room` on a page; the endpoint is otherwise derived from the page.

## Trust and limits

- No accounts, no cookies and no analytics. A room is ephemeral; the relay stores nothing after it closes.
- The relay sees IPs, display names, seats, scores, chart data, library titles and the small pitch samples a singer sends. It never sees or carries audio.
- Scores are **reported by the device that judged them**. The host validates the shape and bounds; this is a friendly room, not a ranked ladder.
- A guest can only claim a free seat and edit its own slot. The host alone edits the room state, sends charts, kicks members and closes the room.
- Messages are capped at 3 MB, names at 24 characters, rooms at 12 members and 8 seats. Unknown or malformed frames are dropped.

## What is not here

No remote play across the internet: host-only audio means the players must hear the host's speakers. No accounts, global leaderboard, chat, voice chat, spectator mode, host migration or local-folder uploads. A guest's own local folder is not sent; the host's library is the room's library.
