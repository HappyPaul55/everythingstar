---
title: When a chart will not load
description: "Why a real chart folder comes back empty, silent or at 0:00, and what to check first: track names, the file chosen, the tempo, the audio and the package."
updated: "2026-10-31"
order: 7
---

"Will not load" is usually one of a few faults wearing one sentence. Decide which one you have before changing anything:

| What you see | What it usually is |
| --- | --- |
| A panel says it has nothing to play | That seat has no chart — a track name, a role, a level, or a file that was not the one chosen |
| The run starts and a highway stays empty | A chart with no notes, or a chart the validator dropped |
| The song lists but there is no sound | The audio is not where the document says, or it is a 0-byte file |
| The row reads `0:00` | Nothing stated a length, and the notes could not supply one |
| One nameless row for a whole collection | The folder was read as a collection, or the wrong `.txt` was chosen |

Work down this page in order. The first two checks explain most of the rest.

## 1. Is it the file you think it is?

A folder can hold more than one thing that parses, and the game chooses one order everywhere: **`notes.mid`, `.chart`, `.sm`, a text sheet**, for listing and playing. [Folder layout](folder-layout.md) has the full order and name tables. What matters here:

- **The wrong `.txt`.** `song.txt` is the chart; `license.txt`, `readme`, `changelog`, `copying` and `credits` are ignored; `instrumental.txt` is a second chart, taken only without `song.txt`. If the words or notes are the other version's, that is the file you got.
- **A `.txt` beside a real chart** is skipped in favour of `notes.mid`, `.chart` or `.sm`.
- **A `.ssc` is not in the folder order**: a folder whose only chart is one is not found as a song. Rename it `.sm`, or point a playlist entry at the file.
- **A package is a song of its own**: `.sng` files are listed from their headers, and a loose chart beside them too.

If the row exists and the notes are wrong, check the file; if the row does not exist, go to check 2.

## 2. Is the folder one song, or a collection?

A folder is a song when it holds a chart and is not a collection: no subfolders, or subfolders **with** a `song.ini`. Subfolders without one make a **collection**, and the game walks into it, so a collection reads as forty songs rather than one nameless one. A song folder keeping art in a subfolder therefore needs a `song.ini`; [Folder layout](folder-layout.md) has the rule.

If one row stands for a whole collection, this is why. If a folder that should be a song is missing, check that it holds one of the chart names above.

## 3. Is the track name one the game knows?

For a Guitar Hero or YARG MIDI, the **track name is the part**. The reader knows:

```text
PART GUITAR   PART GUITAR COOP   PART RHYTHM   PART BASS
PART KEYS     PART DRUMS         PART REAL_DRUMS_PS   PART DANCE
PART VOCALS   HARM1   HARM2   HARM3
```

and two conventions:

- **`T1 GEMS`** is an early chart's name for the guitar; its frets sit in `PART GUITAR`'s pitch bands, and extra pitches are ignored.
- A track with **`GHL`** in its name is a six-fret guitar, read as six columns.

A track with **`TOUCH`** is ignored on purpose. **Any other name is not a part** and is skipped without a word, so a song can come back with no highways while its chart is good. `PART REAL_GUITAR`, `PART REAL_BASS` and renamed tracks turn up; check names before notes.

Fix it by renaming the track to the convention, or accept that the instrument is not read. `PART GUITAR COOP` and `T1 GEMS` need no rename.

For drums, the open-note pitch is the **kick pedal**, and a kit is six columns wide whether or not it uses the pedal.

## 4. Is the tempo, resolution or offset wrong?

These make a chart wrong — early, late or bunched — rather than empty.

- **A `.chart` with no valid `Resolution`** is replaced with **480** and named; a chart authored at another resolution and missing the field is misplaced after the first bar. Check `[Song]`.
- **A `.chart`'s `B` is thousandths of a BPM**: `120000` is 120, `240000` is 240. `B 120` is a tempo of 0.12 BPM, and the chart crawls.
- **A StepMania `#BPMS` of zero or blank**: a non-positive tempo is dropped and named, a blank side of a pair is missing, and no usable tempo assumes 120.
- **An offset with the wrong sign**: a `song.ini`'s `offset` and a `.chart`'s are milliseconds, and positive moves the chart **later**. The MIDI reader applies the `song.ini` offset **once** to notes, sections and `[end]`, so do not pre-shift as well.
- **SMPTE timing or MIDI format 2**: SMPTE has no tempo map, so timing is approximated and named; format 2 carries a warning that tracks may drift.

## 5. Did the MIDI lose notes?

A few structural faults look like a bad chart rather than a bad file.

- **Running status after a sysex or meta event.** MIDI lets a note reuse the previous status byte. A reader that lets a meta or sysex become that status swallows the note after every sysex and drifts by a byte — about 3% of a large test library did, before it was found. The game's reader keeps running status to channel messages only, so a byte-adrift chart is a file to report, not a chart to edit.
- **A truncated file.** A track whose declared length runs past the file, or a file cut inside its header, a track header or between tracks, is named as truncated, not an empty song. A `notes.mid` copied mid-download looks like this: compare sizes and re-copy.
- **A RIFF `RMID` wrapper.** Some collections wrap a `.mid` in RIFF; it is unwrapped before the header is read, and is why an old tool reports "not a MIDI file".

A byte out is not fixed by nudging the offset: notes after the fault are misplaced, not early or late.

## 6. Is the audio where the document says?

A song can list, open, run its notes and be **silent** — the one failure a player cannot diagnose.

- **A bare `#MP3` name.** In a browser folder a relative name resolves against the folder. In an **imported library** the stem URL comes from the folder table, so an unknown file is not a stem; if `#MP3` names it, the URL is written without a base and points beside the song document. Rename it `audio.mp3`/`audio.ogg` and re-import, or list it.
- **A 0-byte or truncated master.** A name cannot show it. When the mix will not play, the stage falls back to the parts, so a folder with a broken `song.ogg` still has a song.
- **Parts and no master** on a song that wants a preview: the run plays them, and the jukebox has nothing to audition.
- **A master that is the whole song beside parts.** The convention assumes the master is the backing on one or two instruments; if yours is a full mix, say so in the `full` preset, or ship it alone.
- **A mix naming no stem the song has** falls back to every stem, so the sound is wrong rather than missing.

With `?dev=1`, the dev panel reads each audio element's file, progression, `readyState`, volume and `MediaError`, plus stem counts on the container: ask for that when a song is silent.

## 7. Is it the art, or the length?

- **The art never arrives.** `album.png` is the convention, but `album_alt.png`, `album.jpg`, `album_alt2.png`, `old album.png`, `small album.png` and `cover.*` are accepted. An unknown file or unresolved path leaves the initials tile, not an error; a 404 art URL does the same.
- **The length reads `0:00`.** A stated length wins; without one it comes from the notes plus a tail. `0:00` means neither happened: no notes kept, a playlist entry saying `durationMs: 0` (the row shows the entry), or a document saying 0 with no notes. A song with no notes is silent too, so fix checks 6 and 1 first.

## 8. Is it the package?

A `.sng` is a container, and its one byte-level trap is the mask:

- The XOR mask uses the byte's position **inside that file**, not the container: `mask[i % 16] ^ (i & 0xFF)`. A container offset gives a file that looks valid and starts with wrong bytes; the chart will not parse.
- An entry outside the data section is dropped and named; a package truncated in transit looks like this.
- **No chart** means not playable. A chart with **no audio** is listed and its notes run silently; check the member names (`song.*`, `guitar.*`, `drums*.*`, `vocals*.*`).

## The checklist, in order

1. Does the **row** exist? If not, is the folder a song (2), and does it hold a chart name (1)?
2. Which **file** was chosen? `notes.mid` → `.chart` → `.sm` → text; `song.txt` before `instrumental.txt`.
3. Do the **track names** match check 3?
4. Does the chart have **notes** at the level the seat asked for? The nearest is chosen.
5. Is the chart **valid**? A dropped chart is named `instrument/level: problem`.
6. Is the **sound** there — files, not names (6)?
7. Does the **length** come from anywhere (7)?
8. In a package, are the **member names** right and the file whole (8)?
9. If one thing is wrong and it is a MIDI, check **track names** again: the commonest cause.
10. Still stuck? Publish the smallest folder that reproduces it, and say which fault: no chart, no sound, no length.

The rules behind all of this are in [Formats](formats.md) and [Folder layout](folder-layout.md); the validation a chart must pass is [What a chart is](what-a-chart-is.md). If the chart is fine and the library is not, [Libraries](libraries.md) and [Publishing](publishing.md) cover the documents and the host.
