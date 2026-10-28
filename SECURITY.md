# Security policy

EverythingStar is a **static site**: the browser downloads files, and everything
after that happens in the tab. There is no server, no API, no database, no account,
no cookie, no analytics and no secret in this repository. A run's band, settings and
scores are kept in the player's own browser storage; playlist documents and audio
are fetched from URLs the player chose.

That removes most of the usual attack surface, and leaves a small one worth
reporting carefully.

## Supported versions

The latest `v*` release and `main` are supported. The deployed site follows `main`,
so a fix lands there; an older tag records what shipped and is not patched. A
security fix is made on `main`, published in the next tag, and named in its release
notes.

## Reporting a vulnerability

**Do not open a public issue.**

- If this repository offers **Report a vulnerability** under its **Security** tab,
  use that private advisory — it keeps the report, the discussion and the fix in one
  place.
- Otherwise, contact the maintainer through **<https://www.happypaul55.com>** and say
  it is a security report for EverythingStar. Please include what you did, what
  happened, the browser and OS, and a minimal reproduction (a playlist or chart
  document that triggers it is ideal).

This is a hobby project with one maintainer: expect an acknowledgement within about a
week, not an incident team. A confirmed issue is fixed on `main` and noted in the
commit; credit is given if you want it.

## In scope

The parts that handle somebody else's data:

- **The URL policy** (`src/lib/game/url.ts`, enforced again in
  `src/components/game/library/store.ts`): a way to make the browser fetch something
  that is not an absolute `http(s)` URL with a host — including through a redirect —
  or to get around the document (8 MB) and package (128 MB) ceilings or the idle
  timeout.
- **Untrusted documents.** A playlist, song, chart, `.sng` package, `song.ini` or
  lyric sheet is somebody else's file. Script injection, a path traversal, an
  unbounded allocation or a crash reachable from one of them is in scope. The readers
  are in `src/lib/game/sources/` and `src/lib/game/playlist.ts` / `source.ts`.
- **The shipped headers and policy** (`public/_headers`): a CSP or permissions
  regression that lets a third party run script, frame the game, or reach a device.
- **A device permission asked for without a gesture** — microphone or MIDI. The rules
  are that `requestPermission`/`requestMIDIAccess` only run from a press.
- **A dependency** with a known vulnerability and a path that is actually reachable
  from this code. Say which path; an advisory alone is not actionable here.

## Out of scope

- **The content of a playlist you added.** A provider's songs, charts, audio, art and
  claims are the provider's. Reporting a bad provider to its own project is the right
  move.
- **Browser policy.** Autoplay refusals, fullscreen rules, mixed-content blocking of
  an `http:` playlist on the https page, and a microphone that a browser will not
  grant are documented behaviour, not vulnerabilities.
- **Local scores and settings.** The board in your browser is editable by design and
  is not a leaderboard. Editing it affects only you.
- **A provider being slow, down, or missing CORS headers.** That is the provider's
  service, and the game reports it in the Playlists dialog.
- **Automated scanner output with no reachable path.** A dependency version, a
  missing header that the shipped policy already sets, or a `SameSite` cookie report
  on a site with no cookies.

## What we will not do

We will not add a server to fix a security report. If a fix needs a service, it
belongs in a separate project reached through the Playlists feature — the client
stays static files and a browser.
