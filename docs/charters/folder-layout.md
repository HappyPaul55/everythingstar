---
title: Folder layout
description: "How the game reads a song folder: which file is the chart and which is the audio, the cover and song.ini, the encodings, and what makes a folder one song."
updated: "2026-10-28"
order: 3
---

A chart folder is a directory with one chart and the files around it. The game reads it on a disk (with your permission, in the Playlists dialog) or after `bun run import` has turned it into [the three documents](libraries.md). Both paths use the same name tables, so a folder that plays from your disk plays the same way when it is published.

This page is the folder's side of that contract. Here is one, complete:

```text
Jonathan Coulton - Code Monkey/
  notes.mid
  song.ini
  song.ogg
  guitar.ogg
  bass.ogg
  drums_1.ogg
  drums_2.ogg
  drums_3.ogg
  vocals.ogg
  crowd.ogg
  preview.ogg
  album.jpg
```

## The chart, in one order

A folder can hold more than one thing that parses: a Guitar Hero chart and a stray `song.txt`, a Clone Hero `.chart`, a StepMania `.sm`, a lyric sheet. The game chooses **one order**, everywhere:

1. `notes.mid`
2. any `.chart`
3. any `.sm`
4. a text sheet: `song.txt`, then another `.txt` that is not documentation, then `.lrc`/`.srt`/`.vtt`

`notes.mid` is the Guitar Hero and YARG convention; a `.chart` is Clone Hero's; a `.sm` is StepMania's. The text step is UltraStar's, with one correction that matters: **`song.txt` wins** over `instrumental.txt`, and a `license.txt` or `readme.txt` is never a chart. A `.txt` that opens with `#TITLE:`, `#ARTIST:`, `#BPM:`, `#MP3:` or `#GAP:` is a karaoke sheet; a changelog is not.

`.ssc` is read when a file is handed to the reader directly, but it is **not** in this order: a folder whose only chart is a `.ssc` is not found as a song. Rename it `.sm`, or point a playlist entry at the file itself.

The same order is used when the folder is listed and when a song is played, so the row you pick is drawn from the file the run reads.

## The audio names

Audio is found by convention. Each audio base name may be `.ogg`, `.opus`, `.mp3` or `.wav`; the preview clip is `.ogg`, `.opus` or `.mp3`:

| File | What it is |
| --- | --- |
| `song.*` | The whole mix, when the folder ships one. `song_original.*` is a second whole mix, tried after `song.*`. |
| `audio.*` | The **UltraStar** master: the file a karaoke sheet names in `#MP3`. Without it, an UltraStar folder plays only the file its header names — which is often not there. |
| `guitar.*`, `lead.*` | The lead guitar. |
| `rhythm.*` | The rhythm guitar — or the bass, on a song that has a bass chart and no `bass.*`. |
| `bass.*` | The bass. |
| `drums.*`, `drums_1.*` … `drums_4.*` | The kit, whole or cut into pieces. A kit in four files is still **one** instrument. |
| `keys.*` | Keys. |
| `vocals.*`, `vocals_1.*` | The lead vocal. |
| `vocals_2.*`, `harmony.*` | A harmony. |
| `crowd.*` | The audience. Recognised and carried, but **not** part of the run's mix; the room's crowd is the game's own sound. |
| `preview.*` | The jukebox clip. Not a stem: nothing mixes it in and a miss never touches it. |

Which of these is *the song* is not a naming question — a folder of one or two instruments uses its master as backing and its parts as the song, while a multitrack's master is not the song at all. That rule is in [Audio and stems](audio-and-stems.md), because it is about the mix rather than the folder.

One correction is worth knowing here: a song with a **bass chart but no `bass.*`** gives its `rhythm.*` to the **bass**. Measured on a bass-led song, that file is about 22 dB louder below 160 Hz than above 250 Hz — it is the bass, whatever it is called. A folder with a real `bass.*`, even a silent one, keeps its names as they are.

Audio is **referenced, never copied**. The importer records the path and leaves the file where it is.

## The cover

`album.png` is the convention. A folder that re-cut its art often leaves the old one beside it, so the table also accepts:

`album.jpg`, `album.jpeg`, `album_alt.png`, `album_alt.jpg`, `album_alt2.png`, `album (1).png`, `old album.png`, `small album.png`, `cover.png`, `cover.jpg`, `cover.jpeg`.

The first name found wins. An UltraStar sheet's `#COVER` is used when the folder has no file the table knows. A song with no art is not a fault: the row draws the song's initials over its accent colour, at the same size, so nothing moves because a neighbour has a picture.

A folder's art is a file, not a URL. The browser reads it and hands the element an object URL, so a `folder://` path never reaches an `<img>` directly.

## `song.ini`

A plain `key = value` file beside a Guitar Hero or Clone Hero chart. It is read tolerantly — keys are lower-cased, a matching pair of quotes is stripped, a value may contain `=` — and only these keys are used:

| Key | Read as |
| --- | --- |
| `name` | The title. The key is `name`, not `title`. |
| `artist` | The artist. |
| `album` | The album name. |
| `year` | The release year, when it is a real year (roughly 1000–3000). |
| `song_length` | The length in **milliseconds**. `0` means "not stated". |
| `preview_start_time` | Where the jukebox preview starts, in milliseconds. |
| `offset` | The chart's shift against the audio, in milliseconds. Positive moves the chart later. |

`genre` is **not read**: the jukebox has no genre field, and a value there is ignored. Neither is any other key, including the ones Clone Hero adds for its own menus. `[song]` is a section header and is skipped; every key shares one namespace.

A `song.ini` is also what tells the folder reader that a folder with subfolders is still **one song** (see below), which is why a song that keeps its art in an `art/` folder should have one.

## Encodings

A chart collection is a decade of tools sharing files, so text is read three ways:

- **UTF-16**, when a byte-order mark says so or the bytes themselves do — a `song.ini` written on Windows is often UTF-16, and read as UTF-8 it gives a title with a space between every letter.
- **UTF-8**, when it decodes cleanly.
- **CP-1252** otherwise, because a chart from an old tool very often is, and a strict decoder would return `Z?rich` for `Zürich`.

Both byte orders of UTF-16 are handled, a byte-order mark is dropped, and a `song.ini` written on an old Mac, with `\r` alone, is read as line breaks too.

## A length the file does not state

Plenty of charts never say how long they are. A stated length always wins; without one, the length comes from the notes themselves — the last thing that sounds, plus **3 seconds** of tail so a run does not end on its final beat.

- A `song.ini`'s `song_length` wins when it is above zero.
- An UltraStar sheet's length comes from its last melody line.
- StepMania's `#LENGTH` is in **seconds**.
- A lyric sheet ends with its last cue.
- A song with no notes and no words stays unknown rather than inventing a three-second song.

A **playlist entry** carries its own `durationMs`, and that is what the jukebox row shows. A published library has to set it even when the chart file says nothing.

## The folder name

Most copies name their folder `Artist - Title`, and some carry no `song.ini` at all. When the file says nothing, the folder name is the fallback: `Jonathan Coulton - Code Monkey` becomes that artist and title.

It is a **fallback and never an override**. Anything the file states wins, so renaming a folder cannot rename a song that names itself.

## When a folder is one song, and when it is a collection

A folder is a song when it holds a chart, and when it is not a collection:

- A folder with **no subfolders** is a song.
- A folder with **subfolders** is a song only when it holds a `song.ini`; otherwise it is a **collection**, and the game walks into it looking for songs.
- A `.sng` file is **a song of its own**. A folder may hold several packages, and it may hold a package and a loose song; both are listed.

That rule is why a chart collection — a changelog in the root and forty song folders underneath — is read as forty songs rather than one nameless song with no length. It is also why a song folder with a `cover/` subfolder and no `song.ini` is read as a collection, and its songs are looked for inside it. Give such a folder a `song.ini`.

## What the game ignores

- `license`, `readme`, `changelog`, `copying` and `credits` text files, which sit beside real charts and are not charts.
- `instrumental.txt` when there is a `song.txt`, because the sheet is the song and the instrumental is the other version.
- A duplicate chart at one instrument, role and level — the source's own priority decides which is kept, and the other is named.
- A second voice beyond two in UltraStar (the first two are used).
- Mines in a StepMania chart: this game has no "do not step there", so they are dropped and named.
- A track in a MIDI whose name is not a part: it is skipped silently, which is the first thing to check when a whole song comes back empty.

If a folder still reads wrongly, [When a chart will not load](when-a-chart-will-not-load.md) is the checklist.
