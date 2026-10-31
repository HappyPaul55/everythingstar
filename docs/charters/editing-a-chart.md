---
title: Making a chart
description: "Open a song in the charter, edit or record its instrument charts, compare up to eight at once, and download a Clone Hero .chart."
updated: "2026-10-31"
order: 9
---

The charter is a chart editor built into EverythingStar — a tool, not a game
mode. Open it from **Charter mode** on the main menu, or at [`/charter`](/charter).

## Open a song

Pick a song from your library, open a folder, or add a playlist URL. The charter
reads **every** chart the song carries, not only the one a band would play.

[The charter's song picker, with a library song, an open folder and a playlist URL.](shot:charter-picker)

## Edit

[The charter editor with a chart open, its highway and editing controls.](shot:charter-editor)

- A note is a **strum** or a **hopo**; [tapping is not a third kind](note-types.md).
- **Click** an empty cell to add a note at that column and moment.
- **Drag** across empty cells to paint notes.
- **Drag a note** to move it and the rest of the selection.
- **Click** a note to select it; **Shift-click** adds. The footer shows its exact
  time, column, length and kind. **Double-click** a highway to select its whole
  chart.
- **Snap** chooses the grid a new or moved note lands on and the lines drawn under
  the notes; it does not move notes already there.
- **Quantize takes** snaps recorded notes as they are captured. **Quantize** pulls
  the selected notes — or the whole active chart when nothing is selected — onto the
  current Snap grid.
- **Copy / Paste** moves a selection to the playhead, including into another chart.
  **Undo / Redo** covers every edit and a whole take as one step.

`Space` plays and pauses; arrow keys nudge the selection by a column or grid step,
Shift and up/down by a bar; Delete removes it.

## Show more than one chart

A song can have any number of charts, and up to **eight** panes are visible at once —
for example the four guitar levels beside the four bass levels. **Charts** shows or
hides a chart, chooses the one you are editing, and makes a new one at any instrument
and level.

[The Charts dialog over the editor: every chart the song carries, with the ones on the board marked.](shot:charter-charts)

## Record a take

Choose the chart, press **Record**, and play with the keyboard, a gamepad or a MIDI
input. The arrow beside Record opens **Record with** (the controller) and **Record
mode** (replace the section, or overdub). A strum takes the frets held at that
moment; a tapped instrument turns each press into a strum note; a held fret is a
sustain. The take starts at the playhead and stops when you press Record again (or
Escape). **Replace section** is the default; **Overdub** lays the take over what is
there. **Quantize** snaps the take as it is captured.

## Download

**Download .chart** writes a Clone Hero / YARG `.chart` with every chart the format
can carry. To play it here, put it beside the song's audio as `song.ogg` and open
that folder from **Playlists**; Clone Hero and YARG use the same folder.

The charter uploads nothing and never writes back to a playlist's file: your work
lives in the tab until you download it.
