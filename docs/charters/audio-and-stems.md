---
title: Audio and stems
description: "The song's own sound: stems and mix presets, which file is the song, how a miss ducks a part, the jukebox preview, and how to assemble a folder."
updated: "2026-10-31"
order: 5
---

A song's sound is its own: a run streams the files the song document names and never copies or stores them. This page is what a charter must get right for a run to sound like the song.

The contract is [§4.2 of the wire format](../developers/playlist-api.md#42-audio).

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
- **`stems`** is one entry per file: an `id`, a `url`, an optional `name`, an optional **`instrument`**. A stem without one is a **master** or backing, never ducked by a miss.
- **`mixPresets`** is keyed by name, each naming stem ids. **`full`** is the whole song; **`stems`** is the parts alone.
- **`preview`** is a short jukebox clip, not a stem; **`previewStartMs`** on the song is where a preview starts without one.

## Which file is the song

Get this wrong and the game plays without its lead instrument.

A chart folder's `song.ogg` is not always the whole song. Measured across a real chart library:

- A **multitrack** — three or more distinct instruments, however many files — carries the whole song in its parts: its master is 22–88% present, sometimes a minute of silence, while the parts sum to 97%. The parts are the song.
- A folder of **one or two instruments** ships a master sharing almost nothing with the instruments beside it (correlation ≈ 0.01 over 15 seconds, where a master containing them sits near 0.3). It is the mix with those instruments **taken out** — the backing a miss needs. The song is master **and** parts.

The importer applies that rule when it writes a document:

| What the folder has | `full` | `stems` |
| --- | --- | --- |
| A master and 1–2 instruments | master + every part | every part |
| Three or more instruments | every part | every part |
| A master only | the master | — |
| Parts only | every part | every part |

A kit cut into `drums_1` to `drums_4` counts as **one instrument**: the count is of things somebody plays.

Two consequences for a publisher:

- **The rule can be wrong for your folder.** On a one- or two-instrument song it assumes `song.ogg` is the backing; if yours is the complete mix and you also ship the parts, name `full` as the master alone.
- **A document's own presets are trusted.** The stage plays the `full` you name; if it names no stem the song has, every stem plays; with no `full`, the first preset is used.

A **0-byte or truncated master is not rare**. When the whole mix will not play, the stage falls back to the parts, so the folder still has a song.

## Stems, parts and a miss

A **part** is something somebody can play. A miss takes it to **a tenth of its own level** — a duck, not a mute, because an element at zero leaves the browser's audio clock and drifts.

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

- **`controlledStemIds` is the field the stage uses.** A miss on that part takes exactly those files to a tenth.
- **A stem with no `instrument` is never controlled**, even if named: ducking the master would duck everything. A one-master song therefore controls nothing — intended, not a gap.
- **A part returns on its next hit** (`"restore": "next_hit"`, the default) or **at the end of the miss's phrase or line** (`"phrase_end"`). `onHit` and `onSustainBreak` are read; `onMiss` is what the stage acts on.
- **The rule is per seat.** Two players on one instrument leave the stem out while *either* is out, and it returns when the last is back.
- **Lead and rhythm are separate keys.** A missed lead does not duck the rhythm, and a plain `guitar` part is the fallback when a song names no role.
- **The master is never in the set.** `controlledStemIds` naming it is ignored.
- **A miss that puts a part out raises the error cue**, once per stop rather than per miss — on a one-master song too, where there is nothing to duck.

Nothing here is read back into judging. It is a mix effect, one way, from a run's misses to the song's volume.

### The guide vocal

A singer replaces the song's voice; the **guide vocal** setting controls the vocal stem underneath:

- **Off** — the vocal stem is **not loaded at all**.
- **On** — it stays under the singer.

Only a separate vocal stem named by the **vocals** part in `audioControl` can be affected; a one-master song keeps its voice.

## The jukebox preview

Choosing a song plays a reminder:

- A folder's **`preview.ogg`** (or `.opus`/`.mp3`), from its own start, if there is one.
- Otherwise the song's **master**, from `previewStartMs` — the named cue, or the beginning.
- A song with **only parts and no whole mix** has nothing to preview. One instrument is a preview of the wrong thing.

The clip is streamed, loops until another row is chosen or the jukebox is left, and is never mixed into the run or ducked. A local file becomes an object URL, the previous one revoked.

## YouTube as the music

A song can use a YouTube video as its sound as well as its backdrop:

```json
"audio": { "source": "youtube" },
"video": { "kind": "youtube", "id": "hHUbLv4ThOo" }
```

- **No stems**: `stems` and `mixPresets` are absent or empty and ignored.
- `video.kind` **must** be `youtube`; otherwise the song has no sound and the game reports the disagreement.
- **One stream means no part can duck.** A miss has no channel to take out; the error cue still plays and the song plays on.
- The row is **silent** unless a licensed `audio.preview` clip is supplied.
- The official player is the playback path; the game never extracts or proxies the stream. Check that the video is embeddable in the player's region.
- A captions-only video gives a `lyrics` chart, not `vocals`: there is no pitch, so no singer score. See [Formats](formats.md).

## Assembling a folder

For someone with a recording and a chart:

1. **Decide what a miss should duck.** For the guitar, you need a separate stem; for nothing, one master is enough.
2. **Cut the stems from one mix, with one start point.** Every file must begin at the same moment; the game aligns to the playhead but cannot rescue a bar-late stem.
3. **Keep them at one level.** Per-stem gain is not applied: 6 dB louder in the file is 6 dB louder in the game.
4. **Name them by the table** in [Folder layout](folder-layout.md): `song.ogg`, `guitar.ogg`, `bass.ogg`, `drums.ogg` or `drums_1..4.ogg`, `vocals.ogg`, `harmony.ogg`. An unknown name is not a stem.
5. **Ship a master with parts on a one- or two-instrument song** — the backing. On a multitrack the parts are the song; if yours is a true full mix, say so in `full`.
6. **Add a preview clip** — the hook, from its start; without one the jukebox plays the master from the song's cue.
7. **Make the length true.** `durationMs` should match the audio; the clock follows the sound and ends with the **last** stem.
8. **Choose a format.** MP3 or AAC/M4A are safest, OGG/Opus works in modern browsers, WAV works and is large; serve **Range** for comfortable seeking.
9. **Say which part owns which stem** in `audioControl`, or a miss ducks nothing.

## What the game does not do

- It does not apply per-stem gain or offset, though both fields exist.
- It does not normalise loudness between songs or stems.
- It does not extract audio from a video, or proxy a stream.
- It does not store audio in its own cache (the browser streams and caches it), mute the master on a miss, or silence a part completely.
- It does not add a song's `crowd.ogg`; the room's crowd is the game's own sound, and it plays while a run is paused.

The game's **own** sounds — clicks, stings, the crowd, the menu beds — are a separate contract with its own manifest and licensing: [Audio](../developers/audio.md).
