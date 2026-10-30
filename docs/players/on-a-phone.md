---
title: On a phone
description: "Playing EverythingStar on a phone: tapping the pads, portrait screens, installing it and keeping songs available offline."
updated: "2026-10-30"
order: 7
---

EverythingStar plays on a phone. The same stage fits the screen, the hit markers become the controls, and a song can be kept on the device so it plays without a connection. Nothing has to be installed to start.

[A lone guitar on a portrait phone: the score, combo and multiplier above the highway, and the five pads along the bottom.](shot:phone-pads)

## The screen it makes

The game fills what the browser leaves. On `/play` the website's header sits above the stage and the footer below it, so the whole stage is on screen at rest and the page scrolls only to the footer. In fullscreen, and in the installed game, the stage is the whole screen.

The stage keeps its two regions whatever the shape:

- the **melody** — the words, or the piano roll with the words under it — across the top;
- the **instrument panels** below it.

A **lone highway** — one player and nobody on the words — fills the stage, and on a portrait phone its rails move **above** the highway, with the score and meter in a compact row and the full width given to the notes. Two rails beside a 390-pixel stage took more than a third of its width from the notes; this is the one layout where the highway needs the width more than the rails need the height.

A band with several players shares the width between their panels. If the stage says there is not enough room for this many players, remove one or turn the phone sideways.

The **band screen** on a phone is one box a row, four players, with no **Add more players** offer — eight full-width boxes would be a scroll past the whole band before Play. A band remembered with more, picked on a wide screen, is still drawn in full.

Controls keep targets of at least 44 pixels, so a button is a button rather than a dot, and every control is reachable by focus as well as by touch.

## The pads are the controls

Tap the pad under a note as it lands, and the note plays. A tap counts as a fret and a strum at once, so hopos need no special thought, and two fingers on a chord only have to land within a moment of each other.

- The pad's **whole column** is its touch target, in a band roughly a finger deep around the hit line, so a finger does not have to be precise.
- A tap at nothing is **not an error**; it is a hand finding the screen. A late second tap simply does nothing.
- The drums use the same highway: the kick column is a pad like the others.
- The pads are not in the tab order; a keyboard or gamepad remains the accessible route, and a seat played by the machine has no pads to press.

Tapping is a setting — **Options → Tap the pads**, on by default. Turn it off and the pads go back to being markers; keys and a gamepad work either way.

Typing wants a physical keyboard: the game never draws one. Instruments and singing are the phone's own ways to play.

## Portrait and landscape

The stage re-measures when the phone turns. Portrait gives the words and the highway more height; landscape gives a band more width, which is the better shape for three or four instrument panels.

Fullscreen does not lock the orientation. Turn the phone and the stage follows.

## Fullscreen and safe areas

The **Fullscreen** button is in the stage's corner where the browser allows it. On a phone it is the way to get rid of the browser's bars and the address bar, which is most of the difference between a game and a page. An iPhone does not offer fullscreen to a web page; **Add to Home Screen** is how it loses the bars there.

In fullscreen or in the installed game, the page is drawn under the status bar and the home indicator. The stage accounts for them:

- the top and sides keep a gutter plus the phone's **safe-area inset**, so a lone player's score rail is not under the notch;
- the progress bar and the stage's corner controls sit below the top inset;
- the bottom is the exception: the lowest thing is the highway's deck, so it runs to the edge under the home indicator rather than leaving a strip of backdrop below the notes for a system bar with nothing to press.

If a control feels close to an edge, fullscreen usually gives it the room back.

## Install it to the home screen

Use **Options → Install the game**, or the browser's own menu and **Install** / **Add to Home Screen**.

- **iPhone and iPad:** the browser has no install prompt. Use **Share → Add to Home Screen**; the game then opens without the browser's bars.
- **Android and desktop Chromium:** the Options row offers **Install**, and the browser's menu does the same.
- A browser that installs only from its menu says so in Options.

The installed game opens at its own address, as a game-only screen, and its shell is kept for offline use. Songs are separate: see below.

## Offline

The game's shell — its pages, scripts and styles — is cached when it is installed or after a first visit on a secure address, so it opens without a connection. The **songs** need saving one at a time.

- Choose a song in the jukebox and press **Download** in the now-playing panel.
- The **Downloads** manager lists what is saved, the storage used of the browser's quota, and **Remove** and **Clear all downloads**. Clearing everything asks for a second press.
- A downloaded song plays with no connection, seeking included.
- A download is one job for the page: leaving the jukebox does not cancel it, and it can be cancelled from the panel or the manager.
- If the device fills, the download says so and writes nothing; a whole playlist's save stops rather than failing every later song.
- YouTube-backed songs cannot be downloaded, and a song in a local folder is already on the device.

A song that has not been downloaded needs a connection the first time you play it, even when the shell is already offline. [Songs and playlists](songs.md#downloads) has the download rules in full.

## Storage, and what can disappear

A phone's browser can clear site data when storage runs low, and private browsing clears it when the window closes. The records and files that live here are:

- the **settings**, **band**, **scores** and **first-run hints** — small, and the four a profile can export;
- the **playlists** and the cached song and chart documents;
- **imported folders**, which are copies in the browser's own storage (up to 512 MB an import);
- **downloaded songs**, which are the large ones.

The Downloads manager warns when the device has **not** promised to keep its storage, because in that state a download can be evicted when space runs low. To make the most of a small phone:

- download the songs you want before you travel, and check they are listed;
- remove downloads you no longer play with **Remove** or **Clear all downloads**;
- close an imported folder you have finished with, which deletes the copy — your original files are untouched;
- export a profile if the settings, band and scores matter; it does not carry the library or downloads.

Clearing the browser's site data for this site removes all of it: settings, band, scores, imports and downloads.

## Keeping the screen on

A song is longer than a phone's default sleep. **Options → Keep screen awake** holds the display on while a run is moving and lets it go on a pause or the results. A browser without the screen wake lock, or one saving battery, simply lets the screen sleep as it always did.

The installed Android app's own boot keeps the display awake during a run, so the setting is skipped there.

## Haptics

If **Haptics** is on, a miss gives a short buzz and spending star power a stronger one. It is feedback only; nothing is judged by it.

Most Android phones vibrate. iPhones do not vibrate from a web page, so the setting is silent there. Turn it off if the buzz is distracting.

## Sound on a phone

Check the phone's silent switch and media volume first. A phone in silent mode may mute the game's sound while still playing a video, which reads as a game with no sound at all. Headphones help a singer, too: with the guide vocal on they keep the song's own voice out of the microphone.

[Troubleshooting](troubleshooting.md) has the rest.
