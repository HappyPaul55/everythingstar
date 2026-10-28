---
title: Singing
description: "Singing in EverythingStar: the microphone, the guide vocal, how notes are judged, duets and what is never recorded."
updated: "2026-10-28"
order: 5
---

Vocals is karaoke on the same stage. Choose **Vocals** for a words player on a song that carries pitch, and the game shows you the melody as a piano roll with the words beneath it. You sing into a microphone; the game listens to the pitch, and each note is judged on how much of its own length you held in tune.

![A singer's stage: note bars on a piano roll, the words under them, and the singer's score and combo at the top right.](../screenshots/desktop-vocals.webp)

## Choosing Vocals, and the microphone prompt

Vocals is chosen on the band screen, in the words player's box. The microphone permission is asked **there** — at the press that chooses Vocals, or at **Play** if a singer was remembered from an earlier visit. It is never asked when the page loads.

The prompt is the browser's. If you allow it, the run opens the microphone when the song starts. If you decline, nothing is broken: the singer's seat is played by **the machine**, the score rail says `auto`, and the run goes on. Declining is a valid way to play, not an error.

The game asks for permission with a stream it immediately stops. That is permission, not listening. The microphone is opened for the run only while the song is moving — not on the band screen, not over the results — so the browser's recording indicator goes out with the song.

## One microphone, every singer

There is one microphone between all the singers. Each singer's seat is judged from it only if that seat has the microphone; a seat the machine covers stays the machine's however loud the room is.

A duet therefore has two runs, two scores and two combos from one microphone. A word both singers sing is judged for each of them independently, from the same pitch. That is what two singers are.

## The guide vocal

**Guide vocal** is a setting in Options, and it is off by default. Off is karaoke: you are the voice, so the song's own vocal stems are not loaded where the song has them. On keeps the song's voice under you, which is the only way to hear your own part drop out when you miss and come back when you hit.

A typist, and Listen, always keep the guide vocal. The setting is about a singer replacing the voice, not about removing it from the song. A song shipped as one master has no separate vocal to take out, so the setting has nothing to remove there.

## How a note is judged

A note is not judged on one sample at its beginning. It is judged on **how much of its own span was held in tune**, which is what makes singing feel fair:

- Joining a long note late and correcting it still lands the note.
- Starting in tune and drifting off does not.
- The game listens a little before and after the note, because a singer arrives early or late and the detector needs a moment to lock on.
- A consonant holds the cursor rather than making the voice blink out.

**Octaves are ignored.** A lower voice singing the same note an octave down is singing the same note. The level you choose sets how far from the pitch you may be and still be in tune; Easy is the most forgiving and Hard the least. Singing always carries the first three levels, because the tolerance is the microphone's rather than the song's, even when the song's instrument charts are Expert-only.

A word delivered **freeform** — spoken or rapped, with no pitch to judge — has no note bar. It is graded on being delivered, not on pitch, and the roll says so while one is being delivered.

A miss resets the singer's combo and takes the vocal part out of the song for a moment, exactly as an instrument's miss does: the stem drops to a tenth of its level and comes back on the next hit, or at the end of the line if the song holds it that long. With the guide vocal off there is no vocal stem loaded, so there is nothing to duck, but the miss is still a miss.

## Duets and harmonies

A melody can carry up to **three parts**. Each part gets its own colour and its own row of words, so two singers on different lyrics are both legible. Where two parts land on the same note at the same moment, it is drawn as **one bar split between the two colours** — not two notes stacked on top of each other.

If there are more singers than the song has parts, the parts are shared. A fourth singer doubles a part rather than becoming a colour the palette cannot tell apart. A shared line appears in both singers' rows; each of them sings and is judged on it.

## Lyrics-only songs

A song whose words carry no pitch has **no singer score**. Its words are typed in free play, the melody region is the lyrics view, and Listen is the unscored read-along. That is deliberate: there is nothing to judge a voice against, so the game does not invent a score.

## Pause, resume and practice

The microphone listens only while the song is moving. A pause stops judging and lets the browser's indicator go out; resuming opens it again for the rest of the run.

A seek starts the listening trail again, so the previous pass's voice cannot land the next section's first note. That matters most in [practice](practice.md): a looping stretch starts each pass clean, and the note at the top of the loop has to be sung again.

## Nothing is recorded

The microphone's samples are analysed in the page by the pitch detector and then dropped. Nothing is recorded, stored or sent anywhere — not to this site, and not to anybody else. The game has no server, no account and no analytics.

The full statement, including what the browser's own storage holds, is in the [privacy notice](https://everythingstar.happypaul55.com/privacy).

## Practical notes

- A microphone the browser can see is enough; a headset's microphone works.
- If the guide vocal is on, headphones keep the song's own voice out of your microphone, which makes the detector's job easier and yours.
- Permission can be changed in the browser's site settings. If it was refused, choose Vocals again — or press Play with a singer on stage — and the browser can ask again.
- A song with no vocal part cannot seat a singer. The band screen does not offer Vocals for it.
