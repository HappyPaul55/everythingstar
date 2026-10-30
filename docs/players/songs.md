---
title: Songs and playlists
description: "The jukebox: finding a song, previews, playlists and folders, imported files, .sng packages and downloads for offline play."
updated: "2026-10-30"
order: 2
---

A song in EverythingStar is a document — a title, an artist, a length, the parts it offers and the audio to play — reached through a **playlist**. The jukebox is where you find one, and the Playlists dialog is where the songs come from.

```ts id="jukebox" alt="The jukebox: an A–Z index down the side, song rows with their length and offers, and the now-playing panel on the right." viewports="desktop"
import { captureJukebox, test } from "./support";

test("the jukebox shows its index, its rows and the now-playing panel", async ({ context, page }) => {
  await captureJukebox(context, page);
});
```

## Finding a song

The list is one column of rows, filed under the first letter of each title. `#` comes first for titles that begin with a number or punctuation, then A to Z. The same letters run down the side as an index; press one and the list jumps so that letter's heading is at the top. On a phone the index is hidden — it would take a third of the width — and the search is the way through.

Songs keep their own place in the library, so a search filters the list around them without re-ranking what is left.

A row says what the song is:

- the cover, or a tile with the song's initials when it has no art;
- how long it is, at the head of the title's line — `3:04  A Talk with George`;
- the title, the artist (under it when the row needs two lines), and what the song offers: `vocals` or `lyrics`, `duet`, and the instruments it carries a chart for.

Only additions are named. A solo song does not say "solo", and a song with vocals does not also say "lyrics"; the words are implied by the vocals.

### Moving through the list

The arrows belong to the list, not the page. <kbd>↓</kbd> and <kbd>↑</kbd>, and <kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd>, move from row to row and take the page's scroll with them. The row you land on becomes the chosen song, and it starts its **preview**. What you hear is what you are looking at.

Hovering is not choosing. A click or a tap auditions a row and stays where it is; on a phone it also opens the now-playing panel. <kbd>Enter</kbd>, or a gamepad's A, takes the next step — the same as **Next: your band**.

### Search

The search looks through **titles, artists and albums**. Accents are folded, so `cafe` finds `Café`, and a double space in a title still matches one typed space.

If nothing contains what you typed, the game forgives **one typo** — a substitution, a missing or extra letter, or two letters swapped. That only applies to a query of at least four characters with no spaces, because `ant` is too short for a guess to be worth anything and a phrase is something to find rather than a word to misspell. Results keep their order; nothing is re-ranked.

A search that finds nothing says so. Searching does not change what is in the library.

### The now-playing panel

The panel on the right is the chosen song: its art, length, title and artist, and what it offers. Under that is a compact table of up to ten recent runs on this browser — when, how many players and the score — or **no score yet**. The **Next: your band** button sits below the panel.

On a wide screen the list and the panel share one height, with the list scrolling inside it. On a phone the panel opens over the list when a row is pressed.

### Previews

Moving onto a row plays a short clip. If the chart folder shipped a `preview` clip, that is what plays; otherwise the game plays the song's own master from a point the song document names. The clip **loops** until you choose another row or leave the jukebox, and the jukebox has no background music of its own — so a song with nothing to preview is silent rather than playing the room's music.

A song shipped only as separate instrument parts has no whole mix to preview, and one with no audio at all says nothing. A `.sng` package is the exception: its first audio member is the only sound it has, and the game uses it rather than leaving the row silent.

## Playlists

**Playlists** is the button in the jukebox's toolbar. The badge beside it counts the sources that are **on**: enabled playlists and folders. A playlist you have switched off is a row in the dialog, not a number on the button.

### The built-in library

The first visit seeds one playlist, **EverythingStar FOSS**, and its songs are the library you start with. It behaves like any other playlist except for two things:

- **Disable** keeps its row and its address but takes its songs out of the library. **Enable** puts them back.
- It is read fresh once per visit, because it is a published library that can change. If the network is unavailable, the last copy the game kept is used.

A playlist you added yourself can be **Removed**; the built-in one cannot, only disabled. If the library is empty and there is no playlist to switch back on, the dialog offers **Add the default playlist**.

### Adding a playlist

**Add a playlist** takes a URL. It must be a full `http://` or `https://` address with a host — `example.com/playlist.json` on its own is refused with a short reason. As you type, the dialog shows **From host**, so you can see where the songs will come from before you add anything.

If this page is on `https` and you enter an `http` address, the dialog says the browser will block it as mixed content. It does not silently pretend the playlist will work.

The host also has to allow the game to fetch its files — a playlist served to a browser tab but not to a cross-origin request will not read. [Troubleshooting](troubleshooting.md#a-playlist-will-not-load) has the details.

A playlist is the **index**. It carries a summary of each song, and the song and chart documents are fetched only when a song is chosen. That is why a library of a few hundred songs is still one small download, and why a broken entry is skipped and named rather than taking the list down.

The row for each playlist shows its song count, when it was last read, and anything that went wrong: a cached copy that could not be refreshed, a document with problems, or songs that were already in another playlist (the first one wins). **Refresh** reads that playlist again, and **Refresh all** does every one. Neither happens behind your back: a playlist you added is re-read only when you ask.

### Playlists that search on demand

A playlist can be a **capability** rather than a catalogue. Its row says **on demand** instead of a song count, and the game asks it for songs as you search the jukebox.

Type at least two characters. The field says which playlists it is searching, and the answers accumulate for the visit — so several searches build a working set. What a search found is not written into the playlist cache; a reload starts again from the capability. A search that fails is said under the field with **Try again**.

### Songs from links

A song document with no playlist around it can be added from a link, and it appears under **Songs from links** in the Playlists dialog. There it can be refreshed like a playlist or removed. A `.sng` package is not a song link: it needs a one-song playlist entry.

## Folders on this machine

**Open a folder…** reads a folder of charts where it sits. Nothing is uploaded and nothing is copied: the game asks the browser for permission to read the folder, then uses the same readers it uses for a playlist.

- A folder is remembered in this browser, so its songs are listed after a reload.
- A reload takes the browser's permission away. The folder comes back **Locked** — songs listed, charts unreadable — until you press **Reconnect**, because only a press can ask for permission again.
- **Close folder** forgets it. A picked folder is never deleted from your disk.
- A folder may be one song, a collection of song folders, or a folder holding `.sng` packages. Each package is one song.
- Opening a folder needs a browser with the File System Access API; Chromium-based desktop browsers have it. Where it is missing, the dialog says so and offers files instead.

Files are never modified, and nothing in the folder is uploaded.

## Importing files

**Import files** and **Import a folder** are for browsers without a folder picker, and for anyone who would rather drag files in. Choose the files, or drop a folder on the dialog.

The game **copies** the selected files into this browser's own storage — the Origin Private File System — and reads the copy with the same scanner a picked folder uses. Nothing is uploaded, and after the copy there is no permission to ask for again.

There are limits, and they are stated before anything is written:

- one import may hold up to **512 MB**;
- the browser must have at least **16 MB** left afterwards, so a nearly full browser refuses rather than fills;
- a failed copy keeps nothing, and the earlier copy of that folder stays readable;
- importing the same folder again makes a new copy, and the older one is deleted only once the new copy is complete;
- **Close folder** deletes the copy, because it is the game's copy rather than your files.

## `.sng` packages

A `.sng` is a container: one song's metadata, chart, audio, cover and preview inside one file. A playlist entry may point at a package, a local folder may hold packages, and **Import files** accepts them directly.

The game reads a package's header and chart to list it, and takes the audio and cover out only when the song is played or drawn. A remote package is kept in memory for a while after it is read — two packages at a time — so opening the band does not download it a second time straight away. That is a cache for the visit, not a permanent copy — use Download for offline play.

## Downloads

A download keeps a song on this device so it plays with no connection. The **Download** button is in the now-playing panel, under the song you have chosen.

A download resolves the song's playlist, its document, every chart, every stem (each part's own audio file), its art and its preview, and writes them into the browser's Cache Storage. The game's own service worker serves them back, byte ranges included, so the song seeks and plays as it does online.

- **It needs a worker in control.** The button appears only when the page is served by the game's worker — the installed game, or the website once its worker is active on a secure address (`https` or `localhost`). Without one, the game says downloads are not available rather than saving half a song.
- **It is one job for the page.** Leaving the jukebox does not cancel it; the progress follows the song.
- **It is all or nothing.** A failure, a cancellation or a full device deletes everything that attempt wrote. A quota failure says there is not enough storage.
- **It can be cancelled** while it runs. What it wrote is removed.
- **YouTube-backed songs are refused**, because their sound is the video player rather than files the game can store. A song in a local folder is already on the device, so there is nothing to download.
- **A whole playlist can be saved** from the Playlists dialog with **Save playlist offline**. It saves one song at a time through the same downloader, says how many songs it cannot save here, and stops if the device fills — leaving the songs it already kept. It is cancellable too.

**Downloads** in the jukebox's toolbar is the manager: every saved song, the storage used of the browser's quota, and **Remove** for one song or **Clear all downloads** for the lot. The clear button asks for a second press before it deletes anything.

A downloaded song is listed after a reload, including one found through an on-demand search. The browser may still clear downloads when storage runs low — the dialog warns when the device has not promised to keep them — so a song you care about is worth checking before a journey. [On a phone](on-a-phone.md#offline) covers storage advice for a phone.

## Listen

An empty band is allowed. With no players on stage, the band screen's button says **Listen**, and the song plays with its words on screen, unscored. It is the read-along: no run is published, nothing reaches the results cards and nothing goes on the board. A lyrics-only song is read this way too, and so is a song you simply want to hear.
