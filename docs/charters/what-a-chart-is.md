---
title: What a chart is
description: "What the game plays: one melody chart for the words and a lane chart per instrument and difficulty, the note kinds, and what makes a chart playable."
updated: "2026-10-31"
order: 1
---

A **chart** is one thing to play: one instrument at one difficulty, or the words. The game plays a **track**: one **melody chart** for the words plus a **lane chart** for every instrument and level a song carries. Every format in [Formats](formats.md) is translated into this shape, whether you write a chart by hand or work out why one will not load.


## The track

A track holds:

| Field | Meaning |
| --- | --- |
| `id`, `title`, `durationMs` | The song's identity and how long it runs. |
| `melody` | The words, pitched or not. Always present, even when a song has none. |
| `charts` | Every lane chart the song carries, at every level. |
| `sections` | Named markers in time order, when the source wrote any. Nothing judges on them. |

A song may carry one guitar level and no bass, or no instrument and be a karaoke track. A player can choose only the charts that exist: the band screen offers those, not a fixed list of four.

## The melody

The melody is the words, one chart however many parts:

- **`parts`** — 1 is a solo, 2 a duet, 3 a trio. It is the song's fact, not a player count: more players than parts share them.
- **`hasPitch`** — whether the words carry pitch. A pitched melody is a `vocals` chart and can be sung. One with no pitch is a `lyrics` chart: the words are typed (and scored) or read in Listen, with no singer score.
- **`rows`** and **`rootMidi`** — the pitch roll. A row is one semitone, so a note's pitch is `rootMidi + row`; `rootMidi` 57 is A3. The roll is what a written pitch and a frequency measured from a microphone have in common.
- **`lines`** — the words as lines for the view: start, end, singing parts and words.
- **`notes`** — the sung syllables, in time order. This is what a singer is judged on.

A melody note is a **syllable**, not a word:

| Field | Meaning |
| --- | --- |
| `timeMs`, `lengthMs` | When it starts and how long it is held. |
| `part` | Which melody part sings it, `0` to `parts - 1`. |
| `row` | The pitch row, or `null` for a freeform word (spoken or rapped). |
| `text` | The syllable as it should read, such as `Mon` or `key`. |
| `hero` | A bonus note, worth five times the normal value. |

A **word** is what a typist types. `Monkey` has two syllables and the melody keeps both: the view draws them, and the line's words are what a typist is held to. Word breaks are respected — a trailing `-`, a leading space, a `~` — so a correctly grouped chart does not come back as fragments.

One note never runs into the next of its own part. A source may write a long note over a short one that follows; the game fits each note into its own turn before the stage sees it, so a run is never held at a note already overtaken.

### The two time bases

In a **chart document**, a line's words are timed from the line, and its notes are timed from the song:

- `lines[].timeMs` is absolute; a word's `timeMs` is **relative to its line**.
- `notes[].timeMs` is **absolute**.

This is the commonest wiring mistake in a new library. A word at `420` inside a line at `15200` is at `15620` in the song; a note at `15620` is already there.


## A lane chart

A lane chart is one instrument at one difficulty, with its own notes:

| Field | Meaning |
| --- | --- |
| `instrument` | `guitar`, `bass`, `drums`, `keys` or `dance`. |
| `role` | On a guitar only: `lead` or `rhythm`. Absent when the source named neither. |
| `difficulty` | `easy`, `normal`, `hard` or `expert`. |
| `columns` | How many columns the highway has. Never a property of the instrument. |

Plus, when the source marks them:

- **`bpm`** — the tempo the beat grid is drawn from. Without it a chart has **no grid** rather than a made-up one, which is why it is optional.
- **`phrases`** — the energy spans a player builds the meter in, in time order.
- **`fills`** — **drum** charts only: freestyle windows. The notes inside are judged as any other note, and an extra strike with nothing to judge is a fill hit rather than an error.

A **column** is one vertical position on the highway. A **part** is a melodic line in the track, and a **role** is what a words player does with one (`sing` or `type`).

## A note

A note is a time, a length, a kind (`strum` or `hopo`), a column (`null` for an
**open** note) and an optional `hero` flag. Notes that share a moment are a
**chord**, with no chord id and no shape. `tap` is not a note kind: a controller
taps, the chart strums, and a legacy `tap` is read as `strum`. On **drums**,
column 5 is the **kick pedal** and the highway is six columns wide whether or not
the chart uses it. [Note types](note-types.md) covers every shape, how a chord
judges as a whole, and how each one is drawn.

## What makes a chart playable

`chartProblems` is the validator: pure, unit-tested, applied by every parser — the importer before writing, the stage before judging. An empty list means playable.

The rules, in the order they bite:

1. `columns` is a whole number of at least 1.
2. `bpm`, if present, is greater than 0.
3. Phrases are in time order, do not overlap, and do not run backwards. A phrase of no length is tolerated; a **fill** of no length is not, because a freestyle window with no width has nothing in it.
4. Note ids are unique, and notes are in time order.
5. Every column is inside the highway. A note outside the columns is not clamped onto the board; the chart is refused.
6. An open note is on a strummed instrument, and is alone at its moment.
7. A hopo is on a strummed instrument, and is not the first note — there is nothing before it to hammer on from.
8. A note kind is `strum` or `hopo`; `tap` is not a note kind. A legacy `tap` is read as `strum`.

It does not check a note against the song's length or the chart against the audio: those are the source's business, and a chart that starts late is still a chart. A missing or negative time is refused earlier, by the placing reader.

A chart about to be played is checked in `assembleTrack`. One that fails is **dropped and named** — `guitar/expert: note x is outside the highway` — and the run goes on, because a band missing one part is still a band. The band and loading screens show the problems, so a missing chart is said.

A chart document with no notes passes the validator, but leaves a panel with nothing to play: a contents problem, not a format problem.

## What makes a chart refused before that

The readers are tolerant, and they name what they drop:

- A note with no time, or a column outside the song document's `laneCount`, is dropped and reported.
- A chart listing with no `difficulty`, no `laneCount`, or a `url` that is not `http(s)` is skipped, and the part may lose its only chart.
- A chart document saying `drums` while the song document lists `lanes` is refused whole.
- A voice chart on an instrument part, or a lane chart on the voice, is refused.
- A word on a part the chart does not declare, or a row above the roll, is dropped and named.
- A melody with more than three parts keeps them: later voices **share the last part**, and the chart is told rather than losing a harmony.

## Difficulty belongs to the chart

There are four levels, and a chart is one of them: a song can be Hard on guitar, Expert to sing, and carry a guitar chart at only one level.

- An instrument gets exactly the levels its charts carry.
- A **singer** always has easy, normal and hard: singing is judged on how much of a note was held in tune, so the level is the microphone's tolerance, not a chart's.
- A **typist** has no level at all. Typing is free play.
- A level a song does not carry resolves to the nearest it has, ties going to the **easier** one. A band is remembered across songs, so a mismatch is ordinary rather than an error.

On a guitar, **lead and rhythm are two seats**. A song may carry both; each is a part with its own chart and, when the folder has them, its own stems and score board slot. A seat naming no role takes the lead on a song with two, the only role on a song with one.

## Where to go next

- [Formats](formats.md) — the files this shape is read from, and what each can and cannot say.
- [Libraries](libraries.md) — the three documents a published chart lives in.
- [When a chart will not load](when-a-chart-will-not-load.md) — the faults that are not about the shape.
