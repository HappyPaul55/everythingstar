---
title: What is built, and where it stops
description: "The honest state of EverythingStar: every mode that works end to end, the parts that are deliberately out of scope, and what a next version would take on."
updated: "2026-10-28"
order: 20
---

A status page ages; `updated` at the foot of this page is when it was last true. The game's own welcome screen prints the build it is running.

## What works end to end today

- **The loop**: welcome → **menu** (with **options** and **credits** off it) → jukebox →
  band → loading → **stage entrance** → run → pause →
  results, inside one island (no reloads), with the band, the settings and the scores kept
  on this device and a fullscreen session surviving the whole thing.
- **The library**: songs come from **playlists** — JSON files at URLs, seeded once
  with **EverythingStar FOSS** and added by the player — read as the three documents a
  real library will
  serve (a playlist is the index, a song document is what a song is, a chart document is
  the notes), cached in IndexedDB under a shape version with a small metadata index
  beside each body, with a player's playlist re-fetched only on demand. A
  playlist can be **on demand**: the game asks it with `?q=` as the jukebox is searched.
  A song can also name a **YouTube video as its music** (`audio.source: "youtube"`): the
  official IFrame player supplies both the sound and the backdrop, and the stage follows
  its playhead. No stream is extracted or served. An entry can also point its `song` at a
  **`.sng` package**, which the game opens when the song is chosen.
- **Local imports**: a browser with no File System Access picker (Safari, Firefox) can
  still take **files or a folder**, through the Playlists dialog or a drop. The files are
  **copied into this browser's own storage** (the Origin Private File System, up to
  512 MB an import) and read by the same folder scanner, so the songs join the library
  beside the playlists — and are still there next visit, without a permission prompt.
- **Offline downloads** (website and native app): the jukebox can save a song — its
  playlist, song document, every chart, every stem, its art and preview — into Cache
  Storage, and the site's own `/sw.js` — or the app's worker — serves them back to media
  elements, byte ranges included, so the song plays with no connection. Both register a
  worker that serves the same `everythingstar-offline-v1` bucket, so the action appears in
  the browser too. A download is one **page-wide job** that keeps going if the player
  leaves the jukebox and can be **cancelled**; a song found through an on-demand search
  is still listed after a reload because the offline records are merged into the library
  last. YouTube-backed songs and songs already in a local folder are refused rather than
  half-saved. A whole **playlist** can be saved from the Playlists dialog with **Save
  playlist offline**: a cancellable queue over the same per-song records, which stops on
  a full device and leaves the songs it already kept.
- **The stage**: a song's charts are fetched for the band that is playing and judged per
  player; words can be sung into a microphone (YIN, judged on how much of each note's
  own span was held in tune) or typed (TypeStar's forgiving rules), with the choice
  made per player on pitched songs.
- **The three ways to play**: **Instruments** on guitar, bass, keys and drums (with
  the pads tapped instead of a strum bar on a phone, lead and rhythm guitars as
  separate seats, and a kick column plus freestyle fills on the drums), **Typing**,
  and **Vocals** (karaoke). All three are complete; the
  [status detail](#status-in-detail) lists the boundaries rather than missing modes.
- **Controllers**: the keyboard (bound by `code`, so a layout travels), a gamepad, a
  **MIDI** keyboard or electronic drum kit, and a mapping a player *learns* control by
  control — which is the only way a plastic guitar or a kit can be set up, since the
  guitars arrive as gamepads and a kit's pads are not standard. A MIDI seat is asked
  for permission only when its owner chooses MIDI or starts setting it up, never on
  load; notes are read in the page and nothing is sent anywhere. Its preset is a
  chromatic run from middle C, which a MIDI keyboard sends with no setup; a kit's
  pads are mapped in the gear. A **strum bar that reports as an axis** is learned like
  a button, and a **MIDI control change** (a hi-hat pedal, say) is mapped like a note.
  The **hit markers are
  controls too**: tapping one plays the note above it, with the tap carrying its own
  strum, so a phone with no keyboard or gamepad can play a highway. The pad is also the
  **menu cursor**: D-pad or left stick moves DOM focus, A selects, B goes back and Start
  pauses. Text fields stay the operating system's keyboard; the game never draws one.
- **Audio** (see **[`audio.md`](audio.md)** for the ids, the contract and the shopping list): menu
  music as a playlist per screen, a whoosh on every screen change, every button, a
  smaller cue when the pointer or focus moves onto a control, the
  typing feedback, **a preview when a song is picked**, a **quiet crowd while paused**,
  an **error when a player's channel goes out**, the combo milestone and hero
  sparkle, the score count-up and star power's spend,
  the **band's own entrance** (one per unique part, panned across the stage) —
  with a manifest, per-file measured trims and credits, four **streamed Ogg/Opus
  menu beds**, and a public-domain crowd loop for the pause. The **menu's** music
  ducks under a sting (the band's entrance is the deliberate exception) and a run's
  own stems never do: a cue is a sound beside the song, not a hand on its fader. The
  master has **music, ambience and sound
  effect families** of its own. Every type has a file; the six stings are a
  **generated chiptune first pass** (CC0) and the four `hype_*` entrances are CC0
  Freesound recordings, all replaceable file-for-file, and
  `audio.md` carries the brief for commissioning better ones.
- **Backdrop**: the game's own artwork on the menus, the song's own video (or its art,
  blurred) on the stage, and drifting flares so the room is not a photograph — and
  whether a song's own plays at all is a **setting** rather than a rule.

- **The charter** (`/charter`): a separate island that opens a song and every
  instrument chart it carries, shows up to eight 2D panes, adds and moves notes with
  the pointer, records a take from the keyboard, a gamepad or MIDI, snaps to a tempo
  grid, and downloads the set as a Clone Hero / YARG `.chart`. It is a tool, not a
  run: no band, no judging, no score, and no write-back to a remote playlist.
The built-in index is read fresh once per visit; a browser seeded with the old local
`/playlist/default.json` is migrated onto it, and `src/lib/game/mock/` stays a
**fixture generator** for the tests.

## Status in detail

What is built in each area, and the boundaries that are deliberate rather than gaps.

**Audio — built**

- **The band loads the song, not the stage.** Opening the band starts the document,
  the charts and the stems; **Play** waits there until every stem the run will use
  reports `HAVE_ENOUGH_DATA` — the browser's "can play through" — and then goes
  straight to the entrance. The button reads **Loading…** with a file count while it
  waits, a failed stem is settled and named under the band, and a wait past 45s offers
  **Play anyway**. On a phone the stems are **primed** with a muted play, because
  `preload` is ignored there until a media element has been played. `StageDirector`
  repeats the readiness check before it starts the clock, so the paths that skip the
  band (the attract demo, a replay) cannot count down against silence either — and
  the same check is released by the player's **Play anyway**.
- **A song plays its own audio, and the clock follows it.** A run plays the `full` mix
  a song document names — **which file that is depends on the chart folder**: one that
  shipped a multitrack plays its parts, one of one or two instruments plays the master
  **and** its parts (the master is the mix with those instruments taken out, so on its
  own it is the song without its guitar). See `AGENTS.md`, and `mixPresetsFor` for the measurements. It is
  **streamed** through media
  elements rather than decoded (or read from Cache Storage when the song was downloaded),
  and the playhead *is* the sound: a frame loop counting
  milliseconds drifts against the music, so `StageClock.followSource` hands the clock to
  the audio and takes it back only when a song has none. Pause pauses the sound, resume
  picks it up, and the audio lag setting now moves the playhead against the sound the way
  it was always meant to. A song read from a folder has its stems read as files and handed
  over as object URLs, like its cover. The stems themselves are held in line **by a rate,
  and seated by one move at a start** (`src/lib/game/audio/drift.ts`: within 18ms alone,
  out of line nudged by at most 2% of speed, and a flam the room can hear — past 40ms —
  seeked once rather than trimmed for seconds; a start waits for every stem to actually
  move and seats them with a single alignment, because a `currentTime` write on a
  starting element restarts its startup; and a stem whose writes never land — a live
  stream — is never written to again, only carried) — and the clock is read from the
  sounding stem **closest to the playhead**, so neither a slow first file nor a part that
  resumed late can pin or drag the rest — while a stem that should be playing but is not
  is seated on the playhead and asked again rather than left silent, and an ended stem is
  never restarted. Every correction — the drift, a pause, a resume — targets the
  **playhead**, never whichever stem the clock happens to be reading, so a pause cannot
  come back with the band behind the notes.
- **A miss ducks the part out of the song.** A run plays `full`, and each part's own
  stems are **ducked while that part is out**: a missed guitar drops away to the
  backing and comes back on the next hit — the song document's own `audioControl`
  rule, read by `src/lib/game/audio/parts.ts` and published one way from the panel to
  `SongAudio`, which sets that element's volume to a **tenth of its own level**
  (`HELD_SHARE`) — never to nothing, because a media element at `volume = 0` leaves the
  browser's audio clock and comes back out of phase, and never `pause()`d, which would
  take it out of the drift as well. Nor is it ever pinned: a ducked stem is on the clock,
  so the ordinary rate rule carries it. The **master is never one of those stems**: it
  has no instrument, so a song shipped as a single file has no channel to drop out, and
  a miss cannot duck the whole song. A stem the run **never plays** — the guide vocal
  under a singer — is not loaded at all (`unplayedStems`), so there is no silent stream
  to keep in step. The registry is **per seat**, so
  two players on one instrument leave the stem down while either of them is out. The
  mapping follows the chart folder's names with one correction: a song with a **bass
  chart but no `bass.ogg`** gives its `rhythm.ogg` to the **bass part** (measured on a
  bass-led test song, that file is the bass), so a missed guitar note leaves the bass
  playing. The **`error` cue
  is the sound of that stop** — it plays the first time a part goes out (not on every
  miss), and on a one-master song it plays too: nothing actually ducks, but the part
  would have gone out.
- **Choosing a song plays it.** Moving onto a jukebox row, clicking it or pressing its
  confirmation key starts that song's **preview**: the chart folder's `preview.ogg`
  clip if it has one, otherwise its **master** from the song's own `previewStartMs` (`previewFor`). A
  song with only parts and no whole mix has nothing to preview — except a `.sng` package,
  whose first audio member is the only sound it has and is better than a silent row — and
  one with no audio at all says nothing. The preview streams through the mixer's **music**
  channel and **loops** until another row is chosen or the jukebox is left; a local file is
  read into an object URL and the previous one released. A **`.sng` package** is held for
  the rest of the visit in a bounded in-memory cache (two packages, 64 MB), so opening
  the band reads the same bytes rather than downloading the package again — a second
  reader in one visit, not persistence. The jukebox has no menu bed behind
  it, so a song with no preview is silent rather than playing the room's music.

**Audio — complete**

- **A miss ducks any player's part, not only a highway's.** A singer's or typist's
  miss now ducks the words' stems through the same `controlledStems` registry, and a
  lead and a rhythm guitar own their own stems instead of sharing one guitar channel.
  `onMiss.restore` is honoured: `next_hit` (the default) or `phrase_end`, which holds
  the part out until the phrase or lyric line it was dropped in has finished.
- **The pause has a crowd.** The mixer holds a bed per channel, so the ambience
  channel plays a public-domain room while the run waits, and nothing else asks for it;
  the jukebox's preview never stops it. There are no applause reactions — a run is the
  song, and the player's own stem is the feedback. The **Crowd** toggle in Options
  turns the pause's room off.
- **Music ducks under a sting.** The three channels have their own levels (Options:
  music, ambience, sound effects), the master sits above them, and a sting dips music
  and ambience rather than the master.
- **The band gets its own entrance.** The stage's first entrance plays one
  `hype_*` cue per unique part — three guitars are one guitar, a singer brings the
  microphone tap, a typist brings none — all starting together and panned evenly
  inside ±25% in band order. It does not duck the song: the entrance is the band
  starting, not a sting over the first bars, and a practice restart does not replay
  it. A run opens on a **quiet beat**: the song's background, the progress bar, the
  score rails and the meter are up first, while the highways and the words stay
  offscreen. Then the hype and the slide begin together — the highways rise from the
  floor, the words drop from the top — and the song waits for the lead, the hype/slide
  and a short breath. There is no 3-2-1 timer and no count tick any more.
- **The run's cues are all wired**: `sparkle` on a hero note, `tick` on the results
  score count-up, and `meter_activate` when a full meter is spent on star power — a lane
  player's whammy buys eight seconds of double score, on top of the combo multiplier.
  The gauge **filling** is silent: it is drawn on the rail, and a swell for it was a
  sound over the song rather than in it.
- **Every type has a file.** The six stings the game was waiting on —
  `win`, `fail`, `best`, `miss`, `type_miss` and `meter_activate` — are
  now a **generated chiptune first pass** (CC0, credited in the manifest), so no cue is
  silent; the four `hype_*` entrances are CC0 Freesound recordings. All of them are
  the part of the sound that is meant to be replaced: `audio.md`
  is the brief, and a better file is a manifest entry rather than a code change. The
  **`error`** cue (`error_1`) remains the sound of a part going out — the first miss of
  a streak — including on a one-master song, where nothing actually ducks.
- **A cue never turns the song down.** The mixer's duck is the **menu bed's** own — a
  sting over `background` music — and a run's stems live outside that graph, so no miss,
  hero note or meter cue can lower the band. That is why `useAudioDucked` is gone rather
  than merely unused: there is nothing left for a cue to publish to the stage.
- **A song's own `crowd.ogg` is not part of its mix.** It is ambience, not a part: the
  game's own crowd bed is the pause's room, and a miss must not be able to silence it.
  An ordinary run plays a song from its start; practice is the exception, and starts
  at its own section.
- The words' guide vocal is a **setting** (Options): off means a singer replaces it —
  the vocal stem is not loaded at all — and on means the song's own vocal stays under
  them. Either way their miss ducks it.

**Songs — built**

- **Real chart sources are read.** `src/lib/game/sources/` translates **Guitar Hero /
  YARG `notes.mid`** (and karaoke MIDI), **Clone Hero `.chart`**, **UltraStar
  `.txt`**, **StepMania `.sm`** and **timed lyrics** (`.lrc`/`.srt`/`.vtt`) into `track.ts`'s
  own shape — the one shape nothing below it knows the origin of. A **`.sng` package** is
  read as the same sources in one container: its metadata is the `song.ini`, its
  `notes.mid`/`notes.chart` is the chart, and its stems, cover and preview are members of
  the package. StepMania **`.ssc`** is read by the same reader (its `#NOTEDATA` blocks
  carry the type and difficulty beside the grid). Every chart in the library the readers
  were built against — **2,056 songs, 16,879 charts and 13.4 million notes** — reads and
  passes `chartProblems`. A chart **fetched at runtime** is held to the same validator:
  a broken chart is dropped and named before the stage, never judged. The
  `.dta`/`.mogg` containers are the one format not read — `.mogg` is an encrypted,
  proprietary audio container — and the stage carries **three voices** by design
  (`MAX_PARTS`), so a fourth harmony is named and shared rather than drawn as a
  fourth colour.
- **UltraStar is read as UltraStar.** Its `#BPM` is quadrupled, pitch is relative to C4,
  `*` is a golden hero note, `R`/`G` are freeform rap (with `G` a hero), `F` is dropped,
  `~`/leading spaces group words, and `#RELATIVE:yes` plus `P1`/`P2` duets work. An
  UltraStar folder chooses `song.txt` and `audio.mp3`/`audio.ogg`, not the `license.txt`
  or the instrumental chart beside them.
- **The collection converts, and a folder plays directly.** `bun run import` walks a
  folder of charts and writes the three documents (`playlist.json`, a song a song, a chart
  a chart) with the audio **referenced rather than copied**; and the Playlists dialog can
  **open a folder from this machine** and read it where it lies, through the same parsers,
  with nothing uploaded and nothing copied. A folder may hold **`.sng` packages** as well
  as loose chart folders; a package is one song, and its header and chart are read to list
  it while its audio and cover are sliced out only when it is played or drawn.
- **Metadata is read as the files actually are.** A `song.ini` may be UTF-8, CP-1252 or
  UTF-16, its fields may be missing, and its cover may be `album.png`, `album_alt.png` or
  `album.jpg`. All of it is read: every song in that library comes back with a title and
  an artist, an album on all but a copy that has no metadata file at all, art on all but
  the one folder that ships none, and a length on every one
  (70 of them say nothing about it anywhere, so the length comes from the notes).
**Songs — boundaries, not gaps**

- **`chartProblems` is a runtime gate too.** Every chart the stage receives — from a
  fetched chart document, a folder or a `.sng` — is validated on the way in. A chart
  that fails is dropped from the track and named on the band and loading screens, so a
  malformed file costs its part rather than the run.
- **Lead and rhythm are two seats.** `PART GUITAR`/`PART RHYTHM`, Clone Hero's
  `Single`/`DoubleRhythm` and the song document's `lead_guitar`/`rhythm_guitar` keep
  both charts; a guitar slot chooses which role it takes when the song carries both,
  and the lineup key records it.
- **`.dta`/`.mogg` is not read.** The audio in that container is encrypted and its keys
  are per game; pretending to read it would ship a silent song. Every other source in
  the list above is read.
- **Three voices is the stage's ceiling.** A melody can carry three parts; a fourth is
  named and shared rather than drawn in a colour the palette does not have.

**The ways to play**

- **Typing a pitched song is supported.** Each words player chooses singing or typing on
  the band screen; both read the same melody view and keep independent scores. A
  typist's results card reports their **words a minute and key accuracy** from the run's
  own keystrokes.
- **Drums are the fourth instrument**, with a **kick column** read from the chart's
  kick pitch (column 5, mapped to a key, a pad button or a learned control) and
  **freestyle fills**: inside a fill an extra hit is not a mistake, pays a small fixed
  bonus and fills the meter, capped so it cannot be farmed.
- **The notes are the same on a phone.** The pads are tapped instead of strummed, so
  nothing has to be plugged in; the kick and the fills are on the same highway.

**The band and its controllers — and what is a separate project**

- **A strum bar that reports as an axis is learnable**, and a **MIDI control change**
  is mapped like a note, so a hi-hat pedal is a real control. Clock, aftertouch and
  sysex are still ignored. A kit whose pads do not follow General MIDI is set up
  control by control in the gear, like a plastic guitar. Access is only asked for at
  the gear or a learn press, so a remembered MIDI seat is reconnected by pressing
  **MIDI** in its gear on a later visit.
- **The phone as a controller is a separate networked project.** It needs a signalling
  room and a host; this repository is static files only. The settled plan is same-room,
  host on the PC, a Durable Object room for WebRTC (or a plain WebSocket first), QR
  pairing, a min-RTT clock offset, pitch *samples* rather than audio, and no typing on a
  phone.
- **No accounts and no server, by design.** The band, the scores and the added playlists
  are this browser's only. A leaderboard is a later project against the same saved-run
  shape, not a missing feature of this client.

**The run and its results**

- **A run can be lost.** The results screen calls a finished run **lost** when the band
  hit under half of at least ten judged notes or words; it shows the failure state and
  saves nothing to the board. It is a verdict, not a mid-song fail mode — a player is
  never cut off by somebody else's miss.
- **Hero notes are counted** and their landing plays `sparkle`; **star power** spends a
  full meter for eight seconds of double score; and the results total **counts up**
  with `tick`.
- **A typist's card says how they typed.** Their run publishes a `typing` report —
  words a minute and key accuracy — from the meaningful keys it stamped, and the
  card adds it to the same stats line as their words and combo. It is a read-out:
  no note is judged by it, and a seek or a new run starts a fresh one.
- **A kept run has a brag card.** The results' **Brag card** button opens a dialog
  over the screen with a 1200×630 poster of the run — the game's name, the song and
  artist, the score, the stars (gold included), the accuracy, the best combo, how
  many were on stage and the date — which **Downloads** as an SVG, **Shares** as a
  file where the browser's share sheet takes files, and **Copies** as text. The card
  is drawn by `src/lib/game/bragCard.ts`, pure and tested: every value is
  XML-escaped, and the SVG is the same document for the same run. It is
  **a poster, not a cover** — song art is somebody else's file at a URL this repo
  does not own, so no art is fetched or embedded (a canvas would need CORS on a host
  the game does not control). The dialog is lazy, because it is opened by one press;
  the preview is an `<img>` over an object URL rather than injected markup; and the
  button only appears for a run the board actually kept — never for Listen, the
  attract demo, a lost run or a stage that judged nothing.

**Dev tools** — the `Dev` chip, the jumpers, and the control over who takes a
keyboard: all marked `dev`, all behind `?dev=1` (and absent without it), and kept
behind the flag by choice. The forced-failure toggle is gone: failure is a real
verdict now. The machine's own seats are not dev tools: `src/lib/game/simulate.ts`
plays whoever nobody is holding.

## What I would do next

The plan is for the engines to share one engine contract (as the sibling TypeStar
build does), so a new way to play is a new engine file, not a new branch everywhere.

The game itself is complete, and every cue has a file. What remains is **optional
polish and other projects**:

1. **Commission the six stings** if the generated chiptune first pass is not the
   identity wanted. They are wired; a better file dropped into `public/audio/` and
   listed in the manifest is the whole change. `audio.md` carries the brief, the format
   and the loudness contract. A dedicated keys and dance entrance is the same kind of
   change, replacing the borrowed guitar/drum cue.
2. **Host the imported collection** so the songs the importer already reads are served
   with audio and CORS — that is a provider, reached through Playlists, not this repo.
3. **A phone controller and a leaderboard**, each a separate networked project; the
   client's saved-run shape and playlist contract are already the seam they plug into.
