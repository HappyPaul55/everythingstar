---
title: Gotchas
description: "The traps that no test or owning page catches: the clock, judging, the highway, input, the library's failure modes and the few parser edges."
updated: "2026-11-03"
order: 3
---

Most rules live with the area that owns them: the loop and the stage in
[Architecture](architecture.md), the mixer and manifest in [Audio](audio.md), the cache,
folders and records in [Libraries](library.md), the gates in [Testing](testing.md) and
the look in [Design](design.md). This page is the residue — the traps a test cannot
state, or that have caught us more than once.

## The clock

- Everything timed reads `StageClock.timeRef`; the playhead never goes into React state.
  One loop owns the frame; a component subscribes and writes to the DOM. Do not add a
  `requestAnimationFrame` loop per component, and do not count frames with a second loop
  to watch the first.
- One cadence per panel. A read-out that moves every frame writes a transform, never
  `top`/`height`. The clock only moves forward: `elapsed` clamps at zero, and a time at or
  before zero is a start, not a rewind.
- Never hand a run an array or object rebuilt in a render body. The stage re-renders on
  every tick, so a new identity restarts the hook keyed on it — that is how typing became
  impossible to finish once. Memoise, and key on what it means (`players.join(",")`);
  `useLaneRun` takes numbers and a chart and nothing else.
- Input is stamped with `event.timeStamp` projected onto the audio clock, never with the
  previous frame's playhead. A gamepad is the exception: its state is polled, so it takes
  the frame.
- A press counts only while `clock.playing`; a release always lands, so a fret held
  across a pause is still let go. The screens own the keyboard outside a run.
- A run cannot be resumed. There is no playhead to restore; a reload starts at the
  welcome with the library, band and scores read back. The remembered band is plain
  data (`BandPlan`), never a live session.
- Screens are session state, not routes. `src/lib/game/screens.ts` is the only place
  that says where an event leads; no hash and no history entry. The current screen is
  mirrored on `html[data-screen]` for the native shell's wake lock and for styling; it is
  a read-out, never an input.

## Judging

- Judging is per player, and nothing reads another player's published state. Feedback
  (sound, haptics, a part ducking) is read from a run's numbers; it never feeds back into
  judging.
- A note is judged once its own span has passed, not at its onset. A long note is scored
  on what was held across it; a singer who starts wrong and corrects still lands it.
- Every player on a note gets their own verdict. Two singers sharing one bar judge
  independently — a shared bar is one note, but each singer's pitch is judged separately,
  and the roll draws `is-mixed` rather than letting the first speak for both.
- A lost run is a verdict and is not saved. `bestFor` refuses a failed run; each line
  records its difficulty and the score board is keyed by **song**, compared by
  `lineupKey`. The board is local by decision — the shape a real one will arrive in.

## The highway

- A held note's **head** is the bottom of its span, so the tail is what scrolls out under
  the line. A hit leaves the neck with a burst; a hold is the exception.
- Highways scroll by transform, never by re-positioning notes: notes sit at fixed
  percentages and one translated layer carries them. The transform and the mounted window
  change basis together, or the notes jerk by the difference.
- Only the window is mounted. A sustain stays mounted while any of its tail is in the
  window, and a chord's neighbour stays whole; mounting one part of a moment is how a
  long hold vanished and a held chord came apart. Notes memoise on identity, state, hold,
  hint and box, so the clock tick does not reconcile a thousand spans.
- A **slide is a link**, never a note kind. Do not add `tap` or `slide` to the kinds; the
  touch gesture is a control, not a chart note.
- Solo stays solo. A shared bar is one note; pitch is `rootMidi + row` and octave
  insensitive; a bar never runs into the next note.

## The stage

- `/play`'s header and stage share the first viewport; fullscreen is `100dvh` with
  safe-area insets except the bottom, which is deliberately omitted. The stage uses
  `overflow: clip`, not `hidden`, and its scrollbars are thin and scoped.
- The melody region has no panel back: it is see-through by design.
- The backdrop ladder is the song's video, then its art (blurred), then the game's own
  room; the dim and the drifting flares are settings, not parts of the ladder.
- A box answers for its own width. `.slot` is a container and its pickers stack by
  `@container`; do not size a box's insides with a media query. The one-column phone
  rule is the exception that proves it.
- The jukebox builds after the first paint: only the window is mounted, and the rows
  arrive after the loading line has drawn.

## Input and focus

- One `keydown` listener, in `StageControls`. Bind by `code`, not `key`, so a layout
  travels; text fields keep the operating system's keyboard.
- A control already spoken for is refused, not silently rebound. A learned mapping is
  per seat; changing an instrument forgets the controller, changing the role keeps it.
- Focus starts on the screen's marked root, and nothing inside the stage is scrolled into
  view. Dialogs stack in order, the opening key owns Escape, text fields keep Escape, and
  Escape during fullscreen pauses.
- The pad drives real focus: D-pad or left stick moves, A selects, B backs out, Start
  pauses. It is not a second cursor.

## Audio

- A miss ducks that part, never the master. The master never reaches zero: its floor is
  `AUDIBLE_FLOOR`, because a media element at volume 0 leaves the browser's audio clock.
  Duck by gain, never `pause()`.
- A stem is on the song's clock. A read behind the playhead is ignored, and an `error` is
  a report of a part going out, not a second miss.
- One hype per part, panned across the stage. There is no `count`/`go` cue; the entrance
  is the count-in. The whammy spends a full meter and adds no score.
- A silent song is diagnosed, not guessed: `data-stems` (what the song asked for),
  `data-sources` (what the browser got), `data-unreadable` (local stems it would not hand
  over), `data-file` on each element, and `audio/diagnostics.ts` for the rest. "No audio
  named", "half the stems unreadable" and "there and silent" are different sentences.
- YouTube is a **reference, not a clock**: the stage's one frame loop advances
  `youtubeClock.ts` between the player's reports and corrects when one lands; nothing is
  extracted or served.

## Library and fetch

- A failed key read is not an empty cache. `keysIn` returns `null` and the trim does
  nothing; folding a rejection into `[]` once deleted the whole cache.
- A `200` is not a document. Only JSON may replace a saved copy; a captive portal is HTML
  with a JSON URL, and the copy the player already has is better than that.
- An entry is a summary; the song wins. An entry's **revision** invalidates the cached
  document — it is how an edited entry is noticed under the same URL.
- Every fetched number has a ceiling: a document is 8 MB, a package 128 MB, and a note's
  time and length are bounded. A number from a document is untrusted input.
- A folder is a song only if it is one. A remembered folder whose charts or stems were
  read by an older build is repaired from the folder once per `FOLDER_SCAN_VERSION`;
  Reconnect always rescans. A record that names no audio is not a playable song.
- Imports are copies in OPFS, never a moved folder: `imports/<id>/`, a generation rather
  than an overwrite, 512 MB per import and 16 MB left free. A `.sng` is a package, not a
  chart format; its members are masked and bounded by the 128 MB package ceiling.

## Sources and formats

- MIDI **running status** is for channel messages only: a meta or sysex event ends it.
  A parser that carries running status across one reads the next bytes as a note.
- The other format rules live in [Formats](../charters/formats.md) and
  [Folder layout](../charters/folder-layout.md): `.chart` tempo is thousandths of a BPM,
  UltraStar has its own scale and `//` is a comment only after whitespace, StepMania
  plays `*-single` modes, and lyrics arrive as syllables until `lyricLines.ts` joins them.
- A folder's chart order is fixed; `findChartName` is the one table. `T1 GEMS` is a
  chart, not a lyric.

## Assets

- Every `url()` for a stage cursor ends in a keyword fallback, and every cursor SVG has
  its own width and height. The OG card is re-rendered from `scripts/og-card.html` and
  `OG_IMAGE_VERSION` is bumped when the picture changes.
- The build writes `.html` files (`build.format: "file"`, `trailingSlash: "never"`), and
  every internal link is written without the extension.
- The stage's three radius tokens, self-hosted fonts and generated icon set are the
  look's rules; [Design](design.md) owns them. The five fret colours are one order,
  shared by the highway and the pads, and the accent belongs to the vocals.
