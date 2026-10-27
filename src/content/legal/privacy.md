---
title: Privacy Policy
description: "How EverythingStar handles what it keeps: no accounts, no analytics, no advertising, and your settings, band and scores stay in this browser."
updated: "2026-10-27"
---

EverythingStar is a free browser game. You can play it without signing in, and
there is no newsletter and no advertising. This notice explains what the game
keeps, what it sends, and why.

## Who is responsible

EverythingStar is published by **HappyPaul55**, who is the data controller for
anything described below. You can contact the controller through
[happypaul55.com](https://www.happypaul55.com).

## Playing without an account

You do not need an account to play, and there are no accounts at all:

- We do not ask for, store or share any personal information.
- We set no cookies of our own and use no analytics, trackers or advertising
  pixels.
- There is no server-side storage of your game or scores, and there is no API in
  this site: it is a set of static files.
- Everything the game remembers about you is kept by your browser, on your
  device, as described below.

## What is kept in your browser

The game keeps five small records in your browser's local storage:

- **`everythingstar:settings`** — how the game behaves: the audio and picture
  lag, the master volume, the note speed and view, whether a song's own backdrop
  plays, how far it is dimmed, whether the drifting lights are drawn, and
  whether the hit markers are controls.
- **`everythingstar:band`** — who is on stage: each seat's instrument or words
  role, its difficulty, whether a words player sings or types, and any
  controller mapping that seat has learned (including a MIDI note map).
- **`everythingstar:onboarding`** — which player seats have already seen the
  first-run key labels on the highway, so a returning player is not taught the
  same keys again while a new player still is.
- **`everythingstar:scores:v2`** — up to 50 finished runs, each saved against its
  song and lineup with its score, best combo, hits, misses, the players' lines,
  the star rating and when it was played.
- **`everythingstar.offline.v1`** — which songs you downloaded for offline play,
  their size and when they were saved, so the Downloads manager can list and
  remove them.

The **library** is kept in IndexedDB, in a database named `everythingstar` with
four stores:

- **`sources`** — the playlist URLs you have added, the song documents you added
  from a link, and playlists you have switched off.
- **`cache`** — copies of the playlist, song and chart documents the game has
  fetched, plus the game's own sound manifest. It is a cache with a size cap:
  old songs and charts are dropped first.
- **`cache-meta`** — one small index record for each document in `cache`: its
  key, URL, kind, when it was stored and how large it is. The game reads this
  to decide what to drop, rather than opening every cached file; it never holds
  a document's contents.
- **`folders`** — folders you have opened from this machine: the browser's own
  folder handle, the songs read from it, and the file names each song was read
  with; and the records of files you have imported (their names, the songs read
  from them, and where the copy lives in this browser's storage — the copy itself
  is in the Origin Private File System, not in this store).

The game also keeps two **Cache Storage** buckets, which is where the installed
game and its downloaded songs live:

- **`everythingstar-offline-v1`** — the songs you choose to **Download**: their
  documents, charts, audio, artwork and preview clip. Nothing is downloaded
  unless you press Download, and removing a song (or **Clear all downloads**)
  deletes its files.
- **`everythingstar-shell-…`** — the installed game's own shell: its pages,
  scripts, fonts, icons, artwork and sounds, so it opens with no connection. It
  holds no personal data and no songs.

These caches survive a reload and a later visit. Clearing this site's data
removes all of them, along with the records above. A browser may evict a site's
storage when the device is short of space; the game asks the browser to keep
this origin when you download a song, but that is a request, not a guarantee. On
iOS, a site that has not been opened for seven days may have its storage cleared
by the system.

## Installing and offline play

The game can be **installed** as a web app from the browser's own menu (on
iPhone or iPad: Share → Add to Home Screen), or played in a browser tab.
Installing is optional and changes nothing about what is sent. An installed game
keeps its own shell on the device, so it opens with no connection; the songs it
plays are still fetched from their hosts unless you download them.

A downloaded song is a copy on this device. It is never uploaded, and it belongs
to the browser profile the game runs in. The native Android app keeps its own
copy under its own storage.

## Local files

You can open a folder of charts from this machine instead of using a playlist.
The browser asks you to choose the folder and gives the page read access to it;
the game reads the charts, art and audio it finds, and does not upload or copy
them. The folder is remembered so its songs are listed next time, but a reload
takes the browser's permission away: the songs appear with the folder locked
until you press **Reconnect**, and the browser may ask you to allow access again.
Removing the folder is always your choice.

You can also **import** files or a folder instead of opening one where it lies. The
game **copies those files into this browser's storage** — the browser's Origin Private
File System — so they are readable again without asking for a folder. One import may
copy up to **512 MB**, and the game keeps **16 MB** of the origin's storage free rather
than filling it. The files are not uploaded anywhere. Removing the import deletes the
copy, and a copy that fails is deleted immediately; clearing this site's data removes
every imported copy.

## What leaves your device

The game is static files, but it does fetch what it plays:

- **This site** (`everythingstar.happypaul55.com`, served by Cloudflare) — the
  pages, scripts, self-hosted fonts, artwork, the sound manifest and the game's
  own sounds. The fonts are served from this site, not from Google Fonts.
- **The built-in library** — the EverythingStar FOSS playlist and the song,
  chart and art files it names are fetched from `raw.githubusercontent.com`.
- **Playlists you add** — the playlist URL, and the song documents, charts,
  artwork and audio it names, are requested from the host that serves them. If
  you paste a playlist from another site, that site sees those requests.
- **On-demand playlists** — if a playlist is a search endpoint, the search text
  you enter is sent to that playlist's host in the request's query string. Its
  results are kept for that visit only.
- **YouTube** — a song can use a YouTube video as its music and backdrop. Only
  then does the page load the YouTube IFrame Player API script and embed the
  video from `youtube.com` (see below).

Nothing else leaves the device. We do not send your scores, band, settings,
microphone audio, MIDI messages, or files from a local folder anywhere.

## What the host sees

The site is served as static files by **Cloudflare**. There is no Worker script,
no API and no application database in this project. Like any web host,
Cloudflare necessarily receives the technical details of each request — such as
your IP address, the URL requested, the time, and headers such as your browser's
user agent — and handles them under
[Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/). We do
not receive or store game or score data from those requests.

## The microphone (singing, karaoke)

Singing is built and optional. Permission is asked when you choose **Vocals** for
a player on the band screen, or at **Play** if a remembered band already has a
singer — not when the page loads. The microphone is opened when a run with a
singer starts playing.

The audio is analysed in your browser, frame by frame, by the game's own pitch
detector. The samples are used for that analysis and then dropped: they are
**never recorded, stored or sent anywhere**. What the game keeps is the recent
pitch it heard, in memory, so a note can be judged on how much of it was held in
tune; the resulting score is saved locally with the run. The stream stays open
until the band no longer has a singer (choosing **Type** closes it) or until you
leave the page, and your browser shows its own microphone indicator while it is
open. Pausing stops the analysis but does not close the stream. If you decline,
the run is still playable: the singers are played by the game and the score rail
says so.

## MIDI (keyboards and drum kits)

MIDI is optional. The browser is asked for MIDI access when you choose **MIDI** in
a player's controller settings, or when you start setting one up — not when the
page loads. The browser shows its own permission prompt and lists the input it
will share.

While you play, the page reads note-on and note-off messages from the connected
input so the notes can be judged; clock, aftertouch and other messages are
ignored, and no MIDI output is opened. **Nothing is recorded, stored or sent
anywhere** — the messages are used to play and then dropped. The access is let go
when you leave the page. If you decline, the run is still playable: the seat
falls back to the controller it had, and choosing a keyboard or a gamepad
instead works exactly as before.

## Music and video

Some songs may be played from **YouTube**, which supplies the music and visuals.
When a song is played that way, the page loads the YouTube IFrame Player API
from `youtube.com` and embeds the video, so YouTube (Google) may set cookies and
see your IP address and the standard technical details of the request, under its
own privacy policy. No YouTube script is loaded to browse the rest of the site
or to play a song that does not use YouTube.

## Third parties

- **Cloudflare** serves the static site (as above).
- **GitHub** serves the built-in EverythingStar FOSS library from
  `raw.githubusercontent.com`.
- **The host of any playlist you add** serves its documents, artwork and audio,
  and answers searches if it is an on-demand playlist.
- **YouTube** may supply the music and visuals for a song (as above).

## Your choices

- **Local data** — clearing this site's storage removes your settings, band,
  scores, cached playlists and documents, downloaded songs, the installed game's
  shell and remembered folders; the game then starts fresh and asks for a folder
  again.
- **Microphone** — you can decline the browser's prompt, or choose **Type**
  instead of **Vocals**; either way the run is playable.
- **MIDI** — you can decline the browser's prompt, or choose **Keyboard**, a
  gamepad or **The machine** instead; the seat keeps what it had and the run is
  playable.
- **Playlists and folders** — you can switch a playlist off, remove it, or
  remove a folder at any time.
- **Contact** — for anything else, reach the controller through
  [happypaul55.com](https://www.happypaul55.com).

## Changes

If this notice changes, the "last updated" date at the top of this page will
change with it.
