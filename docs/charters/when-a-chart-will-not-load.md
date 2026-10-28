---
title: When a chart will not load
description: "Why a real chart folder comes back empty, silent or at 0:00, and what to check first: track names, the file chosen, the tempo, the audio and the package."
updated: "2026-10-28"
order: 6
---

"Will not load" is usually one of a few different faults wearing one sentence. Before changing anything, decide which one you have:

| What you see | What it usually is |
| --- | --- |
| A panel says it has nothing to play | That seat has no chart — a track name, a role, a level, or a file that was not the one chosen |
| The run starts and a highway stays empty | A chart with no notes, or a chart the validator dropped |
| The song lists but there is no sound | The audio is not where the document says, or it is a 0-byte file |
| The row reads `0:00` | Nothing stated a length, and the notes could not supply one |
| One nameless row for a whole collection | The folder was read as a collection, or the wrong `.txt` was chosen |

Work down this page in order. The first two checks explain most of the rest.

## 1. Is it the file you think it is?

A folder can hold more than one thing that parses, and the game chooses one order everywhere: **`notes.mid`, then a `.chart`, then a `.sm`, then a text sheet**. The same order is used when the folder is listed and when the song is played, so the row you pick is drawn from the file the run reads.

- **The wrong `.txt`.** An UltraStar folder has more than one. `song.txt` is the chart, `license.txt` is documentation and `instrumental.txt` is a second chart. `song.txt` wins; a license, readme, changelog, copying or credits file is ignored; if there is no `song.txt`, another `.txt` is taken, and `instrumental.txt` can be it. If the words or the notes are the other version's, that is the file you got.
- **A `.txt` beside a real chart is not a chart.** A changelog in the same folder is skipped in favour of the `notes.mid`, the `.chart` or the `.sm`.
- **A `.ssc` is not in the folder order.** The reader can read one, but a folder looks only for `notes.mid`, `.chart` and `.sm`. A folder whose only chart is a `.ssc` is not found as a song: rename it to `.sm`, or point a playlist entry at the file itself.
- **A package is a song of its own.** If the folder holds `.sng` files, each is listed from its own header; a loose chart beside them is listed too.

If the row exists and the notes are wrong, the file is the first thing to check; if the row does not exist at all, go to check 2.

## 2. Is the folder one song, or a collection?

A folder is a song when it holds a chart and is not a collection:

- no subfolders → a song;
- subfolders **and** a `song.ini` → a song;
- subfolders and no `song.ini` → a **collection**, and the game walks into it.

A chart collection — a changelog in the root and forty song folders under it — used to be read as one nameless song with no length, and every song underneath it was never reached. The rule that fixed it is the one above. A song folder that keeps its art in a subfolder and has no `song.ini` now reads as a collection instead, which is the other half of the same rule: **give such a folder a `song.ini`.**

If one row stands for a whole collection, this is why. If a folder that should be a song is missing entirely, check that it holds one of the chart names in check 1.

## 3. Is the track name one the game knows?

For a Guitar Hero or YARG MIDI, the **track name** is the part. The reader knows a fixed list:

```text
PART GUITAR   PART GUITAR COOP   PART RHYTHM   PART BASS
PART KEYS     PART DRUMS         PART REAL_DRUMS_PS   PART DANCE
PART VOCALS   HARM1   HARM2   HARM3
```

and two conventions:

- **`T1 GEMS`** is an early chart's name for the guitar. Its frets sit in the same pitch bands as `PART GUITAR`, so it reads as a lead guitar and its extra pitches are ignored.
- A track with **`GHL`** in its name is a six-fret guitar, read as six columns.

A track with **`TOUCH`** in its name is ignored on purpose. **Any other name is not a part**, and it is skipped without a word — so a whole song can come back with no highways while its chart is perfectly good. The variants that turn up are things like `PART REAL_GUITAR`, `PART REAL_BASS`, a renamed track, or a second guitar named after the guitarist. Check the track names before you check the notes: a naming difference is the usual reason a whole song comes back empty.

The fix is to rename the track in the MIDI to the convention the part belongs to, or to accept that this instrument is not read. `PART GUITAR COOP` and `T1 GEMS` do not need renaming; they are already known.

For a drum chart, remember that the open-note pitch is the **kick pedal**, and a kit is six columns wide whether or not the chart uses the pedal.

## 4. Is the tempo, resolution or offset wrong?

These do not make a chart empty, but they make it wrong — notes early, late, or bunched at the start.

- **A `.chart` with no valid `Resolution`.** A resolution that is missing, zero, negative or not a number is replaced with **480** and named as a problem. If your chart was authored at a different resolution and the field is missing, everything after the first bar is misplaced. Check the `[Song]` block.
- **A `.chart`'s `B` is thousandths of a BPM.** `120000` is 120, `240000` is 240. A `B` written as `120` is a tempo of 0.12 BPM, and the chart crawls.
- **A StepMania `#BPMS` with a zero or blank value.** A non-positive tempo is dropped and named; a blank side of a pair is a missing value, not a zero. A file with no usable tempo assumes 120. If a file that used to line up now runs at the wrong speed, look here.
- **An offset with the wrong sign.** A `song.ini`'s `offset` and a `.chart`'s own `offset` are both in milliseconds, and positive moves the chart **later**. The MIDI reader applies the `song.ini` offset **once** to the whole timeline — notes, sections and `[end]` — so do not also pre-shift the notes.
- **SMPTE timing or MIDI format 2.** An SMPTE division has no tempo map, so its timing is approximated and named; a format 2 file is read with a warning that its tracks may drift. Neither is a chart to trust for timing.

## 5. Did the MIDI lose notes?

A few structural faults are worth knowing, because they look like a bad chart rather than a bad file.

- **Running status after a sysex or meta event.** MIDI lets a note reuse the previous status byte. A reader that lets a meta or sysex event become that status swallows the note after every sysex, and the rest of the track drifts by a byte — about 3% of a large test library did, before it was found. The game's reader keeps running status to channel messages only, so a chart that is a byte adrift is a file to report (with the file), not a chart to edit.
- **A truncated file.** A track whose declared length runs past the end of the file, a file cut inside its header, inside a track header or between tracks, is named as truncated rather than read as an empty song. If a `notes.mid` was copied while it was still downloading, this is what you see. Check the file size against the source, and re-copy it.
- **A RIFF `RMID` wrapper.** Some collections ship a `.mid` wrapped in a RIFF container. It is unwrapped before the header is read; if an old tool reports it as "not a MIDI file", the wrapper is the reason.

A chart that is a byte out is not something to fix by nudging the offset: the notes after the fault are in the wrong place, not early or late.

## 6. Is the audio where the document says?

A song can list, open, run its notes and be **silent**, and that is the one failure a player cannot diagnose from the outside.

- **A bare `#MP3` name.** An UltraStar sheet names its audio in `#MP3`/`#AUDIO`. In a folder read in the browser, a relative name resolves against the folder. In an **imported library**, the stem URL comes from the folder table, so a file it does not know is not a stem; if the sheet's `#MP3` names it instead, that name is written without a base and points beside the song document, where the file is not. Rename the audio to `audio.mp3`/`audio.ogg` and re-import, or list it in the document yourself.
- **A 0-byte or truncated master.** It happens, and a name cannot show it. When the whole mix will not play, the stage falls back to the parts, so a folder with a broken `song.ogg` still has a song in it.
- **Parts and no master, on a song that wants a preview.** The run plays the parts; the jukebox has nothing to audition, because one instrument is a preview of the wrong thing.
- **A master that is the whole song beside parts.** On a one- or two-instrument folder the convention assumes the master is the backing. If yours is a complete mix, say so in the song document's `full` preset, or ship it alone.
- **A mix that names no stem the song has.** The stage falls back to every stem rather than silence, so this is a sound that is wrong rather than missing.

With `?dev=1` the dev panel reads what each audio element is actually doing — its file, its progression, `readyState`, volume, any `MediaError` — plus the stem counts on the container. That is the read-out to ask for when a song is silent.

## 7. Is it the art, or the length?

- **The art never arrives.** The cover is `album.png` by convention, but `album_alt.png` is how many folders ship it, and `album.jpg`, `album_alt2.png`, `old album.png`, `small album.png` and `cover.*` are all accepted. A file the table does not know, or a path that does not resolve, leaves the initials tile — which is not an error, just a missing picture. In a published library, an art URL that 404s has the same effect.
- **The length reads `0:00`.** A stated length always wins; without one it comes from the notes plus a short tail. `0:00` means neither happened: the chart has no notes the reader kept, or the **playlist entry** says `durationMs: 0` (the row shows the entry, not the document), or the document says 0 and has no notes either. A song with no notes is silent as well as short, so fix check 6 and check 1 before hunting the length.

## 8. Is it the package?

A `.sng` is a container, and its one byte-level trap is the mask:

- The XOR mask is applied with the byte's position **inside that file**, not inside the container: `mask[i % 16] ^ (i & 0xFF)`. A reader that uses the container offset produces a file that looks valid and starts with the wrong bytes, and the chart inside will not parse.
- An entry whose bytes lie outside the package's data section is dropped and named. A package that was truncated in transit looks like this.
- A package with **no chart** is not playable. A package with a chart but **no audio** is listed and its notes run, silently — check the member names (`song.*`, `guitar.*`, `drums*.*`, `vocals*.*`) before assuming the package is broken.

## The checklist, in order

1. Does the **row** exist? If not, is the folder a song (check 2), and does it hold a chart name (check 1)?
2. Which **file** was chosen? `notes.mid` → `.chart` → `.sm` → text sheet; `song.txt` before `instrumental.txt`.
3. Do the file's **track names** match the list in check 3?
4. Does the chart have **notes** at the level the seat asked for? A song may carry only one level, and the nearest is chosen.
5. Is the chart **valid**? A dropped chart is named on the band and loading screens as `instrument/level: problem`.
6. Is the **sound** there — files, not names (check 6)?
7. Does the row's **length** come from anywhere (check 7)?
8. If it is a package, are the **member names** right and the file whole (check 8)?
9. If only one thing is wrong and it is a MIDI, look at the **track names** again. It is the commonest cause.
10. Still stuck? Publish the smallest folder that reproduces it, and say which of the three faults it is: no chart, no sound, or no length.

The rules behind all of this are in [Formats](formats.md) and [Folder layout](folder-layout.md); the validation a chart must pass is [What a chart is](what-a-chart-is.md). If the chart is fine and the library is not, [Libraries](libraries.md) and [Publishing](publishing.md) cover the documents and the host.
