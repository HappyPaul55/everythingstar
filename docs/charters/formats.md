---
title: Formats
description: "Every chart format the game reads — Guitar Hero and YARG MIDI, Clone Hero .chart, UltraStar, StepMania, .sng and timed lyrics — and what each cannot give you."
updated: "2026-10-31"
order: 3
---

The game reads six families of file into the shape described in [What a chart is](what-a-chart-is.md). **What a file starts with** decides its reader, not its name: a chart with the wrong extension is still a chart, and a `.txt` changelog is not a song; the name only breaks a tie.

A file is somebody else's, so every reader drops what it cannot place, **names the problem** and keeps the rest: a half-readable song is still worth playing.

| Format | Gives you | Cannot give you |
| --- | --- | --- |
| Guitar Hero / YARG MIDI | Every instrument and level, vocals with pitch, sections, star power, drum fills | Metadata without a `song.ini`; a fourth voice of its own; a pitch below MIDI 40 |
| Clone Hero `.chart` | The same, in readable text, with its own metadata | A chart type it has no section word for; lyrics; a slide's link |
| UltraStar `.txt` | Karaoke words with pitch, one or two voices | Instruments, levels, sections, fills |
| StepMania `.sm`/`.ssc` | A dance chart at several levels | Anything but dance; words; fills |
| `.sng` package | A whole song folder in one file | Easy hand-editing; more than one chart in play |
| Timed lyrics | Words and their times | Pitch, instruments, a singer score |

## Guitar Hero and YARG MIDI

The rhythm-game convention and best band source: one MIDI track per part, **every difficulty inside it**, and a note's meaning carried by its pitch.

| Level | Frets (green–orange) | Open / hopo / strum |
| --- | --- | --- |
| Easy | 60–64 | 59 / 65 / 66 |
| Normal | 72–76 | 71 / 77 / 78 |
| Hard | 84–88 | 83 / 89 / 90 |
| Expert | 96–100 | 95 / 101 / 102 |

- `+1` to `+4` above green are red, yellow, blue and orange. `−1` is the **open** note on guitar and the **kick pedal** on drums. `+5` and `+6` mark **hammer-on** or **strum** for that moment; the game uses the flag, not spacing.
- `116` marks **star power**, as a sustained note per phrase or marker pairs; it becomes the chart's energy phrases.
- On a voice track `105` opens a **lyric line**, and the lyric events (MIDI meta text) carry one syllable each. A trailing `-` continues a word, `+` is a note with no characters, and a long gap starts a word. A note below MIDI 40 is a talkie, spoken and unpitched.
- Drum fills come from `[mix 8]` events or a section named "fill"; the window closes at the next mix marker, section or `[end]`.
- `[section Verse 1]` becomes a section; `[end]` says where the song stops.

The track names it knows:

| Track | Becomes |
| --- | --- |
| `PART GUITAR`, `PART GUITAR COOP`, `T1 GEMS` | guitar, **lead** |
| `PART RHYTHM` | guitar, **rhythm** |
| `PART BASS`, `PART KEYS`, `PART DANCE` | bass, keys, dance |
| `PART DRUMS`, `PART REAL_DRUMS_PS` | drums |
| `PART VOCALS`, `HARM1`, `HARM2`, `HARM3` | melody parts, in that order |

A track with `GHL` is a six-fret guitar, read as six columns; `TOUCH` is ignored. **Any other name is not a part** — the usual reason a song comes back empty is a renamed or unknown variant. `T1 GEMS` is an early guitar name; its extra pitches are ignored.

Other rules:

- A `song.ini`'s **`offset` is applied once to the whole timeline** — notes, sections and `[end]`. The sign matches `.chart`'s: positive moves the chart later.
- **Voice parts are compacted** to `0..n-1`: a harmonies chart can ship `HARM1`/`HARM2` with no `PART VOCALS`, and a singer on part 0 must still have a part. A fourth voice is named and shared.
- A MIDI with no part names may still be karaoke: the track with the most lyric events becomes the voice. A `.kar` reads this way.
- No lyric events means no melody; an instrumental's empty voice track is not words, and none is invented.
- A RIFF `RMID` wrapper is unwrapped first. A file cut inside its header, a track header or between tracks is named as truncated, not an empty song.

It cannot carry a video, and its tempo map is one per song, so a chart cannot have a different tempo per difficulty.

## Clone Hero and Phase Shift `.chart`

A text format, the easiest instrument format to patch by hand: every chart is its own named section, so nothing is pulled apart by pitch.

```text
[Song]
{
  Resolution = 480
  MusicStream = "song.ogg"
}
[SyncTrack]
{
  0 = B 120000
  0 = TS 4
}
[Events]
{
  0 = E "section Intro"
}
[ExpertSingle]
{
  3840 = N 2 479
  9600 = S 2 1920
}
```

- **`Resolution`** (or `TimeDivision`) is how many ticks a quarter note is cut into, and every time is measured against it. A missing, zero, negative or non-numeric resolution is replaced with **480** and named.
- **`B` is thousandths of a BPM**: `120000` is 120, `240000` is 240. A tick is `tick ÷ Resolution` quarter notes from the start; each tempo change starts a segment, so a tempo map is walked, not multiplied. No tempo assumes 120.
- **`N fret length`** is a note; newer files write **`N fret type length`**, where `type` `1` is a forced hopo. On drums **fret 5 is the kick pedal** because a drum chart is six columns wide; on a five-wide strummed chart fret 5 is the **open** note.
- **`S 2 length`** is a star power phrase.
- `E "section Name"` becomes a section. `E "mix 8"` and a section named "fill" become drum fills.
- `MusicStream` names the mix when there is no `song.ogg`; a relative name resolves against the chart's URL.
- `[Song]` can carry `name`, `artist`, `album`, `year` and `offset` (milliseconds), so a `.chart` needs no `song.ini`.
- **A slide has no `.chart` form.** A line carries a fret, a length and a type; there is no field for a link to another note. The exporter names every link it leaves out and writes the notes without them: a playable chart without its slides is worth more than no chart at all.

The section word is the instrument: `Single` and `DoubleGuitar` are **lead**, `DoubleRhythm` **rhythm**, `DoubleBass` bass, `Drums`/`DrumsReal` the kit, `Keyboard` keys, `GHLGuitar` a six-fret guitar. An unknown word is skipped, not approximated.

Its width and tempo are read from the file; once published, the song document's listing wins.

## UltraStar `.txt`

The karaoke format: `#KEY:value` headers, then one note a line:

```text
#TITLE:Nine Lives
#ARTIST:The Example Band
#BPM:300.5
#GAP:1000
: 0 4 0 Hello
: 16 4 62 world
- 40
E
```

- **The BPM is quadrupled**: a beat is `60_000 / (bpm × 4)` milliseconds, so 120 BPM is 0.125 seconds. `#GAP` is how far the audio starts before beat zero.
- **A decimal comma is accepted**.
- **Pitch is semitones from C4 (MIDI 60)**, so `0` is C4 and `-4` is a real note below it. It is not a "no pitch" marker.
- The note types are `:` a normal syllable, `*` a **golden** note (pitched, and a hero), `R` a rap syllable (no pitch, judged on presence), `G` a golden rap syllable, and `F` a **freestyle** syllable, which is dropped.
- `-` is a phrase break. A **leading space** starts a new word; a leading **`~`** continues the current one. UltraStar's `-` is punctuation, not a join.
- `P1`/`P2` switch voice, on their own line or at a note line's start. Two voices are read; a third is named and ignored.
- `#AUDIO`/`#MP3`/`#COVER` and `#VIDEO` resolve against the chart's address when it has one. `#PREVIEWSTART` sets the jukebox cue; `#YEAR` is read; `#TITLE`, `#ARTIST` and `#ALBUM` name the song.
- `#RELATIVE:yes` means the gap and phrase markers are in beats rather than milliseconds.

It carries one tempo: a changing file is read at its opening tempo and told so. A folder's `audio.mp3`/`audio.ogg` is the master, because the header often names a file that is not there.

## StepMania `.sm` and `.ssc`

A dance format: `#TAG:value;` settings, then one `#NOTES:` block per chart, each a grid of measures:

```text
#TITLE:Nine Lives;
#BPMS:0.000=120.000;
#OFFSET:-0.123;
#NOTES:
     dance-single:
     :
     Challenge:
     10:
     0,0,0,0,0:
     1000
     0100
     0010
     0001
;
```

- Every measure is four beats, cut into as many rows as it has lines. A row has one character per column: `0` nothing, `1` a step, `2`/`4` a hold or roll start, `3` its end, `M` a mine.
- **Only `*-single` modes are charts.** A double, couple or routine file needs a second pad or player, and is named and skipped rather than halved.
- **Every `#BPMS` value is checked**: a non-positive tempo is dropped and named, and a file with no tempo assumes 120. `#STOPS` are pauses after a beat; `#OFFSET` is in seconds and may be negative.
- `#MUSIC` names the mix. `#LENGTH` is in seconds; without it the length comes from the notes.
- `//` is a comment only at a line's start or after whitespace, so `#MUSIC:https://host/song.ogg;` keeps its `https://`.
- `.ssc` is read by the same reader: its `#NOTEDATA` block carries the step type and difficulty beside a raw grid.

Mines have nowhere to go, so they are dropped and named. StepMania cannot carry words, a fill or star power, and every chart it produces is **dance**.

`.ssc` is read when handed to the reader directly — a playlist entry pointing at it — but not by the **folder** order or a package's lookup, so a folder whose only chart is one is not found as a song. Rename it `.sm`, or point an entry at the file.

## `.sng` packages

An `.sng` is **not a chart format** but a container — header, metadata table, file index and files — holding what a song folder would: `notes.mid` or `notes.chart`, stems, `album.jpg`, sometimes a preview.

- The metadata table **is** the `song.ini` — name, artist, album, year, length and preview cue — so a package names itself.
- The chart is found by name: `notes.mid`, then `notes.chart`, then any `.mid`, then any `.chart`.
- Audio, art and preview use a folder's name tables, so `guitar.opus` or `audio/album.jpg` inside is recognised.
- A package is read in two steps: the **header and index** to list it, one **member at a time** for a cover, stem or chart.
- The XOR mask uses the byte's position **inside that file**, not the container; a container offset produces a plausible file with wrong bytes.
- An entry whose bytes lie outside the data section is dropped and named.

A playlist entry may point its `song` at a package; the entry is still the summary, a package with a chart but no audio is listed and runs silently, and no chart means not playable.

## Timed lyrics

`.lrc`, `.srt`, `.vtt` and YouTube captions carry **words and nothing else**. The melody is a `lyrics` chart: one cue a line, its words spread across the cue. It is a first-class source:

- A typist can type it, and that typing is scored.
- Listen reads it along.
- **There is no singer score**, because there is no pitch. A captions-only source must not pretend otherwise by inventing rows.

```text
[00:12.30]turn the volume up        ← LRC
1
00:00:12,300 --> 00:00:15,000       ← SRT
turn the volume up
```

An LRC line takes the body after its **first** timestamp: `[00:12.30][00:20.00]hello` is two cues for the same words. `[ti:]`, `[ar:]` and `[offset:]` are read; a cue with no end runs to the next cue, or four seconds. A sheet with **no timed cues** is named as having none, not read as a three-second track.

A lyric sheet has no audio of its own; a folder may bring some, or a playlist entry may name a song document that carries audio.

Whichever format you choose, [Folder layout](folder-layout.md) says how to put the file in a folder and [Libraries](libraries.md) how to publish it.
