---
title: Band and controllers
description: "Who plays what: seats, instruments, difficulty, singing or typing, and the controllers each player can use."
updated: "2026-10-30"
order: 6
---

Choosing a song and choosing a band are two screens, in that order: the jukebox decides **what**, and the band screen decides **who** and **how hard**. A **player** is somebody on stage, and their **seat** is their place in the band — so Player 3 means the same person in the box, on the stage and on the results.

```ts id="band-screen" alt="The band screen: a character box per player with their instrument, difficulty and controller gear, and Play at the bottom right." viewports="desktop"
import { captureBandScreen, test } from "@docshots/support";

test("the band screen with three players seated", async ({ context, page }) => {
  await captureBandScreen(context, page);
});
```

## A seat per player

The band screen is a row of character boxes. Each box holds everything about one player: what they take, the level they take it at, a gear for what they play with, and a cross to remove them.

A box takes either an instrument or **the place at the words**:

- guitar, bass, drums, simple keys, or dance, when the song carries a chart for it;
- the words, which are sung or typed.

**Only what the song has can be chosen.** A mode the song has no part for is hidden, and an empty box says what it is offering before you press it, so a box never arrives holding something the song cannot play. A song with both a lead and a rhythm guitar shows both, so a guitar player says which one they are taking.

### Sing or type

On a song that carries **pitch**, a words player chooses **Vocals** (singing) or **Typing**. On a song whose words carry no pitch, the words are typed and the box says **typed — free play**.

The two are different runs with different cards. A singer is judged by pitch; a typist is judged by the words. They can share a line and keep their own scores. [Singing](singing.md) and [Typing](typing.md) cover each.

### Each player's own difficulty

Difficulty is a property of a **chart**, not of a song, so each box picks its own. The buttons under a box are the charts the song actually carries for that instrument: maybe Easy and Normal, maybe Expert only. A song can be gentle on the guitar and hard to sing.

Vocals always carry the first three levels, because the tolerance is the microphone's rather than the song's. A typist has no level buttons — a typist plays at Normal, which the screen calls free play. A lyrics-only song has no levels at all.

If a remembered band asks for a level a new song does not carry, the nearest level is used, with ties going to the easier one. That is a mismatch being handled, not an error.

### Four boxes, then more

The screen starts with **four boxes**. When all four are full, **Add more players** appears in the middle of the action bar, between leaving and playing. A wide screen can hold eight; **Play** stays on the right and the consistent back button at the top.

A **phone stops at four**: it draws one box a row, so eight full-width boxes would be a scroll past the whole band before Play. A band remembered with more — picked on a wide screen — is still drawn in full on the phone, because a seat the run will play must not disappear from the screen that plays it.

Removing a player leaves a **gap** rather than renumbering the people behind them. Vacant seats keep their numbers, so Player 4 does not become Player 3 because somebody left.

### An empty band

With nobody on stage, the band screen's button says **Listen**, and the song plays with its words on screen, unscored. It writes nothing to the score board. It is also the way to hear a song before deciding who is playing it.

If players are on stage but none of them has a part in the song, Play is refused with a sentence saying so rather than starting a stage of empty panels.

### Play waits for the song

Opening the band screen starts the song's files. **Play** is the loader: it reads **Loading…** with a count while the charts and every stem the run will use arrive, then goes straight to the entrance. A file that fails is named under the band. After about 45 seconds the button offers **Play anyway** rather than holding you forever.

The band is **remembered** in this browser — who was on stage, what they took, their level and their controller — so the next song does not start from an empty screen. There is no account; the record is this device's, and a profile can carry it to another browser.

## Controllers

A **controller** is what a player holds. Each box's gear opens it, and an instrument seat's dialog is also in Options, so a mapping set up in either place is the same mapping. An instrument player who never opens it uses their place's preset and plays exactly as they did before there was one. A words player's microphone is chosen on the band screen, where the song decides whether they sing.

### Keyboard

Bound by the **physical key**, not the character it types, so an AZERTY player gets the same five keys under their fingers.

- Player 1 on a guitar, bass or drums: <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>F</kbd> <kbd>G</kbd>, with <kbd>↑</kbd> <kbd>↓</kbd> to strum and <kbd>Shift</kbd> to wave.
- Player 2: <kbd>H</kbd> <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd> <kbd>;</kbd>, with <kbd>←</kbd> <kbd>→</kbd> and <kbd>Ctrl</kbd>.
- A drum chart's sixth column (the kick) takes the next key: <kbd>T</kbd> for the first layout, <kbd>U</kbd> for the second. A seventh column, where a chart has one, takes <kbd>Y</kbd> or <kbd>I</kbd>.
- Simple keys are **tapped**: the same row of letters presses the note and there is no strum. A dance mat is tapped too; its first layout is the arrow keys and its second is <kbd>A</kbd> <kbd>W</kbd> <kbd>S</kbd> <kbd>D</kbd>.
- A typist types characters, which is the other way round; [Typing](typing.md) covers the words.

A keypress is one event per physical press; keyboard auto-repeat is ignored, so holding a key does not repeat a trigger.

### Gamepad

Plug a pad in and press a button; the game notices it. The preset follows the standard mapping:

- five frets across the shoulder and face buttons, with the left trigger as the sixth column for a drum chart's kick;
- the D-pad's up and down as the two ways of the strum bar;
- the right trigger as the whammy.

A plastic guitar or a drum kit presents itself as a gamepad too, so this is where one lands — and where its buttons differ, the learn flow below is how it is set up.

The pad is also the **menu cursor**: D-pad or left stick moves focus, A selects, B goes back and Start pauses. While a song is moving the pad belongs to the players, and only Start is read.

### MIDI keyboard or kit

Choosing **MIDI** in a seat's gear asks the browser for access. That is the only time it is asked, besides starting a learn session — never when the page loads. If access is refused or the browser has no Web MIDI, the seat keeps what it had and the gear says why; it never quietly becomes the machine.

The preset is **middle C and the white keys above it** for the frets, the C and D above as the strums, and the E above that as the whammy. A MIDI keyboard sends that with no setup. Every connected input is read as one bus, so plugging in a second device does not need a second choice.

A drum kit's pads are not standard beyond General MIDI's sounds, so a kit is set up control by control like a plastic guitar. A **control change** — a hi-hat pedal, say — is learned like a note, and a pedal held down does not retrigger. Notes and control changes are labelled as such, so `CC 64` is never confused with note 64.

A remembered MIDI seat is silent on a later visit until its owner presses **MIDI** in the gear or starts setting it up, because a browser will not restore access without a press. Nothing leaves the device: messages are read to play controls and dropped.

### Microphone

The microphone is a controller for the words, and there is one between all the singers. It is asked for when Vocals is chosen or when Play is pressed with a singer on stage. [Singing](singing.md) covers the prompt, the judging and the privacy.

### The machine

**The machine** is a controller like any other: a seat left to it plays itself, through the same chart, triggers and rules, and is judged like anybody else. It does not wave the whammy. It is what covers a singer with no microphone, and it is how a solo player can fill out a band.

### Tap pads

On a touch screen the hit markers are controls: tap the pad under a note and it plays. Tapping is a setting (**Tap the pads**, on by default), not a device in the gear. Keys and a gamepad work whether it is on or off, and a machine-played seat has no pads to press.

## Setting a controller up

A preset cannot know which button is which on a plastic guitar or an unusual kit, so the gear offers **Set it up**:

1. The game asks for each control in turn — the frets from left to right, then both ways of the strum on a strummed instrument, then the whammy.
2. Press the control it asks for. A control already used for something else is refused with **that one is taken**; press another.
3. **Skip** leaves a column empty, and **Cancel** ends the session without writing anything.

A column you skip keeps its place and is filled from the preset, so the frets after it stay where they were and no note becomes unplayable. **Use the preset** puts the whole mapping back.

Changing what a box takes **forgets the mapping** — a guitar's five frets are not a dance mat's four arrows — but keeps the level, because the level was about the song rather than the hands. A mapping is remembered per seat, so it survives a reload.

A learned mapping has the same shape as a preset, so the key read-out, the warnings and the countdown read it without knowing the difference.

## Two seats, one control

Two instrument seats can ask for the same key: a keypress carries no device to name it by. The game reports the clash in its controller read-out rather than hiding it, and then leaves both seats working — both receive the press.

That is deliberate. A band with one keyboard between them is better off playing, and the common case is a player on the keys and a typist on the words, where every letter the typist types is also a bound key. The real remedy is a gamepad or a MIDI kit, not a rule that silently takes the keyboard away from somebody.

The same is true of a MIDI control: two seats bound to one note or one control are reported, and both are played.

## What is kept where

The band — the seats, their instruments, levels, words mode and controllers — is one of the four local records, kept beside the settings, the scores and the first-run hints. It is not a song's property: walking back to the band screen does not mean starting again, and the next song knows who is on stage.

A profile carries it to another browser. The library and downloads do not travel with it.
