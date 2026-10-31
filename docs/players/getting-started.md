---
title: Getting started
description: "What EverythingStar is, how to open it, and how a visit goes: choose a song, build a band and play. No account and nothing to install."
updated: "2026-10-31"
order: 1
---

EverythingStar is a rhythm game in a browser. One song plays on one stage, and the people on it can play three ways: **Instruments** (guitar, bass, keys and drums), **Typing** (the words on a keyboard) and **Vocals** (karaoke into a microphone). A band can mix all three, and everybody is judged on their own part.

There is no account, no download and no cost: open the game, pick a song, say who is playing, and play.

## What you need

- A modern browser on a computer, tablet or phone. A desktop is best for a band of several players; a phone taps the pads and can sing into its microphone — see [On a phone](on-a-phone.md).
- Sound, because the song is the clock.
- A keyboard for instruments and typing. A gamepad, MIDI keyboard, drum kit and microphone are optional and set up per player — [Band and controllers](band-and-controllers.md) covers them.
- A connection the first time you play a song. Songs stream from playlists; after that one can be saved for offline play.

## Open the game

Go to **https://everythingstar.happypaul55.com/play** and press **Enter the stage**.

[The welcome screen: the game's name, the Enter the stage button and the build label.](shot:welcome)

That press asks for the whole screen, where the game is meant to be played, and unlocks the audio — browsers do not let a page make a sound before somebody touches it. If the browser refuses the full screen, the game opens in the page and the **Fullscreen** button in the stage's corner tries again. On a first visit the button reads **Loading…** while the sounds are prepared; that is the only wait before the menu.

## The loop

Every visit follows the same path, and no step reloads the page:

**welcome → menu → songs → band → entrance → run → results**

[The menu: Quick Play, Options and Credits, with the stage's backdrop behind them.](shot:menu)

- **Welcome** is the name and one button, **Enter the stage**.
- **Menu** has three doors: **Quick Play** (the jukebox), **Options** and **Credits**; Escape, or a gamepad's B, goes back a step.
- **Songs** is the jukebox: the library under its letters, with a search, a now-playing panel and a preview of each row. [Songs and playlists](songs.md) covers it.
- **Band** is who is playing: a box per player with what they take and how hard. Four boxes to begin with, and an empty band can choose **Listen**. [Instruments](instruments.md), [Typing](typing.md) and [Singing](singing.md) cover the ways to play.
- **The entrance** is the stage arriving — the room, then the highways and the words, while the band's own sound plays. There is no 3-2-1 count; the song starts when it can play through.
- **The run** is the song, and **Pause** (<kbd>Escape</kbd>, or Start on a gamepad) opens resume, restart, practice and leave, scrimmed over the stage rather than replacing it.

### Results

Results gives the band score and a card per player, then the song's history on this browser. **Play again** starts the same song with the same band.

[The results screen: the band's score, a card for each player and the song's history, with Play again below.](shot:results)

## Options, credits and fullscreen

**Options** holds what belongs to this browser rather than a song: lag and calibration, volume, how the notes are drawn, haptics, the wake lock, installation and your profile. Every setting is in [Options](options.md).

**Credits** names what the game is made of; music and sound cues are read from its sound manifest, so a file's credit is the credit shown.

The **Fullscreen** button gives the game the whole screen and stands the website's header and footer aside, with the developer panel if that is on. Escape leaves fullscreen, but in a run the browser keeps that Escape, so leaving fullscreen becomes a pause rather than play behind a window you cannot see.

## Install it, if you want to

EverythingStar does not need installing. To open it like an app, choose **Options → Install the game**, or use the browser's menu and look for **Install** or **Add to Home Screen**. iPhone and iPad have no prompt: use **Share → Add to Home Screen**; where no prompt exists, the Options row says to use the menu. The installed game opens at its own address without the website, and its shell is kept for offline use. Songs still need downloading (see [Downloads](songs.md#downloads)).

## Download a copy

Every [release](https://github.com/HappyPaul55/everythingstar/releases) also carries the game as a folder: a standalone `game` (the stage alone) and `arcade` (the attract loop), as a zip and a tar.gz. Serve one from a web server at a domain's root — opening it from the file system is a page with no JavaScript, because the build addresses everything from `/`. Downloading songs is still the installed game's job.

## No account, and nothing sent

The game keeps four small records in this browser: your settings, the band, your scores and the first-run hints. They are yours, on this device, with no login.

Nothing is uploaded. A profile carries those four records to another browser, while the library, downloads and audio stay put — [Options](options.md#your-profile) explains what it holds. The microphone is listened to only while a song plays; its samples are analysed in the page and dropped, and the full statement is in the [privacy notice](https://everythingstar.happypaul55.com/privacy).
