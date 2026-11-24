---
title: Playing together
description: "Host a room on a laptop or TV and let phones join as extra guitars, drums, singers or typists. The host plays the sound; the phones play the game."
updated: "2026-11-24"
order: 12
---

**Play together** is the same stage for more people than one keyboard can hold. One device — a laptop, a TV or the arcade — is the **host**. It keeps the song, the speakers and the score. Everyone else joins from a phone or another computer, gets one seat, and plays that seat on their own screen.

It is built for a **room**, not the internet: the host's speakers are the music. A phone does not stream the song; it receives only the notes for its own seat and plays its own feedback sounds.

## Hosting

1. On the host, open **Play together** from the main menu.
2. Choose **Play together** or **Listen together**.
3. Pick a song from the host's library. Any song the host can play works — a playlist, a folder, a download, a `.sng` package or a YouTube-backed song.
4. Share the **room code** or the **join link**. On a phone, open the link or type the code; it is six letters and numbers and is not case-sensitive.
5. Each player takes a seat and chooses what they play. The host can remove a player who has left.
6. When every phone says **Ready**, press **Start the song**.

The host needs the song's charts and its sound. Guests need neither the playlist nor the audio: the host sends each seat the notes it will judge.

## Joining

Open the join link, or go to `/join?room=CODE`, enter a name and press **Join the room**. Choose a free seat. What can be played is the song's own offer, exactly as it is on the host's band screen.

- **Instruments** are tapped on the pads, or played with a keyboard, a gamepad, a MIDI keyboard or a kit.
- **Vocals** use the phone's microphone. The room's speakers are the music, so a singer should stand away from them; echo cancellation is on for the room's microphone.
- **Typing** needs a physical keyboard. The game never draws one.

The phone shows **Phone settings**: volume, room sync, picture lag, note speed, tap pads and haptics. A self-hosted room over plain HTTP cannot use a phone microphone — browsers require HTTPS (or `localhost`) for that; instruments and typing still work. **Room sync** is how late this phone hears the host's speakers; the default is right for most rooms. Picture lag is the phone's own display calibration.

## Sound and feedback

The **host's speakers** play the song. A phone's own speaker plays only its player's feedback — a missed note, a part going out, a hero note, star power and the ×4 streak cheer. That is deliberate: the room hears the song, and each player hears their own mistakes and celebrations close to them.

A phone should stay awake and on this screen during a run. A phone that loses the room holds its last host clock for a moment and then freezes; the host's run continues, and a reconnect asks the relay for the room again.

## Listening together

**Listen together** turns the same room into a shared Jukebox. The host's speakers play the music; phones see what is playing and the queue, search the host's library and add songs. A guest can also add a playlist or song URL to the host's library. The host can clear the queue or close the room.

## When a room will not start

- **The room service is not available** — the host is serving a static build with no room server, or the room server is down. Solo play is unaffected.
- **Waiting for the chart** — the host is still loading the song or sending this seat's notes. The host presses Play again when the song is ready.
- **Waiting for the host** — the room is paused, the host's tab is hidden, or the host is changing the song.
- **The phone hears the music late** — open **Phone settings** and raise **Room sync** until the notes and the room's sound line up.
