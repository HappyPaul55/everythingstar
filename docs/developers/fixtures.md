---
title: Fixtures and dev tools
description: "The fixture library the tests read back, the dev panel that drives the stage, and the rules that keep a twelve-minute song cheap."
updated: "2026-10-28"
order: 15
---

## The fixture library

`src/lib/game/mock/` is a **fixture generator**, not content. `mockLibraryFiles()`
writes 36 songs out as the three documents the game reads — a solo and a duet, a
lyrics-only song, one rated hard-only, one twelve-minute song that exercises the
mounted window, and every pairing of two word lists spread through the list so the
A–Z index has something to index. The tests read it back, and it is the shape a real
library serves; the site ships the FOSS library instead. A **simulated player**
(`simulate.ts`) hits about 92% of the notes with a little jitter and drops the rest,
seeded so the same run always plays out the same way.

## The dev panel

What moves: the notes fall to the hit line and flash on a hit or turn red on a
miss; in the keys view the words slide under the pitch bars and the word being sung
lights up — and in a duet each part has its own row, so each player follows their
own part while the line they are waiting for fades up ahead of them; in the lyrics
view the lines advance with the word being sung picked out (a typist's characters
fill in as they type); the piano roll's bars stop short of the next note so quick
notes stay distinct, and a note two parts share is one bar in both their colours;
and every panel's score, combo and meter follow its own run, with every singer and
typist scored on their own too.

The `Dev` chip drives it — the transport, the scrub bar, the read-outs, and the
screen jumper. A song plays from the jukebox through the band screen; the band screen
is where a player finds their keys, and the stage's entrance is the band's own hype and
slide. Escape or Start pauses.

**The pause is where the run's own settings are.** Besides resume, start again and
leave, it carries a compact **quick panel** — how fast the notes come, how late the
sound is, and the song's **guide vocal** when somebody is singing — because those are
comforts a player wants mid-song without a page in between. They are the Options
settings, read and written through the same session, so the two can never disagree.
**Practice this section** opens the practice dialog seeded with the stretch the
playhead is in (at the record's speed, once through), while the plain Practice button
still chooses the stretch and the speed from the top.

## How the stage stays cheap

Twelve minutes is roughly 7,000 notes across a band, so rendering them all and
re-rendering every frame would not do:

- **One animation frame loop** for the stage (`StageClock`). Components that
  follow the playhead subscribe and write to the DOM themselves, so nothing
  re-renders on a frame.
- **One transform per highway per frame.** The notes hold their places and a
  single translated layer carries them, so a frame costs a few style writes
  however long the song is.
- **A mounted window.** Only the notes near the playhead are in the DOM at all
  (about 14 per panel), re-based every couple of seconds — measured at 14 per
  panel eleven minutes in, exactly as at the start.
- **An incremental run.** Judging walks a cursor through the chart, so the cost
  is proportional to the notes played, not to the length of the song.

Those are the rules the real stage keeps; `run.ts` (the run and the timeline) and
`scroll.ts` (the axis maths) are the parts to keep.
