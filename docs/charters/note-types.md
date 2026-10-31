---
title: Note types
description: "What a chart can put on a highway: single notes, chords, slides, hammer-ons and pull-offs, sustains and the notes inside them, open strums, hero notes, and the styles a player can choose."
updated: "2026-10-31"
order: 2
---

Each note on a highway is a `LaneNote`. The fields a chart sets:

| Field | What it says |
| --- | --- |
| `timeMs` | When the note reaches the hit line, in the song's own time. |
| `lengthMs` | `0` means the note is not held; anything longer is a sustain, held to the end. |
| `kind` | `strum` (the string must be struck) or `hopo` (hammer-on or pull-off). |
| `column` | Its column, `0` to `columns - 1`, or `null` for an **open** note. |
| `hero` | A note worth five times the normal value, drawn differently. |
| `slideTo` | The id of a later note this one **slides** to, when it does. |

Every note is a **strum** or a **hopo**; `tap` is not a kind. A strum needs the
strum gesture with its frets held, or a press of its key on a tapped controller; a
hopo is reached by the fret alone. Tapping is how a controller performs a strum
note, and an older chart's `tap` is read as `strum`.

## A single note

One column, one moment, strummed — the shape everything else is built from.

[One strum bar in the middle column, above the hit line, on a five-column guitar highway.](shot:note-single)

## A chord

Several notes at the same `timeMs`, one press of the strum and judged together:
a chord cannot be half hit.

[Three notes on the same beat, across three columns of the highway.](shot:note-chord)

## A slide

A **slide** is a link between two notes, not a third note kind. The earlier note —
the **source** — carries a `slideTo` naming the later one, the **target**; both keep
their own `kind`, both are **fretted**, and they are in different columns. The game
draws the link as a ribbon from the source's end to the target's head, so the two
notes are read as one movement. The ribbon leaves the source **across** the neck and
turns **up** into the target, whichever direction the slide takes.

[Two notes in different columns with a gray band leaving the lower one across and turning up into the higher one.](shot:note-slide)

On a touch highway, a finger that has landed the source may **glide** to the
target's pad without lifting: the arrival plays the target, and its sustain is held
from there. The glide pays the hold value of the span it crossed — at 120 BPM a
measure is 2000 ms, so an 800 ms glide pays 10 — while a tap on the target instead
pays the note alone. That is why the same two notes score 110 with the glide and 100
without it.

The points are in the score but **not** in the star rating (`ratingScore` takes them
back out), because only a touch screen can earn them. A strum, keyboard, gamepad or
MIDI player plays the two notes as they always have: the ribbon is drawn for them
too, and the link never asks for a gesture they cannot make.

The rules a link must pass — both ends fretted, a strictly later target, a different
column, nothing in either column between them, one incoming link per target — are in
[What a chart is](what-a-chart-is.md#a-slide). A chain of links is allowed, and a
chord may slide any subset of its notes.

## A chord that crosses

Each note of a chord may slide on its own. Two sources can leave two pads and cross
to each other's columns: each link has its own source and target, so a crossing pair
is two slides rather than one shape.

[Two source notes and two target notes, with two gray bands crossing in the middle, each link leaving one column across and arriving up the other.](shot:note-chord-slide)

## A hammer-on

A `hopo` reached by pressing its fret **without** strumming, because the note
before it holds the chain. The chart says `hopo`; the game does not infer it from
the spacing, and the note can still be strummed. It is drawn with a white face.

[A strummed note with a white hammer-on note above it, one column higher and reached without a strum.](shot:note-hammer-on)

## A pull-off

The same note reached downwards. The chart writes it as `hopo` too: the direction
is the chart's, not the note's — what changes is which fret the finger leaves.

[A white HOPO note lower than the note before it, the pull-off direction.](shot:note-pull-off)

## A sustain

A note with `lengthMs` above zero: a tail through the hit line, held for points
until it ends.

[A note with a long tail running through the hit line.](shot:note-sustain)

## A chord sustain

Every note of a chord may carry a length; the tails sit side by side and the chord
is held as one. Letting one fret go ends only that hold.

[Three long notes side by side, their tails together through the hit line.](shot:note-chord-sustain)

## A note to strum inside a sustain

A second note at a later `timeMs`, inside the first note's tail. The first stays
held: the fret stays down and the new string is struck. The second note is an
ordinary `strum`.

[A long note with a second, strummed note placed inside its tail.](shot:note-sustain-strum)

## A hammer-on inside a sustain

The same shape with the second note marked `hopo`: reached without a strum, and
the sustain is still held.

[A long note with a second, white HOPO note placed inside its tail.](shot:note-sustain-hammer)

## An open note

`column: null` is an **open** note: nothing is fretted, so the strum is the note.
It spans the whole highway and must stand alone at its moment — an open note beside
another note is refused. A drum chart uses the same shape for a strum with no pad
behind it.

[One open note spanning the whole highway, with no fret column.](shot:note-open)

## A hero note

A note with `hero` set is worth five times the normal value and drawn differently.
It can be any shape above, including one note of a chord or a note inside a
sustain.

## Note styles

The style is a **setting** (`settings.noteStyle`), not chart data: the same notes
are drawn as bars, gems or arrows. Bars are the default; arrows suit a dance mat,
where the direction on the note is also the direction on the pad.

### Bars

[Bars: rectangular notes with a coloured face on a five-column highway.](shot:style-bars)

### Gems

[Gems: rounded notes with a coloured face on the same highway.](shot:style-gems)

### Arrows

[Arrows: notes carrying a direction on the face, and a pad drawn as an arrow.](shot:style-arrows)
