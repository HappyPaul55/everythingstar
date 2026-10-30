---
title: Instruments
description: "Playing a highway in EverythingStar: columns, note kinds, the whammy and star power, drums, misses and how difficulty works."
updated: "2026-10-30"
order: 3
---

An instrument is played on a **highway**: a scrolling board of notes that arrive at a line near the bottom. Each player has their own **panel**, with their highway in the middle, their score on the left and their star power meter on the right. Guitar, bass, simple keys and drums all use the same highway; what changes is the chart on it and the controls in your hands.

```ts id="guitar-highway" alt="A lone guitar highway: five columns of notes above the hit line, with score, combo and multiplier down the left." viewports="desktop"
import { captureGuitarHighway, test } from "./support";

test("one guitar player's highway, a beat into the run", async ({ context, page }) => {
  await captureGuitarHighway(context, page);
});
```

## Columns and the hit line

A highway's **columns** are its vertical strips of notes. The number comes from the chart, not from the instrument: most guitar, bass and keys charts have five, a drum chart has six, and a dance chart has four.

The **hit line** is the row of pads at the bottom. A note is played at the moment it reaches the line. On a guitar, hold the fret for its column and strum as it crosses. On keys and a dance mat the note is tapped by pressing its key, with no strum.

A note that lands leaves the neck, and a small burst above the pad shows where it was played. A missed note turns red and keeps travelling past the line — that is how a hit and a miss are told apart.

## The note kinds

A note is a **strum** or a **hopo**. Tapping is how a controller plays the note, not a
third kind: a key, a dance pad or a phone pad presses it with no separate strum bar.

- **Strum** — the ordinary note. Put the fret down and strum as it crosses. On a tapped instrument, just press the key.
- **Hopo** (hammer-on or pull-off) — a note that does not need a strum if the note before it in your chart landed. Its face turns solid white while it can be hammered. A miss breaks that chain, so the next one has to be strummed.
- **Open** — a purple note with no fret. Strum it on its own, with no fret held. On drums, the open note is the **kick**: it lives in the sixth column and is played with the kick control.
- **Sustain** — a note with a tail. Keep the fret down for as long as the tail runs; letting go ends the hold. A held sustain pays extra as it goes.
- **Chord** — two or more notes at the same moment. On a strummed instrument every fret has to be down for any of them to land; one finger short misses the whole chord, and one strum plays it. On a tapped instrument, press every key in it.

A chord can start several sustains at once, and each hold is its own. Letting go of one fret stops that hold and leaves the others.

The game also draws the song's beat on the highway when the chart knows its tempo: thin lines across it, with a stronger line at the start of a bar. They scroll with the notes, so they are always where the beat is.

## Drums

Drums use the same highway with a **kick column** of their own: six columns instead of five. The five pads are the kit, and the sixth is the kick pedal, played with a key, a gamepad button or a MIDI pedal.

A drum chart can also contain **fills** — short freestyle windows, marked on the highway. Inside a fill, an extra hit is not a mistake: it pays a small fixed bonus and fills your meter, at most once every fraction of a second so it cannot be farmed. A fill hit is not a judged note, and it does not break a combo.

## Star power

Hitting notes fills the meter in your right-hand rail. A miss takes a larger bite out of it, and it drains slowly when nothing is played.

When the meter is full, **wave the whammy** to spend it. You get **eight seconds of double score** on every note and sustain payment, on top of the combo multiplier. The meter empties, and you fill it again from scratch.

The whammy adds no score of its own: its one job is to spend a full gauge. Every instrument has a wave control on each controller preset, so a drum seat can spend its meter the same way a guitar does.

## Misses, errors and the part dropping out

Two things are counted separately:

- A **miss** is a note that was dropped, however it happened — the window closed, or a chord was strummed short.
- An **error** is something you did: a strum with a fret missing for the chord, or a strum with nothing in the window. A fret pressed on nothing is not an error; a hand travels.

A miss resets your combo to ×1. A note whose window closes without a strum is a miss and not an error, because nobody did anything.

The first miss of a streak also takes **that part out of the song**. Your guitar drops to a tenth of its level and comes back on your next hit, or at the end of the phrase if the song holds it that long. The `error` cue is the sound of that stop, and it plays once per stop rather than once per missed note.

A song that ships as a single master has no part to take out. The cue still plays, because the part would have gone out, but the song cannot lose an instrument it does not separate.

## Difficulty is the chart

There is no band-wide difficulty. Each player chooses their own level on the band screen, and the choice is really a choice of **chart**: a song can be easy on the guitar and hard to sing, and it may carry only some levels for an instrument.

The level buttons are the charts the song actually has. If the song carries no Expert guitar chart, Expert is not offered. If a remembered band asks for a level a new song does not have, the game uses the nearest level it does have, with ties going to the easier one — a mismatch is ordinary rather than an error.

## The machine

A player can choose **The machine** as their controller. The seat then plays itself: it reads the same chart, sends the same frets and strums through the same rules, and is judged like anybody else. It does not wave the whammy, so it earns no star power.

This is a real controller, not a demo mode. It is how a solo player can fill out a band, and it is what plays a singer who has no microphone. [Band and controllers](band-and-controllers.md) covers the choice.

## Drawing options

Three settings change how a highway looks, and none of them changes a note:

- **Note view** — the tilted perspective (the default) or a flat board. The tilted neck shows more of what is coming.
- **Note style** — bars (the default), rounded gems, or arrows. A dance chart's arrows point in its four directions; a five-column chart draws five panels.
- **Note speed** — 0.5× to 2.0× in tenths. Faster means less of the song on the neck at once; a note is still hit at the same moment at any speed.

They live in [Options](options.md#notes-and-the-highway), along with the tap setting below.

## Tapping the pads

On a phone, or on any touch screen, the pads on the hit line are controls. **Tap the pad under a note as it lands** and the note plays. A tap counts as a fret and a strum at once, so a hopo needs no special thought.

Two fingers on a chord only have to land within a moment of each other. A tap at nothing is not an error — it is a hand finding the screen — and a late second tap simply does nothing. Each pad's whole column is its touch target, so a finger does not have to be precise.

**Tap the pads** is on by default and can be turned off in Options. Keys and a gamepad work either way. [On a phone](on-a-phone.md) has the rest of the touch layout.

## What a note is worth

A plain note is **50 points**. A chord pays the sum of its notes, a **hero** note pays five times its own, and the streak multiplier is ×1, ×2, ×3 and ×4 at 0, 10, 20 and 30 notes. A sustain pays 25 per note for each measure held, prorated and multiplied by the current multiplier. Star power doubles all of it for its eight seconds.

Timing decides whether a note is a hit at all; there are no perfect, great and good tiers. The results screen calls a run **lost** when the band hit fewer than half of at least ten judged notes or words. That is a verdict at the end, not something that cuts a player off mid-song.
