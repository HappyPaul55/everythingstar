---
title: Troubleshooting
description: "What to try when EverythingStar has no sound, will not start, loses a part, refuses a playlist or forgets your scores."
updated: "2026-10-31"
order: 10
---

Most problems come down to one of four things: the browser has had no gesture yet, a file that did not arrive, a setting doing what it says, or the browser clearing something. If a first attempt fails, try a reload, a second song and a second browser: those tell you whether the fault is the game, the song or the browser.

## There is no sound at all

- **Press the welcome's “Enter the stage” button.** Browsers need a gesture before a page may make sound, and a game left on the welcome is silent on purpose. A first visit then reads **Loading…**; if it never stops, reload — a failed sound file is one cause.
- **Check the master and the families.** Music at zero silences the song and menu beds; **Sound effects** at zero leaves the song but removes the clicks; **Ambience** is only the paused room.
- **Check the device.** A phone's silent switch, a laptop's mute key, headphones not on your head and a Bluetooth speaker in another room all sound like a broken game.
- **A singer with the guide vocal off hears no vocal.** That is karaoke working; turn **Guide vocal** on to hear the song's own vocal.
- **Some songs have no audio.** A notes-only chart folder plays in silence, and a document naming no audio has nothing to play; try another song to tell this from a game-wide problem.
- **The stage says “No sound from this song”.** The run's audio never arrived (the host refused the file, or the browser blocked it), so the game has fallen back to the clock on its own. The notes still come and are judged, and the run still ends and reaches the results; leave the stage from the pause and try the song again, or another one.

## One part is missing

If the guitar is silent while the drums and vocal play, one stem did not arrive.

- The **band screen** names the file — **“…” did not load — that part will be missing** — under the song's other problems. The run carries on without it; a band with one part missing is still a band.
- Go back to the songs and open the band again, which requests the files again. For a downloaded song, download it again; for a local folder, press **Reconnect**.
- A part that drops out **after a miss** and returns on the next hit is the game working, held at a tenth of its level.
- **A song with one master cannot lose a part**: a miss plays the `error` cue but cannot duck an instrument out.

## The song will not start, or Loading never ends

**Play** is the loader: it waits for the charts and every stem the run will use.

- **Loading…** counts files as they arrive; a slow connection is a slow count, not a fault.
- After about 45 seconds it offers **Play anyway** with whatever arrived; a missing part is named under the band.
- A chart that never arrives is named on the band screen and the run goes on; the clock comes from the song.
- In a **local folder** the folder may be **Locked** after a reload; press **Reconnect**.
- **None of this band has a part in this song** means the players have nothing to play: change an instrument or song, or leave the band empty and choose **Listen**.
- A YouTube-backed song gets its sound from the video player, so an extension or network that blocks YouTube stops it.

## The audio and the picture are out of time

Two separate settings in Options:

- **Audio lag** is how late you **hear** the song; positive means the sound is late.
- **Picture lag** is how late the **picture** is against the sound; positive means the display lags, so notes are drawn earlier. Only the drawing moves; judging stays on the sound.

Both have a **Calibrate** dialog that measures from taps. Audio lag matters only for a song with its own audio; a silent song leaves the frame loop in charge.

Causes worth removing before calibrating:

- Bluetooth headphones and speakers add a delay; measure with the device you will play with.
- A television's “game mode” removes a lot of picture delay; turn it on first.
- **Note speed** is not a timing setting: it changes how much is drawn, never when a note is judged. **Practice speed** does change the tempo, deliberately.

If the notes feel consistently early or late while picture and sound agree, that is audio lag. If a hit sounds before its note reaches the line, that is picture lag.

## A folder says Locked

A browser will not keep permission to read a picked folder across a reload — a browser rule, not the game forgetting.

- The songs stay listed but the charts are unreadable until you press **Reconnect**, which asks again and rescans.
- If permission is refused, the dialog says so; press **Reconnect** and allow the browser's prompt.
- If the folder was moved, renamed, unplugged or deleted, Reconnect cannot find it: open it from its new place, and close the old row.
- An **imported** folder is a copy in the browser's storage, so it never shows as Locked; missing songs mean the copy or the site's data was removed.

## An import failed, or there is no space

An import copies files into the browser's storage, bounded on purpose:

- **512 MB per import**, and **16 MB must remain free** afterwards, so a nearly full browser refuses rather than fills.
- A selection with nothing importable — no chart, no `.sng` package — says so.
- A browser that cannot store files says so; use **Open a folder** where available, or add a playlist by URL.
- A failed copy keeps **nothing**, and an earlier copy stays readable. Importing again makes a new generation and deletes the old one only when the new is complete.
- **Close folder** deletes the copy; your originals are untouched.
- To make room, remove downloads you no longer play, close finished imports, or clear this site's data; the last also removes settings, scores, the band and every other stored file.

## A download failed

- **The button only appears when the game's worker is in control**: a secure address (`https` or `localhost`) with an active worker, perhaps after a reload. The installed game has it.
- **A download is all or nothing.** A failure, cancellation or full device removes everything it wrote. A quota message means there is not enough room: remove downloads, or clear this site's data, then try again.
- **YouTube-backed songs cannot be downloaded**, because their sound is the video player; a local folder is already on the device.
- **A playlist's save** stops at a full device and leaves the songs it kept; the failed song is named, and **Cancel** stops the queue.
- If a downloaded song plays online but not offline, the browser may have evicted it. The Downloads manager warns when storage is unpromised; download it again before you need it.

## A playlist will not load

- **It must be a full `http://` or `https://` address with a host**; a bare domain or a path alone is refused with a reason.
- **An `http` playlist on this `https` page is blocked** as mixed content; use `https`.
- **The host must allow cross-origin requests.** The page fetches the playlist and its documents, so the server needs the right CORS headers; a server that serves a browser tab but not the game is the usual cause.
- **There are size caps.** A document — playlist, song or chart — is capped at 8 MB, and a `.sng` package at 128 MB. A URL pointing at a video will not read.
- **A playlist is read as a playlist.** A document that is not one comes back empty, with the problems listed rather than a crash; refresh after fixing it on the server.
- **A playlist you added is refreshed only when you ask**; **Refresh** and **Refresh all** do nothing behind your back.
- **The built-in library can be disabled.** If its songs have vanished, press **Enable** in Playlists; if no playlist is left, **Add the default playlist** puts it back.
- **Duplicate songs are kept once**, from the first playlist that listed them; a song missing from the second is not a fault.
- **An on-demand playlist** needs at least two characters and answers only while reachable. A failed search is said under the field with **Try again**.

## A song offers no chart for my instrument

- **The song may not have that part.** The jukebox row says what a song offers, and the band screen hides modes it has no chart for.
- **The chart may have failed validation.** One that fails the checks is dropped and named as `instrument/difficulty: problem` on the band and loading screens; that costs its part, not the run.
- **A local folder may need a rescan.** Press **Reconnect**; a missed file is picked up.
- **A remembered band can ask for a role or level the song lacks.** The game uses the nearest level, and a seat with no role takes the lead guitar; with no guitar, the box says **not in this song**.
- **“No chart for this instrument” on the stage** means the chart did not arrive. Go back to the band screen, which names the problem.

## The microphone prompt, or no vocal scoring

- **The prompt appears when Vocals is chosen**, or at **Play** if a singer was remembered. It is never asked on page load.
- **Declining is allowed.** The seat becomes the machine, the score rail says `auto`, and the run goes on unscored. To score, allow the microphone and start again.
- **Check the browser's site settings** if permission was refused: allow the microphone, then choose Vocals or press Play again.
- **Check the system input.** A microphone muted in the operating system, a headset with a hardware mute, or the wrong device all read as a singer who never arrives.
- **One microphone serves every singer**; a seat the machine covers stays the machine's.
- **A lyrics-only song has no singer score**, and a song with no vocal part cannot seat a singer: the band screen does not offer Vocals for it.
- **The microphone listens only while the song moves.** A pause stops judging and resuming starts it; a seek starts the listening trail clean, so a practice loop must be sung again.
- **Freeform words are judged on delivery, not pitch**, and the roll says so while one is delivered.
- **A quiet voice close to the microphone detects better than a loud one across the room**; headphones with the guide vocal on keep the song's voice out.

## MIDI is not listed

- **Access is asked for on a gesture only** — choosing **MIDI** in a seat's gear, or starting a learn session. If the browser has never prompted, the seat has not asked.
- **A remembered MIDI seat is silent until you press MIDI again**; a browser cannot restore access without a press.
- **The gear names the inputs it can see.** If the list is empty, plug the kit in, turn it on, and press a key or pad; then reopen the gear.
- **A refusal keeps what the seat had**, and it never quietly becomes the machine; choosing **MIDI** again asks.
- **A kit's pads may not follow a standard map.** **Set it up** learns the controls one at a time, including a control change if the pedal sends one.
- **A browser without Web MIDI says so**; the keyboard and a gamepad still work.

## The scores seem to have gone

Scores are local, so they live and die with this browser's storage.

- **The board is per song and per lineup.** The jukebox's line is this band's best — the same instruments at the same levels, with the words sung or typed the same way. The history beneath is the song's across lineups, so an Expert score can sit above an Easy one without being that band's best.
- **Some runs are never saved.** Practice, Listen, the attract demo, a lost run and a stage that judged nobody do not reach the board.
- **A run is lost** when the band hit fewer than half of at least ten judged notes or words; it is a verdict on the results screen, not a mid-song fail.
- **Private browsing and cleared site data remove the board**, with settings, band, imports and downloads.
- **A new scoring model starts a new board**, so an update that changes scoring does not compare old with new runs.
- **Importing a profile replaces the board**; there is no merge. **Export a profile** if the scores matter: it survives clearing the browser.

## The Android app

The Android app is a separate project: it loads the game-only entry in its WebView and keeps its own offline cache, and its storage is its own, so settings, band and scores in the app are not the browser's and the other way round.

- A link opens the app when Android has verified the App Link, or when it uses `everythingstar://`; a link that opens the browser means the App Link is not verified.
- An old build stays old until the app is updated; the website does not install or update it.
- A song downloaded in the app is available to the app, not the browser, and bugs belong in its own repository.

## Where to report a bug

The game's issues are at **https://github.com/HappyPaul55/everythingstar/issues**. A useful report says:

- what you did and what happened instead;
- the browser and version, the operating system, and whether the game is installed;
- the build label on the welcome screen;
- the song and playlist, if one song is the problem — a public URL is enough;
- whether it happens with another song, browser, or after a reload.

Do not paste a private playlist URL, a password or anything else you would not publish.

If you think you have found a **security** problem, do not open a public issue. The security policy is at **https://github.com/HappyPaul55/everythingstar/blob/main/SECURITY.md**, and it says how to report one privately.
