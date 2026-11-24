---
title: Playing together
description: "Host a room on a laptop or TV and let phones join as extra guitars, drums, singers or typists. The host plays the sound; the phones play the game."
updated: "2026-11-24"
order: 12
---

**Play together** is the same stage for more people than one keyboard can hold. One device — a laptop, a TV or the arcade — is the **host**. It keeps the song, the speakers and the score. Everyone else joins from a phone or another computer, gets one seat, and plays that seat on their own screen.

It is built for a **room**, not the internet: the host's speakers are the music. A phone does not stream the song; it receives only the notes for its own seat and plays its own feedback sounds.

## Hosting

1. On the host, open **Quick Play → Songs**, pick a song and go on to the band. Any song the host can play works — a playlist, a folder, a download, a `.sng` package or a YouTube-backed song.
2. Press **Invite players** on the band screen. The room code, join link and QR code appear in a modal over the band.
3. Share the **code**, **link** or **QR code**. On a phone, open the link, scan the QR or type the code; it is six letters and numbers and is not case-sensitive.
4. Each player takes a seat and chooses what they play. The seat appears on the host's band as a remote box, beside the host's own boxes.
5. When every phone says **Ready**, close the modal and press the band's **Play**. The host can remove a player who has left from the same modal, and the invite button stays on the band so the code can be shown again.

The host needs the song's charts and its sound. Guests need neither the playlist nor the audio: the host sends each seat the notes it will judge.

## Joining

Open the join link, or go to `/join?room=CODE`. The site opens on the join page, with the same header and footer as the rest of EverythingStar and one form in the middle; enter your name and press **Join the room**. The page then hands the screen to the game. Choose a free seat. What can be played is the song's own offer, exactly as it is on the host's band screen.

- **Instruments** are tapped on the pads, or played with a keyboard, a gamepad, a MIDI keyboard or a kit.
- **Vocals** use the phone's microphone. The room's speakers are the music, so a singer should stand away from them; echo cancellation is on for the room's microphone.
- **Typing** needs a physical keyboard. The game never draws one.

The phone shows **Phone settings**: volume, room sync, picture lag, note speed, tap pads and haptics. A self-hosted room over plain HTTP cannot use a phone microphone — browsers require HTTPS (or `localhost`) for that; instruments and typing still work. **Room sync** is how late this phone hears the host's speakers; the default is right for most rooms. Picture lag is the phone's own display calibration.

## Sound and feedback

The **host's speakers** play the song. A phone's own speaker plays only its player's feedback — a missed note, a part going out, a hero note, star power and the ×4 streak cheer. That is deliberate: the room hears the song, and each player hears their own mistakes and celebrations close to them.

A phone should stay awake and on this screen during a run. A phone that loses the room holds its last host clock for a moment and then freezes; the host's run continues, and a reconnect asks the relay for the room again.

## Listening together

**Invite listeners** is the same modal in the **Jukebox**. The host's speakers play the music; phones see what is playing and the queue, search the room's library, add songs, play now or next, remove queue entries, and add a playlist or song URL to the room's library. The host can clear the queue or close the room.

A listening room shares **only songs from URL playlists** — the FOSS library, YouTube-backed songs, downloads and pinned songs. A song from a local folder or an OPFS import has no address another device can fetch, so it stays on the host's device and is not in the room's library.

## When a room will not start

- **The room service is not available** — the host is serving a static build with no room server, or the room server is down. Solo play is unaffected.
- **Waiting for the chart** — the host is still loading the song or sending this seat's notes. The host presses Play again when the song is ready.
- **Waiting for the host** — the room is paused, the host's tab is hidden, or the host is changing the song.
- **The phone hears the music late** — open **Phone settings** and raise **Room sync** until the notes and the room's sound line up.
