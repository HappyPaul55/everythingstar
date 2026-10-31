---
title: Singing
description: "Singing in EverythingStar: the microphone, the guide vocal, how notes are judged, duets and what is never recorded."
updated: "2026-10-31"
order: 5
---

Vocals is karaoke on the same stage. Choose **Vocals** for a words player on a pitched song, and the melody appears as a piano roll with the words beneath it. You sing into a microphone, and each note is judged on how much of its own length you held in tune.

[A singer's stage: note bars on a piano roll with the words under them, and the singer's score and combo on the rails.](shot:singer)

## Choosing Vocals, and the microphone prompt

Vocals is chosen on the band screen, in the words player's box. The microphone permission is asked **there** — at the press that chooses Vocals, or at **Play** if a singer was remembered — and never when the page loads.

If you allow it, the run opens the microphone when the song starts. If you decline, the seat is played by **the machine**, the score rail says `auto`, and the run goes on: declining is a valid way to play, not an error.

The game asks with a stream it immediately stops: permission, not listening. The microphone is opened only while the song moves — not on the band screen or over the results — so the recording indicator goes out with the song.

## One microphone, every singer

There is one microphone between all the singers. A seat is judged from it only if it has the microphone; a seat the machine covers stays the machine's. A duet therefore has two runs, scores and combos from one microphone, and a word both singers sing is judged for each independently.

## The guide vocal

**Guide vocal** is in [Options](options.md#guide-vocal), off by default. Off is karaoke: you are the voice, so the song's own vocal stems are not loaded where it has them. On keeps the song's voice under you — the only way to hear your part drop out on a miss and return on a hit. A typist and Listen always keep it, and a song shipped as one master has no separate vocal to remove.

## How a note is judged

A note is judged on **how much of its own span was held in tune**, not on one sample at its beginning, which is what makes singing feel fair:

- Joining a long note late and correcting it still lands it; starting in tune and drifting off does not.
- The game listens a little before and after, because a singer arrives early or late and the detector needs a moment to lock on.
- A consonant holds the cursor rather than making the voice blink out.

**Octaves are ignored**: a lower voice singing the same note an octave down is singing the same note. The level sets how far from the pitch you may be; Easy is the most forgiving and Hard the least. Singing always carries the first three levels, because the tolerance is the microphone's rather than the song's, even when the instrument charts are Expert-only.

A **freeform** word — spoken or rapped, with no pitch — has no note bar. It is graded on being delivered, and the roll says so while one is being delivered.

A miss resets the singer's combo and takes the vocal part out for a moment, exactly as an instrument's miss does: the stem drops to a tenth of its level and comes back on the next hit, or at the end of the line if the song holds it that long. With the guide vocal off nothing ducks, but the miss is still a miss.

A **lyrics-only** song has no singer score: its words are typed in free play and Listen is the unscored read-along — [Typing](typing.md) covers it.

## Duets and harmonies

A melody can carry up to **three parts**, each with its own colour and row of words, so two singers on different lyrics are both legible. Where two parts land on the same note at the same moment, it is drawn as **one bar split between the two colours**, not two notes stacked.

[Two singers' words in two colours on one melody, each part with its own row of words.](shot:duet)

If there are more singers than parts, the parts are shared: a fourth singer doubles a part rather than becoming a colour the palette cannot tell apart. A shared line appears in both singers' rows, and each of them sings and is judged on it.

## Pause, resume and practice

The microphone listens only while the song is moving. A pause stops judging and lets the browser's indicator go out; resuming opens it again. A seek starts the listening trail again, so the previous pass's voice cannot land the next section's first note — in [practice](practice.md), a looping stretch starts each pass clean and the top note has to be sung again.

## Nothing is recorded

The microphone's samples are analysed in the page by the pitch detector and then dropped. Nothing is recorded, stored or sent anywhere — not to this site, and not to anybody else. The game has no server, no account and no analytics.

The full statement, including what the browser's own storage holds, is in the [privacy notice](https://everythingstar.happypaul55.com/privacy).

## Practical notes

- A microphone the browser can see is enough; a headset's works.
- With the guide vocal on, headphones keep the song's voice out of your microphone.
- Permission can be changed in the browser's site settings; if refused, choose Vocals again — or press Play with a singer on stage — and the browser can ask again.
- A song with no vocal part cannot seat a singer.
