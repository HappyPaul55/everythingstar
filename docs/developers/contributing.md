---
title: Contributing
description: "What is welcome and what is deliberately out of scope, and the short set of pages that take a change from an idea to a merged pull request."
updated: "2026-10-28"
order: 9
---

EverythingStar is a browser rhythm game with **three ways to play** — Instruments,
Typing and Vocals — and all three are built. The honest state of each is in
[What is built, and where it stops](status.md). It is a small AGPL project with one
maintainer, so the most useful contributions are focused ones — a chart format read
correctly, a playlist provider that works, an accessibility bug fixed, a rule made
testable.

Before a structural change, read [Architecture](architecture.md) and
[Gotchas](gotchas.md): the first is the map of the loop and the stage, the second is
what has already been broken once. [`AGENTS.md`](https://github.com/HappyPaul55/everythingstar/blob/main/AGENTS.md)
at the repository root is the short orientation for any change, and it links back here.

## What is welcome

- **A new chart source.** A format the game cannot read yet — another karaoke or
  rhythm-game format, a lyric sheet, a container. The readers are pure, and the
  real chart library is the test.
- **A playlist provider.** A library or an on-demand search service. It lives in its
  own project; [Playlist API](playlist-api.md) is the contract to build it against.
- **Accessibility.** Focus order, screen-reader announcements, reduced motion,
  contrast, touch targets. These are product requirements here, not polish.
- **Engine and stage work.** Highways and notes, typing, singing, the mixer, the
  jukebox.
- **Documentation.** If a sentence in the README or a page in this documentation has
  drifted from the code, that is a bug.

## What is out of scope

- **A server, an API, or a Worker.** This repository is static files only:
  `wrangler.jsonc` has no `main`, `run_worker_first` or bindings, and that is
  deliberate. Anything the game needs at runtime is fetched by the browser from a
  URL the player gave it. A provider is a **separate project**, reached through the
  Playlists feature — not a route here.
- **Accounts, analytics, trackers, cookies.** The game is local: the band, the
  settings and the scores stay in the player's browser.
- **A new runtime dependency** without a reason that survives review. The first
  download is measured, and `scripts/check-budget.ts` fails when it grows past its
  cap.
- **Songs and audio.** Nothing here ships a song. The built-in library is the
  separate [EverythingStar FOSS](https://github.com/HappyPaul55/everythingstar-foss)
  playlist, and `src/lib/game/mock/` is a **fixture generator** the tests read back —
  no product module imports it for behaviour.

## The contributor path

- [Setting up](contributing-setup.md) — Bun, the dev server and the gate.
- [House rules](contributing-code.md) — the conventions, a new chart source and a new
  screen.
- [Commits and pull requests](contributing-pulls.md) — the shape of a change,
  dependencies and reporting.
- [Releases](contributing-releases.md) — a checkpoint, not a build.
- [Testing](testing.md) — the gates and what only a browser can prove.
- [Writing docs](writing-docs.md) — this documentation's own rules.
