---
title: Playlist API
description: "The wire contract a playlist library or an on-demand search endpoint implements: the three documents, URL resolution, CORS, timing, and an acceptance checklist."
updated: "2026-10-28"
order: 7
---

This is for people building a service the game can play from, not for people changing the game. The game's readers are `src/lib/game/playlist.ts` and `src/lib/game/source.ts`; where this document and those disagree, the readers win and this document is the bug.

**Version 1 — the wire contract for a playlist library and an on-demand search endpoint.**

This document is for anyone building a service that EverythingStar can play from. It is
self-contained: you should not need to read the game's source to implement it. The game's
readers are in `src/lib/game/playlist.ts` and `src/lib/game/source.ts`; where this document
and those disagree, the readers win and this document is the bug.

The shortest version: serve **one playlist document** at a URL. It lists songs, or it says
`ondemand: true` and lists none until the game asks it with `?q=…`. Each song is a
**summary**; the summary points at a **song document**; the song document points at one or
more **chart documents**. JSON and media are fetched directly by the browser, so the
service must speak CORS over HTTPS.

To let a visitor add your library (or one song) to their own game in one press, publish a
share link — `https://everythingstar.happypaul55.com/open?playlist=…` or `?song=…`. The
formats, the confirmation rule and the native-app hand-off are in
[`deeplinks.md`](deeplinks.md); [§3.6](#36-sharing-a-song-and-the-link-to-add-it) is the
provider's part of it.

## Quick start

For an on-demand provider, the four requests that matter are:

```
GET /ondemand.json
    -> { "schemaVersion": 1, "name": "My karaoke", "ondemand": true, "songs": [] }

GET /ondemand.json?q=Timber
    -> { "schemaVersion": 1, "songs": [ <zero or more playlist entries> ] }

GET /songs/<id>.json
    -> { "schemaVersion": 1, "id": "<id>", "title": "…", "audio": { … }, "parts": [ … ] }

GET /charts/<id>/vocals.json
    -> { "schemaVersion": 1, "chartType": "vocals", "lines": [ … ], "notes": [ … ] }
```

A search answer may carry **any number of entries**: zero, one, twenty. An empty
`"songs": []` is a valid "nothing found"; every entry the game can read becomes a row.

For a **YouTube-backed** song the song document returns `audio: { "source": "youtube" }`
and `video: { "kind": "youtube", "id": … }`, and there is no audio file to serve: the
official player is the music. See [§4.6](#46-youtube-backed-songs).

For the ordinary, file-backed song, serve the audio file the song document names. Every
response needs `Access-Control-Allow-Origin`; every file needs HTTPS. The rest of this
document is the detail behind those four requests, plus a complete worked example in
[§8](#8-a-complete-worked-example).

---

## Contents

1. [The model](#1-the-model)
2. [The playlist document](#2-the-playlist-document)
3. [On-demand search](#3-on-demand-search)
4. [The song document](#4-the-song-document)
5. [Chart documents](#5-chart-documents)
6. [Delivery contract](#6-delivery-contract)
7. [What the game requests, and when](#7-what-the-game-requests-and-when)
8. [A complete worked example](#8-a-complete-worked-example)
9. [Building a YouTube karaoke resolver](#9-building-a-youtube-karaoke-resolver)
10. [Check yours](#10-check-yours)
11. [Acceptance checklist](#11-acceptance-checklist)
12. [Appendix: accepted values](#12-appendix-accepted-values)

---

## 1. The model

```
playlist.json                  ← the index: what songs exist (or that this is a search endpoint)
  └─ songs/<id>.json           ← the song: metadata, audio, parts, where its charts live
       └─ charts/<id>/<…>.json ← the notes: one instrument at one level, or the voice
```

A `song` may instead point at a **`.sng` package**, which holds all three in one
container; see [§4.7](#47-sng-packages).

There are **three behaviours** of the same document shape:

| Kind | Base document | What the game does |
| --- | --- | --- |
| **Catalogue** | `songs` is a list; no `ondemand` | Lists the songs. No search request is ever made. |
| **On-demand** | `ondemand` is present, and `songs` is empty or absent | Lists nothing from the base; **asks the same URL with a query** when somebody types in the jukebox. |
| **Both** | `ondemand` is present **and** `songs` is non-empty | Lists the base songs, and searches on top of them. |

"Both" is the ordinary case for a provider that ships a starter selection and can find
more. Everything the base lists is always in the library; search results are added to it.
A search answer may itself carry any number of entries — zero, one, or many.

The key separation is **summary vs. truth**. The playlist entry carries just enough to draw
a row and offer the song to a band. The song document is what the song actually is. The
charts are fetched only when a run needs them. Do not put notes in the playlist, and do not
make a listing fetch a chart.

All times are **milliseconds from the start of the song's audio**, as numbers. All URLs may
be absolute (`https://…`) or relative; a relative URL resolves against **the document that
wrote it** (see [§6.1](#61-url-resolution)).

Every document declares:

```json
"schemaVersion": 1
```

The number is exact. A string `"1"` is not a version; a document with an unknown version is
refused as a whole. Unknown fields are ignored, which is how this contract can grow.

---

## 2. The playlist document

### 2.1 Top level

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `schemaVersion` | number | **yes** | Exactly `1`. |
| `name` | string | recommended | The name shown in the Playlists dialog. |
| `description` | string | optional | A sentence about the playlist. It is read, but the current UI does not show it; safe to include for future screens. |
| `ondemand` | `true` or object | optional | Makes the document a search endpoint. See [§3](#3-on-demand-search). |
| `songs` | array | **yes** for a catalogue; may be `[]`, or omitted for a capability | The entries. |

A capability document may omit `songs` entirely, but sending `"songs": []` is clearer and
keeps every document the same shape. A search answer should always include `songs`.

The machine-readable shape is [`docs/playlist.schema.json`](https://github.com/HappyPaul55/everythingstar/blob/main/docs/playlist.schema.json)
(JSON Schema draft 2020-12). It is **advisory** — the reader is authoritative, and
[§10](#10-check-yours) has the command that holds a document to it.

### 2.2 A catalogue

```json
{
  "schemaVersion": 1,
  "name": "The Example Songbook",
  "description": "Six songs recorded for the demo.",
  "songs": [
    {
      "id": "demo-neon-hearts",
      "title": "Neon Hearts",
      "artist": { "id": "static-bloom", "name": "Static Bloom" },
      "album": { "id": "first-light", "name": "First Light", "year": 2007 },
      "art": "art/demo-neon-hearts.jpg",
      "accent": "#3fae5a",
      "durationMs": 180000,
      "previewStartMs": 42000,
      "song": "songs/demo-neon-hearts.json",
      "offer": {
        "instruments": [
          { "role": "guitar", "difficulties": ["easy", "normal", "hard"] },
          { "role": "bass", "difficulties": ["easy", "normal"] },
          { "role": "drums", "difficulties": ["normal", "hard"] }
        ],
        "voice": { "chartType": "vocals", "parts": 1 }
      },
      "video": { "kind": "youtube", "id": "n_GFN3a0yj0" }
    }
  ]
}
```

### 2.3 Playlist entry reference

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | **yes** | The song's key. Must be stable and unique. See [§6.5](#65-ids-are-forever). |
| `title` | string | **yes** | Shown in the list. |
| `song` | string URL | **yes** | Where the song document lives — or a `.sng` package. See [§4.7](#47-sng-packages). |
| `artist` | string or object | **yes** for a clean row | A bare name, or `{ "id"?, "name", "art"? }`. |
| `album` | object | optional | `{ "id"?, "name", "year"?, "art"? }`. |
| `art` | string URL | optional | The cover. Falls back to the album's, then the artist's, then initials. |
| `accent` | string | optional | A CSS colour for the fallback cover tile. |
| `durationMs` | number | **yes** in practice | The song's length. `0` is accepted and shown as `0:00`, but the run's clock and the list need the real value. |
| `previewStartMs` | number | optional (default `0`) | Where a preview starts when there is no preview clip. |
| `offer` | object | **yes** for a playable song | What a band can choose *before* the song document is fetched. See below. |
| `video` | object | optional | `{ "kind": "youtube", "id": "…" }` or `{ "kind": "video", "url": "…" }`. |

`artist` is the one field with two shapes. In a **playlist entry** a bare string is accepted:

```json
"artist": "Static Bloom"
```

In a **song document** it must be an object with a `name` (see [§4.1](#41-top-level)); a
string there is ignored and the row loses its artist. When in doubt, always send the object:

```json
"artist": { "id": "static-bloom", "name": "Static Bloom", "art": "art/static-bloom.jpg" }
```

### 2.4 `offer`: what a band can choose

The offer is the playlist's answer to "what is there to play?" before anything heavier is
loaded. It must agree with the song document's `parts`; if it does not, the band screen may
offer a slot that the song cannot fill.

```json
"offer": {
  "instruments": [
    { "role": "guitar", "difficulties": ["easy", "normal", "hard"] },
    { "role": "bass", "difficulties": ["normal"] }
  ],
  "voice": { "chartType": "vocals", "parts": 1 }
}
```

**`instruments`** is an array of `{ "role", "difficulties" }`:

- `role` is one of `guitar`, `bass`, `drums`, `keys`, `dance`, or the guitar flavours
  `lead_guitar` and `rhythm_guitar`. The two flavours are **separate seats**: list both
  when the song carries both charts, and the band screen offers Lead guitar and Rhythm
  guitar. A plain `guitar` entry is the fallback for a song with one guitar part.
- `difficulties` is a non-empty subset of `easy`, `normal`, `hard`, `expert`.
- **Do not put `vocals` in `instruments`.** The voice is its own field; a `vocals` entry
  here is reported as a problem and skipped.
- An instrument with no difficulties is skipped with a problem. If you have no charts for
  an instrument, leave it out rather than sending an empty list.

**`voice`** is either `null`/absent (an instrumental) or:

```json
{ "chartType": "vocals", "parts": 1 }
```

- `chartType: "vocals"` means the words carry **pitch** and are **sung** into a microphone.
  A freeform note inside a vocals chart (`row: null`) is spoken/rapped and judged on
  presence.
- `chartType: "lyrics"` means the words carry **no pitch**. There is no singer score; the
  words are **typed** (typing is scored) or read in Listen. See [§5.2](#52-the-melody).
- `parts` is `1`–`3` — solo, duet or trio. It must match the melody chart's `parts`. The
  game clamps it to 1–3; a fourth harmony is shared across the three on stage.

A karaoke song is allowed to be **vocals only**. The band screen will offer the words and
nothing else, which is exactly what a karaoke entry is:

```json
"offer": { "instruments": [], "voice": { "chartType": "vocals", "parts": 1 } }
```

### 2.5 `video`

Either a YouTube video, identified by id (not a URL):

```json
"video": { "kind": "youtube", "id": "n_GFN3a0yj0" }
```

or a direct video file:

```json
"video": { "kind": "video", "url": "video/demo-neon-hearts.mp4" }
```

The YouTube backdrop autoplays muted and loops. If a video is not embeddable, omit it; the
game falls back to the song's art, then to its own artwork. A malformed `video` is reported
but does not remove the song. A relative `url` resolves against the playlist that wrote it,
exactly as the entry's `art` does.

---

## 3. On-demand search

### 3.1 Declaring the capability

Add `ondemand` to the base document:

```json
{
  "schemaVersion": 1,
  "name": "Example karaoke",
  "description": "Finds a song on request and builds a karaoke chart for it.",
  "ondemand": true,
  "songs": []
}
```

The base document is read when the playlist is added (and from the browser cache on later
visits), and again on **Refresh**. It is cached in the browser like any playlist. The game
does not search on load.

`ondemand` may also name the query parameter:

```json
"ondemand": { "param": "search" }
```

The parameter name must match `[A-Za-z0-9_.-]+`. `q` is the default; a name that cannot be
a query parameter falls back to `q` and is reported as a problem. An `ondemand` value that
is neither `true` nor an object leaves the document a catalogue. The reader also accepts
the spelling `onDemand`; use `ondemand`.

### 3.2 The search request

When somebody types in the jukebox, each enabled on-demand playlist is asked **in
parallel**:

```
GET <base URL>?q=<the words>
```

Examples:

| Base URL you added | Request the game sends |
| --- | --- |
| `https://karaoke.example.com/ondemand.json` | `https://karaoke.example.com/ondemand.json?q=Timber` |
| `https://karaoke.example.com/ondemand.json?key=demo` | `https://karaoke.example.com/ondemand.json?key=demo&q=Timber` |
| `https://karaoke.example.com/ondemand.json?key=demo&q=old` | `https://karaoke.example.com/ondemand.json?key=demo&q=Timber` |
| `…/ondemand.json` with `"ondemand": { "param": "search" }` | `…/ondemand.json?search=Timber` |

The game builds this with `URL` and `searchParams.set`, not by gluing strings, so:

- an existing query string is preserved;
- an existing parameter of the same name is **replaced**, not duplicated;
- a `#hash` stays at the end;
- spaces, `&`, `+`, `#`, non-Latin characters and emoji are percent-encoded correctly.

The query is the search field **trimmed**. The game asks only at **2 characters or more**,
and waits **400 ms** after the last keystroke. Enter asks immediately. So your service will
not see one-character queries, and it may see overlapping queries if somebody edits quickly.

There is no request body, no custom header and no credential. It is a simple `GET`.

### 3.3 The search answer

Return the **same playlist document shape**:

```json
{
  "schemaVersion": 1,
  "songs": [
    {
      "id": "yt-hHUbLv4ThOo",
      "title": "Timber",
      "artist": { "id": "pitbull", "name": "Pitbull feat. Ke$ha" },
      "durationMs": 232000,
      "previewStartMs": 58000,
      "song": "songs/yt-hHUbLv4ThOo.json",
      "offer": {
        "instruments": [],
        "voice": { "chartType": "vocals", "parts": 1 }
      },
      "video": { "kind": "youtube", "id": "hHUbLv4ThOo" }
    }
  ]
}
```

- `name` and `description` are optional in an answer; the row keeps the **capability's**
  name, not the answer's.
- `ondemand` in an answer is ignored.
- `songs` may hold **any number of entries**: zero, one, or many. Each entry the game can
  read becomes a row; there is no single-result assumption. Twenty matches are twenty rows.
- `songs: []` is a valid answer and means **"nothing found"**, not an error. The game says
  "Nothing by that name."
- A relative `song` or `art` in an answer resolves against the **query URL** (its path, not
  its query string), so `songs/yt-…json` sits beside the base document as you would expect.
- Return only entries you are prepared to serve. A broken entry is skipped; in an answer
  the problem is not shown anywhere, so a malformed result is a result nobody sees.

### 3.4 What the game does with the answer

- Results **accumulate for the visit**: searching "Timber", then "Shape", leaves both songs
  in the jukebox until reload.
- Results are held **in memory only** and are never written to the playlist cache. A reload
  starts from the capability again, which is what "no entries by default" means.
- Results are merged with every other playlist **by `id`**, first source wins. A duplicate
  against a catalogue is reported in the Playlists dialog; a duplicate between two search
  answers is dropped silently. Namespace your ids (`yt-…`, `demo-…`) so two providers
  cannot collide.
- A result is shown under its **title's letter**, A–Z, like any other song. There is no
  separate "search results" section.
- The jukebox's local text filter is forgiving: a result returned for the current query is
  shown even if its title and artist do not literally contain the words typed. A resolver
  may therefore return "Cover of the Century" for "Timber" and it will still appear.
- A query a source has already answered is not asked again for the rest of the visit.
  A **failed** query is forgotten, so retyping it or pressing **Try again** asks again;
  Try again re-asks every on-demand source (an in-flight request is never doubled).

### 3.5 Failures

A search is one request per source, with a **30 second** timeout. The game shows:

> Could not search Example karaoke. Failed to fetch — **Try again**

The word after the source name is the HTTP status text (`500 Internal Server Error`,
`429 Too Many Requests`) or the browser's network error. The JSON body of an error is not
read, so use status codes. **Send CORS headers on errors too**, or the browser reports a
network failure instead of the status.

### 3.6 Sharing a song, and the link to add it

There are two ways to let somebody add **one song** without adding your whole catalogue.

**A one-song playlist.** Serve a normal playlist document that lists exactly that song.
The game reads it like any other catalogue, so nothing about the document changes:

```json
{
  "schemaVersion": 1,
  "name": "Shared: Three Little Birds",
  "songs": [ { "id": "…", "song": "songs/three-little-birds.json", … } ]
}
```

**A song link.** The share URL may name the song document itself; the game reads it,
derives the row from the document's own `id`, `title`, artist, art, length and parts, and
keeps it as a song of its own in the library. There is no playlist document to serve, and
the whole of §4 applies to the document.

```html
<a href="https://everythingstar.happypaul55.com/open?song=https%3A%2F%2Fexample.com%2Fsongs%2Fthree-little-birds.json">
  Add Song to EverythingStar
</a>
```

Rules for a song link:

- The target must be a **song document**, not a `.sng` package and not a playlist. A
  package can only be listed by a playlist entry; use the one-song form above for one.
- It must be an absolute `https:` (or `http:`) URL with CORS on the host, exactly as a
  playlist is. A relative address is refused.
- The link adds nothing on its own: the game asks first, and the player presses **Add**.
- The document is fetched once when added and cached; its charts and audio are still
  fetched only when a band plays it, so a link does not download a song.

A pinned song has no playlist entry to carry an `offer`, so its row's offer is read from
the document's own `parts`. That means the voice's `parts` count falls back to **1** until
the melody chart is loaded; the chart itself still carries the duet or trio, and the stage
follows it.

The full link contract — including the native app's App Links and the `everythingstar://`
form — is in [`deeplinks.md`](deeplinks.md).

A failure does **not** remove songs already in the library, and it does not stop other
sources from answering.

---

## 4. The song document

The song document is what the song **is**: its metadata, audio, parts and chart listings.
It is fetched when a song is selected (for the preview) and read again when the **band
screen** starts loading the charts — from the browser cache when it is already there. The
loading screen waits for that read, then the run starts.

### 4.1 Top level

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `schemaVersion` | number | **yes** | Exactly `1`. |
| `id` | string | **yes** | Must equal the playlist entry's `id`. |
| `title` | string | **yes** | |
| `artist` | object | recommended | `{ "id"?, "name", "art"? }`. A string is **not** accepted here. |
| `album` | object | optional | `{ "id"?, "name", "year"?, "art"? }`. |
| `art` | string URL | optional | |
| `durationMs` | number | **yes** in practice | Must match the audio's length. |
| `previewStartMs` | number | optional (default `0`) | |
| `video` | object | optional | Same shape as the playlist entry. |
| `audio` | object | **yes** for sound | See [§4.2](#42-audio). |
| `parts` | array | **yes** for playable content | See [§4.3](#43-parts-and-chart-listings). |
| `sections` | array | optional | `{ "timeMs", "name" }` markers. |

```json
{
  "schemaVersion": 1,
  "id": "demo-neon-hearts",
  "title": "Neon Hearts",
  "artist": { "id": "static-bloom", "name": "Static Bloom" },
  "album": { "id": "first-light", "name": "First Light", "year": 2007 },
  "art": "../art/demo-neon-hearts.jpg",
  "durationMs": 180000,
  "previewStartMs": 42000,
  "video": { "kind": "youtube", "id": "n_GFN3a0yj0" },
  "audio": { "source": "stems", "stems": [], "mixPresets": {} },
  "parts": []
}
```

An empty `audio` and empty `parts` are legal and mean **silent** and **nothing to play**.
The game says so rather than failing, which is useful while a service is being built, but
it is not a finished entry.

### 4.2 Audio

```json
"audio": {
  "source": "stems",
  "stems": [
    {
      "id": "stem_master",
      "name": "Master",
      "url": "../audio/demo-neon-hearts.mp3"
    }
  ],
  "mixPresets": {
    "full": { "stemIds": ["stem_master"] }
  },
  "preview": "../audio/demo-neon-hearts-preview.mp3"
}
```

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `source` | string | optional (default `stems`) | `stems` for the song's own files; `youtube` when the video is the music. See [§4.6](#46-youtube-backed-songs). |
| `stems` | array | for `stems` | The audio files. |
| `mixPresets` | object | for `stems` | Named mixes. |
| `preview` | string URL | optional | A short clip for the jukebox. |

**`stems`** is an array of files:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | **yes** | The name other fields use to refer to this file. |
| `url` | string URL | **yes** | The audio file. |
| `name` | string | optional | A human name; defaults to the id. |
| `instrument` | string | optional | One of the song roles. A stem with no instrument is the master/backing and is **never** muted by a miss. |
| `defaultGainDb` | number | optional (default `0`) | A per-file trim, parsed and carried but **not applied by the stage yet**. |
| `offsetMs` | number | optional (default `0`) | A per-file sync offset, parsed and carried but **not applied by the stage yet**. |

**Not applied yet.** `defaultGainDb` and `offsetMs` are read and carried on each stem, but
the stage does not use them when it plays the mix. Do not rely on them to balance or sync
a song: master the stems together at the same level and start time. `audioControl`
(§[4.4](#44-audiocontrol)) is the part-muting rule, not a substitute for either.

**`mixPresets`** is an **object**, not an array, keyed by preset id:

```json
"mixPresets": {
  "full":  { "stemIds": ["stem_master"] },
  "stems": { "stemIds": ["stem_vocals", "stem_guitar", "stem_drums"] }
}
```

- **`full`** is the whole song: one master file, or every stem played together. The run
  always tries `full` first. If no `full` preset exists, the first preset is used. If a
  preset names no known stems, **all** stems are used rather than silence.
- **`stems`** is the fallback the game uses when `full` will not play (some folders ship
  a 0-byte master). If it is absent, every stem with an `instrument` is used.

**One master file is enough.** A generated karaoke entry normally has:

```json
"stems": [{ "id": "stem_master", "name": "Master", "url": "…" }],
"mixPresets": { "full": { "stemIds": ["stem_master"] } }
```

With one master, a missed note has no channel to take out — that is the intended answer,
not a gap. If you want misses to mute the vocal or an instrument, ship separate stems and
give each part an `audioControl` (see [§4.4](#44-audiocontrol)).

A **YouTube-backed song** has no files at all: `audio.source` is `"youtube"` and the video
is the music. See [§4.6](#46-youtube-backed-songs).

**`preview`** is an optional short clip. If absent, the jukebox uses the stem whose id is
exactly **`stem_master`**, from `previewStartMs`; if there is no such stem, it uses any
stem with `instrument: null` from the same cue. If even that is absent, the song has no
audition. **`stem_master` is the conventional id**, so keeping it makes the fallback
obvious; a master under another id is found through its missing instrument.

**Audio formats.** MP3 or AAC/M4A are the safest; OGG/Opus works in modern browsers; WAV is
large. Files are streamed by `<audio>` and must support **Range** requests for comfortable
seeking. Do not send a file that is longer or shorter than `durationMs`; the run's clock
follows the sound, and the song ends when the **last** stem ends.

### 4.3 Parts and chart listings

A **part** is something somebody can play: an instrument, or the one place at the words.

```json
"parts": [
  {
    "id": "part_vocals",
    "role": "vocals",
    "label": "Vocals",
    "controllerTypes": ["microphone"],
    "charts": [
      {
        "id": "demo-neon-hearts-voice",
        "chartType": "vocals",
        "url": "../charts/demo-neon-hearts/vocals.json"
      }
    ]
  }
]
```

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | optional | Defaults to `<song id>-<role>`. |
| `role` | string | **yes** | An instrument role, or `vocals` for the words. |
| `label` | string | optional | A display name. |
| `controllerTypes` | string[] | optional | Free-form hints (`guitar_controller`, `drum_kit`, `microphone`). The game does not require them. |
| `audioControl` | object | optional | How a miss affects the mix. See [§4.4](#44-audiocontrol). |
| `charts` | array | **yes**, at least one | Where the notes are. A part with no valid chart is dropped. |

A chart listing has:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | optional | A stable name; defaults to `<role>-<difficulty or chart type>`. |
| `chartType` | string | **yes** | `lanes`, `drums`, `vocals` or `lyrics`. |
| `difficulty` | string | **yes** for lanes/drums | `easy` \| `normal` \| `hard` \| `expert`. Omit for the voice. |
| `laneCount` | number | **yes** for lanes/drums | How many columns the highway has, at least `1`. Omit for the voice. |
| `url` | string URL | **yes** | The chart document. |
| `bpm` | number | optional | The tempo the beat grid is drawn from. Must be `> 0`. |
| `offsetMs` | number | optional (default `0`) | Added to every note and phrase time in this chart. |

**The listing is authoritative.** The game reads `laneCount`, `bpm` and `offsetMs` from the
song document, not from the chart file. A chart file that repeats them is welcome for human
readability, but changing only the file will not change the game. This is the single most
common mismatch when wiring a new provider.

A `vocals` or `lyrics` chart must be on the `vocals` role, and a `lanes` or `drums` chart
must be on a non-vocals role. Anything else is reported and skipped.

### 4.4 `audioControl`

This is the part rule: miss a note, and your part drops out of the mix. It is optional
and needs **separate stems**; with a single master there is nothing to mute.

```json
"audioControl": {
  "controlledStemIds": ["stem_guitar"],
  "onHit": { "action": "unmute", "fadeMs": 20 },
  "onMiss": { "action": "mute", "fadeMs": 80, "restore": "next_hit" },
  "onSustainBreak": null
}
```

- `controlledStemIds` is the field the stage **actually uses**: it names files in
  `audio.stems` by id, and a miss on that part takes exactly those files out.
- The stage's rule is: **a miss mutes the part's stems**, and the part is put back by
  `onMiss.restore` — `next_hit` (the default) on the player's next hit, or `phrase_end`
  at the end of the chart phrase or lyric line that contains the miss. The stems stay
  out while *any* player on that part is out. The registry is per seat, so two players
  on one instrument leave it out until both are back.
- Parts are keyed by **role**, not only instrument: `lead_guitar` and `rhythm_guitar`
  own their own stems, so a missed lead does not mute the rhythm, and a plain `guitar`
  part is the fallback when a document names no role.
- `onHit` and `onSustainBreak` are read and accepted; `onMiss` is the one the stage
  currently acts on. `fadeMs` is accepted; the mixer applies the volume change without a
  scheduled fade.
- The game never reads this back into judging: it is a mix effect only.
- The master is dropped even if it is named: it has no instrument, and muting it would
  silence the whole song.

### 4.5 Sections

Optional markers, in time order:

```json
"sections": [
  { "timeMs": 0, "name": "Intro" },
  { "timeMs": 18000, "name": "Verse 1" },
  { "timeMs": 62000, "name": "Chorus" }
]
```

Nothing judges on them. They are read for structure and future practice screens.

### 4.6 YouTube-backed songs

A song can use a **YouTube video as its music** instead of its own audio files. This is
the YouTube karaoke mode: the service builds the chart from the video's captions, and the
game plays the video through the official IFrame Player API. No audio is extracted or
served.

**Captions give words and times, not pitch.** A captions-only service therefore returns a
`lyrics` chart: the words can be typed or read along in Listen, but there is no singer
score. A `vocals` chart is only honest if the service also has a pitch contour (a licensed
MIDI/karaoke source or its own pitch track); never invent a row to make it look singable.

```json
{
  "schemaVersion": 1,
  "id": "yt-hHUbLv4ThOo",
  "title": "Timber",
  "artist": { "id": "pitbull", "name": "Pitbull feat. Ke$ha" },
  "durationMs": 232000,
  "previewStartMs": 58000,
  "video": { "kind": "youtube", "id": "hHUbLv4ThOo" },
  "audio": { "source": "youtube" },
  "parts": [
    {
      "id": "part_vocals",
      "role": "vocals",
      "charts": [
        {
          "id": "yt-hHUbLv4ThOo-voice",
          "chartType": "lyrics",
          "url": "../charts/yt-hHUbLv4ThOo/lyrics.json"
        }
      ]
    }
  ]
}
```

The **playlist entry keeps its shape**: the same `id`, `title`, `offer` and `video` as any
other song. Only the song document says where the sound comes from. Its
`offer.voice.chartType` must still match the chart it points at — `lyrics` in this
captions-only example, `vocals` only when a pitch contour exists.

Rules for this mode:

- `audio.source` is `"youtube"` and **there are no stems**. `stems` and `mixPresets` are
  absent or empty and are ignored.
- `video.kind` **must** be `"youtube"`. Without it the song has no sound; the game reports
  the disagreement.
- `durationMs` is the video's duration, and every chart time is relative to the video's
  start (`0`). The game follows the player's playhead and ends the run when the video
  ends.
- The video is also the **stage backdrop**. The game's video setting may hide the picture,
  but the player keeps playing: turning off a backdrop must not take the music with it.
- **One stream means no part muting.** `audioControl` has nothing to control: a miss has
  no channel to take out. The game still raises its error cue, and the song plays on.
- There is **no jukebox preview** by default; the row is silent because there are no stems
  and no file to play. An `audio.preview` clip may still be supplied if the service has a
  licensed excerpt; otherwise the row is silent until the song is played.
- The service must check that the video is **embeddable** (`status.embeddable`) and
  available in the player's region, and skip it otherwise. A video that refuses embedding
  is a run nobody can start.
- The official player is the playback path; **do not extract or proxy the stream**. The
  game never asks the service for audio in this mode.
- The video's own captions are not the game's lyrics. The game tries to keep them out of
  the way; the service's chart is what the player reads.
- A captions-only song is **Listen and Type**. If the service has a pitch source as well,
  the same video can carry a `vocals` chart and a singer; see [§5.2](#52-the-melody-vocals-or-lyrics).

The game's clock follows `getCurrentTime()` with a small predictor between reports and
holds while the player buffers, so a coarse report does not make the highway jump. That is
the game's job; the service only needs the times to line up with the video.

### 4.7 `.sng` packages

A playlist entry's `song` may point at a **`.sng` package** instead of a JSON song
document. An `.sng` is the Guitar Hero / Clone Hero / YARG container: one file holding the
chart (`notes.mid` or `notes.chart`), the audio stems, the album art and sometimes a
preview clip. Its metadata table is the `song.ini` — title, artist, album, year, length
and preview cue — so no separate text file is needed.

```json
{
  "id": "tear-me-down",
  "title": "Test Song",
  "artist": "Meat Loaf",
  "album": { "name": "Couldn't Have Said It Better", "year": 2003 },
  "durationMs": 216181,
  "previewStartMs": 30000,
  "song": "packs/tear-me-down.sng",
  "offer": {
    "instruments": [
      { "role": "guitar", "difficulties": ["easy", "normal", "hard", "expert"] },
      { "role": "bass", "difficulties": ["easy", "normal", "hard", "expert"] },
      { "role": "drums", "difficulties": ["easy", "normal", "hard", "expert"] },
      { "role": "keys", "difficulties": ["easy", "normal", "hard", "expert"] }
    ],
    "voice": { "chartType": "vocals", "parts": 1 }
  }
}
```

What the service should know:

- **The playlist entry is still the summary.** The game lists from it and does not download
  every package to draw the jukebox. Include `title`, `artist`, `durationMs` and `offer` for
  a complete row and a playable band screen. If `offer` is absent, the band screen learns it
  when the package arrives, but the row has no chips until then.
- **`art` is still recommended.** A remote package's embedded cover is read only when the
  song is selected. Without an `art` URL the row uses its initials; the now-playing panel
  and the run backdrop use the cover inside the package.
- **The game fetches the whole package when it is needed** — for its preview when the row
  is chosen, and for the chart when the band screen opens. A **bounded in-memory cache**
  (two packages and 64 MB, least-recently-used first) is shared by those two readers, so
  opening the band does not download the same package again during the visit. It is not
  stored in IndexedDB because it contains audio.
- **Everything inside the package is conventional.** `notes.mid`/`notes.chart`; `song.*`,
  `guitar.*`, `bass.*`, `rhythm.*`, `drums*.*`, `keys.*`, `vocals*.*`, `crowd.*`,
  `preview.*`; `album.*`/`cover.*`. The chart may name a nonstandard audio file in
  `MusicStream`; the reader maps that name to the package member when it can.
- **Preview order:** `preview.*` (from its start), otherwise the master from the
  package's `preview_start_time`, otherwise the first audio member from that cue. That last
  fallback is what makes a package with only `guitar.opus` audible rather than silent.
- **CORS and HTTPS** are required exactly as for a JSON song document and its media. The
  package is fetched with `fetch`, not linked as a media URL.
- A package with no chart is not playable; a package with a chart but no audio is still
  listed and its notes still run, silently.

The package format is the [SNG specification](https://github.com/mdsitton/SngFileFormat).
The game's own reader is `src/lib/game/sources/sng.ts`.

---

## 5. Chart documents

One chart document holds one instrument at one difficulty, or the one voice chart. The
game fetches **only the charts the band actually needs**, one per seat, not every chart in
the song.

Every chart document has:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `schemaVersion` | number | **yes** | Exactly `1`. |
| `chartType` | string | optional | If present, must equal the listing's `chartType`. |

The chart's `url` is resolved against the song document, and the song document's
`offsetMs`/`bpm`/`laneCount` listing values are what the game uses.

### 5.1 A lane chart (`lanes` or `drums`)

```json
{
  "schemaVersion": 1,
  "chartType": "lanes",
  "notes": [
    { "timeMs": 1500, "lengthMs": 0,   "kind": "strum", "column": 1 },
    { "timeMs": 2125, "lengthMs": 0,   "kind": "hopo",  "column": 1 },
    { "timeMs": 2750, "lengthMs": 0,   "kind": "strum", "column": null },
    { "timeMs": 3375, "lengthMs": 700, "kind": "strum", "column": 1 },
    { "timeMs": 4000, "lengthMs": 900, "kind": "strum", "column": 1, "hero": true },
    { "timeMs": 4625, "lengthMs": 0,   "kind": "strum", "column": 0 },
    { "timeMs": 4625, "lengthMs": 0,   "kind": "strum", "column": 1 }
  ],
  "phrases": [
    { "startMs": 12000, "endMs": 24000 }
  ]
}
```

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `notes` | array | **yes** (may be empty) | The notes. |
| `notes[].timeMs` | number | **yes** | When it is hit, non-negative. |
| `notes[].lengthMs` | number | optional (default `0`) | A sustain; `0` is a tap. |
| `notes[].kind` | string | optional | `strum`, `tap` or `hopo`. Defaults to the instrument's plain kind. |
| `notes[].column` | number or `null` | optional | `0` to `laneCount - 1`, or `null` for an **open** note. |
| `notes[].hero` | boolean | optional | A bonus note; worth five times the normal value. |
| `phrases` | array | optional | `{ "startMs", "endMs" }` energy spans. |
| `columns` | number | optional | A copy for humans; the listing's `laneCount` wins. |
| `bpm` | number | optional | A copy for humans; the listing's `bpm` wins. |

Rules that matter:

- **Chord = notes with the same `timeMs`** in the same chart. Send one note per column at
  that moment; there is no chord id.
- **Open note** is `column: null`. Use it on strummed instruments; it spans the highway.
- **Order does not matter.** The reader sorts by `timeMs`. Do not send note ids; the game
  numbers them after sorting.
- A note with no `timeMs`, or a negative one, is skipped.
- A `hopo` only makes sense on a strummed instrument, and the chart says `kind` explicitly.
  The game does not re-derive it.
- Keep `column` inside the chart's `laneCount`. The reader truncates to an integer and
  then **drops a note outside the columns, naming it as a problem**; it does not clamp
  an off-board note onto the board.
- `difficulty` and `laneCount` belong on the **listing**, not here.
- `offsetMs`, when the audio and the chart disagree, belongs on the **listing** too.

### 5.2 The melody (`vocals` or `lyrics`)

There is one melody chart for the voice. `vocals` has a singer: pitched notes are sung and
scored, and a freeform note is judged on presence. `lyrics` has no pitch at all, so there
is **no singer score**; the words are typed (and that typing is scored) or read in Listen.
A captions-only source is honest as `lyrics`; a karaoke source that has a pitch contour
uses `vocals`.

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
      "freeform": false,
      "parts": [{ "part": 0, "offset": 0 }],
      "words": [
        { "text": "It's",  "timeMs": 0 },
        { "text": "going", "timeMs": 420 },
        { "text": "down",  "timeMs": 980 }
      ]
    }
  ],
  "notes": [
    { "timeMs": 15200, "lengthMs": 400, "part": 0, "row": 7, "text": "It's" },
    { "timeMs": 15620, "lengthMs": 540, "part": 0, "row": 5, "text": "going" },
    { "timeMs": 16180, "lengthMs": 900, "part": 0, "row": 3, "text": "down" }
  ]
}
```

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `parts` | number | optional (default `1`) | 1 = solo, 2 = duet, 3 = trio. Clamped to 1–3. |
| `rows` | number | optional (default `6`) | How many rows the pitch roll has, at least `1`. |
| `rootMidi` | number | optional (default `57`) | The MIDI note row `0` sounds. |
| `lines` | array | recommended | The words as lines, for the display. |
| `notes` | array | **yes for vocals**; optional for lyrics | The sung notes; this is what a singer is judged on. A lyrics chart reads its words from `lines`. |

**A note's pitch is `rootMidi + row`.** A row is one semitone. Judging is
**octave-insensitive**: a man an octave below a woman is singing the same note. `rows` and
`rootMidi` describe the roll; they are not a limit on what a singer may sing.

A line:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `timeMs` | number | **yes** | The line's start. |
| `endMs` | number | optional | The line's end; defaults to `timeMs`. |
| `freeform` | boolean | optional | A display hint that the line is spoken/rapped. |
| `parts` | array | **yes** in practice | `{ "part", "offset" }` for each part that sings this line. |
| `words` | array | **yes** (may be empty) | `{ "text", "timeMs", "hero"? }`. |

**Word times are relative to the line's `timeMs`.** The example above has a line at
`15200` and a word at `420`, which is `15620` absolute. Note times, by contrast, are
**absolute**. This is the other common wiring mistake; the two time bases are deliberately
different.

`line.parts` tells the display who sings the line. A solo line should carry:

```json
"parts": [{ "part": 0, "offset": 0 }]
```

`offset` is a harmony offset in semitones for that part; `0` is unison. A line with no
`parts` is skipped by the lyric/typing views, so include it even for a solo.

A note:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `timeMs` | number | **yes** | When the word starts, absolute. |
| `lengthMs` | number | optional (default `0`) | How long it is held. |
| `part` | number | optional (default `0`) | Which melody part sings it, `0` to `parts - 1`. |
| `row` | number or `null` | **yes** for vocals | Pitch row, `0` to `rows - 1`. `null` means spoken/no pitch. |
| `text` | string | **yes** | The word as it should read. |
| `hero` | boolean | optional | A bonus word. |

- For a `vocals` chart, send an integer `row` for a pitched note. A **freeform** note — a
  spoken or rapped word the singer should still perform — has `row: null`; the game judges
  it on presence, not pitch. A missing `row` is a client error; send `null` on purpose.
- For a `lyrics` chart, `row` is omitted or `null`, there is no singer, and the words are
  typed (scored as typing) or read in Listen.
- `freeform: true` on a line is a display hint that the line is spoken/rapped, and the view
  says so. It is not a separate chart mode: the note's `row` is what the pitch judge reads.
- Notes are the scoring for a `vocals` chart; lines are the presentation. A `lyrics` chart
  needs the lines and no notes. Send both for a vocals chart.
- The reader sorts notes by time and part, and lines by time. Order in the file is not
  important.
- Negative times are clamped to zero. Keep times inside the audio.

#### Captions-only fallback (`lyrics`)

If all you have is a subtitle track, return `chartType: "lyrics"` and omit `row`:

```json
{
  "schemaVersion": 1,
  "chartType": "lyrics",
  "parts": 1,
  "lines": [
    {
      "timeMs": 15200,
      "endMs": 17800,
      "freeform": false,
      "parts": [{ "part": 0, "offset": 0 }],
      "words": [
        { "text": "It's",  "timeMs": 0 },
        { "text": "going", "timeMs": 420 },
        { "text": "down",  "timeMs": 980 }
      ]
    }
  ],
  "notes": [
    { "timeMs": 15200, "lengthMs": 400, "part": 0, "text": "It's" },
    { "timeMs": 15620, "lengthMs": 540, "part": 0, "text": "going" },
    { "timeMs": 16180, "lengthMs": 900, "part": 0, "text": "down" }
  ]
}
```

The playlist's `offer.voice.chartType` and the song document's chart listing must both say
`lyrics`, or the game will look for a `vocals` chart that is not there.

---

## 6. Delivery contract

### 6.1 URL resolution

Every URL resolves against **the document that wrote it**, exactly like a browser resolves
a relative link:

| Written in | `…` resolves against |
| --- | --- |
| `playlist.json` entry's `song`, `art`, `video.url` | the playlist URL (or the **query URL** for a search answer) |
| song document's `art`, `audio.*.url`, `audio.preview`, `video.url`, `parts[].charts[].url` | the song document's URL |
| a chart document | nothing — a chart has no URLs |

Example tree:

```
https://karaoke.example.com/ondemand.json
https://karaoke.example.com/songs/yt-hHUbLv4ThOo.json
https://karaoke.example.com/charts/yt-hHUbLv4ThOo/vocals.json
https://karaoke.example.com/audio/yt-hHUbLv4ThOo.mp3
https://karaoke.example.com/art/yt-hHUbLv4ThOo.jpg
```

With `"song": "songs/yt-hHUbLv4ThOo.json"` in the playlist, and:

```json
"art": "../art/yt-hHUbLv4ThOo.jpg",
"audio": { "stems": [{ "id": "stem_master", "url": "../audio/yt-hHUbLv4ThOo.mp3" }] },
"charts": [{ "url": "../charts/yt-hHUbLv4ThOo/vocals.json" }]
```

in the song document, every path lands on the tree above. Absolute URLs are also fine; use
whatever your hosting makes simplest.

**Every URL a remote playlist or song document names must resolve to `http(s)` with a
host.** A `javascript:`, `data:`, `file:` or `folder:` reference is **skipped and named**
as a problem rather than fetched, and any URL over **8192 characters** is refused. A
local `folder://` document is the one exception: it is not fetched by the game, so its
references keep the browser's own permissive rule.

### 6.2 HTTPS and CORS

The game is served over HTTPS. Use **HTTPS** for every document and every media file;
HTTP media is blocked as mixed content.

The JSON documents are fetched with `fetch`. Your host must send:

```
Access-Control-Allow-Origin: *
Content-Type: application/json
```

(`*` is fine because the game sends no credentials; the request is `credentials: "omit"`.)
A simple `GET` with no custom headers does **not** trigger a preflight. If you add an
`Authorization` header the game will not send it, and the browser will preflight; do not
depend on one.

Media is fetched by `<audio>`, `<img>` and `<video>`. Cross-origin playback generally works
without CORS, but the jukebox preview is routed through Web Audio and sets
`crossOrigin="anonymous"`, so **serve audio with CORS too**. Artwork needs no CORS for an
`<img>`, but it is harmless.

YouTube is an iframe with its own origin: a YouTube-backed song needs no media CORS
because the service serves no audio. The game's policy allows the frame and the IFrame API
script (`https://www.youtube.com`), and a direct video file is browser-played from its
own URL.

### 6.3 Content types and status codes

| Resource | `Content-Type` |
| --- | --- |
| playlist, song, chart | `application/json` |
| audio | `audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/wav` as appropriate |
| art | `image/jpeg`, `image/png`, `image/webp` |
| direct video | `video/mp4`, `video/webm` |

- **200** with valid JSON is the only success.
- **4xx/5xx** is a failed request. Return the appropriate status; the game shows the status
  text. Send CORS headers on the error too.
- A **200 with `songs: []`** is "nothing found", not an error.
- A **200 that is not the expected document** (wrong `schemaVersion`, not an object) is a
  failed request. The game says so.
- A broken **entry** inside a valid playlist is skipped and the rest of the list still
  works. In the base manifest the problem is listed in the Playlists dialog; in a search
  answer it is quietly dropped. This is tolerance, not a target.

### 6.4 Timing

| Request | Target | Hard limit in the game |
| --- | --- | --- |
| Base capability | < 500 ms | none (it is a normal playlist read) |
| Search answer | < 5 s | **30 s**, then aborted and reported |
| Song document | < 1 s | none; it is the preview and the load |
| Chart document | < 2 s | none; the loading screen waits |
| Audio | start streaming quickly | none; the run's clock follows the sound |
| YouTube player | after the API script and the first video bytes | the stage holds the clock until the player is playing |

A search is synchronous from the game's point of view: one `GET`, one JSON answer. If your
pipeline has to transcode audio or extract pitch, do it **before** answering, cache the
result, and answer with the finished entry. Do not answer with a "processing" placeholder
and expect a second request; the game will treat the placeholder as the result.

The 400 ms debounce and the 2-character floor mean a service sees a modest number of
requests. Still, cache by query and by source id, and return a sane number of results
(roughly 1–50 per query; the jukebox is a list, not a firehose).

### 6.5 IDs are forever

The playlist entry's `id` is the library's key. It is used for:

- merging playlists (same id = one song, first playlist wins);
- the score board (`bestFor` is keyed by song id);
- the selected song (`wantedId` in the session);
- keeping a loaded track while a seat changes.

Therefore:

- **Stable.** The same song must have the same id on every search, every reload, every day.
- **Unique.** Namespace it by source: `yt-<videoId>`, `demo-<slug>`.
- **Shared with the song document.** `song.id` must equal the entry's `id`.
- **Not reused** for a different recording. A live version and a studio version are
  different songs.

A generated song whose id is a fresh UUID on every search is a library full of duplicates
and a score board that never remembers anybody.

### 6.6 Caching

What the game caches:

- The **playlist document** (the base capability) in IndexedDB, refreshed only on the
  **Refresh** button. `Cache-Control: max-age=…` is reasonable.
- **Song and chart documents** in IndexedDB under their URL. Use stable URLs with a long
  cache life if the content is immutable; put a version in the URL or id if it is not.
- **Search answers** are **not** stored in IndexedDB. They are session memory. The request
  is made with `cache: "reload"`, so the browser's HTTP cache is bypassed. Cache on your
  server; do not rely on the browser.
- **Audio is never stored** by the game. The browser streams it.

### 6.7 Privacy and keys

The search words go from the player's browser **directly to your service**. The game sends
no account, no cookie, and no credential. If your service needs a third-party API key:

- do not put the key in the playlist URL — the browser, the network tab and anybody who
  copies the URL can see it;
- put the key on your server and expose a small, rate-limited endpoint;
- say in your own terms that the query leaves the device.

The game's own privacy notice says the library is this browser's; an added playlist is an
external service and its operator's terms apply.

---

## 7. What the game requests, and when

| Moment | Request |
| --- | --- |
| The player adds the playlist, or presses Refresh | `GET <base>` — the capability manifest |
| The player types 2+ characters and pauses 400 ms, or presses Enter | `GET <base>?q=<words>` for every enabled on-demand source, in parallel |
| The player moves onto or clicks a row | `GET <song.doc>` — for the preview |
| The player presses **Next: your band** | The band screen reads the entry's `offer`; the song document and **one chart per seat** start loading behind it |
| The player presses **Play** | Usually already loaded; the loading screen waits if not |
| The countdown starts | For a YouTube-backed song, the official player is created and cued at 0 |
| The run starts | The audio URLs — or the YouTube player's own sound; the clock follows whichever is sounding |
| A song's chart is missing | That player has nothing to play; the run continues |

Only charts a band actually needs are fetched. A vocals-only karaoke entry fetches the
song document and one melody chart, nothing else.

---

## 8. A complete worked example

A minimal karaoke service. The base URL added in the Playlists dialog is:

```
https://karaoke.example.com/ondemand.json?key=demo
```

### 8.1 `GET /ondemand.json?key=demo` — the capability

```json
{
  "schemaVersion": 1,
  "name": "Example karaoke",
  "description": "Finds a song on request and builds a karaoke chart for it.",
  "ondemand": true,
  "songs": []
}
```

The dialog shows **Example karaoke — on demand**. No songs are listed.

### 8.2 `GET /ondemand.json?key=demo&q=Timber` — the answer

```json
{
  "schemaVersion": 1,
  "songs": [
    {
      "id": "yt-hHUbLv4ThOo",
      "title": "Timber",
      "artist": { "id": "pitbull", "name": "Pitbull feat. Ke$ha" },
      "album": { "id": "global-warming", "name": "Global Warming", "year": 2012 },
      "art": "art/yt-hHUbLv4ThOo.jpg",
      "accent": "#f2b705",
      "durationMs": 232000,
      "previewStartMs": 58000,
      "song": "songs/yt-hHUbLv4ThOo.json",
      "offer": {
        "instruments": [],
        "voice": { "chartType": "vocals", "parts": 1 }
      },
      "video": { "kind": "youtube", "id": "hHUbLv4ThOo" }
    }
  ]
}
```

The jukebox adds one row: **3:52 Timber — Pitbull feat. Ke$ha — vocals**. (An answer may
carry any number of entries; this example returns the one match.) The relative `song` and
`art` resolve against the query URL's path:

```
https://karaoke.example.com/songs/yt-hHUbLv4ThOo.json
https://karaoke.example.com/art/yt-hHUbLv4ThOo.jpg
```

### 8.3 `GET /songs/yt-hHUbLv4ThOo.json` — the song

```json
{
  "schemaVersion": 1,
  "id": "yt-hHUbLv4ThOo",
  "title": "Timber",
  "artist": { "id": "pitbull", "name": "Pitbull feat. Ke$ha" },
  "album": { "id": "global-warming", "name": "Global Warming", "year": 2012 },
  "art": "../art/yt-hHUbLv4ThOo.jpg",
  "durationMs": 232000,
  "previewStartMs": 58000,
  "video": { "kind": "youtube", "id": "hHUbLv4ThOo" },
  "audio": {
    "stems": [
      {
        "id": "stem_master",
        "name": "Master",
        "url": "../audio/yt-hHUbLv4ThOo.mp3"
      }
    ],
    "mixPresets": {
      "full": { "stemIds": ["stem_master"] }
    },
    "preview": "../audio/yt-hHUbLv4ThOo-preview.mp3"
  },
  "parts": [
    {
      "id": "part_vocals",
      "role": "vocals",
      "label": "Vocals",
      "controllerTypes": ["microphone"],
      "charts": [
        {
          "id": "yt-hHUbLv4ThOo-voice",
          "chartType": "vocals",
          "url": "../charts/yt-hHUbLv4ThOo/vocals.json"
        }
      ]
    }
  ]
}
```

`../audio/…` resolves to `https://karaoke.example.com/audio/…`; the chart to
`https://karaoke.example.com/charts/yt-hHUbLv4ThOo/vocals.json`.

### 8.4 `GET /charts/yt-hHUbLv4ThOo/vocals.json` — the notes

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
      "freeform": false,
      "parts": [{ "part": 0, "offset": 0 }],
      "words": [
        { "text": "It's", "timeMs": 0 },
        { "text": "going", "timeMs": 420 },
        { "text": "down", "timeMs": 980 }
      ]
    }
  ],
  "notes": [
    { "timeMs": 15200, "lengthMs": 400, "part": 0, "row": 7, "text": "It's" },
    { "timeMs": 15620, "lengthMs": 540, "part": 0, "row": 5, "text": "going" },
    { "timeMs": 16180, "lengthMs": 900, "part": 0, "row": 3, "text": "down" }
  ]
}
```

The singer sees a piano roll with three words; the microphone is judged against
`rootMidi + row`: 55, 53 and 51 (G3, F3, D#3) in this example.

### 8.5 The media

| URL | Must be |
| --- | --- |
| `/audio/yt-hHUbLv4ThOo.mp3` | the full song, 232 s, Range-capable, CORS |
| `/audio/yt-hHUbLv4ThOo-preview.mp3` | a short clip, CORS |
| `/art/yt-hHUbLv4ThOo.jpg` | a square-ish cover |
| the YouTube video `hHUbLv4ThOo` | embeddable and allowed to be embedded |

If the preview clip is absent, the game uses `stem_master` (or, failing that, any stem
with `instrument: null`) from `previewStartMs`; keep the id `stem_master` for the
conventional fallback.

### 8.6 Adding an instrument (optional)

A karaoke entry needs only the voice. If you also want a guitar highway, add a guitar part
to the song document:

```json
{
  "id": "part_guitar",
  "role": "guitar",
  "label": "Guitar",
  "controllerTypes": ["guitar_controller"],
  "charts": [
    {
      "id": "yt-hHUbLv4ThOo-guitar-normal",
      "chartType": "lanes",
      "difficulty": "normal",
      "laneCount": 5,
      "bpm": 120,
      "url": "../charts/yt-hHUbLv4ThOo/guitar-normal.json"
    }
  ]
}
```

and list it in the playlist entry's offer:

```json
"offer": {
  "instruments": [{ "role": "guitar", "difficulties": ["normal"] }],
  "voice": { "chartType": "vocals", "parts": 1 }
}
```

The chart file is then a lane chart ([§5.1](#51-a-lane-chart-lanes-or-drums)) with
`laneCount`-safe columns:

```json
{
  "schemaVersion": 1,
  "chartType": "lanes",
  "notes": [
    { "timeMs": 15200, "lengthMs": 0, "kind": "strum", "column": 0 },
    { "timeMs": 15620, "lengthMs": 0, "kind": "strum", "column": 1 },
    { "timeMs": 16040, "lengthMs": 700, "kind": "strum", "column": 2 },
    { "timeMs": 16740, "lengthMs": 0, "kind": "hopo", "column": 3 },
    { "timeMs": 17160, "lengthMs": 0, "kind": "strum", "column": null, "hero": true }
  ],
  "phrases": [{ "startMs": 15200, "endMs": 24000 }]
}
```

---

## 9. Building a YouTube karaoke resolver

This is the motivating example: a service that takes `q=Timber`, finds the song on YouTube,
reads its captions, and returns a karaoke entry. The shape above is the contract; this
section is the pipeline behind it.

### 9.1 The pipeline

1. **Search.** Use the YouTube Data API `search.list` (`type=video`, `videoCategoryId=10`
   for music) with the query. Take the best result, or offer the first few.
2. **Metadata.** `videos.list` with `part=snippet,contentDetails` gives the title, channel,
   duration (ISO 8601, e.g. `PT3M52S`) and thumbnails. Convert the duration to `durationMs`.
3. **Captions.** `captions.list` tells you what tracks exist. Downloading a track requires
   OAuth and the video owner's permission; the unauthenticated `timedtext` endpoint is not
   a stable public API. Plan for captions you are allowed to use, or accept an uploaded
   subtitle file. If there are no usable captions, return `songs: []` for that query rather
   than an entry nobody can sing.
4. **Words and lines.** A caption cue is a phrase, not a word. Split it into words and
   distribute the cue's duration across them (by character count is a good first pass),
   keeping the times monotonic. Put the cue in `lines[]` with `timeMs`/`endMs` and its words
   in `words[]` (times relative to the line). A `lyrics` chart needs **only** the lines;
   a `vocals` chart also puts each word in `notes[]` with an **absolute** `timeMs`.
5. **Pitch (for `vocals`).** If you have a **licensed** vocal stem or MIDI — not the
   YouTube stream — run a pitch tracker (CREPE, pYIN, basic-pitch), convert Hz to MIDI
   (`69 + 12 * log2(f / 440)`), and subtract a `rootMidi` to get `row`. Choose `rows` to
   cover the contour and `rootMidi` near its lowest note; quantise to semitones. **Do not**
   extract the YouTube stream, and do not send guesses as `vocals`: a `lyrics` chart is
   honest, and the game offers Listen and Type for it.
6. **Audio.** In the YouTube-backed mode the **video is the music**: return
   `video: { "kind": "youtube", "id": … }` and `audio: { "source": "youtube" }`, and serve
   no audio at all. The game plays it through the official IFrame Player API, so the
   stream is never downloaded or proxied. Set `durationMs` to the video's duration; the
   chart times are relative to the video's `0`. A separate recording is the alternative
   if you are not using the player; do not extract the YouTube stream in either case.
7. **Art and video.** Use the thumbnail as `art` (cache or proxy it if hotlinking is not
   allowed), and the video id as `video.kind: "youtube"`. Check `status.embeddable` and the
   region restrictions before returning the entry; a video that refuses embedding is a
   run nobody can start.
8. **Store and answer.** Write the song document and chart once, keyed by the video id, and
   serve the entry from the cache on subsequent searches. The song document has
   `audio.source: "youtube"` and no stems. A search should not regenerate the whole song
   every time.
9. **Return the entry.** `id: "yt-<videoId>"`, the offer (`voice` only for a karaoke song),
   and a `song` URL. The game fetches the song and chart separately.

### 9.2 Mapping YouTube fields

| YouTube | EverythingStar |
| --- | --- |
| `snippet.title` | `title` (clean "Official Video" suffixes if you like) |
| `snippet.channelTitle` | `artist.name` |
| `snippet.thumbnails.high.url` | `art` |
| `contentDetails.duration` (`PT3M52S`) | `durationMs: 232000` |
| `id` | `id: "yt-<id>"`, `video.id`, and `audio.source: "youtube"` |
| caption cues | `lines[]` / `notes[]` |
| a vocal pitch track | `rootMidi`, `rows`, `notes[].row` |
| `status.embeddable` | whether to return the entry at all |

### 9.3 Legal and operational notes

- The **official IFrame player is the playback path**: the service returns the video id and
  no audio, and the game never downloads, extracts or re-serves the stream. That is what
  keeps the YouTube-backed mode on the right side of YouTube's terms.
- Captions are user-contributed and carry their own licences. Auto-generated captions are
  often wrong; if you use them, expect typos and missing punctuation, and say so in your
  service's own UI. The player's own captions are not the game's lyrics; the chart is.
- Keep third-party API keys server-side. The game sends the query straight from the
  browser; it cannot keep a secret.
- Cache aggressively by query and video id. The game debounces, but a popular query should
  not cost an API call per player.
- Rate-limit and return **429** with CORS headers if you must; the game will show
  "429 Too Many Requests" and offer **Try again**.

### 9.4 A service skeleton

```
GET /ondemand.json                 -> { schemaVersion: 1, name, ondemand: true, songs: [] }
GET /ondemand.json?q=Timber        -> { schemaVersion: 1, songs: [ … ] }

GET /songs/:id.json                -> the song document (audio.source: "youtube")
GET /charts/:id/lyrics.json        -> the words (captions-only default)
GET /charts/:id/guitar-normal.json -> a lane chart, if you add instruments
GET /art/:id.jpg                   -> the cover
# no /audio route: the video is the music, played by the official player
```

Keep the base URL stable. If you version the service, put the version in the path
(`/v1/ondemand.json`), not in a header the game does not send.

---

## 10. Check yours

The game's reader is the authority, and it is a command away:

```bash
bun run playlist:check https://example.com/playlist.json
```

It reads the document with the **same** `readPlaylist` the jukebox and the band use,
holds the address to the game's URL policy, and bounds the body at the same 8 MB with the
same 30-second idle deadline. It prints the playlist's name, the songs it would list and
**every problem the reader found**, and exits `1` if there is one or if the document is not
a playlist at all. `--json` prints the same record (`ok`, `url`, `name`, `songs`,
`onDemand`, `problems`) for a build step.

`docs/playlist.schema.json` is the advisory shape for an editor: JSON Schema draft
2020-12, with a description on every field, so a typo is caught while it is typed. It is
deliberately not stricter than the contract.

**This schema is advisory; the reader is authoritative.** It cannot know which relative
path resolves, whether the same `id` is listed twice, or whether an offer's charts really
exist — the checker can, and it reports them in the reader's own words.

---

## 11. Acceptance checklist

Run through this before handing the service to a player.

**The document**

- [ ] `bun run playlist:check <base URL>` says `Result: ok`.

**The capability**

- [ ] `GET <base>` returns `schemaVersion: 1` and `ondemand: true` (or `{ "param": … }`).
- [ ] The response is `application/json` with CORS headers.
- [ ] The Playlists dialog shows the name and **on demand**.
- [ ] Refresh re-reads the capability and does not clear the library unexpectedly.

**Search**

- [ ] `GET <base>?q=Timber` returns the same document shape with `songs`.
- [ ] A search with no matches returns `songs: []` (not a 404, not an error).
- [ ] One result adds one row; several results add every row; twenty are all shown.
- [ ] A base URL that already has `?key=…` becomes `…?key=…&q=…`, not a broken URL.
- [ ] Spaces, `&`, `+`, `#`, accents and emoji in the query arrive intact.
- [ ] A slow request shows **Searching…**, then the result or a failure with **Try again**.
- [ ] A 500/429 with CORS headers is shown as that status, not "Failed to fetch".
- [ ] Two searches in a row add both songs to the jukebox.
- [ ] A reload clears the search results and starts from the capability again.
- [ ] The same query twice does not duplicate a row.

**The entry**

- [ ] `id` is stable across searches and reloads and namespaced by source.
- [ ] `title`, `artist`, `durationMs` are right; the row shows the real length.
- [ ] `art` loads; without it the initials tile is acceptable.
- [ ] `offer` matches the song document's parts and the band screen offers exactly those.
- [ ] A vocals-only entry offers the words and Play is allowed.

**A `.sng` package**

- [ ] `song` points at the package and is served with CORS over HTTPS.
- [ ] The entry carries `title`, `artist`, `durationMs` and `offer`; the row is complete
      without downloading the package.
- [ ] Selecting the row plays its preview (clip, master, or first audio member) and, when
      the package has one, shows its cover.
- [ ] The band screen offers the package's real charts and Play starts the run.
- [ ] A package with no chart is reported, not silently listed as playable.

**The song document**

- [ ] `id` equals the entry's `id`.
- [ ] `artist` is an **object**, not a string.
- [ ] `audio.source` is `stems` or `youtube`; if omitted it is `stems`.
- [ ] `durationMs` matches the audio — or, for a YouTube song, the video.
- [ ] Every `audio.stems[].url` plays and supports Range.
- [ ] `mixPresets.full` names a real stem (or the master).
- [ ] `preview` or a master stem (`stem_master`, or any stem with `instrument: null`) gives the jukebox an audition.
- [ ] Every chart listing's `url` returns the right `chartType`.
- [ ] `laneCount`, `bpm`, `offsetMs` are on the **listing**.
- [ ] A part with `audioControl` names real stem ids, and the master is not controlled.

**A YouTube-backed song**

- [ ] `audio.source` is `"youtube"` and `video.kind` is `"youtube"`.
- [ ] `stems` and `mixPresets` are empty or absent; no `audioControl` is expected.
- [ ] `durationMs` matches the player's video duration, and chart times start at the
  video's `0`.
- [ ] The video is embeddable and allowed in the player's region.
- [ ] The stage shows the video; pause, resume and restart move the player, not just the
  highway.
- [ ] The video's own captions are not fighting the game's lyrics.
- [ ] A miss leaves the sound playing; there is no part to mute.
- [ ] The jukebox row is silent (or plays a licensed `audio.preview` clip if supplied).
- [ ] The run ends when the video ends.
- [ ] A captions-only entry is a `lyrics` chart; a `vocals` chart is only used when a real
  pitch contour exists.

**The charts**

- [ ] `schemaVersion: 1` and the matching `chartType`.
- [ ] Lane notes have `timeMs`, `column` within `laneCount`, and sensible `lengthMs`.
- [ ] A chord is several notes at one `timeMs`.
- [ ] Melody `line.words[].timeMs` is **relative to the line**; `notes[].timeMs` is
  **absolute**.
- [ ] Every line has `parts: [{ "part": 0, "offset": 0 }]` for a solo.
- [ ] `vocals` notes have a `row` within `rows`, or `null` for a freeform/spoken word;
  `lyrics` notes do not need one.
- [ ] A duet uses `parts: 2` and each line says which part or parts it belongs to.
- [ ] The first and last notes are inside the audio; nothing is at a negative time.
- [ ] A `vocals` run offers a singer (microphone or auto); a `lyrics` run offers Type and
  Listen, with a typing score and no singer score.

**The browser**

- [ ] No CORS errors and no mixed-content warnings in the console.
- [ ] No 404s while selecting and playing a song.
- [ ] The audio starts, the clock follows it, and the song ends at the real end.
- [ ] The video backdrop (if present) is embeddable and muted.
- [ ] The row's preview plays when the song is selected.

---

## 12. Appendix: accepted values

**Song roles** (parts and stems):

```
guitar  bass  drums  keys  dance
lead_guitar  rhythm_guitar
vocals
```

`lead_guitar` and `rhythm_guitar` both read as **guitar** to the band screen. `vocals` is
the voice and belongs in `offer.voice`, not `offer.instruments`.

**Instruments** (what a band slot can hold):

```
guitar  bass  drums  keys  dance
```

**Difficulties** (lower-case, exact):

```
easy  normal  hard  expert
```

A singer always has `easy`, `normal` and `hard` — singing is the microphone's tolerance,
not a chart's — and a typist has no level. An instrument gets exactly the levels its charts
carry.

**Chart types**:

```
lanes   a highway for guitar, bass, keys or dance
drums   a highway read as drums
vocals  a pitched melody, sung; freeform notes on presence
lyrics  words only, typed; no singer score, so Listen is the read-along
```

**Lane note kinds**:

```
strum  tap  hopo
```

A plain note defaults to `strum` on guitar/bass/drums and `tap` on keys/dance. `hopo` only
exists on strummed instruments.

**Melody parts**: 1 = solo, 2 = duet, 3 = trio. More players than parts share them;
adding a singer never turns a solo into a duet.

**Document version**: `1`. One version covers the playlist, the song and every chart.
