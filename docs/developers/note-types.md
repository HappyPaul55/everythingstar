---
title: Note types
description: "What a chart can put on a highway: single notes, chords, hammer-ons and pull-offs, sustains and the notes inside them, open strums, and the three note styles."
updated: "2026-10-30"
order: 22
---

A highway is drawn from a chart's `notes`. Each one is a `LaneNote`:

| Field | What it says |
| --- | --- |
| `timeMs` | When the note reaches the hit line, in the song's own time. |
| `lengthMs` | `0` is a tap; anything longer is a sustain, held to the end. |
| `kind` | `strum` (the string must be struck), `hopo` (hammer-on or pull-off) or `tap`. |
| `column` | Its lane, `0` to `columns - 1`, or `null` for an **open** note. |
| `hero` | A note worth a multiplier, drawn differently. |

Every screen below is captured by a test in `tests/e2e/docs`, from the fixture's own
chart, so a note type that changes shape breaks the page that describes it.

## A single note

One column, one moment, strummed. It is the shape everything else is built from.

[One strum bar in the middle column, above the hit line, on a five-column guitar highway.](shot:note-single)

## A chord

Several notes at the same `timeMs`. They are one press of the strum, judged
together: a chord cannot be half hit.

[Three notes on the same beat, across three columns of the highway.](shot:note-chord)

## A hammer-on

A `hopo` note reached by pressing its fret **without** strumming, because the
note before it holds the chain. The game draws it with a white face; the chart
says `hopo` and the run can still be strummed.

[A strummed note with a white hammer-on note above it, one column higher and reached without a strum.](shot:note-hammer-on)

## A pull-off

The same note reached downwards instead of upwards. The chart writes it as
`hopo` too: the direction is the chart's, not the note's — what changes is which
fret the finger leaves.

[A white HOPO note lower than the note before it, the pull-off direction.](shot:note-pull-off)

## A sustain

A note with `lengthMs` greater than zero: a tail that runs through the hit line
and is held for points until it ends.

[A note with a long tail running through the hit line.](shot:note-sustain)

## A chord sustain

Every note of a chord may carry a length. The tails are drawn side by side and
the chord is held as one.

[Three long notes side by side, their tails together through the hit line.](shot:note-chord-sustain)

## A note to strum inside a sustain

A second note at a later `timeMs`, inside the first note's tail. The first stays
held: the hand keeps the fret down and strikes the new string. The chart writes
the second note as an ordinary `strum`.

[A long note with a second, strummed note placed inside its tail.](shot:note-sustain-strum)

## A hammer-on inside a sustain

The same shape with the second note marked `hopo`: it is reached without a
strum, and the sustain is still held.

[A long note with a second, white HOPO note placed inside its tail.](shot:note-sustain-hammer)

## An empty strum

`column: null` is an **open** note: nothing is fretted, so the strum is the
note. It is drawn across the whole highway. A drum chart uses the same shape for
a strum with no pad behind it.

[One open note spanning the whole highway, with no fret column.](shot:note-open)

## Note styles

The style is a **setting** (`settings.noteStyle`), not a property of the chart:
the same notes are drawn as bars, as gems, or as arrows. Bars are the default
the game has always had; arrows are for a dance mat, where the direction on the
note is also the direction on the pad.

### Bars

[Bars: rectangular notes with a coloured face on a five-column highway.](shot:style-bars)

### Gems

[Gems: rounded notes with a coloured face on the same highway.](shot:style-gems)

### Arrows

[Arrows: notes carrying a direction on the face, and a pad drawn as an arrow.](shot:style-arrows)
