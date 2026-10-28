---
title: Getting started
description: "What EverythingStar is, how to open it, and how a visit goes: choose a song, build a band and play. No account and nothing to install."
updated: "2026-10-28"
order: 1
---

EverythingStar is a rhythm game that runs in a browser. One song plays on one stage, and the people on that stage can play it three ways: **Instruments** (guitar, bass, keys and drums), **Typing** (the words on a keyboard) and **Vocals** (karaoke into a microphone). A band can mix all three, and everybody is judged on their own part.

There is no account, no download required and no cost. Open the game, pick a song, say who is playing, and play.

## What you need

- A modern browser on a computer, tablet or phone. A desktop browser is the best place for a band with several players; a phone plays the instruments by tapping the pads and can sing into its microphone — see [On a phone](on-a-phone.md).
- Sound. The song is the clock, so the game is played against what you hear.
- A keyboard for instruments and typing. A gamepad, a MIDI keyboard or an electronic drum kit and a microphone are optional; each is set up per player. [Band and controllers](band-and-controllers.md) covers all of them.
- A connection the first time you play a song. Songs are fetched from playlists and streamed; after that, a song can be saved for offline play.

## Open the game

Go to **https://everythingstar.happypaul55.com/play** and press **Enter the stage**.

That first press does two things. It asks the browser for the whole screen, which is how the game is meant to be played, and it unlocks the game's audio — browsers do not let a page make a sound before somebody touches it. If the browser refuses the full screen, the game still opens in the page and the **Fullscreen** button in the stage's corner is the way to try again.

The welcome's button reads **Loading…** for a moment on a first visit while the game prepares its sounds. That is the only wait before the menu.

## The loop

Every visit follows the same path, and no step reloads the page:

**welcome → menu → songs → band → entrance → run → results**

- **Welcome** is the name and one button, **Enter the stage**.
- **Menu** is three doors: **Quick Play** (the jukebox), **Options** and **Credits**. Escape, or a gamepad's B, goes back a step from any screen that has one.
- **Songs** is the jukebox. It lists the library under its letters, with a search, a now-playing panel and a preview of whatever row you are on. [Songs and playlists](songs.md) covers it.
- **Band** is who is playing: a box per player with what they take and how hard. Four boxes to begin with, and an empty band can choose **Listen** instead. [Instruments](instruments.md), [Typing](typing.md) and [Singing](singing.md) explain the three ways to play.
- **The entrance** is the stage arriving: the room first, then the highways rising and the words dropping into place while the band's own sound plays. There is no 3-2-1 count. The song starts when it can play through.
- **The run** is the song, and **Pause** (<kbd>Escape</kbd>, or Start on a gamepad) opens resume, restart, practice and leave. A pause is scrimmed over the stage rather than replacing it.
- **Results** gives the band score and a card per player, then the song's history on this browser. **Play again** starts the same song with the same band.

## The menu's other two doors

**Options** holds the things that belong to this browser rather than to a song: how far the sound and the picture lag, the volume and its three families, how the notes are drawn, haptics and the screen wake lock, installation and your profile. Every setting is explained in [Options](options.md).

**Credits** says what the game is made of and by whom. The music and the sound cues are read from the game's own sound manifest, so a file's credit is the credit the game shows.

## Fullscreen

The **Fullscreen** button sits in the stage's corner, with the developer panel if that has been turned on. Pressing it gives the game the whole screen and stands the website's header and footer aside.

Escape leaves fullscreen. In a run, the browser keeps that Escape to itself, so the game treats leaving fullscreen as a pause rather than carrying on behind a window you cannot see properly.

## Install it, if you want to

EverythingStar does not need installing. If you would like it to open like an app, with no browser bars, choose **Options → Install the game**, or use the browser's own menu and look for **Install** or **Add to Home Screen**.

- On iPhone and iPad the browser has no install prompt; use **Share → Add to Home Screen**.
- On a browser that offers no prompt at all, the Options row says to use its menu.
- The installed game opens at its own address, without the website around it, and its shell is kept for offline use. The songs themselves still need downloading (see [Downloads](songs.md#downloads)).

## Download a copy

Every [release](https://github.com/HappyPaul55/everythingstar/releases) also carries the
game as a folder: a standalone `game` (the stage on its own) and `arcade` (the attract
loop), each as a zip and a tar.gz. They are for putting the game on a web server of your
own, so serve one from a domain's root — opening it from the file system is a page with
no JavaScript, because the build addresses everything from `/`. Downloading songs for
offline play is still the installed game's job.

## No account, and nothing sent

The game keeps four small records in this browser: your settings, the band, your scores and the first-run hints. They are yours, on this device, with no login.

Nothing is uploaded. A profile can carry those four records to another browser, and the library, downloads and audio deliberately stay where they are — [Options](options.md#your-profile) explains what a profile does and does not contain. The microphone is only listened to while a song is playing, and its samples are analysed in the page and dropped; the full statement is in the [privacy notice](https://everythingstar.happypaul55.com/privacy).

## Where to go next

- [Songs and playlists](songs.md) — finding a song, adding a playlist, local folders and offline downloads.
- [Instruments](instruments.md) — the highway, the note kinds and star power.
- [On a phone](on-a-phone.md) — tapping the pads, installing it and keeping songs offline.
