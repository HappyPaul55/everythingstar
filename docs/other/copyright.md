---
title: Copyright and takedown
description: "No music is hosted here: where the songs actually come from, what belongs to the game, and how to report work of yours that is being used without permission."
updated: "2026-10-28"
order: 3
---

EverythingStar plays songs it does not own, and it hosts none of them. This page
says what belongs to whom, and what to do when something here is yours and should
not be.

## No music is hosted here

This site is a set of static files: pages, scripts, fonts, artwork and the game's
own sounds. It holds no song, lyric sheet, chart or recording. A run's music is
fetched by the browser from a URL:

- **The built-in library** is the separate
  [EverythingStar FOSS](https://github.com/HappyPaul55/everythingstar-foss)
  repository. It holds the songs, their charts, stems and covers, and each song's
  original licence; the game reads its playlist and the documents the playlist
  names.
- **Any other playlist** belongs to the service that publishes it. The game
  requests it from that host, at the player's request; the host is shown in the
  Playlists dialog as an address is typed, and the requests appear in the
  browser's own network log.

The game publishes neither of them. A change here cannot remove something from a
host that serves it, and removing a playlist here cannot reach a copy somebody
else is serving.

## What belongs to the game

- **The code** is AGPL-3.0. The full text is `LICENSE` in the repository
  ([LICENSE](https://github.com/HappyPaul55/everythingstar/blob/main/LICENSE)),
  and the licence's own page is
  [gnu.org/licenses/agpl-3.0.html](https://www.gnu.org/licenses/agpl-3.0.html).
  The licence governs copying, changing and distributing it.
- **The artwork, the interface and the game's own sounds** are the author's,
  except where a third-party licence says otherwise. [Credits](credits.md) lists
  every sound with the credit its manifest records, and the fonts with theirs.
- **The EverythingStar FOSS library** is a separate project with its own
  repository and its own licences: its code, site and metadata are MIT, while its
  songs, lyrics, artwork and charts stay under the licence in each song's folder.
  It is a non-commercial library, and its own README asks that the songs are not
  sold or paywalled and that the source licence travels with a copy.
- **A song's files, wherever they are served**, belong to whoever published them,
  under the licence recorded beside them — each folder in that library keeps its
  source `license.txt`, and the library's `ATTRIBUTION.md` and
  `songs/licenses.json` are its audit.

## If something of yours is here without permission

Write through the contact details at
[happypaul55.com](https://www.happypaul55.com), and include:

- **The work** — what it is, and where it is yours: a recording, a lyric, a
  chart, a picture.
- **The URL** — the playlist, song document or game page where it appears, as
  exactly as you can give it. If it is a playlist you added yourself, say so; it
  is only in your browser.
- **How to reach you** — an address to reply to.
- **Who you are in relation to it** — that you hold the rights, or that you are
  authorised to act for the person who does.

A complete DMCA-style notice — identification of the work, identification of the
material complained of, your contact details, a good-faith statement, a statement
of accuracy under penalty of perjury, and a signature — is welcome, and it makes a
removal straightforward. It is **not required to start a conversation**: a short
message that says what is wrong is enough.

Nothing on this page is legal advice. There is no separate agent or takedown
service: the project has one maintainer, who reads what arrives, and a reply may
take a while.

## What can be done here

- **A song in the built-in library.** The songs live in the
  [FOSS repository](https://github.com/HappyPaul55/everythingstar-foss), so a
  removal there is the fix, and it reaches players the next time their library is
  read. The game's own seed is one URL in this repository, so the whole library
  can also be replaced or switched off as the seed without touching a song.
- **A file that is the game's own.** A sound, a font, a piece of artwork or the
  social card can be replaced or removed in this repository. A deploy reaches a
  player on a later visit; an installed copy or a downloaded song keeps what it
  has until it is refreshed.
- **The code itself.** A piece of code that infringes can be changed or removed,
  and the source stays published, as the licence requires.

## What cannot be done here

The game cannot remove a copy it does not serve. If your work is on somebody
else's playlist, the request goes to the host and to whoever publishes that
playlist. The same is true of a copy of the game that somebody self-hosts, and of
a song a player has already downloaded for offline play. This page can say what
this project will do; it cannot speak for anyone else's server.

## Contact

[happypaul55.com](https://www.happypaul55.com) — the same place for a correction,
a missing credit, or a removal.
