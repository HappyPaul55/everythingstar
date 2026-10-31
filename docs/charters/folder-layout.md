---
title: Folder layout
description: "How the game reads a song folder: which file is the chart and which is the audio, the cover and song.ini, the encodings, and what makes a folder one song."
updated: "2026-10-31"
order: 4
---

A chart folder is a chart and the files around it. The game reads it on disk (with permission, in the Playlists dialog) or after `bun run import` turns it into [the three documents](libraries.md); both use the same name tables, so it plays the same either way.

Here is one, complete:

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

A folder can hold more than one thing that parses — a Guitar Hero chart and a stray `song.txt`, a Clone Hero `.chart`, a StepMania `.sm`, a lyric sheet — so the game chooses **one order**:

1. `notes.mid`
2. any `.chart`
3. any `.sm`
4. a text sheet: `song.txt`, then another `.txt` that is not documentation, then `.lrc`/`.srt`/`.vtt`

`notes.mid` is Guitar Hero and YARG's convention, `.chart` Clone Hero's, `.sm` StepMania's. In the text step **`song.txt` wins** over `instrumental.txt`, and a `license.txt` or `readme.txt` is never a chart; a `.txt` opening with `#TITLE:`, `#ARTIST:`, `#BPM:`, `#MP3:` or `#GAP:` is a karaoke sheet.

`.ssc` is read when handed to the reader directly, but is **not** in this order: a folder whose only chart is a `.ssc` is not found as a song. Rename it `.sm`, or point a playlist entry at the file.

Listing and playing share the order, so the row you pick is the file the run reads.

## The audio names

Audio is found by convention; each base name may be `.ogg`, `.opus`, `.mp3` or `.wav`, a preview `.ogg`, `.opus` or `.mp3`:

| File | What it is |
| --- | --- |
| `song.*` | The whole mix, when shipped; `song_original.*` is a second, tried after it. |
| `audio.*` | The **UltraStar** master, named by `#MP3`; without it the folder plays the header's file — often absent. |
| `guitar.*`, `lead.*` | The lead guitar. |
| `rhythm.*` | The rhythm guitar — or the bass, on a song with a bass chart and no `bass.*`. |
| `bass.*` | The bass. |
| `drums.*`, `drums_1.*` … `drums_4.*` | The kit, whole or in pieces; four files are still **one** instrument. |
| `keys.*` | Keys. |
| `vocals.*`, `vocals_1.*` | The lead vocal. |
| `vocals_2.*`, `harmony.*` | A harmony. |
| `crowd.*` | The audience, carried but **not** in the run's mix; the room's crowd is the game's own. |
| `preview.*` | The jukebox clip; not a stem, so nothing mixes it in or ducks it. |

Which file is *the song* is not a naming question; [Audio and stems](audio-and-stems.md) owns that rule, because it is about the mix rather than the folder.

One correction belongs here: a song with a **bass chart but no `bass.*`** gives its `rhythm.*` to the **bass**. On a bass-led song that file is about 22 dB louder below 160 Hz than above 250 Hz. A folder with a real `bass.*`, even a silent one, keeps its names.

Audio is **referenced, never copied**. The importer records the path and leaves the file where it is.

## The cover

`album.png` is the convention. A re-cut folder often leaves its old art beside the new, so the table also accepts:

`album.jpg`, `album.jpeg`, `album_alt.png`, `album_alt.jpg`, `album_alt2.png`, `album (1).png`, `old album.png`, `small album.png`, `cover.png`, `cover.jpg`, `cover.jpeg`.

The first found wins; an UltraStar sheet's `#COVER` is used when no known file exists. No art is not a fault: the row draws the song's initials over its accent colour at the same size, so a neighbour's picture moves nothing.

A folder's art is a file, not a URL: the browser reads it into an object URL, so a `folder://` path never reaches an `<img>`.

## `song.ini`

A plain `key = value` file beside a Guitar Hero or Clone Hero chart. Read tolerantly — lower-cased keys, quotes stripped, `=` allowed in a value — only these keys are used:

| Key | Read as |
| --- | --- |
| `name` | The title. The key is `name`, not `title`. |
| `artist` | The artist. |
| `album` | The album name. |
| `year` | The release year, when real (roughly 1000–3000). |
| `song_length` | The length in **milliseconds**. `0` means "not stated". |
| `preview_start_time` | Where the jukebox preview starts, in milliseconds. |
| `offset` | The chart's shift against the audio, in milliseconds. Positive moves the chart later. |

`genre` is **not read** — the jukebox has no genre field — and neither is any other key, including Clone Hero's menu keys. `[song]` is a section header and is skipped; every key shares one namespace.

A `song.ini` also keeps a folder with subfolders **one song** (see below), so a song with art in `art/` should have one.

## Encodings

Text is read three ways:

- **UTF-16**, when a byte-order mark says so or the bytes do — a Windows `song.ini` is often UTF-16, and reads as a title with a space between every letter.
- **UTF-8**, when it decodes cleanly.
- **CP-1252** otherwise, because a chart from an old tool often is, and a strict decoder returns `Z?rich` for `Zürich`.

Both UTF-16 byte orders are handled, a byte-order mark dropped, and bare `\r` read as a line break.

## A length the file does not state

Plenty of charts never say how long they are. A stated length always wins; without one it comes from the notes — the last thing that sounds, plus **3 seconds** so a run does not end on its final beat.

- `song.ini`'s `song_length`, when above zero.
- An UltraStar sheet's last melody line.
- StepMania's `#LENGTH`, in **seconds**.
- A lyric sheet's last cue.
- A song with no notes and no words stays unknown rather than inventing a three-second song.

A **playlist entry** carries its own `durationMs`, and that is what the jukebox row shows. A published library has to set it even when the chart file says nothing.

## The folder name

Most copies name their folder `Artist - Title`, some carry no `song.ini`. When the file says nothing, the folder name is the fallback: `Jonathan Coulton - Code Monkey` becomes that artist and title.

It is a **fallback and never an override**: anything the file states wins, so renaming a folder cannot rename a song that names itself.

## When a folder is one song, and when it is a collection

A folder is a song when it holds a chart and is not a collection:

- **No subfolders**: a song.
- **Subfolders**: a song only with a `song.ini`; otherwise a **collection**, and the game walks into it.
- A `.sng` file is **a song of its own**. A folder may hold several, or a package and a loose song; both are listed.

That is why a chart collection — a changelog in the root, forty song folders under it — reads as forty songs rather than one nameless song, and why a song folder with a `cover/` subfolder and no `song.ini` reads as a collection. Give it a `song.ini`.

## What the game ignores

- `license`, `readme`, `changelog`, `copying`, `credits`: files beside real charts, not charts.
- `instrumental.txt` when there is a `song.txt`: the sheet is the song, the instrumental the other version.
- A duplicate chart at one instrument, role and level: the source's priority keeps one and names the other.
- A third UltraStar voice (the first two are used).
- StepMania mines, dropped and named: this game has no "do not step there".
- A MIDI track whose name is not a part: skipped silently, the first thing to check when a song is empty.

If a folder still reads wrongly, [When a chart will not load](when-a-chart-will-not-load.md) is the checklist.
