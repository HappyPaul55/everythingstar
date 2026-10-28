---
title: Libraries
description: "The three documents a library is made of — playlist, song and chart — how their URLs resolve, how ids and revisions work, and how to check one."
updated: "2026-10-28"
order: 5
---

A library is three kinds of document, normally three JSON files. The **playlist** is the index: one summary per song, enough to draw a row and offer it to a band. A **song document** says what a song is: its audio, its parts, and where each part's charts live. A **chart document** is the notes. They are fetched separately, and that separation is the point — a list of five hundred songs is one small fetch, and a run downloads only the charts its band needs.

The full field-by-field contract is [the wire format](../developers/playlist-api.md) (on the site: [Playlist API](https://everythingstar.happypaul55.com/docs/developers/playlist-api)). This page is the shape and the habits; that page is the reference you check a field against.

```text
https://example.com/library/
  playlist.json
  songs/neon-hearts.json
  charts/neon-hearts/guitar-expert.json
  charts/neon-hearts/vocals.json
  art/neon-hearts.jpg
  audio/neon-hearts/master.ogg
  audio/neon-hearts/guitar.ogg
  audio/neon-hearts/vocals.ogg
```

## The playlist

```json
{
  "schemaVersion": 1,
  "name": "The Example Songbook",
  "description": "One song recorded for the demo.",
  "songs": [
    {
      "id": "demo-neon-hearts",
      "title": "Neon Hearts",
      "artist": { "id": "static-bloom", "name": "Static Bloom" },
      "album": { "id": "first-light", "name": "First Light", "year": 2007 },
      "art": "art/neon-hearts.jpg",
      "accent": "#3fae5a",
      "durationMs": 180000,
      "previewStartMs": 42000,
      "song": "songs/neon-hearts.json",
      "offer": {
        "instruments": [
          { "role": "guitar", "difficulties": ["easy", "normal", "hard", "expert"] }
        ],
        "voice": { "chartType": "vocals", "parts": 1 }
      },
      "video": { "kind": "youtube", "id": "n_GFN3a0yj0" }
    }
  ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | The song's key. Stable, unique, and the same as the song document's. |
| `title` | yes | What the jukebox shows and files under its first letter. |
| `artist` | yes in practice | An object `{ id?, name, art? }`, or a bare name here. |
| `album` | no | `{ id?, name, year?, art? }`. |
| `durationMs` | yes in practice | The length the row shows. `0` is accepted and reads `0:00`. |
| `art` | no | The cover; falls back to the album's, then the artist's, then initials. |
| `previewStartMs` | no | Where the preview starts when there is no preview clip. |
| `accent` | no | A CSS colour for the cover tile when there is no art (or it does not arrive). |
| `song` | yes | The song document — or a `.sng` package. |
| `offer` | yes for a playable song | What a band can choose before the document is fetched. |
| `video` | no | A YouTube id or a direct video URL, for the backdrop. |

An **offer** has an array of instruments, each with a non-empty list of difficulties, and one `voice`:

- `role` is `guitar`, `bass`, `drums`, `keys`, `dance`, `lead_guitar` or `rhythm_guitar`. The two guitar flavours are **separate seats**: list both when the song carries both, and the band screen offers Lead guitar and Rhythm guitar.
- `difficulties` are `easy`, `normal`, `hard`, `expert`, lower case.
- `voice` is `{ "chartType": "vocals", "parts": 1 }`, or `"lyrics"` for words with no pitch, or absent for an instrumental. `parts` is 1–3.
- **Never put `vocals` in `instruments`.** The voice is its own field, and a `vocals` entry there is reported and skipped.
- A karaoke song is allowed to offer nothing but the words: `"instruments": []`.

## The song document

```json
{
  "schemaVersion": 1,
  "id": "demo-neon-hearts",
  "title": "Neon Hearts",
  "artist": { "id": "static-bloom", "name": "Static Bloom" },
  "album": { "id": "first-light", "name": "First Light", "year": 2007 },
  "art": "../art/neon-hearts.jpg",
  "durationMs": 180000,
  "previewStartMs": 42000,
  "audio": {
    "stems": [
      { "id": "stem_master", "url": "../audio/neon-hearts/master.ogg" },
      { "id": "stem_guitar", "url": "../audio/neon-hearts/guitar.ogg", "instrument": "lead_guitar" },
      { "id": "stem_vocals", "url": "../audio/neon-hearts/vocals.ogg", "instrument": "vocals" }
    ],
    "mixPresets": {
      "full":  { "stemIds": ["stem_master", "stem_guitar", "stem_vocals"] },
      "stems": { "stemIds": ["stem_guitar", "stem_vocals"] }
    }
  },
  "parts": [
    {
      "id": "part_guitar",
      "role": "guitar",
      "audioControl": {
        "controlledStemIds": ["stem_guitar"],
        "onMiss": { "action": "mute", "fadeMs": 80, "restore": "next_hit" }
      },
      "charts": [
        {
          "id": "neon-hearts-guitar-expert",
          "chartType": "lanes",
          "difficulty": "expert",
          "laneCount": 5,
          "bpm": 132,
          "url": "../charts/neon-hearts/guitar-expert.json"
        }
      ]
    },
    {
      "id": "part_vocals",
      "role": "vocals",
      "audioControl": { "controlledStemIds": ["stem_vocals"] },
      "charts": [
        {
          "id": "neon-hearts-voice",
          "chartType": "vocals",
          "url": "../charts/neon-hearts/vocals.json"
        }
      ]
    }
  ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `schemaVersion` | yes | Exactly `1`, on every document. |
| `id` | yes | Must equal the playlist entry's `id`. |
| `title` | yes | The song's name. |
| `artist` | recommended | An **object**. A string is not accepted here. |
| `album`, `art`, `video` | no | As in the entry. |
| `durationMs` | yes in practice | Should match the audio. |
| `audio` | yes for sound | Stems and presets, or `source: "youtube"`. |
| `parts` | yes for content | One per thing somebody can play. |
| `sections` | no | `{ timeMs, name }` markers. Nothing judges on them. |

A **part** carries a `role`, an optional `label`, an optional `audioControl`, and at least one chart listing. A chart listing carries the **level**, the **column count**, the optional **tempo** and **offset**, and the chart's URL. For the voice there is no level: one melody chart, whichever `chartType` it is.

The listing is authoritative. The game reads `laneCount`, `bpm` and `offsetMs` from the **song document**, not from the chart file, so a chart file that repeats them is a copy for humans. Changing only the file changes nothing.

## A chart document

One instrument at one level, or the one melody:

```json
{
  "schemaVersion": 1,
  "chartType": "lanes",
  "notes": [
    { "timeMs": 1500, "lengthMs": 0,   "kind": "strum", "column": 1 },
    { "timeMs": 2125, "lengthMs": 0,   "kind": "hopo",  "column": 1 },
    { "timeMs": 2750, "lengthMs": 0,   "kind": "strum", "column": null },
    { "timeMs": 3375, "lengthMs": 700, "kind": "strum", "column": 1 },
    { "timeMs": 4625, "lengthMs": 0,   "kind": "strum", "column": 0 },
    { "timeMs": 4625, "lengthMs": 0,   "kind": "strum", "column": 1 }
  ],
  "phrases": [{ "startMs": 12000, "endMs": 24000 }]
}
```

- A **chord** is several notes at one `timeMs`; there is no chord id.
- An **open** note is `column: null`, on a strummed instrument, alone at its moment.
- A **hopo** is a note kind, written by the chart. Do not re-derive it from spacing.
- Order does not matter and notes carry no ids; the reader sorts and numbers them.
- `phrases` are energy spans. `fills` are drum-only freestyle windows.
- `chartType`, if present, must match the listing: `lanes`, `drums`, `vocals` or `lyrics`.

A melody chart is one document for the voice, with `parts`, `rows`, `rootMidi`, `lines` and `notes`. Its two time bases are worth repeating because they are the commonest wiring mistake:

- `lines[].timeMs` is absolute, and each word's `timeMs` is **relative to its line**.
- `notes[].timeMs` is **absolute**.

```json
{
  "schemaVersion": 1,
  "chartType": "vocals",
  "parts": 1,
  "rows": 12,
  "rootMidi": 48,
  "lines": [
    {
      "timeMs": 15200,
      "endMs": 17800,
      "parts": [{ "part": 0, "offset": 0 }],
      "words": [
        { "text": "It's",  "timeMs": 0 },
        { "text": "going", "timeMs": 420 }
      ]
    }
  ],
  "notes": [
    { "timeMs": 15200, "lengthMs": 400, "part": 0, "row": 7, "text": "It's" },
    { "timeMs": 15620, "lengthMs": 540, "part": 0, "row": 5, "text": "going" }
  ]
}
```

A line with no `parts` is not drawn, so a solo line carries `[{ "part": 0, "offset": 0 }]`. A `vocals` note has a `row` inside `rows`, or `null` for a spoken word. A `lyrics` chart needs no notes at all: its words come from the lines, there is no pitch, and there is no singer score.

## How a URL resolves

Every relative URL resolves against **the document that wrote it**, exactly as a browser resolves a link:

| Written in | Resolves against |
| --- | --- |
| A playlist entry's `song`, `art`, `video.url` | The playlist URL |
| A song document's `art`, audio, preview, video and chart URLs | The song document's URL |
| A chart document | Nothing — a chart has no URLs of its own |

That is why a playlist can live anywhere and point at a library beside it, and why the example above uses `../audio/…` from `songs/`.

Every URL must be an absolute `http` or `https` address with a host, at most 8192 characters. `javascript:`, `data:`, `file:` and `blob:` are refused before any fetch, and a URL carrying credentials is refused too. A relative reference that cannot be resolved is named as a problem, and the field is dropped.

The limits, enforced by the same reader the game uses:

- A **document** — playlist, song or chart — is capped at **8 MB**.
- A **`.sng` package** is capped at **128 MB**.
- A body is read as a stream. A host that declares a small `Content-Length` and sends more is cut off at the cap.

CORS is required for the documents, and audio should serve it too — the jukebox preview sets `crossOrigin`:

```text
Access-Control-Allow-Origin: *
Content-Type: application/json
```

Serve everything over **HTTPS** — HTTP media is blocked as mixed content — and let audio answer **Range** requests so a seek is comfortable. The full delivery rules are [§6 of the wire format](../developers/playlist-api.md#6-delivery-contract).

## The index is a summary, the song is the truth

The playlist entry exists so that listing does not fetch every song. It is allowed to be less than the whole truth, but it must not promise more:

- `offer` must agree with the song document's parts. If the entry offers a bass and the document has no bass chart, the band screen offers a seat that cannot be filled.
- `durationMs` is what the row shows; the run's clock and its end come from the audio.
- Where the two disagree on stage, the **document wins**: a part is what the document's `parts` say, not what the summary said.

A broken entry is **skipped and named**, never fatal: a song missing its id, its title or its `song` is reported in the Playlists dialog and the other songs still list. A document that is not a playlist at all comes back empty with the reason. In a search answer the skip is silent, so a malformed result is a result nobody sees.

## Ids and revisions

The entry's `id` is the library's key, and it is used for more than listing:

- merging playlists — the same id in two playlists is **one song**, and the first source wins;
- the local score board, which is keyed by song id;
- the song selected in the session;
- the offline record, if the song has been downloaded.

So it must be **stable** across reloads and searches, **unique** across your own catalogue (namespace it: `demo-neon-hearts`), and **shared** with the song document. Never reuse an id for a different recording.

A document can change under the same URL. To make the game notice, **change the playlist entry**: its revision is a hash of the raw entry, and a song or chart cached for an older revision is fetched again. That is what lets you fix a chart, or add a difficulty, without renaming anything.

- Change the entry's content and the documents follow.
- If the summary would be identical, add a `revision` field with any new value; it is part of the hash.
- A revision miss also bypasses the browser's own HTTP cache, so a `max-age` cannot serve the old copy.
- `schemaVersion` is for a change of **shape**, not of content. Keep it at `1` unless the contract changes.

## Cache, refresh and what a player sees

- The playlist document is cached in the browser and refreshed when the player presses **Refresh** — never behind their back.
- Song and chart documents are cached under their URL and revision, so a second run is instant.
- Search answers are session memory and are not stored.
- Audio is never stored by the game. The browser streams it.
- The built-in EverythingStar FOSS playlist is the exception: it is read fresh once per visit, because it is a published library that changes.

## Checking a library

```bash
bun run playlist:check https://example.com/library/playlist.json
```

It reads the document with the **same reader** the jukebox uses, applies the game's URL policy and the 8 MB cap, prints the name, the songs it would list and every problem, and exits `1` if there is one. `--json` prints the same record for a build step.

The checker reads **one playlist document**. It does not fetch each song document or chart, so it cannot prove that a chart URL answers, that a `laneCount` matches its notes, or that the audio plays. Those are what the acceptance checklist in [the wire format](../developers/playlist-api.md#11-acceptance-checklist) walks through, and what [Publishing](publishing.md) is for.

For an editor, [`docs/playlist.schema.json`](https://github.com/HappyPaul55/everythingstar/blob/main/docs/playlist.schema.json) is the advisory shape (JSON Schema draft 2020-12). It catches a typo as it is typed, but it is deliberately not stricter than the contract and it cannot know what resolves, what is listed twice, or whether a song is playable. **The reader is authoritative.**

## A real one

The shipped library, [EverythingStar FOSS](https://github.com/HappyPaul55/everythingstar-foss), is a published example of all of this. It is seeded into a first visit from:

```text
https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/main/songs/playlist.json
```

It uses a per-song folder rather than the importer's `songs/<id>.json` tree: each entry's `song` is something like `Jonathan Coulton - Code Monkey/song.json`, and that folder holds the song document, its chart documents, `album.jpg`, `preview.ogg` and the stems. Both layouts are valid; what matters is that every relative URL resolves against the document that wrote it.

## Where to go next

- [Audio and stems](audio-and-stems.md) — which file is the song, and how a miss ducks a part.
- [Publishing](publishing.md) — from a folder of charts to a hosted library.
- [The wire format](../developers/playlist-api.md) — every field, the on-demand search request and the acceptance checklist.
