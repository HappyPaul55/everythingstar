---
title: Note types
description: "What a chart can put on a highway: single notes, chords, hammer-ons and pull-offs, sustains and the notes inside them, open strums, hero notes, and the styles a player can choose."
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
