---
title: On a phone
description: "Playing EverythingStar on a phone: tapping the pads, portrait screens, installing it and keeping songs available offline."
updated: "2026-10-31"
order: 7
---

EverythingStar plays on a phone: the stage fits the screen, the hit markers become controls, and a song can be kept on the device. Nothing has to be installed to start.

[A lone guitar on a portrait phone: the score, combo and multiplier above the highway, and the pads along the bottom.](shot:phone-pads)

## The screen it makes

The game fills what the browser leaves. On `/play` the website's header sits above the stage and the footer below it, so the stage is on screen at rest and the page scrolls only to the footer; in fullscreen and the installed game, the stage is the whole screen.

The stage keeps its two regions whatever the shape: the **melody** — the words, or the piano roll with the words under it — across the top, and the **instrument panels** below it.

A **lone highway** — one player and nobody on the words — fills the stage, and on a portrait phone its rails move **above** the highway, with the score and meter in a compact row and the full width given to the notes. Two rails beside a 390-pixel stage took more than a third of the width from the notes.

A band with several players shares the width between their panels. If the stage says there is not enough room for this many players, remove one or turn the phone sideways.

The **band screen** on a phone is one box a row, four players, with no **Add more players** offer: eight full-width boxes would be a scroll past the whole band before Play. A band remembered with more, picked on a wide screen, is still drawn in full.

[The band screen: a character box per player with what they take, their level and controller gear, and Play below.](shot:band-screen)

Controls keep targets of at least 44 pixels, so a button is a button rather than a dot, and every control is reachable by focus as well as by touch.

## The pads are the controls

Tap the pad under a note as it lands, and the note plays. A tap counts as a fret and a strum at once, so hopos need no special thought, and two fingers on a chord only have to land within a moment of each other.

- The pad's **whole column** is its touch target, roughly a finger deep around the hit line.
- A tap at nothing is **not an error**; it is a hand finding the screen, and a late second tap does nothing.
- A note linked by a **slide** ribbon can be played without lifting: keep the finger down and glide to the target's pad. A glide across 800 ms at 120 BPM pays 10 points on top of the note; tapping the target instead plays it without them.
- The drums use the same highway, with the kick column a pad like the others.
- The pads are not in the tab order: a keyboard or gamepad remains the accessible route, and a machine-played seat has none.

Tapping is **Options → Tap the pads**, on by default. Turn it off and the pads are markers again; keys and a gamepad work either way. Typing wants a physical keyboard — the game never draws one — so instruments and singing are the phone's own ways to play.

## Pausing, and leaving a run

A phone has no Escape key, so while a song is playing a **Pause** chip sits in the stage's top corner beside Fullscreen. It opens the pause: resume, start again, practise a stretch, change the note speed or audio lag, or leave the stage. On a desktop the chip is not drawn — Escape and a pad's Start are the ways in.

[The Pause chip in a phone's stage corner, beside Fullscreen, while a guitar run is moving.](shot:stage-pause)

## Portrait and landscape

The stage re-measures when the phone turns: portrait gives the words and highway more height, and landscape gives a band more width, the better shape for three or four panels. Fullscreen does not lock orientation.

## Fullscreen and safe areas

The **Fullscreen** button is in the stage's corner where the browser allows it, and on a phone it is how you lose the browser's bars. An iPhone does not offer fullscreen to a web page; **Add to Home Screen** is how it loses the bars there.

In fullscreen or the installed game the page is drawn under the status bar and home indicator. The top and sides keep a gutter plus the phone's **safe-area inset**, so a lone player's score rail is not under the notch, and the progress bar and corner controls sit below the top inset. The bottom is the exception: the highway's deck runs to the edge under the home indicator rather than leaving a strip of backdrop for a system bar with nothing to press.

If a control feels close to an edge, fullscreen usually gives the room back.

## Install it to the home screen

Use **Options → Install the game**, or the browser's menu and **Install** / **Add to Home Screen**. **iPhone and iPad** have no prompt: use **Share → Add to Home Screen**. **Android and desktop Chromium** offer **Install** in Options too, and a browser that installs only from its menu says so there.

The installed game opens at its own address, as a game-only screen, and its shell is kept for offline use. Songs are separate.

## Offline

The shell — pages, scripts and styles — is cached when the game is installed or after a first visit on a secure address, so it opens without a connection. The **songs** need saving one at a time: choose one and press **Download** in the now-playing panel.

**Downloads** lists what is saved, the storage used of the browser's quota, and **Remove** and **Clear all downloads**; clearing everything asks for a second press. A downloaded song plays offline, seeking included; one that has not been downloaded needs a connection the first time. A download is one job for the page, so leaving the jukebox does not cancel it, and it can be cancelled from the panel or the manager. A full device writes nothing, and a playlist's save stops rather than failing every later song. YouTube-backed songs cannot be downloaded, and a local folder is already on the device. [Songs and playlists](songs.md#downloads) has the rules.

## Storage, and what can disappear

A phone's browser can clear site data when storage runs low, and private browsing clears it when the window closes. What lives here: the **settings**, **band**, **scores** and **first-run hints** (small, and the four a profile exports); the **playlists** and cached documents; **imported folders** (copies of up to 512 MB an import); and **downloaded songs**, the large ones.

The Downloads manager warns when the device has **not** promised to keep its storage, because a download can then be evicted. Before you travel, download what you want and check it is listed; remove downloads you no longer play; close finished imports, which deletes the copy but not your originals; and export a profile if settings, band and scores matter — it does not carry the library or downloads.

Clearing the browser's site data for this site removes all of it: settings, band, scores, imports and downloads.

## Screen and feedback

**Options → Keep screen awake** holds the display on while a run is moving and lets it go on a pause or the results. A browser without the screen wake lock, or one saving battery, lets the screen sleep; the installed Android app holds the display on in its own boot, so the setting is skipped there.

**Haptics** gives a short buzz on a miss and a stronger one when star power is spent. It is feedback only; nothing is judged by it. Most Android phones vibrate; iPhones do not vibrate from a web page.

## Sound on a phone

Check the phone's silent switch and media volume first: silent mode may mute the game while still playing a video. With the guide vocal on, headphones keep the song's own voice out of a singer's microphone.

[Troubleshooting](troubleshooting.md) has the rest.
