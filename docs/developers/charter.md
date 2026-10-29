---
title: Charter
description: "The /charter island: what it loads, how a take becomes notes, why eight charts are visible at once, and what its Download button writes."
updated: "2026-10-29"
order: 21
---

The charter is a **separate island** at `/charter`: a tool for making and editing
instrument charts, reached from the game's menu. It is not a screen in the run loop.
The game's session, band, judging, score board and mixer are not mounted there; the
charter has its own root, its own clock and the song's own audio. That is why it can
carry a large editor without touching the first `/play` download.

## What it loads

A song is opened from the library, a local folder, or a playlist URL the charter adds
to the library. The loader is `src/components/charter/useCharterSong.ts`:

- a remote song goes through `cachedJson` and `readSongDoc`, then **every** chart the
  document lists (not only a band's seats) goes through `readChart`;
- a local folder goes through `readLocalSource`, so it gets every chart in one parse
  and its audio as `folder://` URLs;
- a `.sng` package is named as not editable yet rather than half-opened.

The project holds the game's own `LaneChart` shapes. The **voice chart is not
editable**; a chart document that is not an instrument chart is ignored by the
charter. The audio is streamed by the same `SongAudio` the stage uses, so the clock
follows the song's stems.

## The model

- `src/lib/game/charter/grid.ts` — BPM, beats per bar, subdivision, snapping, bar
  positions and the lines a pane draws. The grid is one per project; the exported
  `.chart` carries its BPM.
- `src/lib/game/charter/edit.ts` — every edit is a pure function over notes:
  add, remove, move, set one note, quantize, copy/paste, duplicate chart. Every
  result goes through `normaliseChart`, which sorts, dedupes a column at a moment,
  fixes a kind the instrument cannot play, and stops a sustain at the next note in
  its column.
- `src/lib/game/charter/record.ts` — a take (`ActionEvent[]`, the same actions a run
  judges) becomes notes: a strum takes the frets held at that moment, a tapped
  instrument takes each press, a hold becomes a sustain, and a strum with nothing
  down on a drum kit is not an open note.
- `src/lib/game/charter/exportChart.ts` — the whole chart set as one Clone Hero /
  YARG `.chart` file.

Undo is a bounded stack of immutable chart-list snapshots. A recording take is one
step, not one per note.

## Eight panes, any number of charts

The **song** can carry more than eight charts. The **panes** show up to eight at once,
which is the comparison the charter is for: guitar easy beside normal beside hard
beside expert, and the bass and drums below. Hiding one makes room for another; the
chart list is the whole song. The recording target is the active pane, and only that
one.

Clicking empty highway adds a note at the snapped moment and column; dragging over
empty cells paints; dragging a note moves the selection. `Pane` geometry is the
game's own `notesInWindow` / `useScrollTrack` / `noteBox`, face-on (2D), with the
playhead low in the pane. The pane has no per-frame React state: the clock carries
the layer.

## Recording

The charter's input is its own hook (`useCharterRecord`) because a charter is not a
band. It still uses the game's layouts: `keyAction`, `padAction`, `padAxisAction` and
`midiAction`, so keyboard, gamepad and MIDI mean what they mean in a run. A take is
stamped with `clock.timeOf`, exactly as judging is, and the project audio-lag setting
is not applied twice.

While a take is armed the recording layout owns the keyboard; the editor's shortcuts
step aside. Escape stops the take. A take can **replace** the span it covered or
**overdub** on top of it; quantization is a toggle.

## Export

`Download .chart` writes one file containing every instrument chart it can express:
`Single` / `DoubleRhythm` / `DoubleBass` / `Drums` / `Keyboard` (and `GHLGuitar` for a
six-column guitar). Star-power phrases become `S 2` events, sections become
`E "section …"`, and notes are converted to ticks at the project BPM. A dance chart
is named and skipped — the format has no dance track. Pair the file with the song's
audio as `song.ogg` (or `MusicStream`'s name) to read it in a folder or in Clone
Hero.

There is no write-back to a remote chart: a URL is somebody else's file. The
charter's work is in the tab until it is downloaded, which is why the Download button
is the primary action.
