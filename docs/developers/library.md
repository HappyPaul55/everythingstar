---
title: Libraries, scores and local records
description: "How the library is cached, fetched and saved, what a playlist may reach, and the four records a player owns on this device."
updated: "2026-11-01"
order: 4
---

This is the manual for the parts that live on the player's device: the library cache and
its policy, the URL rules and body caps, folders, imports and offline downloads, and the
four local records behind the score board, the band and the profile.

## Playlists and the cache

The **songs** come from playlists — JSON files at URLs, seeded once with the
published **EverythingStar FOSS** library
(`https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/main/songs/playlist.json`).
A playlist, a song document and a chart document are the three files. The built-in
index is read **fresh once per visit**, because it is the published library; a
player's playlist is read from IndexedDB under the URL it came from
(`src/components/game/library/store.ts`, policy in `src/lib/game/cache.ts`) and
**Refresh** is the only thing that goes back to the network for it. Audio is streamed
rather than decoded, and the library itself never stores it; the exception is a song a
player deliberately downloads for offline play (below).

Each cached body has a small record beside it in a second object store (`key`,
`url`, `kind`, `at`, `size`; never the body). The body and its record are written in
one transaction, and eviction sums the records rather than deserialising every
cached chart — the reason the index exists. A browser that cached bodies before the
index existed rebuilds it **once**, on the first cache use after the upgrade, by
reading the cache store a single time; after that the two stores' keys agree and no
full read happens. A body from an older shape is dropped there (and its record with
it), and a record whose body has gone is removed the next time the cache trims.
**A read that failed is not a cache to empty**: the trim compares the index with the
cache store's *keys*, and a failed key read used to look like an empty cache — so
every record became an orphan and one transient IndexedDB error could delete all
48 MB of it. A failed key read now leaves both stores alone.
The rules are the same and the cap is **48 MB**: playlists are still kept last and
the oldest chart or song goes first.

## What a playlist may fetch

Every address the library fetches is held to one policy (`src/lib/game/url.ts`): it
must be **absolute, http or https, and have a host**, so a `javascript:`, `data:`,
`file:` or `blob:` URL never reaches `fetch`. The Playlists dialog says which host an
address will reach before it is added, and warns when an http address will be blocked
by an https page's mixed-content rules. Fetches are also **bounded**: a document (a
playlist, a song, a chart, the sound manifest) is capped at **8 MB** and a `.sng`
package at **128 MB**. The declared `Content-Length` is checked first, and the body is
then read as a stream and cancelled and aborted the moment it passes the cap, so a
host that lies about its length cannot fill the tab. A dense five-minute chart is a
few hundred kilobytes, while a video is far past either ceiling; the `.sng` header
caps are a separate rule inside the package.

## Search playlists

A playlist can also be a **search endpoint** rather than a catalogue. `ondemand: true`
in its manifest (or `ondemand: { "param": "search" }` to name a parameter other than
`q`) says it can be asked for a song; the jukebox's search field sends the words as
`?q=…`, built through `URL` so an existing query string and a hash are kept. The
answer is the same playlist document, read against its query URL, with each song
still belonging to the source that was asked. Results are a **session's working
set**: they join the library as they arrive and are held in memory rather than in
the playlist cache, so a reload starts from the capability again. The search is
debounced, needs two characters, and Enter asks without the wait; a failure is said
under the field and retried by hand. **The full wire contract is in
[Playlist API](playlist-api.md)** — it is written to be handed to whoever is
building a library or an on-demand provider.

## Folders and imports

A playlist entry's `song` points at our **song document** (or a **`.sng` package**),
which is what keeps a list of a few hundred songs cheap. A raw `notes.mid`, a `.chart`,
an UltraStar `.txt` or a lyric sheet is read by a **folder** or the importer, never by
a remote playlist entry: those are the formats the **Playlists dialog** reads when it
opens a folder off this machine (`folder.ts`). The folder is walked, each chart is read
where it lies and the songs join the library beside the playlists, with nothing
uploaded and nothing copied. A folder **is remembered** — its handle, the songs reading
it found, **and what each of them was read with** (which file was its chart, its
`song.ini` and its stems) are kept in this browser's own storage, so a reload comes
back to a list that is already there and a song on it is **still playable**, not merely
listed. A reload also takes the browser's permission to read the files, which is why a
remembered folder asks for it again on one press rather than on load; a song whose
folder is locked says so on the band screen, with the press to make good on. A library
remembered by an **older build** — one that kept the songs but not what each was read
with, or one that found a song's chart but not its stems — is repaired from the folder
itself on the way in, so it comes back playable rather than as a list nobody can press
Play on (or one that plays silence).

A **`.sng` member** — a cover, a stem, a chart inside a package — is read and unmasked
out of the file when something asks for it, and the result is kept for the visit in a
**32 MB** cache (`localObjectUrl`), because a jukebox asks for the same cover on every
pass. A member is also held to the same **128 MB** package ceiling as a downloaded one:
a local package has no download to check, so the member's own length is the only
bound. Without it a 2 GB container could ask the tab for 2 GB of array.

A browser with **no directory picker** imports instead: the Playlists dialog's
**Import files** and **Import a folder** inputs (and dropping files or a folder on the
dialog) copy what was chosen into **`imports/<id>/` in the browser's Origin Private File
System**, then read it with that same scanner. An import is capped at **512 MB**, and
the browser's storage estimate has to leave 16 MB free. Its record is stored without a
handle — the OPFS directory is reopened by id on the next visit, so the songs are
readable without a prompt and are never "locked" — and removing the folder, or a copy
that fails, deletes the copy. A picked folder is never copied or deleted.

## Offline downloads

**Offline downloads** are the one place that copies audio. The website and the native
app share one contract: each registers a worker, and both serve the same
`everythingstar-offline-v1` Cache Storage bucket. The jukebox's now-playing slot offers
**Download** and the toolbar opens a **Downloads** manager; saving a song writes its
playlist, song document, every chart for every part, every stem, its art and its preview
into that bucket (`src/components/game/library/downloads.ts`). The site's own `/sw.js` —
or the app's worker — serves it back to the media elements, including the byte ranges a
seek asks for, so a cold start with no network still lists the library and plays the
saved song. JSON is network-first when a network exists (the cached copy is the offline
fallback), while stems and art are cache-first — a saved audio file is a pinned object.
**A refresh only replaces a document with a document**: a `200` is not enough, because a
hotel's captive portal and a host's incident page are both `200` with an HTML body, and
storing one over a saved song leaves a record saying *Downloaded ✓* over a file nobody
can play (re-pressing Download then does nothing, because the record already exists). A
response whose content type is JSON is stored; one with a type that is not is ignored and
the saved copy is served; one with no type is read to see whether it parses. A provider's
`4xx`/`5xx` serves the saved copy too. The **path is not what makes a document**: a
service may answer `/search?q=…` or `/songs/abc`, so the cached response's own
content-type decides whether it is kept fresh, with the `.json` extension only as a
fallback.
A download is a single **page-wide job**: it keeps running when the player walks from the
jukebox to the band, a screen that mounts mid-download sees it already in progress, and
the Downloads dialog offers **Cancel**. It is also all or nothing: a cancelled, failed or
over-quota attempt deletes what it wrote. **A whole playlist can be saved the same way**:
each enabled catalogue row in the Playlists dialog offers **Save playlist offline**, which
walks the playlist through that same downloader one song at a time and shows *Saving 3 of
12…*. Completed songs stay if a later one fails; an ordinary failure is counted and the
queue carries on, while a **quota** failure stops the rest. A saved playlist is therefore a
set of the ordinary per-song records rather than a second manifest, and removing one song
takes only its files. Local folders, pinned songs and on-demand playlists offer no button. A song is about 23 MB, the manager shows the
device's storage use and the app/game/WebView versions, and removal or **Clear all
downloads** is exact. A downloaded on-demand song is still listed after a reload, too:
its summary lives only in the offline record, so the library merges those records in
last rather than leaving the song out of the index. YouTube-backed songs have no files to
save, and a song already in a local folder is already offline, so both are refused with a
sentence rather than a half-download. **The cache name is the same literal in
`src/lib/pwa/cache.ts` and the app's `native/sw.ts`; change both together.** A
browser/WebView without a service worker keeps the streaming game unchanged.

## Scores and the band

A finished run is saved to this browser's own storage
(`src/lib/game/scores.ts`) — the band score, its base score and stars, the best
combo, the hit and miss counts, a line per player at their own difficulty, and the
**lineup** it was played by. The storage key is versioned with the scoring model, so
an older three-point board is not compared with 50-point runs. A run is kept against
its **song**, and compared within that by its **lineup**, not a song difficulty:
difficulty is each player's, so the comparable unit is each player's instrument and
level plus whether a words player sang or typed — a stable, unlocalised, sorted key
such as `drums:hard+guitar:expert+words:normal:sing` (`lineupKey`). Seat order does
not change it. `bestFor`/`topFor` take an optional lineup; with it only that band's
runs count, and without it the song-wide best across lineups is still what the
jukebox shows. An entry saved before lineups were recorded has no key, so it is its
own group and never matches a specific lineup. The results screen compares the new
score with the best **for this band** and shows the last few runs song-wide
(`recentFor`, newest first), each row naming its lineup. The **band** is remembered
the same way
(`src/lib/game/band/store.ts`). There is **no account and no server**: a leaderboard
is a later addition to the same shape, not a different design. Every run also
publishes its own totals to a publish-only board (`RunBoard`) that the results screen
reads — that is a read-out, never an input, so no player's judging can be affected by
another's.

## The four local records

There are **four local records**, and they are kept apart: the **settings**
(`settings.ts`, how the game behaves), the **band** (`band/store.ts`, per seat), the
**board** (`scores.ts`, per song) and the **first-run hints** (`onboarding.ts`, per
seat). **Your profile** in Options is those four, and only those four, as one
versioned JSON file (`src/lib/game/profile.ts`, `format: "everythingstar-profile"`,
version 1): it carries no account, and deliberately **no library, downloads or
audio** — those are other people's files reached through a URL, not records a player
owns, so importing a profile leaves them exactly where they are. Import validates the
envelope and then reads each record through its own pure parser, so a file cannot put
a value on the stage that a stored one could not; a malformed file says why and
changes nothing, the board is capped at the same 50 the board keeps, and the whole
file is refused over 1 MB before it is parsed. Nothing is written until **Replace**,
which writes all four through their own save functions and reloads the page — the
session reads each record on mount, so a reload is the one way to make them all the
import's rather than a mix.

