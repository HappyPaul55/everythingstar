---
title: Options
description: "Every setting in EverythingStar: lag and its calibration, volume, visuals, haptics, installation and your profile."
updated: "2026-10-28"
order: 9
---

Options holds the things that belong to **this browser** rather than to a song. They are saved as you change them, with no account, and they apply to every run from then on. <kbd>Escape</kbd> or a gamepad's B goes back to the menu.

The pause menu carries a **quick panel** with three of the same values — note speed, audio lag and, when somebody is singing, the guide vocal — so a run can be adjusted without leaving it. They are the same settings, not a second copy.

## Sound

### Audio lag

**Audio lag** is how far behind the notes you hear the song: for a television, a soundbar or headphones that add a delay of their own. The stepper moves in 5 ms steps up to ±300 ms, and positive is the usual direction — you hear the song late.

It is read where the song's own audio meets the clock, so it changes when a note is judged only for a song that has audio of its own. A song played without sound leaves the frame loop in charge, and the value moves nothing there.

**Calibrate** measures it instead of guessing. The dialog plays a run of clicks at a fixed level — a muted master cannot make the calibration silent — and asks you to tap along. Eight clean taps is the target out of up to twelve clicks; four is the minimum a measurement is trusted from. Taps more than 300 ms from a click are left out, and the median of the rest becomes the setting, offered as **Use this** or **Try again**.

If the browser will not start Web Audio, the dialog says so and the stepper remains.

### Picture lag

**Picture lag** is how far behind the **sound** the picture is: a television, a projector or a display that shows a frame late. It has the same stepper and the same ±300 ms limit as audio lag. Positive means the display lags, so the scrolling notes are drawn that many milliseconds **ahead** to meet what you hear.

Only the drawing moves. The clock, the judging, the score, the song progress bar and the lyrics' timing keep the real playhead, so a note is still judged against the sound.

**Calibrate** measures it with a marker sweeping across a line **twelve times**, about 0.7 seconds apart, after a short lead-in. Tap as it crosses; eight clean taps is the target and four is the minimum. No sound plays in this test, because a click would give the answer away.

### Volume

The master fader. It sits above three families, each with its own level:

- **Music** — the song and the menu beds. A run's stems are music too.
- **Ambience** — the room's murmur while a run is paused.
- **Sound effects** — clicks, stings and a run's feedback.

The master never reaches a true zero: a fader dragged to nothing lands at about −60 dB. That is deliberate. The song is played by the browser's own media player, and a track at zero volume drops out of the clock that keeps the parts together — the notes would drift away from the music.

### Guide vocal

**Guide vocal** decides whether the song's own voice plays while somebody is singing it.

- **Off** (the default) is karaoke: the singer is the voice, and the song's vocal stems are not loaded where it has them.
- **On** keeps the song's voice under the singer, which is the only way to hear their own part drop out when they miss and come back when they hit.

A typist and Listen always keep the guide vocal. The setting is about a singer replacing the voice, not about removing it from the song.

### Crowd

The murmur of a venue while the run is **paused**, on its own channel. It is the pause menu's alone: never a crowd over the song, and none on the menus, the jukebox or the results. Off leaves the pause silent.

## Notes and the highway

### Note speed

**0.5× to 2.0×**, in tenths. Higher means less of the song on the neck at once, so what is coming arrives sooner.

It is drawing only. The chart, the clock and the hit window are the same at every speed: a note is judged at the same moment whether the neck holds four seconds of song or two. **Practice speed** is a different thing — it slows the song itself. [Practice](practice.md#speed) explains the difference.

### Note view

**In perspective** (the default) tilts a highway into the song, so its columns recede and it shows more of what is coming. **Flat** keeps every note the same size, face-on.

A view, not a rule: judging, columns and difficulty are identical either way.

### Note style

**Bars** (the default), **gems** or **arrows** — a skin for the notes.

- Bars are the flat buttons the game has always drawn.
- Gems are a rounded head at the hit end with a tail behind it.
- Arrows make the glyph the note: four directions on a four-column chart, five panels on a five-column one.

The chart, the clock and the judging never see it. The instrument's own glyph still rides on bars and gems.

### Tap the pads

On by default. A **hit marker is also a control**: tapping a pad plays the note above it, with the tap carrying its own strum, so a hopo needs no thought and a phone with no keyboard can play.

Off leaves the pads as markers and the keyboard, a gamepad or a MIDI kit as the ways in. Those work when it is on, too.

## The stage

### Backdrop

What the stage sits in front of, when the song has something of its own:

- **The song's own** — its video, or its art blurred when there is no video.
- **The game's artwork** — the room the menus use.

A song with nothing of its own falls back to the game's artwork rather than going black. When a YouTube-backed song's picture is put away, its sound keeps playing: the video is also the music.

### Backdrop dim

From **0% to 80%**, in 5% steps. It darkens the backdrop — a song's video, its art or the game's own room — so bright footage is easier to play over.

The notes and the panels keep their own brightness. The dim is one layer over the picture and under everything that is read.

### Drifting lights

The slow glow that drifts over the backdrop. On by default; off leaves a still room. It changes nothing about the song, and the site's reduced-motion rule stops the movement whatever the setting says.

## Feel

### Haptics

On by default. A short buzz when a note is missed, and a stronger pattern when star power is spent. It reaches the gamepad in that player's hands where the pad can rumble, and the phone in your hand where the browser will vibrate.

It is feedback beside the run, never a judging rule. A browser without vibration, a pad with no actuator and an iPhone all stay silent. Off is silence everywhere.

### Keep screen awake

On by default. A four-minute song is longer than a phone's default sleep, so the game holds the display on during the countdown and the run, and lets it go on a pause, the results and every page.

A browser without the Screen Wake Lock, or one saving battery, simply lets the screen sleep as it always did. The installed Android app's own boot already holds the display on, so the setting is skipped there.

## Player setup

One row per seat, saying what that player holds. The gear opens the same controller dialog the band screen's boxes use, including the **learn** flow for a plastic guitar or a MIDI kit — so a mapping set up here is the mapping that seat plays with, and one set up there appears here.

What a player **takes** — their instrument, their words, their level — is not here. That is a question about the song, and the band screen asks it. Players are added and removed there too. [Band and controllers](band-and-controllers.md) has the controllers and the learn flow in full.

## Install the game

**Install the game** keeps EverythingStar on the device. Installed, it opens without the browser's bars, as a game-only screen, and its shell is kept for offline use.

- Chromium-based browsers offer an **Install** button here where the browser allows installing.
- iPhone and iPad have no install prompt: **Share → Add to Home Screen**.
- A browser that installs only from its own menu says so.
- Inside the Android app the row is absent, because the app is already installed.

Installing does not download songs. Those are saved one at a time in the jukebox — [Downloads](songs.md#downloads).

## Your profile

**Export profile** saves the four records this browser holds as one JSON file:

- the **settings** on this page;
- the **band** — the seats, their instruments, levels, words mode and controllers;
- the **score board**;
- the **first-run hints** — which seats have already been shown the highway's key labels.

**Import profile** reads such a file and asks before it replaces anything: **Replace this browser's settings, band, scores and hints?** Nothing is written until **Replace**, and the page then reloads so all four come from the new record rather than a mix of the old and the new.

A file that is over 1 MB, is not JSON, is not an EverythingStar profile or belongs to a different version says why and changes nothing.

A profile deliberately carries **no library, downloads or audio**. Playlists, local folders and saved songs are not records a player owns in that sense — they are files this browser reaches, not preferences or scores — so an import leaves them exactly where they are. Exporting a profile is a backup of how the game behaves and what you scored, not a copy of the game.

If settings, band and scores matter to you, export one before clearing a browser's site data or moving to another device.
