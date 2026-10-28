---
title: Formats
description: "Every chart format the game reads — Guitar Hero and YARG MIDI, Clone Hero .chart, UltraStar, StepMania, .sng and timed lyrics — and what each cannot give you."
updated: "2026-10-28"
order: 2
---

The game reads six families of file and turns each into the one shape described in [What a chart is](what-a-chart-is.md). Which reader gets a file is decided by **what the file starts with**, not by what it is called: a chart with the wrong extension is still a chart, and a `.txt` that is a changelog is not a song. The file name is only a tiebreaker when the bytes say nothing.

One rule holds for all of them: a file is somebody else's, so a reader drops what it cannot place, **names the problem**, and keeps what it can. A song that is half-readable is still worth playing.

| Format | Gives you | Cannot give you |
| --- | --- | --- |
| Guitar Hero / YARG MIDI | Every instrument and level, vocals with pitch, sections, star power, drum fills | Metadata without a `song.ini`; a fourth voice of its own; a pitch below MIDI 40 |
| Clone Hero `.chart` | The same, in readable text, with its own metadata | A chart type it has no section word for; lyrics |
| UltraStar `.txt` | Karaoke words with pitch, one or two voices | Instruments, levels, sections, fills |
| StepMania `.sm`/`.ssc` | A dance chart at several levels | Anything but dance; words; fills |
| `.sng` package | A whole song folder in one file | Easy hand-editing; more than one chart in play |
| Timed lyrics | Words and their times | Pitch, instruments, a singer score |

## Guitar Hero and YARG MIDI

The rhythm-game convention, and the best source for a band. One MIDI track per part, and **every difficulty inside that track**, with the meaning of a note carried by its pitch.

| Level | Frets (green–orange) | Open / hopo / strum |
| --- | --- | --- |
| Easy | 60–64 | 59 / 65 / 66 |
| Normal | 72–76 | 71 / 77 / 78 |
| Hard | 84–88 | 83 / 89 / 90 |
| Expert | 96–100 | 95 / 101 / 102 |

- `+1` to `+4` above green are red, yellow, blue and orange. `−1` is the **open** note on a guitar and the **kick pedal** on drums. `+5` and `+6` are not notes: they are the chart saying **hammer-on** or **strum this one**, per moment. The game uses the flag rather than guessing from the spacing.
- `116` marks **star power**, written either as a sustained note per phrase or as pairs of markers. It becomes the chart's energy phrases.
- On a voice track, `105` opens a **lyric line**, and the lyric events (MIDI meta text) carry one syllable each. A trailing `-` continues a word, `+` is a note with no characters of its own, and a long gap starts a new word. A note below MIDI 40 is a talkie: spoken, with no pitch to judge.
- Drum fills come from `[mix 8]` text events, or from a section whose own name contains "fill". The window closes at the next mix marker, section or `[end]`.
- `[section Verse 1]` text events become the song's sections. `[end]` says where the song stops.

The track names it knows:

| Track | Becomes |
| --- | --- |
| `PART GUITAR`, `PART GUITAR COOP`, `T1 GEMS` | guitar, **lead** |
| `PART RHYTHM` | guitar, **rhythm** |
| `PART BASS`, `PART KEYS`, `PART DANCE` | bass, keys, dance |
| `PART DRUMS`, `PART REAL_DRUMS_PS` | drums |
| `PART VOCALS`, `HARM1`, `HARM2`, `HARM3` | melody parts, in that order |

A track with `GHL` in its name is a six-fret guitar and is read as six columns. A track with `TOUCH` in its name is ignored. **Any other name is not a part** — the usual reason a whole song comes back empty is a variant the reader does not know, such as a renamed guitar track. `T1 GEMS` is an early chart's name for the guitar, and its extra pitches beside the frets are ignored.

Other rules worth knowing:

- A `song.ini`'s **`offset` is applied once to the whole timeline** — notes, sections and the `[end]` marker — not again to each. The sign is the same as `.chart`'s: positive moves the chart later.
- **Voice parts are compacted** to `0..n-1`. A harmonies chart can ship `HARM1`/`HARM2` with no `PART VOCALS`, and a singer on part 0 must still have a part. A fourth voice is named and shared, not dropped.
- A MIDI with no part names at all may still be karaoke: the track with the most lyric events becomes the voice. A `.kar` is read this way.
- No lyric events means no melody. An instrumental's empty voice track is not a song's words, and no melody is invented for it.
- A RIFF `RMID` wrapper is unwrapped first. A file cut inside its header, inside a track header or between tracks is named as truncated rather than read as an empty song.

It cannot name the song without a `song.ini`, cannot carry a video, and cannot give a fourth voice its own part. Its tempo map is one per song, so a chart cannot have a different tempo per difficulty.

## Clone Hero and Phase Shift `.chart`

A text format, and the easiest of the instrument formats to read and patch by hand. Every chart is its own named section, so nothing has to be pulled apart by pitch.

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

- **`Resolution`** (or `TimeDivision`) is how many ticks a quarter note is cut into, and every time in the file is measured against it. A resolution that is not a positive number is replaced with **480** and named as a problem — otherwise the whole chart would divide by zero.
- **`B` is thousandths of a BPM.** `120000` is 120 BPM; `240000` is 240. A tick is `tick ÷ Resolution` quarter notes from the start, and each tempo change starts a new segment, so a chart with a tempo map is walked rather than multiplied. A file with no tempo assumes 120.
- **`N fret length`** is a note; newer files write **`N fret type length`**, where `type` `1` is a forced hopo. On a drum section, **fret 5 is the kick pedal** because a drum chart is six columns wide. On a five-wide strummed chart, fret 5 is the **open** note.
- **`S 2 length`** is a star power phrase.
- `E "section Name"` becomes a section. `E "mix 8"` and a section named "fill" become drum fills.
- `MusicStream` names the mix when the folder has no `song.ogg`; a relative name resolves against the chart's own URL, so `audio/song.ogg` works.
- `[Song]` can also carry `name`, `artist`, `album`, `year` and `offset` (milliseconds), so a `.chart` does not need a `song.ini`.

The section words are the instrument: `Single` and `DoubleGuitar` are the **lead**, `DoubleRhythm` the **rhythm**, `DoubleBass` the bass, `Drums` and `DrumsReal` the kit, `Keyboard` the keys, `GHLGuitar` a six-fret guitar. A word it does not know is skipped, not approximated.

It cannot carry words, and it has no section word for an instrument outside that list. The file's own width and tempo are read from it; once it is published as a chart document, the song document's listing is what the game uses.

## UltraStar `.txt`

The karaoke format. A list of `#KEY:value` headers and then one note a line:

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

- **The BPM is quadrupled.** A beat is `60_000 / (bpm × 4)` milliseconds, so 120 BPM is 0.125 seconds a beat. `#GAP` is how far the audio starts before beat zero.
- **A decimal comma is accepted**, because half of Europe writes one.
- **Pitch is semitones from C4 (MIDI 60)**, so `0` is C4 and `-4` is a real note below it. It is not a "no pitch" marker.
- The note types are `:` a normal syllable, `*` a **golden** note (pitched, and a hero), `R` a rap syllable (no pitch, judged on presence), `G` a golden rap syllable, and `F` a **freestyle** syllable, which is dropped because it was never meant to be performed.
- `-` is a phrase break. A **leading space** starts a new word; a leading **`~`** continues the current one. UltraStar's `-` is punctuation, not a join.
- `P1`/`P2` switch voice, on their own line or at the start of a note line. Two voices are read; a third is named and ignored.
- `#AUDIO`/`#MP3`/`#COVER` and `#VIDEO` resolve against the chart's own address when it has one. `#PREVIEWSTART` sets the jukebox cue. `#YEAR` is read. `#TITLE`, `#ARTIST` and `#ALBUM` name the song.
- `#RELATIVE:yes` means the gap and phrase markers are in beats rather than milliseconds.

UltraStar cannot carry an instrument, a difficulty (the words are one chart), a section or a fill. It carries one tempo: a file that changes tempo is read at its opening tempo and told so. A folder's `audio.mp3`/`audio.ogg` is the master, because the header alone often names a file that is not there.

## StepMania `.sm` and `.ssc`

A dance format. A list of `#TAG:value;` settings, then one `#NOTES:` block per chart, each a grid of measures:

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

- Every measure is four beats, cut into as many rows as it has lines. A row has one character per column: `0` nothing, `1` a step, `2` or `4` the start of a hold or roll, `3` its end, `M` a mine.
- **Only `*-single` modes are charts.** A double, couple or routine file needs a second pad or a second player and is named and skipped rather than narrowed into half a chart.
- **Every `#BPMS` value is checked.** A tempo that is not positive is dropped and named; a file with no tempo assumes 120 rather than running time backwards. `#STOPS` are pauses after a beat, and `#OFFSET` is in seconds and may be negative.
- `#MUSIC` names the mix. `#LENGTH` is in seconds; without it the length comes from the notes.
- `//` is a comment only at the start of a line or after whitespace, so `#MUSIC:https://host/song.ogg;` keeps its `https://`.
- `.ssc` is read by the same reader: its `#NOTEDATA` block carries the step type and difficulty beside a raw grid.

Mines have nowhere to go — this game has no "do not step there" — so they are dropped and named. A StepMania file cannot carry words, a fill or star power, and every chart it produces is **dance**.

One practical difference between the two extensions: `.ssc` is read when the file is handed to the reader directly — a playlist entry pointing at it — but neither the **folder** order nor a package's chart lookup looks for one. A folder whose only chart is a `.ssc` is not found as a song. Rename it to `.sm`, or point a playlist entry at the file.

## `.sng` packages

An `.sng` is **not a chart format**. It is a container: a header, a metadata table, a file index and the files themselves, holding everything a song folder would — `notes.mid` or `notes.chart`, the stems, `album.jpg`, sometimes a preview clip.

- The metadata table **is** the `song.ini`: name, artist, album, year, length and preview cue, so a package names itself without a separate text file.
- The chart is found by name: `notes.mid`, then `notes.chart`, then any `.mid`, then any `.chart`.
- Audio, art and preview are found by the same name tables a folder uses, so `guitar.opus` or `audio/album.jpg` inside the package is recognised.
- A package is read in two steps: the **header and index** to list it, and one **member at a time** to draw the cover, play a stem or read the chart. A folder of a thousand packages does not read a thousand songs' audio to list them.
- The XOR mask is applied with the byte's position **inside that file**, not inside the container. A reader that uses a container offset produces a plausible file with the wrong bytes.
- An entry whose bytes lie outside the package's data section is dropped and named.

A playlist entry may point its `song` at a package. The entry is still the summary, and a package with a chart but no audio is still listed — its notes run, silently. A package with no chart is not playable.

## Timed lyrics

`.lrc`, `.srt` and `.vtt`, and by extension YouTube captions, carry **words and nothing else**. The melody they make is a `lyrics` chart: one cue a line, its words spread across the cue's own span. That is a first-class source, not a broken one:

- A typist can type it, and that typing is scored.
- Listen reads it along.
- **There is no singer score**, because there is no pitch. A captions-only source must not pretend otherwise by inventing rows.

```text
[00:12.30]turn the volume up        ← LRC
1
00:00:12,300 --> 00:00:15,000       ← SRT
turn the volume up
```

An LRC line takes the body after its **first** timestamp: `[00:12.30][00:20.00]hello` is two cues for the same words, not one cue at the last bracket. `[ti:]`, `[ar:]` and `[offset:]` are read. A cue with no end runs to the next cue, or four seconds. A sheet with **no timed cues** is not a song: it is named as having no timed lyrics rather than read as a three-second track with no words.

A lyric sheet has no audio of its own. A folder may bring some, and a playlist entry can name a song document that carries audio.

## Which should I use

- **A band with instruments: Guitar Hero / YARG MIDI.** It is the only format that carries every instrument, every level, vocals with pitch, sections and fills in one file.
- **A band, and you want a file you can read and patch: Clone Hero `.chart`.** The same content in text, with its metadata inside the file.
- **Karaoke: UltraStar.** Words and pitch, one or two voices, and a convention every karaoke tool already writes.
- **Dance only: StepMania.** Its single modes are the dance highway; its doubles are not playable here.
- **Distribution: `.sng`.** One file per song, carrying its chart, audio and cover — but it is a container, so the chart inside it is still one of the formats above.
- **Words only, no pitch: timed lyrics.** Honest as a `lyrics` chart, and only that. If you have a pitch contour as well, use a vocals source instead.

Whichever you choose, [Folder layout](folder-layout.md) says how to put it in a folder the game will read, and [Libraries](libraries.md) says how to publish it as the three documents.
