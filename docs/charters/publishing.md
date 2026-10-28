---
title: Publishing
description: "From a folder of charts to a hosted library: the import command, what it writes and validates, hosting and licensing, and an acceptance checklist."
updated: "2026-10-28"
order: 7
---

This page takes a folder of charts to a library other people can add by URL. The conversion is one command, the hosting is static files, and the rules that matter are the ones in [Libraries](libraries.md) — this is the doing of them.

## From a folder to a library

```bash
bun run import --from "charts/Chart Library" --to "public/library"
```

The importer walks the tree, treats a folder holding a chart as a song, and reads each one with the **same pure parsers the browser uses**. It is a converter, not game code: it is allowed to be slow, and it reports a broken folder rather than playing around it.

| Flag | Meaning |
| --- | --- |
| `--from <dir>` | The collection to read. Required. |
| `--to <dir>` | Where the documents go. Default `library`. |
| `--audio-base <url>` | What goes in front of every audio path. Default `../audio`. |
| `--dry-run` | Read and report, write nothing. |
| `--only <text>` | Only folders whose path contains this text. |
| `--limit <n>` | Attempt at most `n` folders. `0` attempts none. |
| `--report <file>` | Write the run's report as JSON. |

A dry run is the first thing to do on a large collection:

```bash
bun run import --from "charts/Chart Library" --to "public/library" --dry-run
```

It prints how many songs it found, how many charts and notes, how many folders it could not read, and the first ten problems. No documents are written, so a bad guess costs a minute rather than a tree of wrong documents.

## What it writes

```text
public/library/
  playlist.json
  songs/neon-hearts.json
  songs/jonathan-coulton-code-monkey.json
  charts/neon-hearts/guitar-expert.json
  charts/neon-hearts/vocals.json
  charts/jonathan-coulton-code-monkey/guitar-lead-expert.json
  charts/jonathan-coulton-code-monkey/drums-hard.json
  audio-manifest.json
```

- **`playlist.json`** at the output root. Its `name` is the import root's folder name and its `songs` are the entries, in the order the folders were found.
- **`songs/<id>.json`** per song: the song document, with parts and chart listings.
- **`charts/<id>/…`** per chart: `<instrument>-<level>.json`, with the role in the name when there is one (`guitar-lead-expert.json`), and `vocals.json` or `lyrics.json` for the voice.
- **`audio-manifest.json`**: one entry per song, listing the audio files it needs, as paths relative to the **import root**. This is the shopping list for whoever prepares the host, because the importer copies **no audio**.

The ids come from each folder's path, not from its title, so two copies of one title in two albums are two songs. A path that slugs to the same text as another gets a short suffix from the whole path, and **every colliding path is suffixed** rather than the first one winning. The ids are settled over every folder found, before `--only` or `--limit` selects any, so converting a subset does not rename what it writes.

## What it refuses

Every chart is held to `chartProblems` — the same validator the stage applies — before it is written:

- A chart that fails is **dropped from the song** and named in the report: `instrument/level: problem`. Writing it would advertise an instrument the band screen then says it cannot play.
- A source with no usable chart and no melody is **skipped** rather than written as an entry with a title and no game mode.
- A folder the importer cannot read at all is counted as failed, named, and the rest of the run carries on.
- A melody alone is still a song: a karaoke folder with no instrument charts is written normally.

The run's exit code is `1` when a folder could not be read. Chart problems are reported but do not fail the run — the songs they leave behind are still playable, with a part missing.

## Where the audio goes

The importer writes stem URLs as `<audio-base>/<path>`, where `<path>` is the file's place under the import root. With the default base:

```text
library/songs/neon-hearts.json   +   ../audio/neon-hearts/guitar.ogg
                              =   library/audio/neon-hearts/guitar.ogg
```

So the simplest arrangement is to copy every file the manifest names to **`audio/<the same relative path>`** at the output root:

```text
public/library/audio/Jonathan Coulton - Code Monkey/song.ogg
public/library/audio/Jonathan Coulton - Code Monkey/guitar.ogg
```

`audio-manifest.json` is the list to copy from; keeping its paths is what makes `../audio/…` in the song document land on the file.

If your audio lives somewhere else, pass the base that lands there. The base is a URL fragment, not a filesystem path, and it is resolved against the song document: `../audio` from `songs/<id>.json` is the output root's `audio/`. A base of `https://cdn.example.com/songs/` makes every stem absolute, which is a good way to put the audio on a different host — as long as that host sends CORS and answers Range requests.

Audio is **never copied**, so a conversion is small and fast, and a re-import cannot duplicate a library's worth of files.

## Hosting

A library is static files. There is no server to run, no API and no account:

- **HTTPS** for every document and every media file. HTTP media is blocked as mixed content.
- **CORS** on the JSON: `Access-Control-Allow-Origin: *` and `Content-Type: application/json`. Serve audio with it too: the jukebox preview is routed through Web Audio and sets `crossOrigin`, so a cross-origin clip without CORS is silent.
- **Range requests** on audio, or a seek is uncomfortable and a stream has to start over.
- **Content types**: `application/json` for the documents, the right `audio/*` and `image/*` for the media, `video/mp4`/`video/webm` for a direct video.
- **8 MB** is the cap on a document and **128 MB** on a `.sng` package. A dense five-minute chart is hundreds of kilobytes, so the cap is a guard against a video being served where a chart should be.
- A host that sends CORS on its **errors** too is a host whose 404 reads as a 404 rather than "Failed to fetch".

A JSON library is fetched piecemeal — the playlist, then one song document, then one chart per seat — so a large catalogue is a small first fetch. A `.sng` library is fetched whole per song, up to 128 MB, so it suits small catalogues or a CDN.

The site's own hosting is described in [Deployment](../developers/deployment.md); a provider's host is its own project and its own rules. The wire contract's [§6](../developers/playlist-api.md#6-delivery-contract) is the full version.

## Check what you published

```bash
bun run playlist:check https://example.com/library/playlist.json
```

It reads the playlist with the game's reader, applies the same URL policy and the same 8 MB cap, prints the name, the songs it would list and every problem, and exits `1` if there is one. Run it against the **published URL**, not the file on disk: a relative path that resolves locally can still 404 on the host.

What it cannot see, because it reads one document:

- whether each `song` URL answers, and with the right `id`;
- whether a chart URL answers, or whether its notes fit its `laneCount`;
- whether the audio plays, seeks, or matches `durationMs`;
- whether the art loads, or whether the offer matches the document's parts.

Those are for the acceptance checklist, below. [`docs/playlist.schema.json`](https://github.com/HappyPaul55/everythingstar/blob/main/docs/playlist.schema.json) is the advisory shape for an editor; the reader is authoritative.

## Ids and revisions after publication

- **The id is forever.** The score board, the library merge and the offline record are keyed by it. Moving a folder changes the importer's id, and to the game that is a different song: its best score does not follow.
- **Re-running on the same tree is stable.** The id is derived from the path, so a re-import writes the same names.
- **A chart changed in place is not seen until the entry changes.** Song and chart documents are cached under the playlist entry's revision, which is a hash of the raw entry. Fixing a chart means editing its entry — or adding a `revision` field to the entry when the summary would otherwise be identical — and the documents follow.
- **A changed document shape is a different matter**, and not something a publisher controls: `schemaVersion` stays `1`.

## Licensing and consent

Publishing a chart is publishing somebody's work, and the chart is only one of the rights involved:

- **The composition and the lyrics** are the songwriter's. A chart of a commercial song is a derivative work unless the licence allows it.
- **The recording** is the performer's and the label's. A stem you cut from a commercial master is not yours to serve because you bought the record.
- **The chart itself** is its author's. Converting somebody else's chart is copying it.
- **A game's audio is not a licence** to the song, and a video is not a licence to extract its sound.

The safe answers are the ones the shipped library uses: works whose licences permit derivative use, with the original licence kept beside each song and an attribution file that says where every piece came from. The [EverythingStar FOSS](https://github.com/HappyPaul55/everythingstar-foss) library is the worked example: **37 songs**, one folder each, **only works whose licences permit derivative use**, every song's original `license.txt` kept, an `ATTRIBUTION.md` and a `songs/licenses.json` audit, and audio as OGG only.

Two more rules that are not legal ones:

- **Do not extract or proxy a YouTube stream.** A YouTube-backed song plays through the official player; the game never asks for its audio, and a provider must check that a video is embeddable before listing it.
- **Say what leaves the device.** A search provider receives the player's words directly from their browser. It gets no account, no cookie and no credential, and a third-party key belongs on your server rather than in a URL.

## The worked example

The game's seeded library is a real published implementation of everything on this page:

```text
https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/main/songs/playlist.json
```

- The playlist sits at `songs/playlist.json`; each entry's `song` is a folder name plus `song.json`, so every URL resolves against the playlist.
- A song folder holds `notes.mid` (a Guitar Hero chart), `song.ini`, `song.json`, its chart documents, its OGG stems and `album.jpg`. The same folder can be copied into Clone Hero or YARG's Songs directory, which is a useful check that the chart and the audio agree.
- Its song documents name a master, the instrument stems and a `preview.ogg`, and give each part an `audioControl` naming the stems a miss should duck — `stem_drums_1` to `stem_drums_3` for the kit, for example.
- Raw GitHub sends CORS, so a game on another origin can fetch the playlist, charts and audio.
- The playlist URL is the **stable link** people share; the assets are addressed relative to it, so the library can grow without anybody needing a new link.

You do not have to copy its layout. The importer's `songs/<id>.json` tree is equally valid; what matters is that each relative URL resolves against the document that wrote it, and that the entry's summary agrees with the song.

## Acceptance checklist

Before handing a library to a player:

- [ ] `bun run import --from <dir> --dry-run` reports no unreadable folder, and the charts you expect.
- [ ] The real run wrote `playlist.json`, one song document per song and the charts; `audio-manifest.json` lists every file.
- [ ] The audio tree is at the paths the manifest names, and every path answers over HTTPS.
- [ ] `bun run playlist:check <published playlist URL>` prints `Result: ok`.
- [ ] The playlist is served as `application/json` with CORS headers, and a 404 carries them too.
- [ ] Every `song` URL answers, and each document's `id` equals its entry's.
- [ ] The band screen offers exactly the entry's `offer`, and Play starts the run.
- [ ] One chart per instrument at one level loads, and the first and last notes sit inside the audio.
- [ ] A miss ducks the part it should, and the part comes back — or, on a one-master song, the error cue plays and the song carries on.
- [ ] The jukebox row shows a real length, a cover and a preview.
- [ ] The run's clock follows the sound, and the song ends at its real end.
- [ ] Every song's licence and credit are recorded, and the audio is one you may serve.
- [ ] A re-import of the same folder tree writes the same ids; a changed chart has a changed entry (or a `revision`).
- [ ] The library works from a clean browser with no cache, not only from the one that built it.

If a step fails, [When a chart will not load](when-a-chart-will-not-load.md) is the fault-finding page, and [Libraries](libraries.md) is the document reference.
