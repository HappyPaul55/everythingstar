---
title: Troubleshooting
description: "What to try when EverythingStar has no sound, will not start, loses a part, refuses a playlist or forgets your scores."
updated: "2026-10-28"
order: 10
---

Most problems come down to one of four things: the browser has not been given a gesture yet, a file did not arrive, a setting is doing what it says, or the browser has cleared something it was keeping. This page goes symptom by symptom.

If a first attempt does not help, try a reload, a second song, and a second browser. Those three answers tell you whether the fault is the game, the song or the browser.

## There is no sound at all

- **Press the welcome's “Enter the stage” button.** Browsers do not let a page make a sound before a gesture, and that button is the gesture that unlocks the game's audio. A game opened and left on the welcome is silent on purpose.
- **Wait for the button to stop saying Loading…** On a first visit the game prepares its cues before it lets you in. If it never leaves that state, reload; a sound file that failed is one cause.
- **Check the master and the families.** Options has a master fader and **Music**, **Ambience** and **Sound effects** under it. Music at zero silences the song and the menu beds; Sound effects at zero leaves the song but removes the clicks.
- **Check the device.** A phone's silent switch, a laptop's mute key, headphones that are connected but not on your head, and a Bluetooth speaker in another room all sound exactly like a broken game.
- **A singer with the guide vocal off hears no vocal from the song.** That is karaoke working: the singer is the voice. Turn **Guide vocal** on in Options to hear the song's own vocal under them.
- **Some songs have no audio.** A chart folder with notes and no audio files plays its notes in silence. The band screen names a stem that failed; a song document that names no audio has nothing to play. Try another song to tell this apart from a game-wide problem.

## One part is missing

If the guitar is silent while the drums and vocal play, one stem did not arrive.

- The **band screen** names a file that did not load — **“…” did not load — that part will be missing** — under the song's other problems. That is the place to look before the run.
- The run carries on without it rather than refusing to start. A band with one part missing is still a band.
- Go back to the songs and open the band again: the song's files are requested again. For a downloaded song, download it again; for a local folder, press **Reconnect**.
- A part that drops out **after a miss** and comes back on the next hit is the game working. It is held at a tenth of its level, not silenced, and it is meant to be heard.
- **A song with one master cannot lose a part.** If the song is a single file, a miss plays the `error` cue but cannot duck an instrument out, because there is no separate channel to duck.

## The song will not start, or Loading never ends

**Play** is the loader. It waits for the song's charts and for every stem the run will use to say it can play through.

- The button reads **Loading…** with a count while files arrive. A slow connection is a slow count, not a fault.
- A wait that passes about 45 seconds offers **Play anyway**, which starts the run with whatever has arrived. A missing part is named under the band.
- If a chart never arrives, the game says so on the band screen and the run goes on without it. The clock comes from the song, not the chart.
- If the song is in a **local folder**, the folder may be **Locked** after a reload. Press **Reconnect**; see below.
- If **Play** refuses with **None of this band has a part in this song**, the players on stage have nothing to play: change an instrument or a song, or leave the band empty and choose **Listen**.
- A YouTube-backed song gets its sound from the video player. An extension that blocks YouTube, or a network that blocks it, leaves the song unable to start; try another song or another browser.

## The audio and the picture are out of time

Two separate settings, in Options, and they mean different things:

- **Audio lag** is how late you **hear** the song. Nudge it until the notes and the sound land together. Positive means the sound is late.
- **Picture lag** is how late the **picture** is against the sound. Positive means the display lags, so the notes are drawn earlier to meet what you hear. Only the drawing moves; judging stays on the sound.

Both have a **Calibrate** dialog that measures the value from taps. Audio lag needs a song with its own audio to matter; a silent song leaves the frame loop in charge and the value moves nothing.

Some causes worth removing before calibrating:

- Bluetooth headphones and speakers add a delay of their own; measure with the device you will play with.
- A television's “game mode” removes a lot of picture delay. If the display has one, turn it on before measuring.
- **Note speed** is not a timing setting. It changes how much of the song is drawn, never when a note is judged.
- **Practice speed** does change the song's tempo, deliberately. It is not the same setting as note speed.

If the notes feel consistently early or late but the picture and sound agree with each other, that is audio lag. If a hit sounds before its note reaches the line, that is picture lag.

## A folder says Locked

A folder picked from this machine is remembered, but a browser will not keep permission to read it across a reload. That is a browser rule, not the game forgetting.

- The folder's songs stay listed; its charts are unreadable until you press **Reconnect**, which asks for permission again and rescans.
- If permission is refused, the dialog says so. Press **Reconnect** to ask again, and allow the browser's prompt.
- If the folder was moved, renamed, unplugged or deleted, Reconnect cannot find it. Open it again from its new place; the old row can be closed.
- An **imported** folder is a copy in the browser's own storage, so it never shows as Locked. If its songs are missing, the copy was removed or the site's data was cleared.

## An import failed, or there is no space

An import copies files into the browser's own storage. It is bounded on purpose:

- **512 MB per import.** A larger selection is refused before anything is written.
- **16 MB must remain free** afterwards, so a nearly full browser refuses rather than filling up.
- A selection with nothing importable — no chart, no `.sng` package — says so.
- A browser that cannot store files says so; use **Open a folder** where that is available, or add a playlist by URL.
- A failed copy keeps **nothing**, and an earlier copy of the same folder stays readable. Importing again makes a new generation and deletes the old one only when the new one is complete.
- **Close folder** deletes the copy. Your original files are untouched.
- To make room, remove downloads you no longer play, close imports you have finished with, or clear this site's data — the last also removes settings, scores, the band and every other stored file.

## A download failed

- **The button only appears when the game's worker is in control.** On the website that means a secure address (`https` or `localhost`) and an active worker, which may need a reload after the first visit; if it is missing, reload the page. In the installed game it is present.
- **A download is all or nothing.** A failure, a cancellation or a full device removes everything the attempt wrote, so a half-song is never left behind.
- **A quota message** means there is not enough room. Remove downloads you no longer need, or clear this site's data, then try again.
- **YouTube-backed songs cannot be downloaded**, because their sound is the video player rather than files the game can store.
- **A song in a local folder is already on the device**, so there is nothing to download.
- **A whole playlist's save** stops at a full device and leaves the songs it already kept; the failed song is named, and **Cancel** stops the queue.
- If a downloaded song plays online but not offline, the browser may have evicted it. The Downloads manager warns when the device has not promised to keep storage; download it again before you need it.

## A playlist will not load

- **It must be a full `http://` or `https://` address with a host.** A bare domain or a path on its own is refused with a reason.
- **An `http` playlist on this `https` page is blocked by the browser** as mixed content. Use an `https` address.
- **The host must allow cross-origin requests.** A playlist and its song and chart documents are fetched by the page, so the server has to send the appropriate CORS headers. A server that serves the file to a browser tab but not to the game is the usual cause.
- **There are size caps.** A document — a playlist, a song, a chart — is capped at 8 MB, and a `.sng` package at 128 MB. A URL that points at a video is not a playlist and will not read.
- **A playlist is read as a playlist.** A document that is not one comes back empty, with the problems listed in the dialog rather than a crash. Refresh after fixing it on the server.
- **A playlist you added is refreshed only when you ask.** **Refresh** and **Refresh all** are buttons; nothing re-reads your playlist behind your back.
- **The built-in library can be disabled.** If its songs have vanished, open Playlists and press **Enable**; if there is no playlist left to switch back on, **Add the default playlist** puts it back.
- **Duplicate songs are kept once**, from the first playlist that listed them. A song missing from the second playlist is not a fault.
- **An on-demand playlist** needs at least two characters in the search, and it answers only while it is reachable. A failed search is said under the field with **Try again**.

## A song offers no chart for my instrument

- **The song may not have that part.** The jukebox row says what a song offers, and the band screen hides modes the song has no chart for. A song can have vocals and no drums, or a guitar and nothing to sing.
- **The chart may have failed validation.** A fetched chart that does not pass the game's checks is dropped and named as `instrument/difficulty: problem` on the band and loading screens. That costs its part, not the run; another instrument still plays.
- **A local folder may need a rescan.** Press **Reconnect**; the folder is read again, and a chart or audio file that was not seen the first time is picked up.
- **A remembered band can ask for a role or level the song does not have.** The game falls back to the nearest level, and a seat with no role takes the lead guitar; if the song has no guitar at all, the box says **not in this song**.
- **“No chart for this instrument” on the stage** means the chart did not arrive. Go back to the band screen, which names the problem, and try again.

## The microphone prompt, or no vocal scoring

- **The prompt appears when Vocals is chosen**, or at **Play** if a singer was remembered. It is never asked on page load, so a game that has not asked is not broken.
- **Declining is allowed.** The singer's seat becomes the machine, the score rail says `auto`, and the run goes on without vocal scoring from your voice. If you want to score, allow the microphone and start the run again.
- **Check the browser's site settings** if permission was refused. Allow the microphone for this site, then choose Vocals or press Play again.
- **Check the system input.** A microphone muted in the operating system, a headset with a hardware mute, or the wrong input device all read as a singer who never arrives.
- **One microphone serves every singer.** Two singers share it; a seat the machine covers stays the machine's.
- **A lyrics-only song has no singer score.** Its words are typed in free play, and Listen is the unscored read-along.
- **A song with no vocal part cannot seat a singer.** The band screen does not offer Vocals for it.
- **The microphone listens only while the song moves.** A pause stops judging, and resuming starts it again; a seek starts the listening trail clean, so a practice loop has to be sung again.
- **Freeform words are judged on delivery, not pitch.** A spoken line does not need a tune, and the roll says so while one is being delivered.
- **A quiet voice close to the microphone is easier to detect than a loud one across the room**, and headphones with the guide vocal on keep the song's own voice out of your microphone.

## MIDI is not listed

- **Access is asked for on a gesture only** — choosing **MIDI** in a seat's gear, or starting a learn session. If the browser has never prompted, the seat has not asked.
- **A remembered MIDI seat is silent until you press MIDI again.** A browser cannot restore access without a press.
- **The gear names the inputs it can see.** If the list is empty, plug the kit in, turn it on, and press a key or a pad; then open the gear again.
- **A refusal keeps what the seat had.** It never quietly becomes the machine. Choosing **MIDI** again is the press that asks.
- **A kit's pads may not follow a standard map.** That is what **Set it up** is for: learn the controls one at a time, including a control change if the kit's pedal sends one.
- **A browser without Web MIDI says so.** The keyboard and a gamepad still work.

## The scores seem to have gone

Scores are local, with no account, so they live and die with this browser's storage.

- **The board is per song and per lineup.** The jukebox's line is this band's best — the same instruments at the same levels, with the words sung or typed the same way. The history under it is the song's own across lineups, so an Expert score can sit above an Easy one without being the best for the Easy band.
- **Some runs are never saved.** Practice, Listen, the attract demo, a lost run and a stage that judged nobody do not reach the board.
- **A run is lost** when the band hit fewer than half of at least ten judged notes or words. It is a verdict on the results screen, not a mid-song fail.
- **Private browsing and cleared site data remove the board**, along with the settings, the band, imports and downloads.
- **A new scoring model starts a new board.** An update that changes how runs are scored does not compare old runs with new ones; the old board is not read.
- **Importing a profile replaces the board** with the imported one. There is no merge.
- **Export a profile** if the scores matter; it is the one copy that survives clearing the browser.

## The Android app

The Android app is a separate project from this website. It loads the game's own game-only entry inside its WebView and keeps its own copy of the offline song cache, but its storage is its own: settings, the band and scores in the app are not the browser's, and the other way round.

- A link opens the app when Android has verified the App Link, or when it uses the `everythingstar://` scheme. A link that opens the browser instead means the App Link is not verified on that install.
- An old build stays old until the app is updated; the app is not installed or updated by this website.
- A song downloaded in the app is available to the app, not to the browser.
- Bugs in the app belong in its own repository rather than this site's issue tracker.

## Where to report a bug

The game's issues are at **https://github.com/HappyPaul55/everythingstar/issues**.

A useful report says:

- what you did, and what happened instead;
- the browser and version, the operating system, and whether the game is installed;
- the build label shown on the welcome screen;
- the song and the playlist, if one song is the problem — a public playlist URL is enough;
- whether it happens with another song, another browser, or after a reload.

Do not paste a private playlist URL, a password or anything else you would not publish.

If you think you have found a **security** problem, do not open a public issue. The security policy is at **https://github.com/HappyPaul55/everythingstar/blob/main/SECURITY.md**, and it says how to report one privately.
