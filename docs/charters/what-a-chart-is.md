---
title: What a chart is
description: "What the game plays: one melody chart for the words and a lane chart per instrument and difficulty, the note kinds, and what makes a chart playable."
updated: "2026-10-28"
order: 1
---

A **chart** is one thing to play: one instrument at one difficulty, or the words. The game plays a **track**, which is one **melody chart** for the words plus a **lane chart** for every instrument and level a song carries. Every format in [Formats](formats.md) is translated into this shape, and nothing in the game knows where a chart came from, so this page is the place to start whether you are writing a chart by hand or working out why one will not load.

The shape lives in `src/lib/game/track.ts` and is the only module that owns it.

## The track

A track is a song's title and length, its melody, its lane charts, and optionally its sections:

| Field | Meaning |
| --- | --- |
| `id`, `title`, `durationMs` | The song's identity and how long it runs. |
| `melody` | The words, pitched or not. Always present, even when a song has none. |
| `charts` | Every lane chart the song carries, at every level. |
| `sections` | Named markers in time order, when the source wrote any. Nothing judges on them. |

A song may carry one level for the guitar and none for the bass. It may carry no instrument at all and be a karaoke track. What it does **not** carry, a player cannot choose: the band screen offers the charts that exist, not a fixed list of four levels.

## The melody

The melody is the words. It is one chart however many parts it has:

- **`parts`** — 1 is a solo, 2 a duet, 3 a trio. It is the song's own fact, not a count of players: more players than parts share them.
- **`hasPitch`** — whether the words carry pitch. A pitched melody is a `vocals` chart and can be sung. A melody with no pitch is a `lyrics` chart: the words are typed (which is scored) or read in Listen, and there is no singer score.
- **`rows`** and **`rootMidi`** — the pitch roll. A row is one semitone, so a note's pitch is `rootMidi + row`. `rootMidi` 57 is A3. The roll is what a pitch drawn from a file and a frequency measured from a microphone have in common.
- **`lines`** — the words as lines, for the view: a start, an end, the parts that sing it, and its words.
- **`notes`** — the sung syllables, in time order. This is what a singer is judged on.

A melody note is a **syllable**, not a word:

| Field | Meaning |
| --- | --- |
| `timeMs`, `lengthMs` | When it starts and how long it is held. |
| `part` | Which melody part sings it, `0` to `parts - 1`. |
| `row` | The pitch row, or `null` for a freeform word (spoken or rapped). |
| `text` | The syllable as it should read, such as `Mon` or `key`. |
| `hero` | A bonus note, worth five times the normal value. |

A **word** is the whole thing a typist types. `Monkey` is one word made of two syllables, and the melody keeps both: the view draws the syllables on the roll, and the line's words are what a typist is held to. The source's own word breaks are respected — a trailing `-`, a leading space, a `~` — so a chart that was grouped correctly in its own format does not come back as fragments.

One note never runs into the next note of its own part. A source may write a long note over a short one that follows it; the game fits each note into its own turn before the stage sees it, so a run is never held at a note that has already been overtaken.

### The two time bases

In a **chart document**, a line's words are timed from the line, and its notes are timed from the song:

- `lines[].timeMs` is absolute; a word's `timeMs` is **relative to its line**.
- `notes[].timeMs` is **absolute**.

This is the most common wiring mistake in a new library. A word at `420` inside a line at `15200` is at `15620` in the song. A note at `15620` is already there.

The game stores both absolutely once it has read the document, so nothing downstream deals in two clocks.

## A lane chart

A lane chart is one instrument at one difficulty, with its own notes:

| Field | Meaning |
| --- | --- |
| `instrument` | `guitar`, `bass`, `drums`, `keys` or `dance`. |
| `role` | On a guitar only: `lead` or `rhythm`. Absent when the source named neither. |
| `difficulty` | `easy`, `normal`, `hard` or `expert`. |
| `columns` | How many columns the highway has. Never a property of the instrument. |

Plus, when the source marks them:

- **`bpm`** — the tempo the beat grid is drawn from. A chart that does not know its tempo has **no grid** rather than a made-up one, which is why the field is optional.
- **`phrases`** — the energy spans a player builds the meter in, in time order. A chart that marks none carries none.
- **`fills`** — **drum** charts only: freestyle windows. The notes inside are judged as any other note, and an extra strike with nothing to judge is a fill hit rather than an error.

A **column** is one vertical position on the highway. A **part** is a melodic line in the track, and a **role** is what a words player does with one (`sing` or `type`).

## A note

| Field | Meaning |
| --- | --- |
| `timeMs`, `lengthMs` | When it is hit, and how long it is held. `0` is not held. |
| `kind` | `strum` or `hopo`. |
| `column` | `0` to `columns - 1`, or `null` for an **open** note. |
| `hero` | A bonus note, worth five times the normal value. |

A note is a **strum** or a **hopo**. Tapping is not a note kind: it is how a controller
plays the note. Keys, a dance mat and a phone pad press the note with no separate strum
bar; a guitar strums. The chart says what the note is, and the controller says how the
player performs it.

- A **strum** note needs the strum gesture with its frets held — or, on a tapped
  instrument, a press of its key.
- A **hopo** is a note that can be hammered on: struck by the fret alone, without a
  strum. The chart says which notes those are, per note; the game does not infer it
  from the spacing. A hopo only exists on an instrument that strums.
- An **open** note has no column. It is strummed with no frets, spans the highway, and
  must stand alone at its moment — an open note beside another note is refused.
- On **drums**, column 5 is the **kick pedal**. A drum highway is six columns wide
  whether or not the chart uses the pedal, and a kick can share a moment with a pad.

An older document may still say `tap` for a note on a tapped instrument. It is read as
an ordinary `strum`, which is the same note under a clearer name.

A **chord** is implicit: notes that share a moment in one chart are the chord. There is no chord id and no chord shape, and a strum judges the whole group — all of it or none of it. A chord can start several sustains at once, so letting one fret go stops that hold and leaves the others.

## What makes a chart playable

`chartProblems` is the validator. It is pure, unit-tested, and every parser is held to it — the importer before it writes, and the stage before it judges. A chart with an empty list of problems is playable.

The rules, in the order they bite:

1. `columns` is a whole number of at least 1.
2. `bpm`, if present, is greater than 0.
3. Phrases are in time order, do not overlap, and do not run backwards. A phrase of no length is tolerated; a **fill** of no length is not, because a freestyle window with no width has nothing in it.
4. Note ids are unique, and notes are in time order.
5. Every column is inside the highway. A note outside the columns is not clamped onto the board; the chart is refused.
6. An open note is on a strummed instrument, and is alone at its moment.
7. A hopo is on a strummed instrument, and is not the first note — there is nothing before it to hammer on from.
8. A note kind is `strum` or `hopo`; `tap` is not a note kind. A legacy `tap` is read as `strum`.

It deliberately does not check a note against the song's length, or the chart against the audio: those are the source's business, and a chart that starts late is still a chart. A note with a missing or negative time is refused earlier, by the reader that places it.

A chart the game is about to play is checked in `assembleTrack`. A chart that fails is **dropped and named** — `guitar/expert: note x is outside the highway` — and the run goes on without it, because a band with one part missing is still a band. The band and loading screens show the problems, so a chart that never arrives is said rather than silently absent.

A chart document with no notes at all passes that validator — there is nothing wrong with it — but it leaves a panel with nothing to play. That is a contents problem, not a format problem.

## What makes a chart refused before that

The readers are tolerant, and they name what they drop:

- A note with no time, or a column outside the song document's `laneCount`, is dropped from the chart and reported.
- A chart listing with no `difficulty` on a highway, no `laneCount`, or a `url` that is not an `http(s)` address is skipped, and the part may lose its only chart.
- A chart document that says it is `drums` while the song document lists it as `lanes` is refused whole.
- A voice chart on an instrument part, or a lane chart on the voice, is refused.
- A word on a part the chart does not declare, or a row above the roll, is dropped and named.
- A melody with more parts than the stage draws keeps them: voices beyond three **share the last part**, and the chart is told so rather than losing a whole harmony.

## Difficulty belongs to the chart

There are four levels, and a chart is one of them. A song can be Hard on the guitar and Expert to sing, and it can carry a guitar chart at only one level.

- An instrument gets exactly the levels its charts carry, and the band screen offers those.
- A **singer** always has easy, normal and hard. Singing is judged by how much of a note was held in tune, so the level is the microphone's tolerance rather than a chart's. A song never needs a vocal chart per level.
- A **typist** has no level at all. Typing is free play.
- Asking for a level a song does not carry resolves to the nearest it has, with ties going to the **easier** one. A band is remembered across songs, so a mismatch is ordinary rather than an error.

On a guitar, **lead and rhythm are two seats**. A song may carry both; each is a part with its own chart and, when the folder has them, its own stems and its own place in the score board's lineup. A seat that names no role takes the lead on a song that has two, and takes the only role on a song that has one.

## Where to go next

- [Formats](formats.md) — the files this shape is read from, and what each one can and cannot say.
- [Libraries](libraries.md) — the three documents a published chart lives in.
- [When a chart will not load](when-a-chart-will-not-load.md) — the faults that are not about the shape.
