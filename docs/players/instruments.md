---
title: Instruments
description: "Playing a highway in EverythingStar: columns, note kinds, the whammy and star power, drums, misses and how difficulty works."
updated: "2026-10-31"
order: 3
---

An instrument is played on a **highway**: a scrolling board of notes arriving at a line near the bottom. Each player has their own **panel**, with the highway in the middle and score and star power on the rails. Guitar, bass, keys and drums share the highway; the chart and controls change.

[A lone guitar highway: five columns of notes above the hit line, with the score, combo and multiplier rails beside or above it.](shot:guitar-highway)

## Columns and the hit line

A highway's **columns** are its vertical strips of notes, and the count comes from the chart: most guitar, bass and keys charts have five, a drum chart six, and a dance chart four.

The **hit line** is the row of pads at the bottom. On a guitar, hold the fret for the column and strum as the note crosses; on keys and a dance mat, press its key with no strum.

A note that lands leaves the neck with a small burst above the pad; a missed note turns red and keeps travelling past the line.

## The note kinds

A note is a **strum** or a **hopo**. Tapping is how a controller plays a note, not a third kind: a key, a dance pad or a phone pad presses it with no separate strum bar. [Note types](../charters/note-types.md) draws each kind.

- **Strum** — the ordinary note: fret down and strum as it crosses, or just press the key on a tapped instrument.
- **Hopo** (hammer-on or pull-off) — no strum needed if the note before it in your chart landed. Its face turns white while it can be hammered; a miss breaks the chain, so the next one has to be strummed.
- **Open** — a purple note with no fret, strummed on its own. On drums it is the **kick**, in the sixth column and played with the kick control.
- **Sustain** — a note with a tail. Keep the fret down while the tail runs; letting go ends the hold, and a held sustain pays extra as it goes.
- **Chord** — two or more notes at once. On a strummed instrument every fret must be down for any to land: one finger short misses it all, and one strum plays it. On a tapped one, press every key.

A chord can start several sustains at once, each hold its own: letting go of one fret stops that hold and leaves the others.

When the chart knows its tempo the beat is drawn on the highway: thin lines across it, stronger at the start of a bar, scrolling with the notes.

## Drums

Drums use the same highway with a **kick column** of their own: six columns instead of five, the five pads being the kit and the sixth the kick pedal, played with a key, a gamepad button or a MIDI pedal.

A drum chart can contain **fills** — short freestyle windows, marked on the highway. Inside one an extra hit is not a mistake: it pays a small fixed bonus and fills your meter, at most once every fraction of a second so it cannot be farmed. A fill hit is not judged and does not break a combo.

## Star power

Hitting notes fills the meter; a miss takes a larger bite, and it drains slowly when nothing is played. When it is full, **wave the whammy** to spend it: **eight seconds of double score** on every note and sustain payment, on top of the combo multiplier. The meter empties, and you fill it from scratch.

The whammy adds no score of its own; its one job is to spend a full gauge. Every instrument has a wave control on each preset, so a drum seat can spend its meter like a guitar.

## Misses, errors and the part dropping out

Two things are counted separately:

- A **miss** is a note that was dropped, however it happened — the window closed, or a chord was strummed short.
- An **error** is something you did: a strum with a fret missing for the chord, or a strum with nothing in the window. A fret pressed on nothing is not an error; a hand travels.

A miss resets your combo to ×1. A note whose window closes without a strum is a miss, not an error, because nobody did anything.

The first miss of a streak also takes **that part out of the song**: your guitar drops to a tenth of its level and comes back on your next hit, or at the end of the phrase if the song holds it that long. The `error` cue is the sound of that stop, and it plays once per stop rather than once per missed note.

A song shipped as one master has no part to take out: the cue still plays, but the song cannot lose an instrument it does not separate.

## Difficulty is the chart

There is no band-wide difficulty. Each player chooses a level on the band screen, and the choice is a choice of **chart**: a song can be easy on the guitar and hard to sing, and may carry only some levels. Expert is not offered where there is no Expert chart. [Band and controllers](band-and-controllers.md) covers the band and the nearest-level fallback.

## The machine

A player can choose **The machine** as their controller: the seat plays itself through the same chart, rules and judging, and does not wave the whammy, so it earns no star power. It is a real controller, not a demo mode, and fills out a solo band or a singer with no microphone.

## Drawing options

Three settings change how a highway looks, and none changes a note: **Note view** (the tilted perspective or a flat board), **Note style** (bars, gems or arrows) and **Note speed** (0.5× to 2.0× in tenths, faster meaning less of the song on the neck at once). They live in [Options](options.md#notes-and-the-highway).

## Tapping the pads

On a touch screen the pads are controls: **tap the pad under a note as it lands** and it plays, as a fret and a strum at once. **Tap the pads** is on by default and can be turned off in Options; [On a phone](on-a-phone.md) has the touch layout in full.

### Sliding between pads

Some notes are **linked**: a ribbon runs from one note to a later one in another column. Keep your finger on the source's pad after it plays and **glide** across to the target's pad; the target plays on arrival, its hold is kept, and the glide pays the hold value of the span you crossed. Tap the linked target instead and it still plays, but the glide's points are not paid.

A slide is a link, not a third note kind: both notes are still strums or hopos. Only a touch screen can follow the link — a keyboard, gamepad or MIDI player plays the two notes normally — so the **star rating** leaves the glide's points out. The ribbon is drawn for everybody, so the chart reads the same on any controller.

## What a note is worth

A plain note is **50 points**; a chord pays the sum of its notes, a **hero** note five times its own, and the streak multiplier is ×1, ×2, ×3 and ×4 at 0, 10, 20 and 30 notes. A sustain pays 25 per note for each measure held, prorated and multiplied. A **slide** pays the same hold value for the span it crossed — 10 points for 800 ms at 120 BPM — and star power doubles it for eight seconds.

Timing decides whether a note is a hit at all; there are no perfect, great and good tiers. The results screen calls a run **lost** when the band hit fewer than half of at least ten judged notes or words — a verdict at the end, not a mid-song stop.
