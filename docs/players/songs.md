---
title: Songs and playlists
description: "The jukebox: finding a song, previews, playlists and folders, imported files, .sng packages and downloads for offline play."
updated: "2026-10-31"
order: 2
---

A song is a document — title, artist, length, parts and audio — reached through a **playlist**. The jukebox is where you find one; the Playlists dialog is where songs come from.

## Finding a song

The list is one column of rows filed under each title's first letter: `#` first for numbers and punctuation, then A to Z. The same letters run down the side; press one and the list jumps to that heading. A phone hides the index, which would take a third of the width, so search is the way through.

A row carries the cover or a tile with the song's initials, the length at the head of the title line (`3:04  A Talk with George`), the title and artist, and what the song offers: `vocals` or `lyrics`, `duet`, and the instruments with a chart. Only additions are named, so a solo song does not say "solo" and vocals imply lyrics.

[The jukebox: song rows, and the chosen song's art, length and recent runs in the now-playing panel.](shot:jukebox)

### Moving through the list

The arrows belong to the list. <kbd>↓</kbd> and <kbd>↑</kbd>, and <kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd>, move from row to row and take the page's scroll with them. The row you land on becomes the chosen song and starts its **preview**.

Hovering is not choosing. A click or tap auditions a row and stays put; on a phone it also opens the now-playing panel. <kbd>Enter</kbd>, or a gamepad's A, is **Next: your band**.

### Search

The search looks through **titles, artists and albums**. Accents are folded, so `cafe` finds `Café`, and a double space still matches one typed space. It filters the list without re-ranking what is left.

If nothing contains what you typed, the game forgives **one typo** — a substitution, a missing or extra letter, or two letters swapped — for a query of at least four characters with no spaces. `ant` is too short for a guess to be worth anything, and a phrase is something to find rather than misspell. A search that finds nothing says so; searching never changes the library.

### The now-playing panel

The panel is the chosen song: art, length, title, artist and what it offers. Under it is a table of up to ten recent runs — when, how many players and the score — or **no score yet**, with **Next: your band** below. On a wide screen list and panel share one height; on a phone the panel opens over the list.

### Previews

Moving onto a row plays a short clip: the chart folder's `preview` clip or the song's own master, from a point the document names. It **loops** until you choose another row or leave; there is no background music, so a song with nothing to preview is silent. A song shipped as separate parts has no whole mix, and one with no audio says nothing — except a `.sng`, whose first audio member is all it has.

## Playlists

**Playlists** is the jukebox's toolbar button. Its badge counts the sources that are **on** — enabled playlists and folders — so a switched-off playlist is a row in the dialog, not a number on the button.

[The Playlists dialog: the built-in library and the playlists switched on, each with its song count.](shot:playlists)

### The built-in library

The first visit seeds one playlist, **EverythingStar FOSS**, whose songs are the library you start with. **Disable** keeps its row and address but takes its songs out, **Enable** puts them back, and it can only be disabled, never removed. It is read fresh once per visit, because a published library can change; without a network the game uses the last copy it kept.

A playlist you added can be **Removed**. If the library is empty and no playlist can be switched back on, the dialog offers **Add the default playlist**.

### Adding a playlist

**Add a playlist** takes a URL: a full `http://` or `https://` address with a host, so `example.com/playlist.json` alone is refused with a short reason. As you type, the dialog shows **From host**.

On an `https` page an `http` address is blocked as mixed content, and the dialog says so. The host must also allow the game to fetch its files: a playlist served to a browser tab but not to a cross-origin request will not read — [Troubleshooting](troubleshooting.md#a-playlist-will-not-load) has the details.

A playlist is the **index**: it carries a summary of each song, and song and chart documents are fetched only when one is chosen. A few hundred songs are still one small download, and a broken entry is skipped and named rather than taking the list down. Each row shows its song count, when it was last read, and anything wrong: a stale cache, a document with problems, or songs already in another playlist (the first wins). **Refresh** reads it again and **Refresh all** does every one; your own playlist is re-read only when asked.

### Playlists that search on demand

A playlist can be a **capability** rather than a catalogue. Its row says **on demand** instead of a song count, and the game asks it for songs as you search.

Type at least two characters. The field names the playlists it searches, and answers accumulate for the visit, so several searches build a working set. A result is not written into the playlist cache; a reload starts again from the capability. A failed search is said under the field with **Try again**.

### Songs from links

A song document with no playlist can be added from a link and appears under **Songs from links** in the Playlists dialog, where it can be refreshed or removed. A `.sng` package is not a song link: it needs a one-song playlist entry.

## Folders on this machine

**Open a folder…** reads a folder of charts where it sits. Nothing is uploaded or copied: the game asks permission to read it and then uses the same readers as for a playlist.

- A folder is remembered, so its songs are listed after a reload.
- A reload takes the permission away. The folder comes back **Locked** — songs listed, charts unreadable — until you press **Reconnect**, because only a press can ask again.
- **Close folder** forgets it; a picked folder is never deleted from your disk.
- A folder may be one song, a collection of songs, or `.sng` packages, each one song.
- It needs the File System Access API, which Chromium-based desktop browsers have; where it is missing, the dialog offers files.

Files are never modified, and nothing is uploaded.

## Importing files

**Import files** and **Import a folder** are for browsers without a folder picker, and for anyone who would rather drag files in. The game **copies** the selection into the Origin Private File System and reads it with the same scanner; nothing is uploaded. The limits come before anything is written:

- one import may hold up to **512 MB**;
- at least **16 MB** must remain afterwards, so a nearly full browser refuses rather than fills;
- a failed copy keeps nothing, and the earlier copy stays readable;
- importing the same folder again makes a new copy, and the older is deleted only once the new is complete;
- **Close folder** deletes the copy, which is the game's rather than your files.

[The Playlists dialog after an import: the copied package listed as one song, with a note that it is in this browser's storage.](shot:import)

## `.sng` packages

A `.sng` is a container: one song's metadata, chart, audio, cover and preview in one file. A playlist entry may point at one, a local folder may hold them, and **Import files** accepts them. The game reads the header and chart to list it, and takes the audio and cover out only when the song is played or drawn.

A remote package is kept in memory, two at a time, after it is read, so opening the band does not fetch it again straight away. That is a cache for the visit, not a copy; use Download for offline play.

## Downloads

A download keeps a song on this device so it plays with no connection. **Download** is in the now-playing panel: it resolves the playlist, document, charts, stems (each part's audio), art and preview into Cache Storage, and the service worker serves them back, byte ranges included, so the song seeks and plays as online.

- **It needs a worker in control.** The button appears only when the game's worker serves the page — the installed game, or the website on a secure address (`https` or `localhost`) with an active worker. Without one the game says downloads are unavailable rather than saving half a song.
- **It is one job for the page, and all or nothing.** Leaving the jukebox does not cancel it; progress follows the song. Cancelling it, a failure or a full device deletes everything the attempt wrote, and a quota failure says there is not enough storage.
- **YouTube-backed songs are refused**, because their sound is the video player rather than files the game can store. A song in a local folder is already on the device.
- **A whole playlist can be saved** with **Save playlist offline** in the Playlists dialog: one song at a time, saying how many it cannot save, and stopping at a full device with the songs it kept. It is cancellable too.

**Downloads** in the toolbar lists every saved song, the storage used of the browser's quota, and **Remove** and **Clear all downloads**; clearing everything asks for a second press.

A downloaded song is listed after a reload, including one found through an on-demand search. The browser may still clear downloads when storage runs low, and the dialog warns when the device has not promised to keep them, so check a song you care about before a journey.

## Listen

An empty band is allowed. With no players on stage the button says **Listen**, and the song plays with its words on screen, unscored: no run is published, nothing reaches the results and nothing goes on the board. A lyrics-only song is read this way, and so is a song you want to hear.

[An unscored Listen run: the song's words on the melody region, with no players on stage and no score.](shot:listen)
