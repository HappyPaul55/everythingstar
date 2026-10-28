---
title: Accessibility
description: "What EverythingStar does for keyboard, screen reader, gamepad, motion and low-vision players, the settings that change how it plays, and the limits to know about."
updated: "2026-10-28"
order: 5
---

EverythingStar aims at **WCAG 2.2 AA**. It has not had a third-party audit, so
this page says what is built and where the limits are rather than claiming
conformance.

## Moving around the game

- **Every screen puts focus where it starts.** Arriving at a screen places focus on
  the control that screen begins with — Quick Play on the menu, the song row a
  player left when they come back from the band — and announces the screen's name
  in a live region, because a single island has no page load to announce itself.
- **A gamepad drives the same focus as the keyboard.** The D-pad or left stick
  moves, A confirms, B goes back and Start pauses. There is no second cursor: a
  pad, a keyboard and a screen reader always agree about what is selected. While a
  song is moving, the pad belongs to the players and only Start is read.
- **Overlays are native dialogs.** Each one traps focus while it is open, closes on
  Escape and returns focus to the control that opened it. When one opens over
  another, the top one takes the pad's cursor and the Escape key.
- **Escape is back** — out of a dialog, off a screen, and out of a run (where it
  pauses). In fullscreen the browser keeps Escape for itself, so leaving fullscreen
  pauses the run instead of dropping the player into a moving song. A text field
  keeps its own Escape: the jukebox's search clears rather than leaving the screen.
- **The marketing and notice pages are plain and work without JavaScript.** They
  have a skip link, real landmarks and a mobile menu built from `<details>`. The
  game itself is one React island and does need JavaScript.

## Seeing and hearing it

- **Focus is always visible.** A 3px ring, ink on paper and cream on the stage,
  drawn for a gamepad as well as for <kbd>Tab</kbd> — the game moves the real focus,
  so the browser's ring follows — and handed to the system's own colour in
  forced-colours mode.
- **Reduced motion is honoured.** With `prefers-reduced-motion: reduce` the site
  cuts animations and transitions to an instant: the stage's entrance does not
  slide, a hit's burst holds a still glow instead of flashing, and the room's drifting
  lights stop.
- **Text scales.** The pages are set in rem units, so the browser's own text size
  and zoom apply. Inside the stage, type is sized from the panel it sits in, so it
  grows with the stage rather than with the root font size.
- **A note is never told apart by colour alone.** Its column is also its position,
  and each instrument's kit gives it a glyph; the note style can be bars, gems or
  arrows. The five fret colours are the one deliberate exception — players know
  them — and the column still carries the meaning.
- **Targets are large.** Controls on the site's pages and on the game's screens
  keep a 44 px minimum; on the highway a tap takes the whole column at the line, so
  a thumb has a generous target.
- **Nothing essential is sound-only.** Every cue is feedback beside the picture,
  and the picture says the same thing — a note is drawn, a part's meter is drawn, a
  screen is named in text.

## Settings that change how it plays

Options, off the main menu, holds the adjustments that matter most; the pause menu
carries the three a player reaches for mid-run (note speed, audio lag and, when
somebody is singing, the guide vocal).

- **Audio lag** — the offset between the sound and the judgement, by stepper or by
  the **Sound** calibration: eight taps on a beat, and the median becomes the
  setting.
- **Picture lag** — the same for a display that is late, by stepper or by the
  **Picture** calibration, which crosses a marker over a line on twelve beats.
- **Volume** — a master fader and separate music, ambience and sound-effect levels.
  The master never reaches silence.
- **Note speed** — how much of the song fits on the neck. Drawing only: the same
  note is hit at the same moment at any speed.
- **Highway view** — flat or in perspective, and **note style** — bars, gems or
  arrows.
- **Backdrop** — whether a song's own video or art plays, how far it is dimmed, and
  whether the room's drifting lights are drawn at all.
- **Guide vocal** — whether the song's own vocal stays under a singer.
- **Crowd** — whether the room is heard while a run is paused.
- **Tap markers** — whether a hit marker is also a control, which is how a phone
  plays a highway.
- **Haptics** — whether a miss and a spent star power buzz the device or rumble a
  pad. Off is silent.
- **Keep the display awake** — whether a run holds the screen on. Off leaves the
  device's own timeout in charge.

None of these changes the chart: a note is due at the same moment in the song
whatever the speed or the view, and the two lag settings only line the sound and
the picture up with it. A buzz or a held screen is never read back into a score.

## Limits

These are honest boundaries, not a list of things that will arrive.

- **The highway is a visual game.** Notes fall towards a line and are hit as they
  cross it. There is no audio-only mode, and nothing announces which column is
  coming: the song and the part ducking out are feedback, not instruction. A player
  who cannot see the highway cannot play it as intended.
- **A screen reader can operate the site and the game's menus** — the welcome, the
  menu, Options, the jukebox, the band screen, the dialogs and the results — but
  the falling notes themselves are not described.
- **Singing needs a microphone.** Typing the words is the keyboard alternative, and
  it keeps its own score, chosen per player on the band screen.
- **Reduced motion cannot stop the notes**, because their movement is the game. It
  removes the decoration around them.
- **No third-party audit has been done.** Automated checks (axe) run in the test
  suite over the pages and screens it drives, but automation only finds what
  automation can see; the judgement calls are in
  [Design and accessibility](../developers/design.md).

## Reporting a barrier

If something here stops you playing, say so:

- open an issue at
  [github.com/HappyPaul55/everythingstar/issues](https://github.com/HappyPaul55/everythingstar/issues),
  or use the contact details at [happypaul55.com](https://www.happypaul55.com);
- say what you were doing, your browser and operating system, what you play with
  (keyboard, gamepad, MIDI, microphone, touch) and any assistive technology you
  use;
- mention any setting you had changed — the audio or picture lag, the note speed,
  the view — because those change what is on screen.

Reports about **focus, contrast or motion are treated as bugs**, not preferences.
A change that regresses one is sent back in review.

This page was last reviewed on 28 October 2026.
