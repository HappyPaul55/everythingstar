# EverythingStar

**Three ways to play on one stage, in your browser.** Instruments (guitar, bass, keys
and drums as falling notes), Typing (the words on a keyboard) and Vocals (karaoke into a
microphone) — the same song, one stage. Play with a keyboard, a gamepad, a MIDI kit or a
microphone, or tap the notes on a phone.

[![Licence: AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-yellow)](./LICENSE)
![Astro 7 + React 19](https://img.shields.io/badge/Astro%207%20%2B%20React%2019-static%20site-ff5d01)
[![CI](https://github.com/HappyPaul55/everythingstar/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/HappyPaul55/everythingstar/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/HappyPaul55/everythingstar?label=release&color=yellow)](https://github.com/HappyPaul55/everythingstar/releases)

**[Play it at everythingstar.happypaul55.com](https://everythingstar.happypaul55.com)** —
free, no account, no cookies, no trackers, nothing to install. Install it from the
browser's menu if you would rather have it on your home screen, with its own icon and
offline play.

![The stage: a guitar highway on a graffiti-arcade backdrop.](docs/screenshots/desktop-guitar.webp)

## What it is

- **The whole loop, in one island.** Welcome → menu → jukebox → band → stage entrance →
  run → pause → results, with no page reloads and one fullscreen session across it.
- **Three ways to play, judged per player.** Falling-note highways with chords, hopos,
  sustains, star power and drum fills; Typing with TypeStar's forgiving rules; Vocals
  judged on how much of each note's own span was held in tune.
- **Songs are fetched, not bundled.** The built-in library is the separate
  [EverythingStar FOSS](https://github.com/HappyPaul55/everythingstar-foss) playlist;
  any `http(s)` playlist can be added, a playlist can answer a search instead of listing
  songs, and a folder of charts can be opened or imported into the browser. Guitar Hero
  / YARG MIDI, Clone Hero `.chart`, UltraStar, StepMania, `.sng` packages and timed
  lyrics all read through the same parsers.
- **Real controllers.** Keyboard bound by key code, gamepad, MIDI keyboard or kit,
  microphone, and hit markers that are controls so a phone can play. A mapping can be
  learned control by control, which is the only way a plastic guitar or a non-standard
  kit gets set up.
- **It runs on static files.** No server, no API, no accounts, no analytics. The band,
  the settings and the scores stay in the browser; a song's audio is streamed from
  wherever its playlist says it is.

| | |
| --- | --- |
| ![Karaoke: a piano roll with the words sliding under its notes.](docs/screenshots/desktop-vocals.webp) | ![The jukebox: an A–Z index, the song list and the now-playing panel.](docs/screenshots/desktop-jukebox.webp) |
| **Vocals.** A piano roll with the words under its notes, judged on the pitch held across each note. | **The jukebox.** A list you navigate: A–Z index, search, duration and what each song offers. |
| ![The band screen: one character box per player.](docs/screenshots/desktop-band-screen.webp) | ![A phone playing a guitar highway, the score above it.](docs/screenshots/mobile-guitar.webp) |
| **The band.** One box per player: what they take, how hard, and the controller in their hands. | **On a phone.** The pads are the controls; a lone highway takes the whole width. |

## Documentation

The documentation is written once as Markdown in [`docs/`](docs/README.md) and read by
GitHub and by the site. Four audiences:

| Section | Read it on the site | Start with |
| --- | --- | --- |
| **Players** | <https://everythingstar.happypaul55.com/docs/players/getting-started> | songs, instruments, typing, singing, controllers, phones, practice, options |
| **Charters** | <https://everythingstar.happypaul55.com/docs/charters/what-a-chart-is> | the track format, chart formats, folder layout, audio stems, libraries, publishing |
| **Developers** | <https://everythingstar.happypaul55.com/docs/developers/architecture> | architecture, project map, gotchas, audio, playlist API, testing, deployment, contributing |
| **Other** | <https://everythingstar.happypaul55.com/privacy> | privacy, terms, copyright and takedown, credits, accessibility |

The full state of the game — what is built, what is deliberately out of scope and what a
next version would take on — is [What is built, and where it stops](docs/developers/status.md).
It is honest about the boundaries: there is no leaderboard and no server, the band, the
settings and the scores are this browser's, and a phone as a controller is a separate
networked project.

## Quick start

Use **[Bun](https://bun.sh)** for everything — `bun` and `bunx`, never `npm` or `npx`.

```bash
bun install
bun run dev              # http://localhost:4321 — the game is /play
bun run verify           # lint, knip, types, tests, build, PWA, budget
bun run test:e2e         # browser tests (starts its own dev server)
```

The commands, the gates and the house rules are in
[Setting up](docs/developers/contributing-setup.md); the browser suite's own rule and
inventory are in [`tests/e2e/README.md`](tests/e2e/README.md).

## Notes

- **Links into the game.** `https://everythingstar.happypaul55.com/open?playlist=<url>`
  and `?song=<url>` are confirmed in a dialog; an Android App Link or
  `everythingstar://` opens the native app instead. The contract is
  [Links into the game](docs/developers/deeplinks.md).
- **Hosting a library.** Serve three documents from a static host with CORS; the wire
  contract is [Playlist API](docs/developers/playlist-api.md), and
  `bun run playlist:check <url>` holds a document to the game's own reader.
- **The social card** is generated from `scripts/og-card.html` with `bun run cards`.

## Contributing and security

Contributions are welcome: a chart format read correctly, a playlist provider, an
accessibility bug, a rule made testable. Start at
[Contributing](docs/developers/contributing.md), and read
[Architecture](docs/developers/architecture.md) and [Gotchas](docs/developers/gotchas.md)
before a structural change.

**Do not open a public issue for a vulnerability.** [SECURITY.md](SECURITY.md) says how
to report one privately.

## Licence

EverythingStar's code is [AGPL-3.0-only](LICENSE). The songs it plays are not shipped
here: the built-in library is a separate repository, and any other playlist belongs to
whoever publishes it. Fonts, sounds and other third-party work are credited in
[Credits](docs/other/credits.md).
