---
title: Publishing
description: "From a folder of charts to a hosted library: the import command, what it writes and validates, hosting and licensing, and an acceptance checklist."
updated: "2026-10-31"
order: 8
---

This page takes a folder of charts to a library others add by URL: one conversion command, static hosting, and the rules in [Libraries](libraries.md).

## From a folder to a library

```bash
bun run import --from "charts/Chart Library" --to "public/library"
```

It treats a folder holding a chart as a song and reads each with the **same pure parsers the browser uses**. It is a converter, not game code: it may be slow and reports a broken folder rather than playing around it.

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

It prints songs, charts, notes, unreadable folders and the first ten problems; nothing is written, so a bad guess costs a minute, not a tree of wrong documents.

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

- **`playlist.json`** at the output root: its `name` is the import root's folder name and its `songs` are the entries, in discovery order.
- **`songs/<id>.json`** per song: the song document, with parts and chart listings.
- **`charts/<id>/…`** per chart: `<instrument>-<level>.json`, with the role in the name when there is one (`guitar-lead-expert.json`), and `vocals.json` or `lyrics.json` for the voice.
- **`audio-manifest.json`**: one entry per song, listing audio paths relative to the **import root** — the shopping list for whoever prepares the host, because the importer copies **no audio**.

Ids come from each folder's path, not its title, so two copies in two albums are two songs. A path that slugs to the same text gets a short suffix from the whole path, and **every colliding path is suffixed**, not only the first. Ids are settled before `--only` or `--limit` selects any, so a subset does not rename what it writes.

## What it refuses

Every chart is held to `chartProblems`, the stage's validator, before it is written ([What a chart is](what-a-chart-is.md#what-makes-a-chart-playable)):

- A chart that fails is **dropped from the song** and named `instrument/level: problem`; writing it would advertise a part the band screen says it cannot play.
- A source with no usable chart and no melody is **skipped**, not written as a title with no game mode.
- An unreadable folder is counted as failed, named, and the run carries on.
- A melody alone is still a song: a karaoke folder is written normally.

The exit code is `1` when a folder could not be read; chart problems do not fail the run.

## Where the audio goes

The importer writes stem URLs as `<audio-base>/<path>`, where `<path>` is the file's place under the import root. With the default base:

```text
library/songs/neon-hearts.json   +   ../audio/neon-hearts/guitar.ogg
                              =   library/audio/neon-hearts/guitar.ogg
```

Copy every manifest file to **`audio/<the same relative path>`** at the output root:

```text
public/library/audio/Jonathan Coulton - Code Monkey/song.ogg
public/library/audio/Jonathan Coulton - Code Monkey/guitar.ogg
```

`audio-manifest.json` is the copy list; keeping its paths makes `../audio/…` in the song document land on the file.

If audio lives elsewhere, pass the base that lands there. It is a URL fragment resolved against the song document: `../audio` from `songs/<id>.json` is the output root's `audio/`; `https://cdn.example.com/songs/` makes stems absolute, if the host sends CORS and answers Range.

Audio is **never copied**, so a conversion is small and fast, and a re-import cannot duplicate a library's worth of files.

## Hosting

A library is static files: no server, no API, no account.

- **HTTPS** for every document and media file. HTTP media is blocked as mixed content.
- **CORS** on JSON (`Access-Control-Allow-Origin: *`, `Content-Type: application/json`) and audio: the preview goes through Web Audio and sets `crossOrigin`, so a clip without CORS is silent.
- **Range requests** on audio, or a seek is uncomfortable and a stream has to start over.
- **Content types**: `application/json` for documents, the right `audio/*` and `image/*`, `video/mp4`/`video/webm` for a direct video.
- **8 MB** on a document, **128 MB** on a `.sng`: a dense five-minute chart is hundreds of kilobytes, so the cap guards against a video served as a chart.
- **CORS on errors** too, so a 404 reads as a 404 rather than "Failed to fetch".

A JSON library is fetched piecemeal — playlist, one song, one chart per seat — so a large catalogue is a small first fetch; a `.sng` library is fetched whole per song, up to 128 MB, suiting small catalogues or a CDN.

The site's own hosting is [Deployment](../developers/deployment.md); a provider's host is its own project. The wire contract's [§6](../developers/playlist-api.md#6-delivery-contract) is the full version.

## Check what you published

```bash
bun run playlist:check https://example.com/library/playlist.json
```

It applies the game's reader, URL policy and 8 MB cap, prints the songs and every problem, and exits `1` if there is one. Run it against the **published URL**: a locally valid path can still 404 on the host. [Libraries](libraries.md#checking-a-library) lists what it cannot see; the checklist below walks it.

## Ids and revisions after publication

**The id is forever.** The score board, library merge and offline record are keyed by it; moving a folder gives a different id, and the best score does not follow. Re-running the same tree writes the same names.

**A chart changed in place is not seen until the entry changes.** Song and chart documents are cached under the entry's revision, a hash of the raw entry: edit the entry, or add a `revision` field when the summary would be identical. `schemaVersion` stays `1` for a change of shape only. [Libraries](libraries.md#ids-and-revisions) has the detail.

## Licensing and consent

Publishing a chart publishes somebody's work, and the chart is only one right involved:

- **The composition and lyrics** are the songwriter's: a commercial song's chart is a derivative work unless licensed.
- **The recording** is the performer's and the label's: a stem cut from a commercial master is not yours to serve because you bought the record.
- **The chart** is its author's: converting somebody else's is copying it.
- **A game's audio is not a licence** to the song, and a video is not a licence to extract its sound.

The safe answers are the shipped library's: derivative-permitted works, the original licence beside each song, attribution for every piece. [EverythingStar FOSS](https://github.com/HappyPaul55/everythingstar-foss) is the worked example: **37 songs**, one folder each, derivative-permitted works only, every `license.txt`, an `ATTRIBUTION.md`, a `songs/licenses.json` audit and OGG audio.

Two rules that are not legal ones:

- **Do not extract or proxy a YouTube stream**: a YouTube song plays through the official player, and a provider must check a video is embeddable before listing it.
- **Say what leaves the device**: a search provider receives the player's words from their browser, with no account, cookie or credential; a third-party key belongs on your server, not in a URL.

## The worked example

The game's seeded library is a real implementation of this page:

```text
https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/main/songs/playlist.json
```

- The playlist is `songs/playlist.json`; each entry's `song` is a folder name plus `song.json`, so URLs resolve against the playlist.
- A song folder holds `notes.mid`, `song.ini`, `song.json`, charts, OGG stems and `album.jpg` — the same folder can be copied into Clone Hero or YARG, a useful check that chart and audio agree.
- Song documents name a master, instrument stems and `preview.ogg`, and give each part an `audioControl` naming its stems (`stem_drums_1` to `stem_drums_3` for the kit, say).
- Raw GitHub sends CORS, so another origin can fetch the playlist, charts and audio.
- The playlist URL is the **stable link** people share; assets resolve relative to it, so the library grows without a new link.

You need not copy its layout: the importer's `songs/<id>.json` tree is equally valid. What matters is that each relative URL resolves against the document that wrote it, and the entry's summary agrees with the song.

## Acceptance checklist

Before handing a library to a player:

- [ ] `bun run import --from <dir> --dry-run` reports no unreadable folder, and the charts you expect.
- [ ] The real run wrote `playlist.json`, a song document per song and the charts; `audio-manifest.json` lists every file.
- [ ] The audio tree is at the manifest's paths, and every path answers over HTTPS.
- [ ] `bun run playlist:check <published playlist URL>` prints `Result: ok`.
- [ ] The playlist is `application/json` with CORS, and a 404 carries them too.
- [ ] Every `song` URL answers, and each document's `id` equals its entry's.
- [ ] The band screen offers exactly the entry's `offer`, and Play starts the run.
- [ ] One chart per instrument at one level loads, first and last notes inside the audio.
- [ ] A miss ducks the right part and it returns — or, on a one-master song, the error cue plays on.
- [ ] The jukebox row shows a real length, a cover and a preview, and the run's clock follows the sound to the real end.
- [ ] Every song's licence and credit are recorded, and the audio is one you may serve.
- [ ] A re-import writes the same ids; a changed chart has a changed entry (or a `revision`).
- [ ] The library works from a clean browser with no cache.

If a step fails, [When a chart will not load](when-a-chart-will-not-load.md) is the fault-finding page, and [Libraries](libraries.md) is the document reference.
