---
title: Project map
description: "Where everything lives: every module, what it owns, and the seam it sits behind — the file-by-file map of the game, the site and the scripts."
updated: "2026-10-31"
order: 2
---

The vocabulary is exact — player, panel, highway, column, part, role, chart, seat, controller, layout — and each entry says why the file is where it is, not only what it is called.

- [Audio](audio.md) — **the audio shopping list**: every sound the game needs, where it
  plays, and the delivery contract (format, loudness, loops, licensing). The ids in
  it are the mixer's manifest, and `public/audio/sounds.json` is that manifest —
  read by `src/lib/game/audio/sounds.ts` and `useSounds`, with the dev panel showing
  the tally of what is still to come.
- [Playlist API](playlist-api.md) — **the wire contract** another team implements a
  library or an on-demand provider against: the playlist, song and chart documents, the
  `?q=` search request and answer, URL resolution, CORS, timing, a complete worked
  example, a YouTube-resolver section, a "Check yours" command and an acceptance
  checklist. Keep it in step with `playlist.ts` and `source.ts`; they are the readers it
  documents.
- `docs/playlist.schema.json` + `scripts/check-playlist.ts` — **a provider's checker**,
  written against the game's own reader rather than beside it: the schema is the advisory
  shape for an editor (draft 2020-12) and says so, while `bun run playlist:check <url>`
  puts a document through `readPlaylist` and the game's own URL policy and body cap
  (`fetchLimits.ts`, shared with the library's bounded fetch) and exits 1 on any problem
  the reader named. The pure report is `src/lib/game/playlistCheck.ts`; the schema can
  never be authoritative, because only the reader knows what resolves and what is listed
  twice.
- [Links into the game](deeplinks.md) — **the link contract**: `Open in EverythingStar`,
  `Add Playlist…` and
  `Add Song…`, the confirmation rule, URL and payload limits, the Android App Link and
  `everythingstar://` routes, the cold/warm hand-off into the WebView, and the
  acceptance checklist. Keep it in step with `src/lib/game/intent.ts` and the app's
  `native/deeplink.ts`.
- `src/content/site/settings.json` — name, tagline, description, url, author,
  repo and licence. The `file()` loader requires an **array** with `id: "main"`;
  the site reads `getEntry("site", "main")`.
- `src/content.config.ts` — the `site` and `docs` collections (Astro 5+ location,
  NOT `src/content/config.ts`). `docs` reads `./docs` at the repository root; the
  folder is the section and `README.md` is the hub.
- `docs/**/*.md` — **the documentation**, written once for GitHub and the site. The
  pages are the four audiences (`players/`, `charters/`, `developers/`, `other/`) and
  [Writing docs](writing-docs.md) is the system. `docs/other/` holds the notices,
  served at the site root.
- `src/lib/docs/{paths,nav,sections}.ts` — the documentation's pure rules: a document's
  id to its URL (`/docs/...`, or `/privacy` for a notice), relative link rewriting,
  the sidebar's groups and the page's neighbours. Tested beside them: `paths.test.ts`,
  `nav.test.ts`, and `content.test.ts` for the source's own links and frontmatter.
- `src/lib/docshots/config.ts` + `capture.ts` — the capture side: the variant
  list `docshots.config.ts` declares, and the automatic fixture that reads a
  test's `doc` annotation, takes the WebP in the test's teardown and writes it to
  `public/docs/test-output/`.
- `tests/e2e/docs/*.spec.ts` — the capture tests, one spec per shot, each taken on
  desktop and mobile, with `annotation: [{ type: "doc", description: "<id>" }]`. The
  page names the id with `[description](shot:<id>)`; `bun run docs:shots` runs them
  and `bun run build` runs that first. They cover the whole guide, not only the
  player pages: the welcome, menu and options; playlists and import; Listen and the
  results; pause and practice; typing, the duet and the controllers; and the
  charter's picker, editor and charts.
- `src/lib/docs/shots.ts` — the satteri link visitor that replaces a `shot:`
  paragraph with a `<figure>`, the `<img>` for each variant file that exists and
  one `<details>` per screen. `references.test.ts` holds the page and the test
  together.
- `public/docs/test-output/` — **generated, ignored by Git**: the captures, served
  as written. [Writing docs](writing-docs.md#screenshots) is the rule.
- `tests/e2e/docs-library/` + `docs-library.ts` — the captures' **mock**: a snapshot
  of the published EverythingStar FOSS playlist (real titles, artists, offers, cover
  art at 96×96) served under the URL a fresh install seeds, with documents and charts
  generated per song. `bun run docs:library` refreshes it; it never runs in a gate.
- `tests/e2e/note-guide.ts` — the [note-types page](../charters/note-types.md)'s own
  charts: one short song per note type, at the seeded URL, so a capture shows the
  note its prose names.
- `tests/e2e/docs-charts.ts` — the captures' **duet and lyrics fixture**: a song two
  melody players share, and one with timed lines, so the duet, typing and lyrics
  captures share one chart and one journey.
- `src/pages/docs/index.astro` + `src/pages/docs/[...slug].astro` — the hub and a page
  per sectioned document; `src/pages/[...legal].astro` builds the notices at the site
  root; `src/layouts/DocsLayout.astro` and `LegalLayout.astro` are their frames.
- `src/pages/play.astro` — **the public game page**. It mounts the same island in the
  site shell (`BaseLayout`), so the marketing header and footer frame the stage and
  fullscreen stands them aside. It is the page a search should land on, so it keeps the
  site's canonical and Open Graph metadata and stays in the sitemap.
- `src/pages/app.astro` — **the installed PWA's game-only entry**. It is the manifest's
  `start_url`, `noindex`, and not in the sitemap.
- `src/pages/embed.astro` — **the native app's game-only entry**. It is deliberately a
  different URL from `/app` and `/play`: the APK loads `embed.html`, so an old WebView
  cache, service worker or task can never hand it a website page from one of the other
  routes. The app repository copies it to `index.html` and requires it as the bundle's
  only page; do not add website chrome here.
- `src/pages/open.astro` — **the link entry**: the same game-only shell, and the page
  `Open in EverythingStar`, `Add Playlist…` and `Add Song…` land on. The query is
  read on the client (`src/lib/game/intent.ts`), never at build time — static hosting
  cannot vary a page by query, so the document is deliberately generic. `noindex`,
  not in the sitemap.
- `src/layouts/GameLayout.astro` — the game-only head `/app`, `/embed` and `/open`
  share: viewport, theme, manifest link, apple tags, display-font preload, the
  worker registration and no site furniture, always `noindex`.
  `src/layouts/BaseLayout.astro` is the website shell for `/`, `/play`, `/docs`, the
  notices and the error pages, and loads `GameApp`'s styles with the header and footer
  around it.
- `public/manifest.webmanifest` — **hand-authored** (name/id/start_url `/app`/scope,
  `display_override`, maskable icons, a Play shortcut, `launch_handler`,
  `handle_links`). `bun run icons` generates the icons and deliberately does not write
  this file; `scripts/check-pwa.ts` holds the fields that matter.
- `src/lib/pwa/**`, `scripts/sw.ts`, `scripts/build-sw.ts` — **the installable
  shell**: `cache.ts` (the two cache names; the offline bucket literal is shared with
  the app repo), `range.ts` (media byte ranges, pure), `precache.ts` (what an install
  keeps, pure), the worker entry, and the post-build step that bundles it with the
  hashed `_astro` chunks and the build identity. `bun run build` runs it;
  `scripts/check-pwa.ts` checks the output.
- `src/lib/pwa/register.ts` + `src/components/pwa/ServiceWorker.astro` — the one
  registration: production, https/localhost, never inside the native WebView.
- `src/lib/release/bundles.ts` + `scripts/release-assets.ts` + `scripts/check-release.ts`
  — **the release archives**, and the plan they all read: one `dist/` becomes `game`,
  `arcade` and `website`, each as a zip and a tar.gz in `release/`. `game` and `arcade`
  promote a built game-only page to `index.html`, carry the game's own directories, a
  manifest rewired to `/` and a `BUILD.txt`, and no website at all; `website` is `dist/`
  untouched. The plan is pure and unit-tested, the builder is copying and compressing,
  and the gate holds an archive to its plan and to what its page names — a missing
  `_astro` chunk is a download that draws and never hydrates. `bun run verify` runs both,
  and `.github/workflows/release.yml` attaches the six files to the GitHub Release.
- `src/components/game/pwa/install.ts` + `useInstall.ts` — the install prompt captured
  by the inline head listener (Chromium fires it once, early) and adopted at session
  mount; the Options row offers it, iOS gets instructions, and the native shell gets no
  row.
- `src/lib/game/intent.ts` — **the link intent**, pure and tested: a query string into
  `{ kind: "playlist" | "song", url }`, the canonical share URL, and the query stripped
  after it is read. `src/components/game/intent/useIntent.ts` reads it once, defers it
  during a run, asks, and hands the add to the library; `screens/IntentDialog.tsx` is
  the question. `deeplinks.md` is the wire contract, including the native hand-off.
- `src/lib/game/pinned.ts` + `src/components/game/library/usePinned.ts` — **a song from
  a link**: a song document with no playlist around it becomes a one-song library
  entry, read through the same cache and listed under **Songs from links**.
- `src/layouts/BaseLayout.astro` — loads `global.css`, settings and the display font,
  and renders the shell (header, slot, footer). It deliberately does **not** import
  `band.css`: that is the game's stylesheet and `/play` adds it itself, after the
  global one.
- `src/components/layout/{Seo,Header,Footer,Breadcrumbs}.astro` — the shell.
  `Seo.astro` emits the canonical URL, Open Graph/Twitter tags and a JSON-LD
  `@graph` (`Person` + `VideoGame` + `WebSite` + optional `WebPage` and
  `BreadcrumbList`); `src/lib/seo.ts` is the pure title/canonical arithmetic.
- `src/components/ui/{Container,Button,Mark}.astro` — small primitives. `Mark` is
  the "E" + star brand tile; `public/icons/brand-mark.svg` is the icon source.
- `src/components/home/{HomePage,StageWindow}.astro` — the landing page and its
  phone-shaped live attract window (an iframe of `/arcade`, linked to `/play`; the
  old static hero SVG is gone). The iframe is decorative and the anchor over it is
  the frame's one real link, so the window is keyboard-reachable without a plaque on
  the picture.
- `src/components/game/GameApp.tsx` — **the game island's shell**, and the loop
  around the run: it draws the room, the provider tower, the stage, the pages, the
  corner and focus. Its root (`.band`) is the persistent fullscreen target and must
  stay mounted as screens and modes are added. On `/arcade` it also owns the attract
  on/off and silent flags and mounts `useAttract`; the attract's own configuration is
  read from the query string after mount, because the page is static.
- `src/components/game/useGameSession.ts` — **the session**: the screen and its
  dispatch, the library, the chosen song, the band plan and counts, the board,
  settings, the dev flag, fullscreen, the loaded track and the backdrop, with the
  effects that keep them true. State and effects only; no screen is rendered here.
  `useGameSession(attract)` borrows the session for the demo: a generated plan (not
  the remembered one), `humans` ignored, `perfect` on, `silent` where asked, the guide
  vocal kept, and `focus` off for the homepage window.
- `src/lib/game/attract.ts` — **the attract decisions**, pure and tested: query
  options (`players`, `sound`, `demo`, `chrome`), the playable-song filter, the
  seeded cycle that stops on a couple and then picks one, and the band generator
  (one lane on the home; up to three instruments plus the words lane for the arcade;
  every seat `{ on: "none" }`, at the song's hardest chart).
- `src/components/game/attract/useAttract.ts` — the attract **driver**: the
  thirty-second welcome idle, the pointer/key/gamepad stop that returns to the
  welcome, and the per-screen timers that walk songs → band → run → results → songs.
  No screen of its own and no second frame loop.
- `src/components/game/band/RunMode.tsx` — the perfect-run context the three judging
  engines read: lane `autoInput`, `singerVerdict` and `autoTyping` take
  `PERFECT_ACCURACY` in attract, through the same rules as every other run.
- `src/components/game/GameProviders.tsx` — **the provider tower** every screen
  shares, in its one deliberate order: audio, song-audio status, clock, controls,
  song, run board, part audio. The song-audio status sits between the mixer and the
  clock because the band's loader and the clock's start gate read the same answer;
  the screens stay in the middle of it.
- `src/components/game/band/SongAudioStatus.tsx` — **the band's loader read-out**:
  the same media elements `SongAudio` plays are watched here, so a run's stems are
  counted as ready (`HAVE_ENOUGH_DATA`, the browser's "can play through") without a
  second download. It owns the mobile gesture (`prime`: a muted play, paused and
  reset as soon as the stem is ready), names a stem that failed, and reports
  `done`/`total` to the Play button and `Loading`. The pure rule is
  `src/lib/game/audio/preload.ts`.
- `src/components/game/screens/ScreenHost.tsx` — **the screen registry**: a page
  per screen for the welcome, menu, options, credits, songs, band, loading and
  results, and the pause overlay that sits inside `BandStage`. The countdown screen
  has no overlay of its own: it is the stage entrance. One entry is all a new screen
  needs (and one in `screens.ts`).
- `src/components/game/ui/**` + `src/lib/game/ui/focus.ts` — **focus as the game's
  cursor**: `ScreenFocus` announces a screen and puts focus on its starting control,
  `GamepadNav` turns D-pad/stick/A/B/Start into that same focus, `nav.ts` owns the
  screen roots and focusable query, `modalStack.ts` is the order of open dialogs (so
  the top one is the one a pad is on, `NativeDialog`/`useModal` give every overlay
  a native dialog, a focus trap and its opener back, and `StepButton` is the one
  stepper both Options and the pause's quick panel draw. `ui/focus.ts` is the pure
  spatial geometry; `src/lib/game/controls/uiPad.ts` is the pad's UI mapping.
- `src/lib/game/screens.ts` — **the screen machine**: the screens, the events that
  move between them, `screenAfter`, `wantsCharts`, `opensRun` and `backEventFor`.
  `wantsCharts` runs from the band screen through the run and the **results**, so a
  replay keeps the charts and its entrance is computed from the real melody. A band
  with its charts and sound already in hand goes straight to the countdown with the
  `start` event; the load page remains for the attract demo and as the fallback.
  `opensRun` includes the band as a run-opening entry, so the direct start still gets
  its entrance. Pure and unit-tested; components only render the screen they are
  handed. The screen is session state: it is not mirrored into the URL.
- `src/lib/game/practice.ts` — **practice**, pure and tested: a `PracticePlan`
  (a span, a 0.5–1.0 speed in 0.1 steps and a loop flag), the clamping/parsing
  that keeps one inside its song, and `practiceSections` (the song's sections,
  then a chart's phrases, then the whole song). The stage applies it; nothing
  here scores it.
- `src/lib/game/settings.ts` — **the settings**: the audio lag, the visual
  (picture) lag, the master fader and the music/ambience/sfx family levels under it,
  whether a song's own backdrop plays, how the
  highways are drawn (`HighwayView`: flat or in perspective), how fast notes travel
  (`noteSpeed`), how far the backdrop
  is dimmed (`backdropDim`), whether the room's drifting lights are drawn (`flares`),
  whether the song's guide vocal stays under a singer (`guideVocal`), whether the
  room's crowd plays while a run is paused (`crowd`), whether a hit marker is also
  a control (`tap`), whether a miss and a spent star power are felt (`haptics`) and
  whether a run holds the display on (`keepAwake`), with the shape, the clamping
  and the stepping pure. Pure except `loadSettings`/`saveSettings`; one local record
  beside the band, the board and the first-run hints.
- `src/lib/game/haptics.ts` + `src/components/game/band/useHaptics.ts` — **the buzz**:
  the miss and star cues (a device pattern and a pad rumble each), the shared minimum
  gap between device buzzes (`hapticAllowed`), and the per-seat hook that watches a
  run's miss and star counts. The pad is the seat's own, found through the control
  plan; a machine seat is passed `enabled: false` because it has no hands. Pure rules
  and unit-tested, and **never read into judging**.
- `src/lib/game/wakeLock.ts` + `src/components/game/band/useWakeLock.ts` — **the screen
  kept on**: the pure table (`shouldHoldWakeLock`: the countdown and the run, never a
  hidden document, a switched-off setting or the native shell) and the one sentinel
  the island asks `navigator.wakeLock` for, released on a pause and re-asked on a
  resume. Pure rules and unit-tested.
- `src/lib/game/onboarding.ts` + `src/components/game/band/useFirstRunHint.ts` — **the
  first-run highway hints**, per player seat: which seats have already been shown the
  key labels, so Player 3 still gets them when Players 1 and 2 have played. Pure except
  `loadOnboarding`/`saveOnboarding`.
- `src/lib/game/calibration.ts` — **the measured calibration**, pure and
  tested: the eight-tap run (`CALIBRATION_TAPS`), its 0.7-second beats and lead-in,
  the ±300 ms window that decides a tap belongs to its nearest beat, the median that
  becomes the setting, and the floor below which a run is not trusted. It turns a
  measurement into the same `audioLagMs` the stepper edits, through `snapLag`. The
  **picture** half reuses all of it: `crossingTimes` seats the marker's twelve
  crossings on the tap clock and `pictureMarkerPercent` puts it on the line at each
  one, so the taps measure `visualLagMs` with no second arithmetic.
  `CalibrationDialog` is its caller for both modes.
- `src/lib/game/math.ts` — **the one clamp**, pure: `clamp`/`clamp01`, so a domain that
  needs a different rule says so at its own call site instead of growing a twin.
- `src/lib/game/text.ts` — the two small text helpers the readers, writers and fixtures
  share: `slug` (a name as an id, with no invented fallback) and `basename`.
- `src/lib/game/scores.ts` — **the local score board**: what a run saves (score,
  best combo, hits, misses, a line per player, the lineup key and the base/stars it
  was rated against), what counts as a best, and the browser storage behind it. The
  storage key is versioned with the scoring model, so an old three-point board is not
  compared with 50-point runs. Pure except `loadBoard`/`saveRun`/`replaceBoard`, and
  `BOARD_LIMIT` is the one number saying how many runs it keeps.
- `src/lib/game/profile.ts` — **a player's profile**, pure and tested: the versioned
  envelope (`format: "everythingstar-profile"`, version 1, `exportedAt`) around the
  **four local records** — settings, band, board and first-run hints — and nothing
  else. `buildProfile` copies the live records; `readProfile` refuses a file over
  1 MB before parsing, then checks the envelope and hands each record to its own pure
  parser (`parseSettings`, `parsePlan`, `parseBoard`, `parseOnboarding`), capped to
  `BOARD_LIMIT`, so an import is held to the same tolerance as a store read. It
  **deliberately carries no library, downloads or audio**: those are reached through
  a URL, not owned by a player, so an import leaves them untouched.
- `src/lib/game/meter.ts` — the **meter's arithmetic**, pure and shared by both judging
  engines: `fillMeter`/`missMeter`/`drainMeter`, so a band cannot read two meters that
  fill or drain differently.
- `src/components/game/screens/**` — the screens: `Welcome`, `Menu` (Quick Play,
  Options, Credits), `Options` (audio lag, picture lag and their measured
  calibrations, the master volume and the music/ambience/sfx family levels, guide
  vocal, pause crowd, note
  speed, backdrop, backdrop dim, drifting lights, tap style, note view, note style,
  player setup)
  and `CalibrationDialog` (the eight-click Sound measurement and the twelve-crossing
  Picture measurement over Options),
  `Credits` (read out of the sound manifest), `Songs` (the jukebox:
  the search, the A–Z index, the now-playing slot and the way to the playlists),
  `SongRow`, `Band` (a slot
  per player, each with its own controller settings behind a gear), `SlotSettings`
  (one player's device and their learned mapping), `playerBits` (the two things a
  player is drawn with, shared by the band screen and `Options`), `Loading`,
  `PauseMenu` (resume, restart, leave — plus a **quick panel** for the note speed,
  the audio lag and the guide vocal when somebody is singing, and **Practice this
  section**, which seeds `PracticeDialog` with the stretch under the playhead),
  `Results`, and `BragCardDialog` (the poster of a kept run, over the results — lazy,
  like the dialogs opened by one press). The **countdown** is not a component: it is
  the stage's
  entrance. They read what they
  need from context (the run board, the song, the clock) and take callbacks for
  everything else.
- `src/pages/charter.astro` + `src/components/charter/**` — **the charter island**, a tool at `/charter` rather than a screen in the run loop. It opens a song and every chart it carries, draws up to eight 2D panes, adds and moves notes by pointer, records keyboard/gamepad/MIDI takes, and downloads a Clone Hero `.chart`. Its clock and `SongAudio` are its own; the band, judging, score board and mixer are not mounted. See [Charter](charter.md).
- `src/lib/game/charter/**` — the charter's pure rules: `grid.ts` (BPM, subdivision, snapping, bar lines), `edit.ts` (the canonical note list and every edit, including copy/paste and cross-chart paste), `record.ts` (a take of the game's own actions into notes), and `exportChart.ts` (the whole set as a `.chart`). Unit-tested beside them.
- `src/styles/charter.css` — the charter's own look, imported only by `/charter`; it keeps the stage's tokens and never reaches a marketing page or `/play`.
- `src/lib/game/song.ts` — **the song**: what a library lists and a band is offered
  (title, artist, album, art, length, and what there is to play). Not a track — a
  song is *where a track comes from*. `songDifficulties`, `songHasPart` and
  `songArt` are what a screen asks instead of reading the shape itself.
- `src/lib/game/playlist.ts` — **the playlist file**, and the summary it carries per
  song: read tolerantly (a broken entry is skipped and named), every path resolved
  against the playlist's own URL, and `mergeSongs` for several playlists into one
  library. `src/lib/game/source.ts` is the other two documents — a **song document**
  (its audio, its parts, where its charts live) and a **chart document** (the notes,
  into our own format) — plus `assembleTrack` and `sourceChartFor`.
- `src/components/game/library/**` — the library at the seam: `store.ts` (the one
  place that touches IndexedDB and the one place that fetches), `useLibrary` (the
  playlists, the folders, the merge, the on-demand refresh), `useSongTrack` (a song and
  the charts its band needs, into a `Track` — or a raw source, or a folder, parsed
  straight into one), `useSongPreview` (the clip a jukebox row plays when it is picked),
  `folder.ts` (reading a folder off this machine, and **importing files into OPFS**),
  `localImport.ts` (the pure root/path/cap arithmetic an import is built from),
  `drop.ts` (a dropped folder walked with `webkitGetAsEntry`), `sng.ts` (fetching a
  package and making its members object URLs), `downloads.ts` (the Cache Storage writes,
  one song or a whole playlist's queue in the one job), `useOffline` (the list, the job
  in flight and the storage numbers), `DownloadAction` and `DownloadsDialog`,
  `SongCover` and `PlaylistsDialog`.
- `src/lib/game/url.ts` — **what the game will fetch**, pure and tested: an absolute
  `http:`/`https:` URL with a host, the host to show for it, and whether an https page
  would block it as mixed content. `store.ts` is where the policy is enforced, with the
  8 MB document and 128 MB package ceilings.
- `src/lib/game/cache.ts` — the cache's **policy**, pure and tested: what is stale,
  what a body costs, and what is let go of first when the cache is over its cap.
- `src/lib/game/audio/sounds.ts` — **the sound manifest**, read at runtime
  (`public/audio/sounds.json`): every sound the game can play and every one it is
  still waiting for. `src/components/game/audio/useSounds.ts` fetches it, and the dev
  panel shows the tally. See `audio.md` for what each type is for.
- `src/components/game/audio/engine.ts` + `StageAudio.tsx` + `src/lib/game/audio/mix.ts`
  — **the mixer**: one graph, three channels, beds streamed as media elements and
  one-shots decoded. The welcome warms it (`engine.prepare`: the graph built
  **suspended**, every cue decoded and the opening bed downloaded, chosen by the pure
  `soundsToWarm`), and the first gesture only resumes it. `mix.ts` holds the pure rules
  (which channel a type plays on, which screens want a bed). A **jukebox preview** is a
  streamed media element on the **music** channel — `engine.preview` — that loops until
  another row is chosen or the jukebox is left; the jukebox itself asks for no bed.
- `src/lib/game/audio/drift.ts` — **how a song's stems are kept in line**, pure and
  tested: the hold, nudge-by-rate and seek thresholds (`driftAction`), read by
  `SongAudio`, which plays the stems and follows one of them with the clock.
- `src/lib/game/audio/parts.ts` + `src/components/game/band/PartAudio.tsx` — **a miss
  ducks its part out of the song**: `controlledStems` reads the song document's own
  `parts[].audioControl` into a kind → stems map and drops the master (it is the whole
  song, so it is never ducked); the registry holds parts out per **seat**, and
  `SongAudio` subscribes and sets those elements' volume to a tenth of their level
  (`HELD_SHARE`) until the part's next hit. `unplayedStems` is the other half: a stem the
  run never plays at all — the guide vocal under a singer — is never loaded. One-way, and
  never read back into judging.
- `src/lib/game/band/media.ts` + `flares.ts` (and `BackdropFlares.tsx`) — **the backdrop**:
  `StageMedia`, the ladder `backdropFor` walks (a song's video, then its art, then ours),
  `DEFAULT_BACKDROP`, and the plan for the room's drifting lights.
- `src/lib/game/jukebox.ts` — the jukebox's own maths, pure and tested: which
  letter a title files under, what a song's slot is called (`A·03`), and what a
  search matches — **title, artist or album**, through one accent-folding
  normalisation, with **one typo** forgiven against a word of those fields when a
  four-character, single-word query matches nothing exactly. The result is still a
  yes or no, so the groups, the order and the slot codes never move. A few hundred
  songs is a list you navigate, and this is what makes it navigable.
- `src/lib/game/jukeboxWindow.ts` — the jukebox's **window**, pure and tested: the
  mounted item range, the spacer heights that stand in for the rows outside it,
  a letter's offset, and the row step focus follows. `useJukeboxList` measures one
  heading and one row and `Songs.tsx` renders only this slice.
- `src/components/game/screens/useJukeboxList.ts` — the jukebox list's **DOM
  orchestration**, so `Songs.tsx` keeps the toolbar, the search, the preview and
  the rows: the scroller ref, the measured heading and row (and the retry for a
  frame that misses them), the mounted window, identity-based scroll anchoring,
  the silent seating of the chosen row, and the ArrowUp/ArrowDown and Tab handling
  that can only see mounted rows.
- `src/lib/game/band/store.ts` — the band **remembered** between visits, in this
  browser's storage: a jukebox should know who is on stage from one song to the
  next. Pure except `loadPlan`/`savePlan`.
- `src/components/game/band/RunBoard.tsx` — where every run publishes its totals
  (`usePublishRun`/`usePublishRuns`) so the results screen has real numbers.
  Publish-only: nothing here is ever read back into judging.
- `src/lib/game/publish.ts` — **when a run's ref state is handed to React**, pure and
  tested: a dirty check, an 80 ms throttle, and the final frame on a known length or a
  stopped transport, so the last notes cannot be lost to the stage unmounting.
- `src/components/game/band/StageDirector.tsx` — the bridge between the screens
  and the clock: it seeks, plays and pauses per screen and reports the song
  ending. Headless, and below `StageClockProvider` because it drives the clock.
- `src/components/game/band/SongAudio.tsx` — **the song's own sound**: the mix a
  document names, one streamed `audio` element per stem, the clock read from a
  sounding one, the rest kept in line by `audio/drift.ts`, and `finish()` when the
  last stem ends. A newly registered source is aligned to the playhead, so a
  count-in's seek is not undone.
- `src/lib/game/band/playhead.ts` — **the source playhead**, pure and tested: reads are
  monotonic, a stem switch cannot rewind the song, and a deliberate seek is the one
  move allowed backwards, guarded while the elements catch up.
- `src/lib/game/band/**` — the band model and geometry: `types.ts` (the **slots**: a
  player takes an instrument or one of the melody's roles, plus `BandPlan`,
  `makeBand`, `lanePlayers`/`melodyPlayers`, `melodyRoles`, `melodyView`),
  `store.ts` (the remembered plan), `layout.ts` (the **pure region/panel geometry**:
  `fitPanels`, `computeBandLayout`, `STAGE_GUTTER` — the clear space each stage
  keeps at its edge), `melody.ts` (the **pure vocal geometry**: `rowCentre`,
  `barSpanMs`/`nextOnsets`, which keep a note's bar inside its own turn,
  `rollNotes`, which draws each note once however many parts are on it, and
  `lineSpanMs`/`linePlace`/`mountedLines`/`linesInWindow`, the words' twin of
  that geometry on the same layer) and their
  unit tests. Change the geometry here, not in the components.
- `src/lib/game/track.ts` — **our track format**, and the only module that owns
  its shape: instruments and their kits, lane notes and their kinds, charts,
  melody parts and lines, plus `chartFor`, `momentAt` and `chartProblems`.
- `src/lib/game/sources/**` — **the source translators**, and the one shape they all hand
  back (`ParsedSource`, `types.ts`). `midi.ts` is the MIDI file as bytes and a tempo map;
  `ghmidi.ts` is the Guitar Hero / YARG **note-track convention** (the pitch
  bands, the strum/hopo flags, star power, sections, the lyric track); `chart.ts` is Clone
  Hero's `.chart`; `ultrastar.ts` a karaoke `.txt`; `stepmania.ts` a dance `.sm`;
  `lyrics.ts` timed lyrics (`.lrc`/`.srt`/`.vtt`); `sng.ts` the **package container** whose
  metadata is a `song.ini` and whose `notes.mid`/`notes.chart` is the chart;
  `lyricLines.ts` turns syllables into
  words and lines; `ini.ts`
  reads a `song.ini`; `common.ts` is the small rules the readers share (a release year
  whether it came from a `.chart` or a `.txt`); `detect.ts` says what a file is from its
  own bytes; `parse.ts` is the one door in; and `write.ts` turns a source into the three
  documents (or, at runtime,
  straight into a `Track` via `trackFromSource`). Pure and unit-tested, and the same code
  serves the importer and the browser.
- `scripts/import/index.ts` — `bun run import --from <dir> --to <dir>`: a folder of charts
  into a library. It writes `playlist.json` plus a song and a chart a piece, holds every
  chart to `chartProblems`, **copies no audio** (stems are referenced, relative to the song
  document or under `--audio-base`) and writes an `audio-manifest.json` of what each song
  needs. `--dry-run` reports without writing.
- `src/lib/game/lanes.ts` — judging a player's highway: one pure reducer per
  player, note kinds, chords, the hopo gate, opens, sustains and the whammy, plus the
  **touch** trigger a tap on a hit marker sends. It
  reads that player's chart and that player's input, and nothing else, ever. It also
  counts **errors** apart from misses: a wrong strum is the player's, a window closing
  is nobody's, and records when each note **landed** (`hitTimes`) for the hit's own
  feedback — never for judging.
- `src/lib/game/scoring.ts` — the scoring rules in one place: the hit window, 50
  points a note, `HERO_MULTIPLE`, the 1..4 streak multiplier, the measure and hold
  maths, the base score and the star rating.
- `src/lib/game/typing.ts` — the typing engine: the three difficulties, which
  characters count, the forgiving skips, and the grace at a line's edges.
- `src/lib/game/input.ts` — the **actions** a player's hands make (put a fret down,
  strum, wave the whammy), the pure action-to-trigger function, and the machine's
  highway player (`autoInput`), which goes through the same triggers.
- `src/lib/game/simulate.ts` — **the automated player's verdicts**: `autoVerdict`
  (what a seat nobody is holding is judged by) and `autoTyping` (a second typist,
  typing through the real engine), both derived from the song's seed so a run plays
  out the same way. This is **real behaviour** — the machine is a controller like
  any other — not the fixture generator, and neither path shortcuts the judging.
- `src/lib/game/controls/**` — controllers as data and as a plan, pure and tested:
  `layout.ts` (the keyboard, gamepad and MIDI tables, the key codes, note names and
  their labels, the presets, and the steps a player is taken through to set one up),
  `plan.ts` (which seat plays
  with what, the seats fighting over one control, and the keyboard layout an
  explicit choice takes), `pad.ts` (a gamepad snapshot and the edges since the last
  look).
- `src/lib/game/band/notes.ts` — the highway's own geometry and its note
  treatments (`columnCentre`, `noteGlyph`, `noteClasses`, `heldColumns`,
  `hitBursts`), pure and tested.
- `src/lib/game/mock/**` — the **fixture generator, and nothing but fixtures**:
  `songs.ts` (the fixture songs: a few written by hand, then every
  pairing of two word lists), `track.ts` (lyric lines, a duet, a pitch contour with
  the odd freeform line, and a chart for every instrument at every difficulty, each
  opening with the note zoo), `files.ts` (those songs written out as the three
  documents the game reads — the playlist, the song documents and the chart
  documents — pure, so a test reads its own output back) and `random.ts` (a seeded
  PRNG), with their tests. No product code lives here and nothing outside it imports
  it for behaviour. A real playlist replaces all of it; the shipped library is
  EverythingStar FOSS.
- `src/lib/game/pitch.ts` — **YIN pitch detection**: the difference function,
  cumulative-mean normalisation, an absolute threshold and parabolic interpolation,
  decimated and buffer-reusing so a frame costs a fraction of a millisecond, and
  listening only across the **sung range** (65–1500 Hz), so a rumble or a room's
  whistle cannot become a note. Pure and unit-tested against synthetic buffers —
  including a vibrating, harmonic voice — so it can be corrected without a microphone.
- `src/lib/game/singing.ts` — what the game makes of a pitch: the row → MIDI anchor,
  the tolerance each level of a voice is listened at, the **trail** of recent samples,
  and `singVerdict` — how much of a note's own span was held in tune, and whether
  that is enough to land it. Pure and tested.
- `src/lib/game/run.ts` — the run: `advanceRun` walks a cursor through a chart to
  accumulate score, combo and meter (incremental, and it replays from the top
  when asked for an earlier time, which is what makes a seek work), plus
  `activeLineIndex` / `activeWordIndex` for the karaoke playhead. Worth keeping.
- `src/lib/game/scroll.ts` — the scrolling-axis maths: `axisPercent` places a
  moment on an axis and `nextAxisOffset` moves the layer past it; `notesInWindow`
  slices the chart for the mounted window. Worth keeping.
- `src/components/game/band/**` — the stage: `BandStage` (measures the stage,
  renders the regions and an overlay slot), `MelodyRegion` with its two views
  (`LyricsView`, `KeysView`), `TypeWord` (the per-character typing feedback),
  `LanesRegion` + `PlayerPanel` + `ScoreRail` + `InfoRail` + `Highway` (the note
  area, a face per skin and an instrument kit), `StageBackground`, `StageClock` (the one
  frame loop and the transport), `StageControls` (the one input route: who plays
  with what, the microphone, MIDI, setting a controller up, and the listener and poll
  behind them),
  `useMicInput` (the microphone: YIN on the frame loop, into a trail), `useMidiInput`
  (MIDI: one access object, the connected inputs, and permission on a gesture),
  `useSinging`
  (the singers' runs, from the trail or the simulator), `StageDirector` (the clock
  per screen), `RunBoard` (the published totals), `SongContext`, `useScrollTrack`,
  `useLaneRun` (a player's judging, off the clock), `useTyping` (the typists'),
  `useHaptics` (one seat's buzz and rumble), `useWakeLock` (the display a run holds),
  `useElementSize`, `useFullscreen` and the temporary `BandControls`. `PlayerPanel`
  is instrument-agnostic — the instrument is data — and owns its lane's run.
- `src/styles/band.css` — the band stage styling (regions, player panel, rails,
  highway and its note treatments, preview controls). It is imported by
  `GameLayout` for the game-only entries and by `play.astro` for `/play`, always
  **after** `global.css` in source. The production bundler can still concatenate
  `band.css` first, so the file **states Tailwind's layer order itself**
  (`@layer properties, theme, base, components, utilities;`). Without that,
  `components` becomes the first layer, Tailwind's preflight (`base`) lands after
  it, and resets the welcome title, the mode chips and every `.band-btn`. The
  marketing pages deliberately do not carry this stylesheet, which is why `/play`
  states the global-then-band pair itself. `tests/e2e/play-style.spec.ts` pins the
  computed styles in the dev suite **and** the production-preview suite.
- `src/lib/{site,button,nav}.ts` — types and pure helpers (`buttonClass` shared
  by `Button.astro`; `siteNav` shared by header and footer and unit-tested).
- `src/i18n/**` — `locales.ts` (currently only `en`), `ui/en.ts` (the source of
  truth), `index.ts` (`t`), `astro.ts` (`tFor`, `localeFromPath`), `react.tsx`
  (`I18nProvider`, `useT`, `withLocale`), `paths.ts` (`localePath`).
- `src/styles/global.css` — Tailwind v4 `@theme` tokens (colours, the radius
  scale and the fonts) and the shell components (`.spray-*`, `.hazard`,
  `.comment`, `.mark`, `.sticker`, the nav), plus the print and reduced-motion
  layers.
- `wrangler.jsonc` — the Cloudflare upload: the Worker name and
  `assets.directory: ./dist`, with **no `main` and no `run_worker_first`**, so
  `bunx wrangler deploy` uploads static files and nothing else. `workers_dev` and
  `preview_urls` are off, and the empty `previews` block is inert now that Workers
  Builds is disconnected. A provider is its own project.
- `scripts/generate-icons.mjs`, `scripts/fetch-fonts.mjs`, `scripts/check-budget.ts`,
  `scripts/og-card.html`, `scripts/render-cards.ts`, `scripts/check-docs.ts` — icon set,
  self-hosted fonts, the dist/audio size caps, the social cards' source layout and
  renderer, and the documentation gate.
- `.github/workflows/ci.yml` — CI installs with a frozen lockfile and runs
  `bun run verify`.
