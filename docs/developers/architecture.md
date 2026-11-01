---
title: Architecture
description: "The loop, the screen machine and the one stage: how EverythingStar is laid out, what is mounted for every screen, and where the seams are."
updated: "2026-11-01"
order: 1
---

This is the map you read before changing the loop or the stage. The file-by-file detail is in [Project map](project-map.md); the rules that are easy to break are in [Gotchas](gotchas.md).

## The loop around a run

EverythingStar is a **single island**: one screen at a time, moving between them never
reloads the page, and a **fullscreen** session survives the whole loop. Only one of
those screens is the **stage** (the song, and the pause during it); the welcome, the
**menu** and its two branches, the jukebox, the band screen, the load and the results
are **pages of their own**, with the whole viewport to themselves — a menu drawn over a
running song is a menu with a song in the way. The loop is:

```
welcome → menu → songs → band → (loading) → entrance → playing → results → songs
            ↕ options / credits                      ↕ paused
```

Opening the band starts the song's charts **and its stems**. **Play is the loader**:
it waits until every file the run will play says it can play through, then goes
straight to the entrance — the parenthesised load page is the attract demo's and a
fallback, not a stop an ordinary run makes.

- **Welcome** — the brand and one button: it **takes the screen** (fullscreen wants
  a gesture, and this is the one that means "let me in") and it is the press that
  unlocks audio. Until the mixer has warmed — every cue decoded and the opening bed
  downloaded, on a suspended graph so nothing sounds early — the button reads
  **Loading…** and is disabled, so entering is not the thing that waits for the sound.
- **Menu** — the board the welcome opens on to: **Quick Play** (the jukebox), **Options**
  and **Credits**. The wordmark sits beside three large, tilted choices on desktop; on
  phones the wordmark moves above them. Options and Credits are round trips, and Escape
  (or a pad's B) goes back a step from every screen that has one.
- **Options** — the handful of things that belong to a player rather than to a song, kept
  in this browser (`src/lib/game/settings.ts`): **audio lag** (a stepper, ±300 ms in
  5 ms steps, with a **Calibrate** dialog that measures it from eight clicks and writes
  the same `audioLagMs`), **picture lag** (the same stepper and limit, with the dialog's
  **Picture** mode measuring a marker's twelve crossings into `visualLagMs`; positive
  means the display is late, so the notes are drawn ahead, and only the drawing moves),
  the **volume** (the master fader the mixer's own `CHANNEL_LEVEL` sits
  under, plus a fader for each family — **music**, **ambience** and **sound
  effects**; the master never reaches zero, because the song's stems are media elements
  and a silent one leaves the audio clock — a fader dragged to nothing lands on
  `AUDIBLE_FLOOR`, about −60 dB), the **note speed** (0.5×–2.0× in tenths, a range with its own read-out — it
  changes only how much song the neck draws at once, never the chart, the clock or the
  judging), the **backdrop** (whether a song's own video plays behind the stage), the
  **backdrop dim** (0–80% in 5% steps, over the picture and under the panels), the
  **drifting lights** (on or off), the **note view** (whether the necks are drawn flat
  or tilted into perspective — see below), the **note style** (bars, gems or arrows —
  a skin for the notes, drawing only, see below), whether the **guide vocal** stays
  under a singer, whether the **crowd** plays while a run is paused, whether a miss and
  a spent star power are **felt** — a short buzz on the device and a stronger pattern
  on the pad that seat is holding, feedback only and never a judging rule — whether
  the game **keeps the screen awake** while a run is moving (the Screen Wake Lock,
  asked for on the countdown and the run and let go on the pause and the results; the
  installed app skips it because its own boot already holds the display on), and
  **player setup** — one row per
  seat, with
  the same controller dialog and learn flow the band screen's gears open (including a
  MIDI keyboard or kit), so a mapping
  learned in either place is the same mapping. What a player *takes* is not here: that is
  a question about the song, and the band screen asks it. **The audio lag is read against
  the song's own sound** — a run's clock is the audio, so the offset a player sets is the
  offset their run is judged with; a song with no audio of its own leaves the frame loop
  in charge, where the value moves nothing. **The picture lag is read where the note
  layers are drawn** — `useScrollTrack` adds it to both the transform and the mounted
  window, so the highway and the melody roll arrive with the sound while the clock and
  the judging never see it. **The calibration is a measurement, not a
  guess**: `src/lib/game/calibration.ts` pairs each tap with its nearest scheduled click
  (dropping anything more than 300 ms out) and takes the median, which the dialog offers
  as `+35 ms` or similar; its clicks run on their own fixed-level graph, so a muted
  master cannot silence them, and the graph is closed when the run ends or the dialog
  goes. Picture mode uses the same rules on the marker's crossings, plays no sound, and
  keeps its one animation frame alive only while it is listening. A browser that refuses
  Web Audio says so and leaves the stepper. At the bottom of the page is **your
  profile** — see [the four local records](library.md#the-four-local-records): **Export profile** saves
  the four local records as one JSON file, and **Import profile** reads one, asks
  before it replaces anything, and reloads so the settings, band, board and hints all
  come from the new record.
- **Credits** — what the game is made of and by whom, as a list you scroll. The music and
  the cues are **read from the sound manifest's own credits** rather than written out
  again, so the two cannot drift. Every shipped file now carries a credit — the four
  beds included, as the author's own Suno generations — and a file that arrived without
  one would be *said* rather than hidden.
- **Songs** (the jukebox) — the library in one column, filed under their letter,
  with an A–Z index down the side, a search over **titles, artists and albums** —
  accents folded, so `Café` finds `cafe`, and one typo forgiven on a long single
  word — and the chosen song in a **now playing** panel. A list you navigate, not a grid you
  browse: up/down and Tab move the selection from row to row (the arrows belong to
  the list, not the page), and Enter (or a pad's A) takes the next step — the same
  as **Next: your band**. The list is **windowed**: only the rows around the
  viewport (plus a few of overscan and the letter headings around them) are in the
  DOM, and spacers carry the height of everything else, so a folder of 2,000 songs
  scrolls, jumps by letter and arrows across a window boundary exactly like a list
  of twenty. A row is a
  cover (or a drawn tile when it has no art), **how long the song
  is** at the head of the title's line — `4:00  1999 Forever`, the time in the mono face
  at the title's own size — the title, the artist under it, and **what it offers** — a
  duet, vocals or lyrics, and which instruments it carries a part for. The artist and the
  offers start where the row's text starts, so the time costs its width to the title and
  to nothing else. It carries **no slot code and no score**. The now-playing panel
  leads with the song's duration and offers a compact table of up to ten recent runs
  (date, band size and score); the next-step button sits outside the panel. A row is
  one line when there is width
  for one, **two lines below 80rem** (the artist under the title, the offers keeping
  their column) and **three on a phone** (the offers on a line of their own) — a taller
  row, never a row with less on it, and its **cover grows with it** (30px, 43px, 54px).
  On a phone the index is hidden (it would
  take a third of the width) and the
  search box is the way through — and the "find a song" label steps aside there, so the
  field and the Playlists button share the row. Difficulty is deliberately *not* a song's
  chip: it
  belongs to whoever is playing, so a song can be a gentle strum and a hard line to
  sing, and each slot on the band screen chooses its own. The list and the
  **now-playing** column share one height on a wide screen, with the list scrolling
  inside it and the way on to the band below the now-playing surface.
- **Playlists** (a button in the jukebox's corner, opening a native dialog) - where
  the songs come from: each playlist with its song count, when it was last read,
  anything it could not be read for, and what a reader can do about it - **Refresh**
  it (or all of them), **Disable** the built-in EverythingStar FOSS playlist (its row
  stays, its songs leave, and **Enable** puts them back), or **Remove** a playlist
  the player added. Adding one is a URL: a full **http://** or **https://** address,
  and the dialog shows **the host it will reach** as it is typed - an http address on
  this https page is called out, because the browser will block it. The list is
  **seeded once** with
  EverythingStar FOSS. An **on-demand** playlist says so instead of a song count: it
  is asked for songs by the search field rather than listing them, and what it finds
  lasts for the visit.
- **Band** — who is on stage, **a character box each**: an instrument (guitar, bass,
  drums, simple keys, dance) or **the place at the words** — singing or typing on a
  pitched song, typing on a lyrics-only song — and the difficulty that fits it. *Only
  what the song
  carries can be chosen*: unavailable modes are **hidden**, and the level buttons are
  the chart sets it actually has (a song can be
  Expert-only on the guitar) and they share **one row** however many there are, and
  Play is refused when active players have no part. An empty band may choose
  **Listen**, which shows the song's lyrics while it runs. A new box **never
  arrives holding something the song cannot play** — the empty box says what it is
  offering before you press it. **Four boxes to start with**, and the action bar
  offers a second row in the middle, with Play on the right, once the first is full;
  the consistent Back button sits in the page header. The boxes *are* the band, and
  the band is **remembered**
  between visits — including, per player, **what they play with**: a gear on each box
  opens their controller, where they pick the keyboard, a gamepad, a MIDI keyboard or
  kit, or the machine, and can be **taken through setting it up** control by control.
  That is what a plastic guitar needs, since every one of them arrives as a gamepad,
  and what a MIDI kit needs when its pads do not follow a standard map; a MIDI seat is
  asked for permission at that press, never on load, and the gear names the inputs it
  can see. Vacant seats keep their numbers when someone
  leaves, and an empty band can start with **Listen** instead of adding a player.
  Opening this screen also **starts the song's files**; **Play waits for them** — the
  button reads **Loading…** with a count while they arrive — and starts the entrance
  the moment the charts and every stem are ready. A file that fails is named under
  the band, and a wait that drags offers **Play anyway** instead of holding the
  player forever.
- **Stage entrance** — the room and the score arrive first, then the highways rise
  from the floor and the words drop from the top while the band's own hype plays.
  There is no 3-2-1 and no count tick; the song starts when the hype and the slide
  have played out **and every stem says it can play through** — the clock does not
  begin counting against silence.
- **Pause** — Escape, Start, the pause button, or the stage's own chip on a touch
  screen: resume, start again, practise a stretch, or leave. A quiet crowd sits under
  it. A **phone** has no Escape key, so a 44 px **Pause** chip sits in the stage
  corner whenever `(pointer: coarse)` and a song is playing; without it a touch player
  could only leave a song by finishing it.
- **The sound can be lost without the run being lost.** A source that is registered
  but never answers (every stem failed, a refused video) no longer holds the playhead
  at 0:00. A hard failure is given up on after `SOURCE_STALL_MS` (1.5 s), a source
  that is merely slow after `SOURCE_STALL_SOFT_MS` (6 s) — a seek is not a broken
  song. The frame clock then takes over, the run plays and ends normally, and a line
  under the progress bar says there is no sound. A source that arrives late is seated
  on the playhead. The picture lag, the note speed and the judging are unchanged.
- **Results** — the band score, its **stars and average multiplier**, and how the
  run went (the notes hit of what was judged, the accuracy, the best combo), then
  **a card per player** in band order — what they took, at what level, their score,
  their own stars and average multiplier, and their own notes, accuracy and combo —
  and where the run sits in this browser's history for the song. The best line is
  **for this band** — the same instruments at the same levels, with the words sung or
  typed the same way — while the history below stays the song's own across lineups,
  and each row says which lineup it was under the date and band size.

Choosing a song and choosing a band are **two screens in sequence** on purpose: a
jukebox wants the room a few hundred titles need and a band wants the room a slot
per player needs, and one panel doing both was what the first attempt got wrong.

## The stage

`/play` sits in the site shell, with the marketing header above the stage and the
footer below it, because it is the public page somebody finds by searching. The
header and the stage share the **first viewport** (`BaseLayout`'s `frame`), so the
whole game is on screen at rest and the footer sits one screen down; `/app`, `/embed`
and `/open` use the **game-only layout**, where the stage is the page and fills the
whole `100dvh` viewport. A **Fullscreen** button makes the stage the whole screen,
hides the site shell and the browser's chrome, and gives the game alone.

The stage is two regions over a full-bleed backdrop — **the game's own artwork by
default**, and a song's video, or its art blurred, when there is one — with a scrim to
keep the regions readable:

- **Melody region** (full viewport width) — where whoever is on the words plays. It
  shows one of two views, **never both**, and the song's pitch plus who is singing decides
  which:
  - **Lyrics** when the words carry no pitch, or when a pitched song's words players all
    chose Type — the words-only view. Typists are scored; Listen is the unscored
    read-along.
  - **Keys** when the song carries **pitch** and somebody is singing — a piano roll
    with the words **under its notes**, riding the same scrolling track. A note is
    drawn as a **bar for as long as it is held**, and a bar stops short of the next
    note in its part, so two quick notes read as two bars rather than one long run.
    There are no ribbons between notes. Each lyric line is a strip placed at its own
    moment, so the words slide at the pace of the notes and the singer reads the
    pitch and the word in one place; the word being sung carries the highlight, and
    a part keeps its own row of words under the bars. Words delivered **freeform** —
    spoken or rapped, with no pitch to judge — have no bar, and the roll says so
    while one is being delivered. A typist in the same band sees whole words; the
    syllable note bars belong to the singers.
  - **A duet** reads in the same view: each part gets its own note colour and its
    own row of words, so two singers on different lyrics are both legible. Where
    they land on the same note together it is drawn as **one bar split between the
    two colours** — not two notes on top of each other.
  - In the words-only view a duet reads as **one block per part**, side by side
    with a rule in its colour, each block carrying its own lines — so a line both
    sing simply shows in both. The line still to come **fades up over its run-up**
    (as does each part's number in the roll), so a player can see their own entry
    coming without watching the clock.
  - Words players choose whether to **sing or type** when a song carries pitch.
    Typing rides on those same words: a typist's characters are marked as they
    land, the next one is the caret, and the word being typed is the one they are
    on. Each typist keeps their own score, exactly as each singer does. Their
    results card also carries their **typing report** — words a minute (five
    characters to a word, over the first-to-last-key span, floored at a second) and
    key accuracy — read from the run's own keystrokes and never used in judging.
  - **Singing** is heard: the microphone is asked for when **Vocals** is selected
    (or at the band's Play if a singer was remembered), then it listens only while
    the stage is playing. Pitch is detected with YIN (decimated, buffer-reusing, on
    the stage's own frame loop), and each note is judged on **how much of its own
    span was held in tune**: joining a long note late and correcting it still lands
    the note, while starting right and drifting off does not. It is listened to a
    little before and after the note, so an early or late entry is not punished for
    the detector taking a frame to lock on. A **cursor** on the playhead shows where
    the voice is against where the note is, and holds through a consonant rather
    than blinking out. Octaves are ignored, so a lower voice is not punished for
    being lower; a refusal is not an error, it is a band that plays itself (the
    score rail says so), and nothing leaves the device.
- **Lanes region** — one panel per player (guitar, bass, drums, keys, dance),
  side by side. Each panel holds the score (left), the note highway (centre) and
  the info rail (right — the power meter, a full-height bar). A highway note is a
  **button**: it is hit where it lands. The pads are one pointer surface — the hit
  row captures the pointer, not the pad — so a finger already on the line may
  **glide** from one pad to the next without lifting. That is the chart's one
  **slide** link, the only ribbon on the neck: a touch player earns its span's hold
  value, and no other controller can. Once a note lands it leaves the neck, and a
  **burst** above the pad says where it was played; a miss keeps its red note
  travelling past the line.

## The stack, and the first download

- **Astro 7** (static) + **React 19** island (`@astrojs/react`, `client:load`)
- **Tailwind CSS v4** with design tokens in `@theme` (`src/styles/global.css`)
- **Cloudflare static assets** (`wrangler.jsonc`) — GitHub Actions builds and
  uploads the files with `wrangler deploy`, with no Worker script and no API
- **Bun** for installs, scripts and binaries — never `npm`/`npx`; the lockfile is
  `bun.lock`
- Self-hosted fonts: **Permanent Marker** (display), **Space Grotesk** (body),
  **Space Mono** (utility)

### The first download

The island is one React root, but not everything it can do belongs in the first
download. The **source translators** (`src/lib/game/sources/parse.ts` and the MIDI,
`.chart`, StepMania, UltraStar and lyric readers behind it) are fetched with
`await import(...)` only when a folder or `.sng` package is first read, and
**`PlaylistsDialog`**, **`DownloadsDialog`**, **`CalibrationDialog`**, **`IntentDialog`**
and the dev **`BandControls`** are `React.lazy` with a null `Suspense` fallback. A
player who opens the JSON library and never presses Calibrate, opens Downloads, follows
a link or uses `?dev=1` does not pay for any of it.

That matters because `/play` is the page the game starts on: the initial JavaScript
graph is **577 KiB raw / 186 KiB gzipped across 22 files**. That is the first download
only; every `_astro` JavaScript chunk in the build totals **708 KiB**, because the lazy
chunks still ship — they are just not requested first. `scripts/check-budget.ts` walks
`play.html`'s initial island graph, gates the initial raw and gzipped sizes directly,
and fails if a translator marker leaks into it, so the split cannot quietly regress.
Do not lazy-load the main screens: a flash on every navigation is worse than the bytes
saved.

## Pages

- `/` — landing: the hero, the three ways to play, and the live attract window. It
  ships no JavaScript: the window is a same-origin iframe and the link over it is the
  page's one script-free control.
- `/play` — the **public game page**: the same game island, the welcome, the menu and its
  two branches, the jukebox and the band screen, a run and its results, all over one
  persistent stage. It sits in the site shell, so the marketing header and footer frame
  the stage, and fullscreen puts them aside. Unlike the game-only entries below it is
  **indexable**, with the site's canonical/Open Graph metadata, and it is in the
  sitemap. Screens are session state; the address bar stays on `/play`.
- `/app` — the **installed PWA's entry**: game-only, `noindex`, and the manifest's
  `start_url`. It is not in the sitemap.
- `/arcade` — the **attract entry**: game-only, `noindex`, and the page the homepage's
  live window embeds. Left idle on the welcome it starts the demo; any input returns to
  the welcome. `?players=1`, `?sound=0|1|auto`, `?demo=1` and `?chrome=0` shape the
  same document for the homepage window; it is not in the sitemap.
- `/embed` — the **native app's entry**: the same game-only page at a URL of its own, so
  an old WebView cache, service worker or task can never hand the app a website page from
  `/play`, `/app` or `/open`. The APK bundles `embed.html`; `noindex` and not in the
  sitemap.
- `/charter` — the **charter island**: game-only, `noindex`, not in the sitemap, and deliberately a separate React root from `/play`. It carries the chart editor (up to eight 2D panes, pointer editing, keyboard/gamepad/MIDI recording) and its own clock and `SongAudio`; the run's providers are not mounted. See [Charter](charter.md).
- `/open` — the **link entry**: the same game-only page, read by the intent parser. A bare
  `/open` opens the game; `?playlist=…` and `?song=…` ask to add one. `noindex` and
  excluded from the sitemap; see [`deeplinks.md`](deeplinks.md).
- `/docs` — the **documentation hub**, and `/docs/<section>/<page>` for each page
  under `players/`, `charters/` and `developers/`: plain Astro, no island, in the
  sitemap. The collection base is `./docs` at the repository root, so the same
  Markdown is what GitHub shows. See [Writing docs](writing-docs.md).
- `/privacy`, `/terms`, `/copyright`, `/credits`, `/accessibility` — the **notices**,
  authored in `docs/other/` but served at the site root because they are not
  documentation and `/privacy` is load-bearing (the footer, the offline shell and the
  Android app). They are built by `src/pages/[...legal].astro` with the same one
  Markdown source.
- `/404`.

Internal links use `localePath` (`src/i18n/paths.ts`) and the UI is translated
through `t()` (`src/i18n/`), so adding a locale later is a dictionary file rather
than a refactor. **Only English ships today.**
