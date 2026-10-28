---
title: Audio
description: "The audio shopping list: every sound the game needs, where it plays, the delivery contract behind each one, and what its manifest entry means."
updated: "2026-10-28"
order: 6
---

`public/audio/sounds.json` is this list as the game reads it; the mixer is `src/components/game/audio/`. A sound with no file is silent rather than an error, which is what makes it safe to wire a cue before the sound exists.

What the game needs to make a noise, and what "delivered" means. This is a **shopping
list and a contract**: the **type** column is what the code asks for, so the names
matter as much as the sounds.

Everything here is *ours* — the game's own sound. The **song's** audio is its own
document's (see the last section), and a real song brings its own stems.

## The whole list

**26 types are asked for below; 24 are playable and 34 files have arrived.** `in place`
marks a sound that has arrived. `want` is how many **files** behind the type — more is better where
a sound repeats (a click, a move), pointless where it does not (a `win`).

**In place** (all 34 files, 24 of the 26 types playable): the whole UI family — click,
move, confirm, back, refuse, open and the screen whoosh — plus the typing feedback and
the results tick come from **Kenney's UI Audio pack** (CC0 — credit
"Kenney, kenney.nl"). Each wired file carries a **measured trim** in `sounds.json`,
because a pack is not mastered to itself: the same twelve sounds sat between −16 and
−33 dBFS RMS. The four menu beds are not from that pack: they are the author's own
Suno generations, credited in the manifest below. The crowd is public domain from
[pdsounds.org](http://pdsounds.org) via Wikimedia Commons: `crowd` is a restaurant room
(stephan), trimmed, faded and encoded to Ogg/Opus at 64 kbps. It is the **pause
menu's** alone. The stage asks for a type; a missing file is silence.

**`error`** is the one cue not from that pack: `error_1` arrived in `audio-src/` as an
mp3 and was trimmed to its 0.42s of sound, mixed to mono at 48 kHz and measured to sit
with the family. It is a **Pixabay** sound, used under the Pixabay Content License
(no attribution required; the terms are recorded in `sounds.json`).

**The band's entrance is recorded.** Four `hype_*` entrances open a run: guitar and
keys (Fontaine12), bass (the same recording pitched down), drums and dance
(BuddhistIsTheWaterfallTheHueGo) and a singer's microphone tap (susychristiansen), all
from **Freesound under CC0** — see [freesound.org/s/163070](https://freesound.org/people/Fontaine12/sounds/163070/),
[s/786070](https://freesound.org/people/BuddhistIsTheWaterfallTheHueGo/sounds/786070/)
and [s/149034](https://freesound.org/people/susychristiansen/sounds/149034/). They are
one sound per **part**, not one per player: three guitars are one guitar entrance, a
lead and a rhythm share it, and a guitar plus keys share it too. The unique entrances
start on one sample and are panned inside ±25% in band order, so a guitar and a bass
sit a quarter left and a quarter right. They are balanced to each other with measured
trims and deliberately **do not duck the song** — this is the band starting, not a sting
over the first bars. The guitar and bass files are the same recording with the amp's
lead-in trimmed off at 2.35s, so what plays is the chord rather than the wait before
it; the quiet run-up to the attack is kept, because cutting on the attack itself risks
clipping it. The brief below is what a dedicated keys or dance entrance would
replace the borrowed one with.

**The six stings are generated.** Kenney's pack has no `win`, `fail`, `best`,
`miss`, `type_miss` or `meter_activate` that fits, so those six
are a **generated chiptune first pass** (CC0, credited as "Generated for EverythingStar"
in `sounds.json`): bell arpeggios for the run's framing, a wooden thud for `miss`, a
soft buzz for `type_miss` and a bright burst for `meter_activate`. They suit the arcade look and they make every moment audible. They
are the one part of the sound **meant to be replaced** — the brief below is what a
commissioned sting should be, and swapping one is a manifest entry and a file, never a
code change. `sparkle` was a bright UI switch standing in and now has its own chime for
the same reason.

**There is no count-in tick or go sting.** The 3-2-1 timer is gone: the stage's lanes
rise, its lyric highway drops, and the band's `hype_*` entrance is the count-in. The
song begins after the hype has played out, not under it.

The list is deliberately short, and it got there by **merging**: a sound that repeats is
the *note*, not a second cue. A hit needs no sound of its own (the player's stem
comes back to its level — that *is* the hit), and the miss ducks it, which is in the
song file already.
So there are no `hit_*`, no per-instrument misses, and no `sing_*`. Where one gesture is
one gesture, it is one type: a confirm is a confirm whether it was picking a song or a
player joining.

### Music — the bed every page sits on

| type | kind | want | what to get | in place |
| --- | --- | --- | --- | --- |
| `background` | track | 4–6 | A whole piece, **2:00–3:00 for a new asset** (the shipped four are the author's Suno generations at ~4:55, ~4:55, ~4:55 and ~2:40), low-key and unhurried, **no vocals**, nothing that competes with a song preview. One sonic world across the bank: same instrumentation, same room, same era. Each must survive ten minutes without grating. **The first one listed is the one the game always opens on**, so make it the best. *4 already in (Ogg/Opus at 64 kbps).* | ✓ |

Welcome and band play `background` — it does not matter which one they land on, and
the bank runs through them. The jukebox plays only the chosen song's preview, and is
silent when there is none. The loading screen keeps the `background` bed; the stage's
entrance plays the band's own `hype_*` entrances, and the pause has its own quiet crowd.
**The brand's identity lives in the stings** (`win`, `best`), not in a theme bed,
because there is no single bed any more.

### UI — short, dry, and one family

A click should sound like the same object as the confirm, hit harder.

| type | kind | want | what to get | in place |
| --- | --- | --- | --- | --- |
| `click` | oneshot | 3 | The default press, **0.06–0.12s**. Heard hundreds of times a session: one file is a machine. | ✓ |
| `move` | oneshot | 3 | Moving onto a control: the pointer landing on one, or focus arriving by Tab or a pad. **0.04–0.12s**, softer and shorter than a click — it is the hand travelling, not a press. Heard the most of all, so **variants matter most here**. Its trims sit deliberately **~8 dB under the rest of the family**: a hint that something is there, not an event. | ✓ |
| `select` | oneshot | 2 | **Every yes**: picking a song, a difficulty, a chip, a player joining the band, a playlist arriving. **0.06–0.12s**, lighter than a click — a confirm, not a press. | ✓ |
| `back` | oneshot | 1 | **Every no**: back, cancel, closing a dialog, a player leaving, a playlist forgotten. **0.08–0.15s**, lower, closing. | ✓ |
| `refuse` | oneshot | 1 | A **refused** action: Play with nothing playable, a part the song has none of, a control already taken, a playlist that would not load. **0.15–0.3s**, dull, no pitch, never harsh. It is said a lot. | ✓ |
| `open` | oneshot | 1 | A dialog opening (playlists, controllers). **0.15–0.3s**, rising — it can sit over the `click` that opened it. | ✓ |
| `screen` | oneshot | 1 | Moving between screens. **0.15–0.35s** whoosh. One file, either direction. | ✓ |

### The run — its opening ten seconds and its end

| type | kind | want | what to get | in place |
| --- | --- | --- | --- | --- |
| `hype_guitar` | oneshot | 1 | The guitar (and simple keys) plugging into an amp and hitting a chord. **~3.4s**; the chord is the entrance. | ✓ |
| `hype_bass` | oneshot | 1 | The same recording pitched down, as the bass's own entrance. **~3.4s.** | ✓ |
| `hype_drums` | oneshot | 1 | A short drum roll. Also the dance mat's entrance. **~2s.** | ✓ |
| `hype_vocals` | oneshot | 1 | A microphone tap/check for the singer. **~2.5s.** | ✓ |
| `win` | oneshot | 1 | A run that made it. **4–8s.** | ✓ |
| `fail` | oneshot | 1 | A lost run. **4–8s.** Not cruel — the band lost, nobody died. | ✓ |
| `best` | oneshot | 1 | A new best. **2–4s**, layers over `win`. | ✓ |
| `tick` | oneshot | 1 | The score counting up. **0.03–0.08s**, played rapidly. Cheap, and it is most of the drama. | ✓ |

### Playing — the juice, and most of it is the misses

A **hit already sounds**: the player's stem returns to its level, so the note *is* the
feedback. A miss **ducks** that stem to a tenth of its own level — the loudest thing in
the mix dropping away — and `miss` lands on top of it, so a mistake is heard twice over
without a bank of hit sounds. It is a duck and never a mute: a media element at `volume = 0`
leaves the browser's audio clock, and a part brought back from silence is out of phase with
the band. The same rule is why the master fader has a floor rather than a zero
(`AUDIBLE_FLOOR` in `src/lib/game/audio/mix.ts`).

An **error** is the sound of a part **going out**. The first miss of a streak ducks that
player's stems — or *would*, on a song shipped as one master, where there is no stem to
take out — and that is the moment this cue belongs: the channel went quiet, and here is why.
A further miss while the part is already out gets no second cue, and the next hit brings
the part back. The run still counts the player's own wrong strums apart from misses
(`LaneRun.errors` against `LaneRun.misses`) as a read-out; the **cue follows the channel,
not the cause**.

| type | kind | want | what to get | in place |
| --- | --- | --- | --- | --- |
| `miss` | oneshot | 1 | A missed note, a dropped hold, a streak breaking: one sound for all three. **0.1–0.2s.** **Required** — the stem ducks, so this *is* the miss. | ✓ |
| `error` | oneshot | 1 | A part **going out**: the first miss of a streak ducks that player's stems (or would, on a one-master song). **0.1–0.4s**, dry and short — the sound of a channel cutting, never musical. **Once per stop**, not once per miss. | ✓ |
| `sparkle` | oneshot | 1 | A hero note landed. **0.2–0.5s.** The money sound — this one should feel *good*, and it is the only per-note cue we need. | ✓ |
| `combo_milestone` | oneshot | 2 | The multiplier stepping up. **0.2–0.4s** rising — two of them, or one that we pitch up as the combo climbs. **Not in the game at the moment** — see below. | — |
| `meter_full` | oneshot | 1 | The meter filling. **1–2s** swell. **Not in the game at the moment** — see below. | — |
| `meter_activate` | oneshot | 1 | Spending it. **0.4–0.8s** burst. | ✓ |

**`combo_milestone` is not in the game at the moment**, and the row above is what a
replacement would be. The cue it shipped with played on every multiplier step, and it
was pulled for being annoying: the file is a bright, loud blip rather than a reward that
rises (a Kenney UI sound at `+6.5 dB`, the loudest cue in the manifest), and because a
sting ducks the song, each multiplier step also dipped the music under it for about
three-quarters of a second — so the ladder sounded like a fault in the mix rather than a
streak paying off. A replacement is welcome, and it should sit **inside** the song rather
than over it: quiet enough to be a colour, musical rather than a UI tick, and no duck.
Until then the multiplier steps in silence, which is honest; **do not wire an earcon
back in without a file worth hearing.**

**`meter_full` is not in the game either**, and it went the same way. The gauge topping
out played a rising shimmer with a **1–2s** swell, and because the type was a sting it
also dipped the song under it — so a run that kept a streak alive was pumped down to
35% every time the meter came back to the top, which read as a hole in the mix rather
than a reward. The gauge is drawn on the rail, so a player can see it fill; the only
star-power moment that still has a cue is spending it (`meter_activate`), which is a
thing the player did. A replacement would have to sit inside the song and stay short.
That removal is also why **no cue touches a song at all now**: the duck is the menu
bed's own (`DUCK_LEVEL`), and a run's stems are outside its graph.

### Typing — the only mode that needs per-keystroke feedback

| type | kind | want | what to get | in place |
| --- | --- | --- | --- | --- |
| `type_key` | oneshot | 3 | A keystroke. **0.03–0.06s**, three of them so it does not machine-gun. | ✓ |
| `type_word` | oneshot | 1 | A word completed. **0.1–0.2s**, small and satisfying. | ✓ |
| `type_miss` | oneshot | 1 | A mistyped or missed word. **0.1–0.2s**, a soft buzz, not a beep. | ✓ |

### Crowd — the room while the run waits

| type | kind | want | what to get | in place |
| --- | --- | --- | --- | --- |
| `crowd` | loop | 1 | The room **while the run is paused**. **0:30–1:00** (the shipped loop is 0:30), seamless: a room of people, murmur and shuffle. Quiet enough to sit under the pause rather than compete with it. | ✓ |

The crowd is the pause menu's alone: a run is the song, and a crowd over it was the
first sound to grow tiresome. There are no applause reactions — the stage does not
answer a hit with a room, because the player's own stem is the feedback.

**Not assets**: the **whammy** adds no DSP of its own — a full meter is spent on eight
seconds of **star power**, and the held note keeps sounding as it is. The pause is quiet
because the only sound asked for is the `crowd` loop; the mixer adds no muffle filter.

## Types and variants

The game does not play a file, it plays a **type** — `click`, `background`, `miss`. A
type may have several files behind it, and which file answers is decided by **what the
files are**:

- **`track`** — a whole piece. The bank is a **playlist**: it **always opens on the
  first file listed** (so arriving in the game always sounds the same), then picks at
  **random**, never repeating the one before, and moves on when each finishes. Fixed
  opening, shuffle behind it — which is neither a bag nor a walk.
- **`loop`** — a texture with no end, repeated seam-free and never advanced: the room
  while the run is paused.
- **`oneshot`** — a sound that happens: a click, a sting, a miss. A bank of these is
  dealt as a **shuffled bag**: never the same file twice running, and no pattern to
  notice — which is what three clicks need and a strict rotation would ruin.

Files sharing a type must agree on their `kind`, or half a bank would advance while the
other half looped. The reader says so by name if they do not.

Two things follow for anything you buy:

- **Variants matter where they repeat.** A click is heard hundreds of times a session,
  so one file is a bug and three is right. A `win` is heard once a song, so one is fine.
- **A type is what the code asks for**; the file names are yours. `sounds.json` is
  where the two are joined up — and **the type names in this file are the contract**.

**Adding a type is a decision, not a detail.** Every type is something to buy, learn
and mix, so a new one needs a reason the existing ones do not already cover: a new
*sound* is often a new file behind a type that exists.

## How to deliver

| | |
| --- | --- |
| **Format** | **Ogg/Opus** for the music beds (64 kbps VBR, 48 kHz — see *Encoding a replacement bed*); OGG Vorbis, 48 kHz for SFX — the target for a **new** file. (WAV masters welcome as a separate copy.) |
| **Channels** | Music and ambience **stereo**; almost every SFX **mono** (we place it) — again the target for a new file. The shipped click set is 44.1 kHz stereo, so the existing bank is not uniform. |
| **Loops** | Seamless and sample-exact: no fade at either end, no reverb tail cut, nothing added to make it "close". A `loopStart`/`loopEnd` is only needed if the loop is not the whole file; the player sets those points on the **streamed bed element**, so the loop repeats that span rather than the file (a browser that ignores the points falls back to looping the whole file). |
| **Loudness** | Music ~**−16 LUFS**, ambience ~**−20 LUFS**, SFX ~**−14 LUFS** with true peaks ≤ **−1 dBTP**. **Do not limit or squash** — the mixer ducks the menu bed under stings, and a cue is heard **beside** a song rather than over it, and a brickwalled master fights that. |
| **Length** | Tracks **2:00–3:00** for a new asset (the shipped four run ~4:55, ~4:55, ~4:55 and ~2:40); ambience loops **0:30–1:00** (the shipped crowd is 0:30); stings **2–8s**; SFX **0.05–1.5s**. |
| **Licence** | Worldwide, perpetual, **web game / interactive** use, **no attribution required** (or we will credit — tell us how). Must be **Content ID free**: a claim on a streamer's playthrough is a support ticket. Send the licence or a link to its terms, per asset, and tell us if a bank needs a `credit`. |
| **Naming** | Anything you like — the manifest joins a file to its type. A zip of `public/audio/**` is perfect. |
| **Voice** | **No vocals in menu music or in any SFX.** The song's own voice has to sit on top of them. |

### Where files live

- **`audio-src/`** — anything as downloaded: a pack's masters, its duplicate formats
  (`wav`/`m4a`/`mp3`), its alternates, its licence PDF. **Gitignored and never
  deployed.**
- **`public/audio/`** — what the game serves: the OGG for each sound, and the manifest.
  `public/` goes to the deploy verbatim, so a pack's worth of formats in there is
  megabytes of nothing.

## The song's own audio

A song carries its own audio, in its **song document's** `audio` block: `stems[]`,
`mixPresets` and each part's `audioControl`. Nothing here is a game asset, but the
**specs matter enormously**, because the whole "your instrument drops out when you miss"
trick depends on them.

- **One song = one set of stems, sample-aligned.** Every stem must be the same length,
  the same sample rate, and start at the same instant. If they do not, muting one
  mid-song drifts out of time. Bounce them together, from one session, in one go.
- **Which stems**: `master`, `drums`, `bass`, `lead_guitar`, `rhythm_guitar`, `keys`,
  `vocals`, plus `backing` and `crowd` where the song has them. `master` is the whole
  mix (or the backing around the parts), what `full` falls back to, and what the
  jukebox previews when the song has no clip.
- **The preview clip is not a stem.** `preview.ogg` (or `.opus`/`.mp3`) is a jukebox
  clip: recorded as `audio.preview`, played from its own start, never in `mixPresets`,
  never muted, and never opened by a run. A song without one is previewed from its
  **master** at `previewStartMs` - which is worth having even when `full` is the parts.
  A **`.sng` package** follows the same order, but a package with only parts previews its
  first audio member from that cue: it is the only sound the package has, and silence is
  worse than one instrument for a row that is only a reminder.
- **A file name is not always the instrument.** A song with a **bass chart but no
  `bass.ogg`** often carries its bass as `rhythm.ogg`; measured on a bass-led test song,
  that file is ~22 dB louder below 160 Hz than above 250 Hz, so it is a bass, not a
  rhythm guitar. The song document gives such a file to the **bass part**, so a missed
  guitar note leaves the bass playing. A folder with a real `bass.ogg` keeps `rhythm.ogg`
  on the guitar, and a song with no bass chart keeps it there too.
- **Format**: OGG Vorbis or Opus, served with HTTP range requests and CORS headers
  (we stream the stems with media elements rather than decoding them: seven stems of a
  four-minute song are ~640MB as raw audio).
- **Size**: at `q3`–`q4` a four-minute stem is ~3MB, so a full band is ~20–25MB a song.
  That is why `mixPresets.full` exists and why the preview uses one file.
- **Charts**: the notes come separately (`charts/…`), and a real library needs a licence
  for the audio **and** for the chart.
- **What we need to develop against**: three or four **licence-clear** songs with
  stems — one full band, one duet, one lyrics-only (no pitch), one instrumental. Until
  then the game plays generated audio-less songs: with no stems there is nothing to
  unmute, so a mock song is silent except for its misses and its crowd.
- **Where stems come from now**: `bun run import` reads the stems a chart folder already
  has — `song.ogg` as the master, `guitar.ogg` / `rhythm.ogg` / `bass.ogg` / `keys.ogg`,
  the `drums_1..4.ogg` a kit is split into, `vocals.ogg` and `vocals_2.ogg` for a harmony,
  `crowd.ogg`, and `preview.ogg` for the jukebox clip — and **references** them in the song document. It copies nothing, transcodes
  nothing and writes an `audio-manifest.json` of what each song needs so the files can be
  hosted separately. A folder opened from this machine carries the same names as
  `folder://` URLs. A chart library is tens of gigabytes of audio: it is hosted or it is
  silent, and the game does not care which.
- **Which of those files is the song depends on the folder, and it is measured, not
  guessed.** A folder that shipped a **multitrack** (three or more distinct instruments,
  however many files they are cut into — a kit's `drums_1..4` is one) has a `song.ogg`
  that measures 22–88% present — some open with a minute of digital silence — while its
  parts sum to **97% at a full level**: so those play their parts. A folder with one or
  two **instruments** beside its mix is the older convention, where `song.ogg` *is* the
  song and those files are the **backing** (the mix with an instrument taken out): those
  play the master. The rule is `mixPresetsFor` in `src/lib/game/sources/files.ts`. A mix
  that will not load at all — some folders ship a **0-byte** `song.ogg` — leaves
  `SongAudio` playing the parts instead, because a song with a file missing is still the
  song.

## The manifest

`public/audio/sounds.json` is the list of what the game **has**, read at runtime
(`src/lib/game/audio/sounds.ts`, pure and tested; `useSounds` fetches it fresh every
time, with the cache only as an offline fallback). Adding a sound is dropping a file in
`public/audio/` and writing a line — no rebuild, no code.

**An entry with no `file` is a sound that has not arrived yet**, so this one file is
both the manifest and the checklist: the dev panel reads its tally — the files here,
the files wanted, and how many **types** can actually be played — and a test checks that
every file it names is on disk.

| field | |
| --- | --- |
| `type` | what the game **plays** - one of the types in the tables above |
| `id` | this file's own name, unique in the manifest — `click_2`, `background_1` |
| `kind` | **required, and it decides how the file plays** — `track`, `loop` or `oneshot` |
| `file` | relative to the manifest. Omit it until you have the sound |
| `gainDb` | a trim on top of its channel's level (optional) |
| `credit` | who to thank and under what terms (optional) |
| `loopStart` / `loopEnd` | loop points in seconds, when the loop is not the whole file — applied to the streamed bed element, both required and positive |

The four `background_*` beds are wired to `background` and ship as **Ogg/Opus**
(`background_1.ogg` … `background_4.ogg`), not MP3: MP3 pads the ends, which is a tick
at a seam and a second of nothing between tracks, and the old masters were 22.5 MiB of
the deploy. The Opus set is 8.2 MiB, and every file decodes to the **same sample count**
as its source, so a bed is neither padded nor truncated.

The four beds are **HappyPaul55's own Suno generations**. Their source masters (created
15 October 2026) are tagged `artist=happypaul55`, `title=Testing my Guitar` and
`comment=made with suno`; the shipped Opus files have their metadata stripped, so the
manifest carries the record instead: each one's `credit` is **HappyPaul55, made with
Suno**. Their use is governed by the terms of the Suno plan they were generated under.
The game is free and non-commercial, and this is a record of provenance rather than a
separate licence name we cannot establish.

### Encoding a replacement bed

There is deliberately no npm script: a bed is replaced once in a while, and the command
belongs with the toolchain rather than in `package.json`. From a mastered 48 kHz stereo
source:

```bash
ffmpeg -i background_N.mp3 \
  -map 0:a:0 -ac 2 -ar 48000 \
  -af "afade=t=in:st=0:d=0.005,areverse,afade=t=in:st=0:d=0.005,areverse" \
  -c:a libopus -b:a 64k -vbr on -compression_level 10 \
  -application audio -map_metadata -1 background_N.ogg
```

- **64 kbps VBR stereo** is the low end of what a menu bed needs and the point where
  Opus is transparent for this material — no vocals, nothing dense, and the bed sits at
  half the music channel. At 96 kbps the four files would be 50% larger for nothing
  audible; at 64 kbps a 4:55 bed is ~2.4 MB and the 2:40 one ~1.3 MB.
- **`-map 0:a:0`** is not optional for these masters: they carry cover art, and without
  it ffmpeg maps the embedded image into the Ogg as a second, Theora stream.
- **The 5 ms fades are the seam fix, and they are ramps, not cuts.** Measure a source's
  edges first (`ffmpeg -af silencedetect=noise=-60dB:d=0.05 -f null -`, or decode it and
  look at the first/last non-zero sample). These four have no leading silence and only
  5–12 ms of ≤ 1-LSB dither at the very end, so nothing musical was trimmed; the fades
  take each edge to zero (and the decoded first/last samples measure within a few LSB of
  it). **Trim real leading or trailing silence before running the command**, never the
  decay: `areverse` puts the same 5 ms ramp on the tail without hard-coding a duration.
- **`-map_metadata -1`** keeps the file to audio (the manifest owns ids and credits) and
  writes no ReplayGain tags; the integrated loudness of each bed is unchanged from its
  master, so the bank does not jump from one piece to the next.
- **Verify** with
  `ffprobe -v error -show_entries stream=codec_name,sample_rate,channels -of default=noprint_wrappers=1 background_N.ogg`
  (expect `opus`, `48000`, `2`), and compare decoded length rather than trusting the
  container's rounded duration:
  `ffmpeg -v error -i background_N.ogg -f s16le -ac 2 -ar 48000 - | wc -c` is
  `samples × 4` bytes.

## Built: the mixer

`src/components/game/audio/` — one `AudioContext`, three channels (music, ambience,
sound effects) under a master, and the rules about *when* kept pure in
`src/lib/game/audio/mix.ts`.

**The levels** are `CHANNEL_LEVEL` in `mix.ts`, and they are deliberately modest: the
beds sit at **half** (the room, not the subject) and the cues at **70%** (loud enough to
be heard, not the master, because feedback at full scale has nowhere left to go). The
master starts at full — it is the player's, and the mix is the mix's. A file's own
`gainDb` normalises it within its family; the channel decides where the family sits.

- **A bed streams; a one-shot is decoded.** A four-minute track as an `AudioBuffer` is
  ~90MB of float samples, so a bed is an `<audio>` element the browser streams, routed
  into the graph for its gain. A click or a sting is milliseconds and wants to start
  *now*, so it is fetched, decoded and kept.
- **Nothing plays before a gesture, but the welcome loads before one.** The graph is
  built **suspended** while the poster is up, which is legal and makes no sound: it is
  what lets every cue be **fetched and decoded** before the first press, and the bed the
  pages open on be downloaded (both chosen by `soundsToWarm` — every one-shot, the first
  `background`, and any loop). The welcome's button says "Loading…" and is disabled until
  that is in hand, so its press is not the press that starts a fetch: it resumes the
  graph and the first click is heard as a click. The cap is five seconds — a manifest or
  a file that never arrives is a **silent** game, not a welcome nobody can leave. The bed
  asked for before the press is remembered and starts with it.
- **Every page wants `background`; the stage and the jukebox want none.** A menu bed
  over a running song is the one thing the mixer must never do, and the jukebox is a
  preview booth rather than a room with a house band.
- **Asking for the bed that is already playing does nothing**, so moving between menus
  never restarts the track somebody is listening to.
- **A jukebox preview is a guest on the music channel.** Choosing a song streams its
  `preview.ogg` (or its master from `previewStartMs`) through a media element and
  **loops** it until another song is chosen or the jukebox is left. With no preview to
  play the jukebox is silent — the menu bed does not return behind it. It is **not** a
  manifest type — it is the song's own file, so it has no `gainDb` and no picker.
- **Every button clicks** — one listener on the island rather than a prop on sixty
  components. **Moving onto a control makes a smaller sound** — the pointer entering
  one, or focus arriving by Tab or a pad — and the game's own focus placement (a
  screen's starting control, a dialog opening) is silent, because the `screen` whoosh
  or the `open` cue has already said it. The focus layer marks those moves `silent`.

## The manifest is complete

**Wired and audible now**: every button (`click`, or its own `data-sound` — `select`,
`back`, `open`, `refuse`), a `move` when the pointer lands on a control or focus reaches
one by Tab or a pad, a whoosh on every screen change, the
typing feedback (`type_key`, `type_word`, `type_miss`), a `miss` when a highway misses,
an `error` when a player's part **goes out** (the first miss of a streak, including on a
one-master song where nothing actually ducks), `sparkle` on a hero note, `tick` on the results count-up, the **crowd** in
the pause menu, and **`meter_activate`** at the one
star-power moment left (the gauge filling is drawn, not sounded). The run's framing (the band's own `hype_*` entrances
when the stage's entrance opens, one per unique part and panned across the band;
`win` / `fail` / `best` at the results) is wired too.

**Nothing is waiting on a file.** Every type resolves to at least one sound, and the
game's rule still holds for the future: asking for a type nothing can play is
**silence, not an error**, so a cue can be wired ahead of its asset without breaking a
screen. A replacement is a file in `public/audio/` plus its manifest entry.

**The mix is complete.** Music, ambience and sound effects have their own levels under
the master (Options); a sting ducks the **menu's** music and ambience — never a song,
whose stems live outside the graph — while the band's `hype_*`
entrances deliberately do not; a song's own stems — lane and
voice — drop out while that part is out and come back on the next hit or at the end of
its phrase (`onMiss.restore: "next_hit"` or `"phrase_end"`); the guide vocal is a
setting. The jukebox **preview** is built (`preview.ogg`, else the master from
`previewStartMs`); a run plays a song from its start, and practice from its section.

## Where to look

- **Free / CC0**: Kenney (UI SFX packs — the whole `click`/`select`/`back` family in one
  purchase), freesound.org filtered to CC0, Pixabay Audio, ZapSplat. Check the licence
  per file, and beware Content ID on "free" music.
- **Paid stock**: Epidemic Sound, Artlist, Soundstripe, AudioJungle (music, with game
  licences); Krotos, Boom Library, A Sound Effect (SFX, crowd, drum hits). Buy UI packs
  as packs: the variants a bank needs are exactly what a pack is good at.
- **Custom**: worth it for the **sting family** (`win`, `best`) so the game has
  an identity of its own — the beds can be stock, but the moments a player remembers
  should not be.
- **Crowd and stage**: any "rock crowd" pack; a live-album crowd recording is often
  better and cheaper than a library's. It is a pause texture, so a minute is plenty.
