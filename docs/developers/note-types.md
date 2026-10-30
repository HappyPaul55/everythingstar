---
title: Note types
description: "What a chart can put on a highway: single notes, chords, hammer-ons and pull-offs, sustains and the notes inside them, open strums, and the three note styles."
updated: "2026-10-30"
order: 21
---

A highway is drawn from a chart's `notes`. Each one is a `LaneNote`:

| Field | What it says |
| --- | --- |
| `timeMs` | When the note reaches the hit line, in the song's own time. |
| `lengthMs` | `0` is a tap; anything longer is a sustain, held to the end. |
| `kind` | `strum` (the string must be struck), `hopo` (hammer-on or pull-off) or `tap`. |
| `column` | Its lane, `0` to `columns - 1`, or `null` for an **open** note. |
| `hero` | A note worth a multiplier, drawn differently. |

Every screen below is captured by the test beside it, from the fixture's own
chart, so a note type that changes shape breaks the page that describes it.

## A single note

One column, one moment, strummed. It is the shape everything else is built from.

```ts id="note-single" alt="One strum bar in the middle column, above the hit line, on a five-column guitar highway."
import { expect, test } from "./support";
import { captureNoteType } from "./support";

test("a single note", async ({ context, page }) => {
  const leaked = await captureNoteType(context, page, "One note");
  expect(leaked, "unexpected external requests").toEqual([]);
});
```

## A chord

Several notes at the same `timeMs`. They are one press of the strum, judged
together: a chord cannot be half hit.

```ts id="note-chord" alt="Three notes on the same beat, across three columns of the highway."
import { expect, test } from "./support";
import { captureNoteType } from "./support";

test("a chord", async ({ context, page }) => {
  const leaked = await captureNoteType(context, page, "Three at once");
  expect(leaked, "unexpected external requests").toEqual([]);
});
```

## A hammer-on

A `hopo` note reached by pressing its fret **without** strumming, because the
note before it holds the chain. The game draws it with a white face; the chart
says `hopo` and the run can still be strummed.

```ts id="note-hammer-on" alt="A strummed note with a white hammer-on note above it, one column higher and reached without a strum."
import { expect, test } from "./support";
import { captureNoteType } from "./support";

test("a hammer-on", async ({ context, page }) => {
  const leaked = await captureNoteType(context, page, "Hammered on");
  expect(leaked, "unexpected external requests").toEqual([]);
});
```

## A pull-off

The same note reached downwards instead of upwards. The chart writes it as
`hopo` too: the direction is the chart's, not the note's — what changes is which
fret the finger leaves.

```ts id="note-pull-off" alt="A white HOPO note lower than the note before it, the pull-off direction."
import { expect, test } from "./support";
import { captureNoteType } from "./support";

test("a pull-off", async ({ context, page }) => {
  const leaked = await captureNoteType(context, page, "Pulled off");
  expect(leaked, "unexpected external requests").toEqual([]);
});
```

## A sustain

A note with `lengthMs` greater than zero: a tail that runs through the hit line
and is held for points until it ends.

```ts id="note-sustain" alt="A note with a long tail running through the hit line."
import { expect, test } from "./support";
import { captureNoteType } from "./support";

test("a sustain", async ({ context, page }) => {
  const leaked = await captureNoteType(context, page, "One held note");
  expect(leaked, "unexpected external requests").toEqual([]);
});
```

## A chord sustain

Every note of a chord may carry a length. The tails are drawn side by side and
the chord is held as one.

```ts id="note-chord-sustain" alt="Three long notes side by side, their tails together through the hit line."
import { expect, test } from "./support";
import { captureNoteType } from "./support";

test("a chord sustain", async ({ context, page }) => {
  const leaked = await captureNoteType(context, page, "Three held at once");
  expect(leaked, "unexpected external requests").toEqual([]);
});
```

## A note to strum inside a sustain

A second note at a later `timeMs`, inside the first note's tail. The first stays
held: the hand keeps the fret down and strikes the new string. The chart writes
the second note as an ordinary `strum`.

```ts id="note-sustain-strum" alt="A long note with a second, strummed note placed inside its tail."
import { expect, test } from "./support";
import { captureNoteType } from "./support";

test("a note to strum inside a sustain", async ({ context, page }) => {
  const leaked = await captureNoteType(context, page, "Held, then strummed");
  expect(leaked, "unexpected external requests").toEqual([]);
});
```

## A hammer-on inside a sustain

The same shape with the second note marked `hopo`: it is reached without a
strum, and the sustain is still held.

```ts id="note-sustain-hammer" alt="A long note with a second, white HOPO note placed inside its tail."
import { expect, test } from "./support";
import { captureNoteType } from "./support";

test("a hammer-on inside a sustain", async ({ context, page }) => {
  const leaked = await captureNoteType(context, page, "Held, then hammered");
  expect(leaked, "unexpected external requests").toEqual([]);
});
```

## An empty strum

`column: null` is an **open** note: nothing is fretted, so the strum is the
note. It is drawn across the whole highway. A drum chart uses the same shape for
a strum with no pad behind it.

```ts id="note-open" alt="One open note spanning the whole highway, with no fret column."
import { expect, test } from "./support";
import { captureNoteType } from "./support";

test("an empty strum", async ({ context, page }) => {
  const leaked = await captureNoteType(context, page, "Nothing fretted");
  expect(leaked, "unexpected external requests").toEqual([]);
});
```

## Note styles

The style is a **setting** (`settings.noteStyle`), not a property of the chart:
the same notes are drawn as bars, as gems, or as arrows. Bars are the default
the game has always had; arrows are for a dance mat, where the direction on the
note is also the direction on the pad.

### Bars

```ts id="style-bars" alt="Bars: rectangular notes with a coloured face on a five-column highway."
import { expect, test } from "./support";
import { captureNoteType } from "./support";

test("the bars style", async ({ context, page }) => {
  const leaked = await captureNoteType(context, page, "Note style", "Bars");
  expect(leaked, "unexpected external requests").toEqual([]);
});
```

### Gems

```ts id="style-gems" alt="Gems: rounded notes with a coloured face on the same highway."
import { expect, test } from "./support";
import { captureNoteType } from "./support";

test("the gems style", async ({ context, page }) => {
  const leaked = await captureNoteType(context, page, "Note style", "Gems");
  expect(leaked, "unexpected external requests").toEqual([]);
});
```

### Arrows

```ts id="style-arrows" alt="Arrows: notes carrying a direction on the face, and a pad drawn as an arrow."
import { expect, test } from "./support";
import { captureNoteType } from "./support";

test("the arrows style", async ({ context, page }) => {
  const leaked = await captureNoteType(context, page, "Note style", "Arrows");
  expect(leaked, "unexpected external requests").toEqual([]);
});
```
