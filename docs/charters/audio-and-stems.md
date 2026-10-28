---
title: Audio and stems
description: "The song's own sound: stems and mix presets, which file is the song, how a miss ducks a part, the jukebox preview, and how to assemble a folder."
updated: "2026-10-28"
order: 4
---

A song's sound is its own. The game ships its own effects and menu music, but a run plays the files the song document names, streamed from wherever they are hosted. It never copies, transcodes or extracts them, and it never stores them. This page is what a charter has to get right so that a run sounds like the song.

The contract is [§4.2 of the wire format](../developers/playlist-api.md#42-audio); the code that decides what plays is `src/lib/game/sources/files.ts`, `src/lib/game/audio/stemPlan.ts` and `src/lib/game/audio/parts.ts`.

## The audio block

```json
"audio": {
  "source": "stems",
  "stems": [
    { "id": "stem_master", "name": "Backing", "url": "../audio/song.ogg" },
    { "id": "stem_guitar", "url": "../audio/guitar.ogg", "instrument": "lead_guitar" },
    { "id": "stem_drums",  "url": "../audio/drums.ogg",  "instrument": "drums" }
  ],
  "mixPresets": {
    "full":  { "stemIds": ["stem_master", "stem_guitar", "stem_drums"] },
    "stems": { "stemIds": ["stem_guitar", "stem_drums"] }
  },
  "preview": "../audio/preview.ogg"
}
```

- **`source`** is `stems` (the ordinary case) or `youtube` (the video is the music). Omitted means `stems`.
- **`stems`** is one entry per file: an `id` other fields refer to, a `url`, an optional `name`, and an optional **`instrument`**. A stem with no instrument is a **master** or backing, and is never ducked by a miss.
- **`mixPresets`** is an object keyed by name, each naming stem ids. **`full`** is the whole song; **`stems`** is the parts alone.
- **`preview`** is a short clip for the jukebox. It is not a stem.
- **`previewStartMs`**, on the song, is where a preview starts when there is no clip.

Two per-file fields are read and carried but **not applied** by the stage: `defaultGainDb` and `offsetMs`. Do not use them to balance or sync a song. Master the stems together at the same level and the same start.

## Which file is the song

This is the one decision in a chart folder that is easy to get wrong, and getting it wrong is a game that plays without its lead instrument.

A chart folder's `song.ogg` is not always the whole song. Measured across a real chart library:

- A **multitrack** — three or more distinct instruments, however many files they are cut into — already carries the whole song in its parts. Its master is 22–88% present, sometimes opening with a minute of silence, while the parts sum to 97% at a full level. So the parts are the song.
- A folder of **one or two instruments** ships a master that shares almost nothing with the instrument files beside it (correlation ≈ 0.01 over 15 seconds, where a master containing them would sit near 0.3). It is the mix with those instruments **taken out** — the backing a miss needs. So the song is the master **and** the parts together.

The importer applies that rule when it writes a document:

| What the folder has | `full` | `stems` |
| --- | --- | --- |
| A master and 1–2 instruments | master + every part | every part |
| Three or more instruments | every part | every part |
| A master only | the master | — |
| Parts only | every part | every part |

A kit cut into `drums_1` to `drums_4` counts as **one instrument**, not four. The count is of things somebody plays, or a one-instrument folder would be mistaken for a multitrack and a missed drum note would take the whole kit out.

Two consequences for a publisher:

- **The rule can be wrong for your folder.** On a one- or two-instrument song it assumes `song.ogg` is the backing, because that is what those folders ship. If your `song.ogg` really is the complete mix and you also ship the parts, name `full` as the master alone in the song document instead of letting the rule add the parts on top. Shipping the master alone, with no parts, is the simplest version of that.
- **A document's own presets are trusted.** The stage plays the `full` you name. If `full` names no stem the song has, every stem is played rather than silence; if there is no `full` at all, the first preset is used.

A **0-byte or truncated master is not rare**. When the whole mix will not play at all, the stage falls back to the parts, so a folder with a broken `song.ogg` still has a song in it.

## Stems, parts and a miss

A **part** is something somebody can play. When a player misses, the part they are playing **drops out of the mix** — not to silence, but to **a tenth of its own level**. It is a duck, not a mute, because a media element at zero volume leaves the browser's audio clock and drifts; a quiet one stays in time and comes back in phase.

The rule is the song document's: a part's `audioControl` names the stems it owns.

```json
"parts": [
  {
    "id": "part_guitar",
    "role": "guitar",
    "audioControl": {
      "controlledStemIds": ["stem_guitar"],
      "onMiss": { "action": "mute", "fadeMs": 80, "restore": "next_hit" }
    },
    "charts": [ … ]
  }
]
```

What matters:

- **`controlledStemIds` is the field the stage uses.** A miss on that part takes exactly those files down to a tenth.
- **A stem with no `instrument` is never controlled**, even if it is named: the master is the whole song, or the backing around the parts, and ducking it would duck everything. A song shipped as one master therefore controls nothing — that is the intended answer, not a gap.
- **A part is put back by its next hit** (`"restore": "next_hit"`, the default), or **at the end of the phrase or line the miss fell in** (`"restore": "phrase_end"`). `onHit` and `onSustainBreak` are read and accepted; `onMiss` is the rule the stage acts on.
- **The rule is per seat.** Two players on one instrument leave the stem out while *either* of them is out, and it returns when the last of them is back.
- **Lead and rhythm are separate keys.** A missed lead does not duck the rhythm, and a plain `guitar` part is the fallback when a song names no role.
- **The master is never in the set.** `controlledStemIds` naming it is ignored.
- **A miss that puts a part out raises the error cue**, once per stop rather than once per miss — and on a one-master song too, where the part would have gone out but there is nothing to duck.

Nothing here is read back into judging. It is a mix effect, one way, from a run's misses to the song's volume.

### The guide vocal

A singer replaces the song's voice. The **guide vocal** setting decides what happens to the vocal stem underneath them:

- **Off** — the vocal stem is **not loaded at all**. A stream nobody hears is a download, a decoder and a clock of its own.
- **On** — it stays under the singer.

This only does anything when the vocal stem is a separate file and the **vocals** part names it in `audioControl`. A song shipped as one master has its voice inside it, and no setting can take it out.

## The jukebox preview

Choosing a song plays a short reminder of it:

- A folder's **`preview.ogg`** (or `.opus`/`.mp3`), played from its own start, if there is one.
- Otherwise the song's **master**, from `previewStartMs` — the cue the song names, or the beginning.
- A song with **only parts and no whole mix** has nothing to preview. One instrument is a preview of the wrong thing.

The clip is streamed, loops until another row is chosen or the jukebox is left, and is never mixed into the run and never ducked. A local file is read into an object URL and the previous one is revoked when the next starts.

## YouTube as the music

A song can use a YouTube video as its sound as well as its backdrop:

```json
"audio": { "source": "youtube" },
"video": { "kind": "youtube", "id": "hHUbLv4ThOo" }
```

- There are **no stems**. `stems` and `mixPresets` are absent or empty and are ignored.
- `video.kind` **must** be `youtube`. Without it the song has no sound, and the game reports the disagreement.
- **One stream means no part can duck.** A miss has no channel to take out; the error cue still plays and the song plays on.
- The row is **silent** unless a licensed `audio.preview` clip is supplied.
- The official player is the playback path. The game never extracts or proxies the stream. Check that the video is embeddable and available in the player's region before publishing it.
- A captions-only video gives a `lyrics` chart, not a `vocals` one: there is no pitch, so there is no singer score. See [Formats](formats.md).

## Assembling a folder

Plain steps for someone with a recording and a chart:

1. **Decide what a miss should duck.** If the answer is "the guitar", you need a guitar stem separate from the rest. If the answer is "nothing", one master file is enough and is much simpler.
2. **Cut the stems from one mix, with one start point.** Every file must begin at the same moment in the song. The game aligns them to the playhead, but it cannot rescue a stem that starts a bar late.
3. **Keep them at the same level.** Per-stem gain is not applied. A file mastered 6 dB louder is 6 dB louder in the game.
4. **Name them by the table** in [Folder layout](folder-layout.md): `song.ogg`, `guitar.ogg`, `bass.ogg`, `drums.ogg` or `drums_1..4.ogg`, `vocals.ogg`, `harmony.ogg`. A name the table does not know is not a stem.
5. **Ship a master when you ship parts on a one- or two-instrument song** — that is the backing. On a multitrack, the parts are the song and a master is optional. If your master is a true full mix, say so with your own `full` preset in the song document.
6. **Add a preview clip.** The hook, from its own start; without one the jukebox plays the master from the song's cue.
7. **Make the length true.** `durationMs` should match the audio; the run's clock follows the sound and the song ends when the **last** stem ends.
8. **Choose a format.** MP3 or AAC/M4A are the safest; OGG/Opus works in modern browsers; WAV works and is large. Serve the files with **Range** requests so a seek is comfortable.
9. **Say which part owns which stem** in the song document's `audioControl`, or a miss will duck nothing.

## What the game does not do

- It does not apply per-stem gain or a per-stem offset, even though both fields exist.
- It does not normalise loudness between songs, or between stems.
- It does not extract audio from a video, or proxy a stream.
- It does not store audio in its own cache. The browser streams and caches it.
- It does not mute the master when a part is missed, and it does not silence a part completely.
- It does not add a song's `crowd.ogg` to the run. The room's crowd is the game's own sound, and it plays while a run is paused.

The game's **own** sounds — clicks, stings, the crowd, the menu beds — are a separate contract with its own manifest and licensing: [Audio](../developers/audio.md).
