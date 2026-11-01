---
title: Options
description: "Every setting in EverythingStar: lag and its calibration, volume, visuals, haptics, installation and your profile."
updated: "2026-10-31"
order: 9
---

Options holds what belongs to **this browser** rather than a song. Each change is saved at once, with no account, and applies to every run. <kbd>Escape</kbd> or a gamepad's B goes back to the menu.

The pause menu carries a **quick panel** with three of the same values — note speed, audio lag and, when somebody is singing, the guide vocal — so a run can be adjusted without leaving it.

[The Options screen: lag and its two calibrations, then the master and its volume families.](shot:options)

## Sound

### Audio lag

**Audio lag** is how far behind the notes you hear the song: for a television, a soundbar or headphones that add a delay of their own. The stepper moves in 5 ms steps up to ±300 ms, and positive is the usual direction — you hear the song late.

It changes judging only for a song with audio of its own; a silent song leaves the frame loop in charge and the value moves nothing.

**Calibrate** measures it. The dialog plays clicks at a fixed level — a muted master cannot make it silent — and asks you to tap along: eight clean taps is the target out of up to twelve, four the minimum. Taps more than 300 ms from a click are left out, and the median of the rest is offered as **Use this** or **Try again**. If the browser will not start Web Audio, the dialog says so and the stepper remains.

### Picture lag

**Picture lag** is how far behind the **sound** the picture is: a display that shows a frame late. It has the same stepper and ±300 ms limit. Positive means the display lags, so the notes are drawn that many milliseconds **ahead**; only the drawing moves, while the clock, judging, score, progress bar and lyrics keep the real playhead.

**Calibrate** measures it with a marker sweeping a line **twelve times**, about 0.7 seconds apart, after a short lead-in. Tap as it crosses; eight clean taps is the target and four the minimum. No sound plays, because a click would give the answer away.

### Volume

The master fader sits above three families, each with its own level:

- **Music** — the song and the menu beds; a run's stems are music too.
- **Ambience** — the room's murmur while a run is paused.
- **Sound effects** — clicks, stings and a run's feedback.

The master never reaches zero: a fader dragged to nothing lands at about −60 dB. A track at zero volume would drop out of the clock that keeps the parts together, so the notes would drift from the music.

### Guide vocal

**Off** (the default) is karaoke: the singer is the voice, and the song's vocal stems are not loaded where it has them. **On** keeps the song's voice under the singer — the only way to hear their own part drop out on a miss and come back on a hit. A typist and Listen always keep it. [Singing](singing.md#the-guide-vocal) covers it.

### Crowd

The murmur of a venue while the run is **paused**, on its own channel. It is the pause menu's alone: never over the song, and none on the menus, the jukebox or the results. Off leaves the pause silent.

## Notes and the highway

### Note speed

**0.5× to 2.0×**, in tenths. Higher means less of the song on the neck at once, so what is coming arrives sooner.

It is drawing only: chart, clock and hit window are the same at every speed, and a note is judged at the same moment however much song the neck holds. **Practice speed** instead slows the song itself — [Practice](practice.md#speed) explains.

### Note view

**In perspective** (the default) tilts a highway into the song, so the columns recede and more of what is coming shows. **Flat** keeps every note the same size, face-on. Judging is identical either way.

### If the notes stutter

The perspective view is the heaviest drawing: a four-player band in perspective is
the case a weaker GPU notices first. **Flat** keeps every note the same size and is
much lighter, **Drifting lights off** removes the room's animation, and fewer players
is lighter still. The chart, clock, hit window and judging are identical in every
view, so this is only about the picture.

### Note style

**Bars** (the default), **gems** or **arrows** — a skin for the notes. Bars are the flat buttons, gems a rounded head with a tail behind it, and arrows make the glyph the note: four directions on a four-column chart, five panels on a five-column one. Judging never sees it, and the instrument's own glyph still rides on bars and gems.

### Tap the pads

On by default. A **hit marker is also a control**: tapping a pad plays the note above it, the tap carrying its own strum, so a hopo needs no thought. Off leaves the pads as markers, and keys and a gamepad work either way.

## The stage

**Backdrop** is what the stage sits in front of: **the song's own** video, or its art blurred when there is no video, or **the game's artwork**. A song with nothing of its own falls back to the artwork rather than going black. When a YouTube-backed song's picture is put away, its sound keeps playing: the video is also the music.

**Backdrop dim** runs from **0% to 80%** in 5% steps and darkens the backdrop, so bright footage is easier to play over. The notes and panels keep their brightness; the dim sits over the picture and under everything read.

**Drifting lights** is the slow glow over the backdrop, on by default. Off leaves a still room, and the site's reduced-motion rule stops the movement whatever the setting says.

## Feel

**Haptics** is on by default: a short buzz when a note is missed and a stronger pattern when star power is spent. It reaches the gamepad where the pad can rumble and the phone where the browser will vibrate. It is feedback, never a judging rule; a browser without vibration, a pad with no actuator and an iPhone all stay silent.

**Keep screen awake** is on by default. A four-minute song is longer than a phone's default sleep, so the game holds the display on during the countdown and the run, and lets it go on a pause, the results and every page. A browser without the Screen Wake Lock, or one saving battery, lets the screen sleep. The installed Android app holds the display on in its own boot, so the setting is skipped there.

## Player setup

One row per seat, saying what that player holds. The gear opens the same controller dialog as the band screen, including **learn**, so a mapping set here is the one that seat plays with and one set there appears here. What a player **takes** — instrument, words, level — is asked on the band screen. [Band and controllers](band-and-controllers.md) has the controllers in full.

## Install the game

**Install the game** keeps EverythingStar on the device. Installed, it opens without the browser's bars as a game-only screen, and its shell works offline.

- Chromium-based browsers offer an **Install** button here where the browser allows it.
- iPhone and iPad have no prompt: **Share → Add to Home Screen**.
- A browser that installs only from its own menu says so, and inside the Android app the row is absent because the app is already installed.

Installing does not download songs; those are saved one at a time in the jukebox — [Downloads](songs.md#downloads).

## Your profile

**Export profile** saves the four records as one JSON file: the **settings**, the **band** (seats, instruments, levels, words mode and controllers), the **score board**, and the **first-run hints** (which seats have seen the key labels).

**Import profile** reads such a file and asks before it replaces anything: **Replace this browser's settings, band, scores and hints?** Nothing is written until **Replace**, and the page reloads so all four come from the new record, not a mix.

A file that is over 1 MB, is not JSON, is not an EverythingStar profile or belongs to a different version says why and changes nothing.

A profile deliberately carries **no library, downloads or audio**: playlists, folders and saved songs are files this browser reaches, not preferences or scores, so an import leaves them where they are. It backs up how the game behaves and what you scored, not the game.

If settings, band and scores matter, export one before clearing a site's data or moving to another device.
