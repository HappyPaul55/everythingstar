---
title: Band and controllers
description: "Who plays what: seats, instruments, difficulty, singing or typing, and the controllers each player can use."
updated: "2026-10-31"
order: 6
---

Choosing a song and a band are two screens: the jukebox decides **what**, the band screen **who** and **how hard**. A **player** is somebody on stage, and their **seat** is their place — so Player 3 means the same person in the box, on the stage and in the results.

[The band screen: a character box per player with what they take, their level and controller gear, and Play at the foot of the screen.](shot:band-screen)

## A seat per player

The band screen is a row of boxes, each holding one player: what they take, the level, a gear for what they play with, and a cross to remove them. A box takes either an instrument or **the place at the words**:

- guitar, bass, drums, simple keys, or dance, when the song carries a chart for it;
- the words, which are sung or typed.

**Only what the song has can be chosen.** A mode the song has no part for is hidden, and an empty box says what it offers before you press it. A song with a lead and a rhythm guitar shows both, so a player says which one they take.

### Sing or type

On a song that carries **pitch**, a words player chooses **Vocals** or **Typing**; on one whose words carry no pitch the words are typed and the box says **typed — free play**. They are different runs with different cards — a singer is judged by pitch, a typist by the words — and they can share a line while keeping their own scores. [Singing](singing.md) and [Typing](typing.md) cover each.

### Each player's own difficulty

Difficulty belongs to a **chart**, so each box picks its own. The buttons are the charts the song carries: maybe Easy and Normal, maybe Expert only, so a song can be gentle on the guitar and hard to sing. Vocals always carry the first three levels; a typist has none and plays at Normal, called free play, and a lyrics-only song has no levels.

If a remembered band asks for a level the new song lacks, the nearest is used, ties to the easier. That is a mismatch handled, not an error.

### Four boxes, then more

The screen starts with **four boxes**. When all are full, **Add more players** appears in the action bar between leaving and playing. A wide screen can hold eight; **Play** stays on the right and the back button at the top.

A **phone stops at four** and draws one box a row, so eight would be a scroll past the band before Play; a band remembered with more is still drawn in full. Removing a player leaves a **gap** rather than renumbering, so Player 4 does not become Player 3.

### An empty band, and Play

With nobody on stage the button says **Listen**, and the song plays unscored — [Songs and playlists](songs.md#listen) has the read-along. If players have no part in the song, Play is refused with a sentence rather than starting empty panels.

Opening the band screen starts the song's files. **Play** is the loader: it reads **Loading…** with a count while the charts and every stem arrive, then goes to the entrance. A failed file is named under the band, and after about 45 seconds the button offers **Play anyway**.

The band is **remembered** — who was on stage, what they took, their level and controller — so the next song does not start empty. There is no account; the record is this device's, and a profile can carry it to another browser.

## Controllers

A **controller** is what a player holds. Each box's gear opens it, and an instrument seat's dialog is also in Options, so a mapping set in either place is the same. Without opening it, an instrument player uses their place's preset; a words player's microphone is chosen on the band screen.

### Keyboard

Bound by the **physical key**, not the character it types, so an AZERTY player gets the same five keys under their fingers.

- Player 1 on a guitar, bass or drums: <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>F</kbd> <kbd>G</kbd>, with <kbd>↑</kbd> <kbd>↓</kbd> to strum and <kbd>Shift</kbd> to wave.
- Player 2: <kbd>H</kbd> <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd> <kbd>;</kbd>, with <kbd>←</kbd> <kbd>→</kbd> and <kbd>Ctrl</kbd>.
- A drum chart's sixth column (the kick) takes the next key: <kbd>T</kbd> for the first layout, <kbd>U</kbd> for the second. A seventh column takes <kbd>Y</kbd> or <kbd>I</kbd>.
- Simple keys are **tapped**: the same row of letters presses the note and there is no strum. A dance mat is tapped too; its first layout is the arrow keys, its second <kbd>A</kbd> <kbd>W</kbd> <kbd>S</kbd> <kbd>D</kbd>.
- A typist types characters, the other way round; [Typing](typing.md) covers the words.

Keyboard auto-repeat is ignored, so holding a key does not trigger twice.

### Gamepad

Plug a pad in and press a button; the game notices it. The preset follows the standard mapping: five frets across the shoulder and face buttons, with the left trigger as a drum chart's sixth column; the D-pad's up and down as the strum bar; and the right trigger as the whammy.

A plastic guitar or drum kit presents itself as a gamepad too, and where its buttons differ the learn flow below sets it up. The pad is also the **menu cursor**: D-pad or left stick moves focus, A selects, B goes back and Start pauses. During a song it belongs to the players, and only Start is read.

### MIDI keyboard or kit

Choosing **MIDI** in a seat's gear asks for access — the only time besides a learn session, never on page load. If access is refused or there is no Web MIDI, the seat keeps what it had and the gear says why; it never quietly becomes the machine.

The preset is **middle C and the white keys above it** for the frets, the C and D above as the strums, and the E above as the whammy, which a MIDI keyboard sends with no setup. Every connected input is read as one bus, so a second device needs no second choice.

A kit's pads are not standard beyond General MIDI's sounds, so a kit is set up control by control. A **control change** — a hi-hat pedal, say — is learned like a note, and a pedal held down does not retrigger. Notes and control changes are labelled, so `CC 64` is never confused with note 64.

A remembered MIDI seat is silent until its owner presses **MIDI**, because a browser will not restore access without a press. Nothing leaves the device: messages are read and dropped.

### Microphone

The microphone is a controller for the words, and there is one between all the singers. It is asked for when Vocals is chosen or when Play is pressed with a singer on stage. [Singing](singing.md) covers the prompt, the judging and the privacy.

### The machine and tap pads

**The machine** is a controller like any other: a seat left to it plays itself through the same chart, triggers and rules, and is judged like anybody else. It does not wave the whammy. It covers a singer with no microphone and lets a solo player fill out a band.

On a touch screen the hit markers are controls: tap the pad under a note and it plays. Tapping is a setting (**Tap the pads**, on by default), not a device; keys and a gamepad work either way.

## Setting a controller up

A preset cannot know which button is which on a plastic guitar or unusual kit, so the gear offers **Set it up**: the game asks for each control in turn — frets left to right, both strum ways on a strummed instrument, then the whammy. Press the control it asks for; one already used is refused with **that one is taken**, so press another. **Skip** leaves a column empty and **Cancel** writes nothing.

[The controller dialog for one player: the device they use, the preset mapping and Set it up below.](shot:controller)

A skipped column keeps its place and is filled from the preset, so the frets after it stay put and no note becomes unplayable; **Use the preset** puts the whole mapping back.

Changing what a box takes **forgets the mapping** — a guitar's five frets are not a dance mat's four arrows — but keeps the level, because that was about the song, not the hands. A mapping is remembered per seat and survives a reload; a learned one has the same shape as a preset, so the key read-out, warnings and countdown read it alike.

## Two seats, one control

Two instrument seats can ask for the same key, because a keypress carries no device to name it by. The game reports the clash and leaves both seats working, both receiving the press. A band with one keyboard is better off playing, and the common case — a player on the keys and a typist on the words — has every typed letter also bound. The remedy is a gamepad or MIDI kit, not a rule that silently takes the keyboard away. Two seats bound to one MIDI note or control are reported too, and both are played.

## What is kept where

The band — seats, instruments, levels, words mode and controllers — is one of the four local records, beside settings, scores and first-run hints. Walking back to the band screen does not start again. A profile carries it to another browser; the library and downloads do not travel.
