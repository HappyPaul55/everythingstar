---
title: Gotchas
description: "The rules that have already been broken once: the vocabulary, the track format, the parsers, the stems, the stage geometry and the local records."
updated: "2026-11-01"
order: 3
---

A reference, and a long one: it is the reasoning behind the code, kept because each rule was learned the hard way. Search this page when something behaves oddly; add to it when you find the next one.

- **The vocabulary is exact: player, panel, highway, column, part, role, chart,
  seat, controller, layout.** "Lane" used to mean two different things and the
  confusion showed up in every conversation about the stage, so it is gone. A
  **player** is someone on stage; a **seat** is their one place in the band
  (`Player.seat`), so "Player 3" means one person on the band screen, on the stage,
  in the plan and in the results; a **panel** is their 1:1 area; a **highway** is the
  scrolling note area inside it; a **column** is one vertical lane of that highway;
  a **part** is a melodic line in the track; a **role** is what a melody player does
  with a part (`sing` or `type`); a **chart** is one instrument at one difficulty; a
  **slide** is a **link** between two notes and never a note kind; a **controller**
  is what a player holds (their own keys, a gamepad, a MIDI kit, the microphone, or
  the machine); and a **layout** is what that controller's controls mean. Keep to
  these words in code, comments and conversation.
- **The charter is an island, not a screen.** `/charter` is its own React root with
  its own `StageClock` and `SongAudio`; the game's session, band, judging, score board
  and mixer are not mounted there. Do not add it to the screen machine, and do not
  grow `/play`'s initial graph with it. It is game-only and `noindex`, and the only
  shared pieces are the pure rules and the stage's clock/audio components.
- **A charter take is the game's actions, and an export is the game's chart.** The
  recording path is `ActionEvent` → `takeNotes` → `normaliseChart`, the same actions a
  run judges; the download is a Clone Hero `.chart` written from the same note list.
  A song may carry more than eight charts: the **panes** show at most eight, the
  chart list is the whole song, and only the active pane is the recording target.
  There is no write-back to a remote chart and no persistence beyond the tab; the
  download is the save.
- **Our track format is the one shape every source normalises into.**
  `src/lib/game/track.ts` holds it: `Track` → `MelodyChart` + `LaneChart[]`, and every
  format the translators read — Guitar Hero / YARG and karaoke MIDI, Clone
  Hero `.chart`, UltraStar `.txt`, StepMania `.sm`/`.ssc`, timed lyrics — is translated into it.
  Nothing below that line knows where a track came from, and **nothing outside
  that module changes the shape**. `chartProblems` is the validator every source
  parser is held to, and the mock passes it.
- **The translators are all of `src/lib/game/sources/`, and they hand back one shape.**
  A parser takes bytes (or text) and returns a `ParsedSource` — meta, audio, lanes,
  melody, sections, problems — and nothing else in the game knows a format. `parse.ts`
  is the single door (it sniffs with `detect.ts` first), and `write.ts` turns a
  `ParsedSource` into either the three documents (the importer) or a `Track`
  (`trackFromSource`, the runtime). **The same pure parsers run in the browser and under
  `bun run import`**, which is what makes the importer a test of the runtime code rather
  than a second implementation. A new format is a new file here and a line in `parse.ts`,
  never a change downstream.
- **The translators and the rarely opened dialogs are not in the first download.**
  `parse.ts` and every reader behind it (MIDI, `.chart`, StepMania, UltraStar, lyrics)
  are fetched with `await import(...)` at the browser call sites — `folder.ts`'s
  `parseLocal` and the `.sng` header/entry read, `sources/sng.ts`'s `parseSngSource`
  (therefore `async`), and the package's browser readers behind `library/sngSong.ts`
  and `preview.ts`'s `.sng` branch — so a player who only opens the JSON library never
  downloads them. `sngNames.ts` keeps the name-only helpers (and `isSngUrl` its own
  tiny module) out of the reader's chunk, so the package's `MAGIC` cannot leak back
  into the first download. `parseSource` itself
  stays synchronous and pure; the laziness lives in the caller, not in the parser.
  `PlaylistsDialog`, `DownloadsDialog`, `CalibrationDialog`, `IntentDialog`,
  `BragCardDialog` and
  `BandControls` are
  `React.lazy` with a
  `Suspense` fallback of nothing, because each is opened by one press (the jukebox's
  toolbar, Options' Calibrate, a `/open` link, a kept run's Brag card, `?dev=1`) and a
  dialog arriving a moment
  later is invisible while a whole-screen spinner is not. **The profile envelope is
  fetched the same way**, with `await import("…/profile")` in Options' two handlers,
  because importing or exporting is a once-a-session press rather than page code. A
  lazy dialog still mounts as
  a native `<dialog>` with `useModal`, and its opener keeps `aria-haspopup="dialog"`, so
  Escape and focus return are unchanged. **The initial `/play` graph is the number that
  matters** — 577 KiB raw / 186 KiB gzipped across 21 files — and
  `scripts/check-budget.ts` gates the initial raw and gzipped sizes directly, and fails
  if a translator marker appears in it. Do not lazy-load the main screens: a flash on every navigation costs more than
  the bytes it saves.
- **A `.sng` is a container, not a chart format.** `sources/sng.ts` reads the little-endian
  header and file index, turns the metadata table into the `song.ini` the chart readers
  already know, and hands `notes.mid`/`notes.chart` to `parseSource`. The XOR mask is
  applied with the byte's position **inside that file**: `mask[i % 16] ^ (i & 0xFF)`.
  A container offset produces a plausible file with the wrong bytes. A playlist entry may
  point its `song` at a package; the entry is still the summary, because listing must not
  download every package. A local package is read in slices (`readSngHeaderFromFile`,
  `readSngEntryFromFile`); a remote one is fetched whole and its members become object
  URLs. A remote package is kept for the rest of the visit in a **bounded in-memory
  cache** (`sngCache.ts`: two packages and 64 MB, least-recently-used first, shared by
  the jukebox's preview and the band's load), so opening the band does not download
  the same package again; that is a cache for a second reader, **not persistence** —
  nothing goes in IndexedDB, because a package carries the audio.
- **The Guitar Hero / YARG note-track convention, in one place.**
  One MIDI track per part (`PART GUITAR`, `PART DRUMS`, `PART VOCALS`, `HARM1`…), every
  difficulty inside it, and the meaning carried by the pitch: `60/72/84/96` are green on
  easy/normal/hard/expert, `+1..+4` are the other frets, `+5` is the **hopo flag** and
  `+6` the **strum flag** (the chart says which, per note — do not re-derive it), `−1`
  (59/71/83/95) is the **open** note on a guitar and the **kick** on drums (column 5),
  `116` is **star power**, and on a voice track `105` opens a lyric line and the lyric
  events carry the syllables. **A `song.ini`'s `offset`
  is applied once to the whole timeline** (`withOffset` in `ghmidi.ts`), not again to
  notes, sections and the `[end]` marker. **Voice parts are compacted** to `0..n-1`
  after reading, because a harmonies chart can ship `HARM1`/`HARM2` with no
  `PART VOCALS`, and a singer on part 0 must still have a part. Read `ghmidi.ts` before
  touching any of it: the constants are there, with the reasoning.
- **A `.chart`'s tempo is thousandths of a BPM, and its resolution is load-bearing.**
  `chart.ts` reads `B` values as thousandths — `240000` is 240 BPM — and every tick
  against the `Resolution` (or `TimeDivision`) the `[Song]` block states. A resolution
  that is not a positive number would divide the whole chart by zero, so it is replaced
  with **480** and named as a problem rather than left to become `Infinity`.
- **Running status is for channel messages only.** A MIDI meta or sysex event must
  **not** become the status a following data byte is read against. It is one line in
  `midi.ts` and getting it wrong silently swallows the note after every sysex — 3% of the
  test library drifted by a byte before it was found. If MIDI parsing ever "loses
  a track", look there first. A track whose declared length runs **past the end of the
  file** stops at EOF with a problem rather than looping on a zero read; a file cut
  **inside its header, inside a track header or between tracks** is named for the same
  reason, rather than read as an empty song with nothing to play. A RIFF `RMID` wrapper
  is unwrapped to the MIDI inside it before the header is read.
- **Lyrics arrive as syllables; the game reads words.** `lyricLines.ts` is the only place
  that groups them. A source may say **explicitly** where a word starts (`Syllable.wordStart`,
  which is how UltraStar's leading space and `~` continuation are carried) or leave it to
  the Guitar Hero convention (a trailing `-` continues, `+` is a note with no characters,
  a long gap starts a new word). A `Syllable.hero` makes its word a hero as well as its
  note. A `MelodyWord` is the whole word (what a typist types); a `MelodyNote` is one
  syllable (what the roll draws and the singer judges). Do not put whole words on notes or
  syllables in the line's words. **An LRC line takes the body after its first
  timestamp** — `[00:12.30][00:20.00]hello` is two cues for the same words, not one cue
  at the last bracket — and a sheet with **no timed cues** is no melody and a named
  problem, not a three-second song with no words.
- **UltraStar is its own format, not Guitar Hero.** `sources/ultrastar.ts` reads a
  **quadrupled** BPM (`60_000 / (bpm * 4)`), a decimal comma, and a pitch that is
  **semitones from C4** (`60 + pitch`): `-4` is a real note and `0` is C4. `*` is a golden
  hero note, `R`/`G` are freeform (rap) and `G` is a hero, and `F` is freestyle and is
  dropped. `-` is the only phrase break; `~` and a leading space are word continuation and
  a new word, never a line break. `#AUDIO`/`#MP3`/`#COVER` resolve against the chart's
  `baseUrl`; `P1`/`P2` are two parts; `#RELATIVE:yes` uses phrase markers' beat offsets.
  The karaoke regression is 3:08.9 and `get up get coffee`, not 12:01 and
  syllable fragments.
- **StepMania comments do not eat a URL, and only single modes play.** `stepmania.ts`
  treats `//` as a comment only at a line start or after whitespace, so
  `#MUSIC:https://host/song.ogg;` keeps its `https://` rather than losing it to a
  stripper. Only `*-single` modes are charts (a double, couple or routine file is named
  and skipped), and **every `#BPMS` value is validated**: a non-positive tempo is dropped
  and named, and a file with no tempo assumes 120 rather than running time backwards.
- **Audio is referenced, never copied, and resolves against whatever wrote it.** The
  importer writes stem URLs relative to the song document, with `--audio-base` as the
  override (its default is `../audio`), and a raw source's sibling files resolve against
  the source's own URL — the same `resolveUrl` rule everything else follows.
  `audio-manifest.json` beside an imported library lists the files each song needs,
  because we do not ship them.
- **A folder off this machine is a source like any other, and it is remembered.**
  `folder.ts` addresses a local song by a `folder://<id>/<path>` URL, walks the tree with
  the File System Access API and parses each chart with the *same* parsers, so nothing
  downstream branches on "local". The handle **is structured-cloneable**, so it and the
  songs reading it found live in IndexedDB (`store.ts`): the list is on screen at once
  after a reload instead of half a minute of walking a disk again. **What each song was
  read with goes down too** (`songFiles`, written by `folderFiles`/`readLocalSongFiles`):
  the URL says where a chart is, and that record says what it was called and what sat
  beside it, so a restored song is **readable** rather than merely listed. Leaving it out
  is a library of songs that each load with no chart and no audio — "No chart for this
  instrument" on every panel, on a folder full of songs. A reload also takes the browser's
  **permission** to read the files, so a restored folder comes back **locked** — its songs
  listed, its charts unreadable until somebody presses Reconnect, because only a gesture
  can ask. `isLocalFolderLocked` is how a load says *that* rather than "could not be read",
  and the band screen shows the problem **before** the run (`screen__warn`) instead of
  leaving it to the stage's own "nothing to play". A record written by a build that kept
  no file names is **repaired from the folder itself** — `repairFolderFiles` lists each
  song's folder again and parses nothing, which is what Reconnect does besides asking —
  so a library from an older build comes back playable rather than merely present. A
  record that **names no audio** is repaired the same way, because a song with a chart
  and no stems lists, opens, plays its notes and is silent, which is the one failure a
  player cannot diagnose from the outside; the names are one listing away. A **`.sng`**
  is a song of its own: `readFolder` reads each package's header and chart, and its record
  says `package: true` with the member names, so the cover, preview and stems are sliced
  out of the package rather than looked for beside it. A folder holding packages is not
  also read as a lyric sheet because of a stray `changelog.txt`.
  `persist()` never throws: a browser that
  cannot keep a folder is a folder that is not remembered, never a folder that will not
  open. A folder's chart is fetched **once for every seat**, unlike a playlist's per-chart
  fetch, because a MIDI holds every part and difficulty in one file.
- **An import is the same folder, copied where every browser can read it.** Safari and
  Firefox have no `showDirectoryPicker`, so `importFiles` in `folder.ts` takes the
  `File`s from an `<input type="file">` (files or `webkitdirectory`) or a drop and copies
  them to **`imports/<id>/` in the Origin Private File System**, then hands that
  directory to the **same** `readFolder` and parsers. `localImport.ts` is the pure part:
  the root name and id are **content-derived** (`slug(name)-hash(name)` plus a digest of
  the selected relative paths, with generations added as a separate `-2`/`-3` suffix),
  so two selections that happen to share a name are different sources. Paths are
  relative to the chosen root, a batch is capped at **512 MB**, and
  `navigator.storage.estimate()`
  must leave **16 MB** free so a nearly full origin is refused rather than filled.
  `drop.ts` walks `DataTransferItem.webkitGetAsEntry()` folders; a drop and a directory
  input end up as the same path list, so there is no second way to name a tree. The
  record says `opfs: true` and **keeps no handle** — the directory is reopened from its
  id on restore, which is the part that makes the copy readable without a picker. An
  OPFS handle has no permission to lose, so `folderAccess`/`isLocalFolderLocked` report
  an import as **granted** rather than locked (a non-OPFS handle with no
  `queryPermission` is granted too, and `requestFolderAccess` answers true for an
  import). **A re-import is a new generation, not an overwrite**: `uniqueImportId`
  picks `imports/<id>/`, `imports/<id>-2/` and so on from the OPFS directories
  themselves, so a failed copy is dropped alone and the earlier copy stays readable;
  when the new one is whole, `removeReplacedImports` deletes every earlier generation
  of that folder. The dialog's **Forget** and **Close** are busy-guarded
  (`canForget`/`busyRef`), because closing a folder mid-copy would delete its
  directory out from under the writer. `closeFolder`, and a copy or scan that fails,
  delete `imports/<id>/`, so removing an import does not leak disk; a picked folder is
  never deleted.
- **A remembered folder can be a stale summary, not just stale file names.**
  `StoredFolder.version` is the scan generation; `FOLDER_SCAN_VERSION` in `folder.ts` is
  bumped whenever the reader changes what a folder's songs *are*. A folder with no version
  (or an older one) is **rescanned once** on restore when permission is already granted.
  **Reconnect always rescans**, not merely re-lists, because the press means "read this
  folder again". A restore **merges** folders added while it was running
  (`mergeFolderSources`: the live row wins, a restored one is appended), and one folder
  the browser will not walk keeps its own summaries rather than taking the rest of the
  library down with it. A stale folder that is **locked** keeps its old scan version, so
  the next Reconnect still knows it has work to do. Without this, a folder scanned
  before the UltraStar fix kept its old song summaries — the karaoke song still said
  "no voice", so the band screen offered no Vocals/Type — and its old chart record was a
  `license.txt`, which is where "no #BPM; assuming 120"
  came from. Belt and braces: `readLocalSource` re-picks `findSheet` and the audio from the
  folder even from a stale record, and the band screen derives its modes from
  `offerFromDoc(doc)` rather than trusting a summary. A record that names no audio is
  repaired from the folder **once** (`checked` in the record): after that it is a
  chart-only song, and listing it again on every restore can never find a stem that is
  not there.
- **The stage draws its own cursor set, and only the stage.** `public/cursors/` holds the
  whole palette — the tag arrow at rest, the pointing hand for anything pressable, and
  `text`, `wait`, `help`, `move`, `not-allowed`, `grab`/`grabbing` and `zoom-in`/`zoom-out`
  beside them — every one a hand-authored **SVG and nothing else**. Chromium, Gecko and
  WebKit all take an SVG cursor, so there is no raster twin to keep in step, and each one
  carries its own `width`/`height`, which is the thing that lets an engine take it as a
  cursor at all. An engine that will not has the **keyword at the end of the declaration**
  to fall back on — which is why every `cursor` here ends in `auto`, `pointer`, `text` or
  the rest rather than a bare `url()`, and why a fallback is never a file we keep.
  `band.css` applies them to `.band` under `@media (pointer: fine)`, and **the hotspot
  lives with the `url()` in the CSS**, not in the drawing, because it belongs to how a mark
  is used. The ones with a home are applied (a field you type in, a slider, a control that
  refuses, the loading screen); the rest are held for the screen that needs them. Two ways
  of drawing carry the whole family: a **hand is a union of rounded digits** — one group of
  `<rect>`s drawn as the shadow, the outline, and a fill-only pass that paints the joins
  away, so only the silhouette keeps an edge, and the creases between the fingers are drawn
  back on top because a union has no valleys of its own (tune the digits, not the passes) —
  and a **glyph is cased strokes**, the same path drawn as an ink casing under a yellow
  core, so a `?` or an I-beam gets the inked edge a filled shape has. **One list of
  selectors says what is pressable** so a new control is never the one thing still drawn by
  the desktop. The paper pages keep the browser's own. New artwork is a new SVG and a line
  in the CSS; move the hotspot with it or the tip and the pointer part company.
- **Fullscreen is product behaviour, and it shares the dev corner.** `StageFullscreen` sits
  in `.stage-corner` with the dev panel — **one container**, so the two can never sit on
  each other — and shows only when there is somewhere to go (a browser that cannot do it
  gets no button; a screen already filled needs no invitation). It is the way *back* into
  the screen after Esc, which the welcome's own button cannot be. Do not put it behind the
  dev flag: fullscreen is how the game is played.
  **A microphone prompt can leave fullscreen.** Some browsers drop out to ask, so the
  band captures whether the stage was fullscreen before `requestPermission` and calls
  `fullscreen.restore(wasActive)` once the browser has answered. It is best effort — the
  permission answer may no longer carry the gesture `requestFullscreen` needs — but it
  puts the screen back when the browser allows it, and does nothing when the prompt did
  not take it away.
- **A folder is a song only if it is one.** The walk stops at a folder holding a chart —
  but a `.txt` beside a chart is a **changelog**, not a lyric sheet, and a folder with
  sub-folders is a **collection**. Getting this wrong is what made a chart collection
  read as one nameless song with no length, with every song underneath it never
  reached; the rule is `isSongFolder` in `folder.ts`, and the test that pins it is the
  shape of a real chart collection (a changelog beside forty song folders).
- **An UltraStar folder has more than one `.txt`.** `song.txt` is the chart, `license.txt`
  is documentation and `instrumental.txt` is a second chart; picking the first `.txt` gave
  the instrumental version or a license as the song. `findSheet` in `sources/files.ts`
  prefers `song.txt`, ignores license/readme/changelog/copying/credits, then takes another
  `.txt`, then a timed lyric sheet. Both the folder reader and the importer use it.
- **A file name is a table, not a guess.** `sources/files.ts` holds the audio and art
  names a chart folder uses — `album.png` is the convention but `album_alt.png` is how 92
  of the test library's songs ship their cover, and a chart folder that re-cut its art
  leaves the old one beside it. `audio.mp3`/`audio.ogg` are the UltraStar master, not a
  second choice; without them the folder's `#MP3` stayed a bare name and the run was
  silent. `findName` picks the best of what is there; the table is shared by the importer
  and the folder reader so the two cannot drift. **`findChartName` is the one folder-level
  chart order** — `notes.mid`, then a `.chart`, then a `.sm`, then `findSheet` — and both
  listing a folder and playing a song from it use it, so the file a row is drawn from is
  always the file the run reads.
- **A file says three encodings, and `decodeText` reads all three.** UTF-16 (a `song.ini`
  written on Windows is often that — read as UTF-8 it gives a title with a space between
  every letter), UTF-8 when it decodes, and **CP-1252** otherwise (or `Zürich` comes
  out as `Z?rich`). Metadata is the whole point of the jukebox; a title that is nearly
  right is worse than one that is obviously missing.
- **What a file does not say, the folder does.** `folderAttribution` reads the
  `Artist - Title` every chart folder names its folder by — a **fallback only**, for the
  copies that lost their `song.ini`. And a length the file never states comes from the notes
  (`sources/duration.ts` plus a tail), which is what turned 70 songs that read `0:00` into
  songs with a real time on them.
- **Art read from a folder is a file, not a URL.** `folder://…` means nothing to an
  `<img>`, so `useArtUrl` reads the file and hands the element an **object URL**, revoking
  it when the element goes — two thousand covers kept alive would be two thousand
  pictures' worth of memory. Anything that shows a song's art goes through the hook,
  including the run's backdrop (`backdropFor` takes the resolved art). The same is true of
  stems when they are played.
- **Some early charts name their guitar track `T1 GEMS`.** Its frets sit in the same
  pitch bands as `PART GUITAR`, so it reads as a guitar with its extra pitches ignored.
  When a source turns up with a chart that will not load, look at its **track names**
  first — a naming difference is the usual reason a whole song comes back empty.
- **A library is three documents, and they are fetched separately.**
  `playlist.json` is the **index** — a summary per song, enough to draw a row and
  offer it to a band; `songs/<id>.json` is the **song** — its audio, its parts, and
  where each part's charts live; `charts/<part>/<level>.json` is the **notes**. The
  jukebox reads the first alone (500 songs is one fetch), the band screen reads the
  offer out of it, and a run fetches **one chart per seat**. Do not make a playlist
  carry a chart, and do not make a screen fetch a song to list it: the point of the
  split is that a list of a few hundred songs costs kilobytes. The entry is the
  index's summary and the song is the truth — where they disagree the song wins on
  stage — so a drift shows up as a menu that offers something nobody can play, which
  is why the generator's output is read back by a test.
- **Everything fetched is somebody else's file, and none of it is trusted.**
  `read.ts` holds the primitives, and each reader says its own rules: a song missing
  its id, its title or its file is **skipped and named**, never fatal, and a document
  that is not a playlist at all comes back empty. Problems surface in the playlists
  dialog, not in a thrown error. Every path resolves against **the document that
  wrote it**, so a playlist can live anywhere and point at files beside it.
- **A fetched chart is validated before it reaches the stage.** `assembleTrack` in
  `source.ts` holds every lane chart to `chartProblems`; a chart that fails is **dropped**
  from the track and reported as `instrument/difficulty: problem`, so a malformed fetched
  document costs its part, never the run. `trackFromSource` uses the same gate for a
  folder or a `.sng`, and `useSongTrack` merges the problems into the band and loading
  screens. The importer still validates what it writes; this is the same rule at runtime.
- **A URL is fetched only if it is http(s), and its body has a ceiling.**
  `src/lib/game/url.ts` is the one policy: absolute, `http:` or `https:`, with a host
  — so `javascript:`, `data:`, `file:`, `blob:` and relative addresses are refused
  before any `fetch`. A URL **carrying credentials** (`https://user:pass@host/x`) is
  refused too: it parses, but `fetch` would throw an opaque TypeError rather than the
  readable refusal the dialog can show. The Playlists dialog shows the **host** the
  address will reach as it is typed, refuses anything else with a short inline reason,
  and allows an `http:` address while saying the browser will block it on an https page
  as mixed content. `store.ts`'s `fetchJson`/`fetchBytes` are the **library document**
  fetch paths and enforce the same rule again, including **`response.url` after a
  redirect**; the downloader reuses the same bounded read (`fetchResponse`) into Cache
  Storage, and the mixer fetches its own sound files directly. A **document**
  — a playlist, a song, a chart, the sound manifest — is capped at **8 MB**, and a
  **`.sng` package** at **128 MB**: a dense five-minute chart is hundreds of
  kilobytes and a package with stems is tens of megabytes, while a video is past
  either. The declared `Content-Length` is an early exit, not the guarantee: the body
  is read as a stream, and past the cap the reader is cancelled and the request
  aborted, so a host that lies cannot fill the tab. The read also has an **idle
  deadline** (`fetchBounded` in `store.ts`): a body that stops arriving is given up on
  rather than left as a spinner, and the timer is per step, so a slow download is not
  mistaken for a dead one. The caller's `AbortSignal` is
  forwarded. A failure is an ordinary `Error` shown by the playlist row or the
  search, and the `.sng` header caps in `sources/sng.ts` are separate and unchanged.
- **The library is fetched, and only the library seam fetches it.** `src/components/game/library/`
  is the seam: `store.ts` is the only module that touches IndexedDB, `useLibrary`
  owns the sources and the merge, `useSongTrack` owns a song and its charts. Nothing
  else fetches a library document (the downloader uses the same bounded read into Cache
  Storage, and the mixer fetches its own sound files). **The sources are seeded once** — a first visit writes the
  built-in EverythingStar FOSS playlist, and after that the list is whatever the
  player made of it. The seeded playlist is **disabled, not forgotten**: its row and
  URL stay and its songs leave the library until Enable, while a player's own
  playlist is removed. The badge on the jukebox's Playlists button counts the sources
  that are **on** — enabled playlists and folders — so a switched-off playlist, the
  built-in one included, is a row in the dialog rather than a number on the button.
  A **player's** playlist is read from the cache while we have one and re-fetched
  only when asked: **Refresh is a button, never something that happens behind the
  player**. The **built-in** playlist is the exception: it is the published FOSS
  library, so it is read **fresh once per visit** (the cached copy is the fallback),
  like the sound manifest, because a cached copy would keep listing old songs after
  the library changes. A browser that seeded the old `/playlist/default.json` is
  migrated onto the published library on load.
- **The game accepts playlists, not brands.** The one provider URL the game names is
  the **default seed** — the FOSS library — so a first boot is not empty and the
  shipped content is licence-safe. It is a URL like any other; do not add a directory
  of the sibling projects, a "recommended providers" panel or a branch for a named
  EverythingStar site. Everything other than that seed arrives through the generic
  `?playlist=` / `?song=` links or the Playlists dialog: the game is a third party to
  its own providers too.
- **The screen is mirrored on the document for the native shell.** `useGameSession`
  writes `html[data-screen]` (`welcome`, `songs`, `band`, `loading`, `countdown`,
  `playing`, `paused`, `results`). The app's boot reads it to keep the display awake
  only during loading/countdown/playing; it is a read-out, never an input, and nothing
  in the game reads it back.
- **Offline downloads are the one other fetcher, and they write Cache Storage, not
  IndexedDB.** `library/downloads.ts` resolves a song's playlist, document, all charts,
  all stems, art and preview, then `cache.put`s each URL into
  `everythingstar-offline-v1`. **Two workers** serve that bucket: this site's generated
  `scripts/sw.ts` (`dist/sw.js`) and the app repository's `native/sw.ts`. They are two
  builds of one contract, so the cache name is the same literal in
  `src/lib/pwa/cache.ts` and `native/sw.ts`; change both together, and bump the
  version if the stored shape changes. Byte ranges are `src/lib/pwa/range.ts` here and
  `native/sw-range.ts` there, pure and tested on both sides. The control renders when
  `navigator.serviceWorker.controller` exists — which the website's own worker now
  supplies, so **downloads exist in the browser too**, not only in the app. The job is
  **page-wide** (`startDownload` holds the one job for the session, so unmounting the
  jukebox does not end it) and **cancellable** (`cancelDownload` aborts it and deletes
  what the attempt wrote). A downloaded on-demand song is listed after a reload because
  `mergeOfflineSongs` merges the offline records into the library **last**. The app's
  worker handshake re-sends `clients.claim()` on every load because Android WebView
  does not always put a fresh document under an active worker; the website answers the
  same message harmlessly. JSON is network-first when online (the cached copy is the
  offline fallback); stems/art are cache-first. A download is all-or-nothing: a failure
  or a `QuotaExceededError` deletes everything the attempt wrote. YouTube-backed and
  local folder songs are refused rather than half-saved.
- **A whole playlist is saved through the same downloader, not a second one.**
  `startPlaylistDownload` (`library/downloads.ts`) takes the **one** page-wide job slot
  and runs `downloadSong` over the plan one song at a time, so a saved playlist is a
  set of ordinary per-song records — the Downloads dialog lists every song, removing
  one takes only its files, and there is no playlist manifest to keep in step.
  `planPlaylistDownload` is the pure pre-flight the Playlists dialog runs while it
  draws: it returns the songs it would attempt and the ones it skips with a reason
  (`local` is already offline, `unsupported` is a browser with no worker), without a
  fetch. A song whose document turns out to be **YouTube-backed** is planned like any
  other and fails on its own step, because the playlist summary does not carry the
  audio source. The queue is `{ source, done, total, failed, skipped }`, told through
  `OfflineJobState`, with `busyId` following the song in flight so the now-playing
  slot's progress still works; `done` counts the songs the queue has **begun**, so
  `Saving 3 of 12…` is where it is. An **ordinary** failure is counted and the queue
  carries on; the songs already completed stay, and each failed attempt is rolled back
  by `downloadSong` itself. A **quota** failure stops the rest of the queue, since
  every later song would hit the same wall. `cancelDownload` aborts a queue as well as
  a single song. Nothing is offered for a **local folder** (already on the device), a
  **pinned song** (a source, not a catalogue) or an **on-demand** playlist (its songs
  are answers to a search) — those rows simply have no button.
- **The installed game's shell is generated, never hand-written.** `bun run build`
  runs `scripts/build-sw.ts` after Astro: it reads the built pages, takes every
  `_astro` chunk **including the lazy ones** (`precache.ts` is pure and tested), and
  bundles `scripts/sw.ts` with that list and the build's identity. Do not put a worker
  in `public/`: it cannot know the hashed names, and a page that loads but does not
  hydrate offline is exactly the bug that skipping the island chunks causes.
  `public/_headers` must keep `/sw.js` at `no-cache`; `scripts/check-pwa.ts` is the
  gate that the manifest, the shell entries and the registration are really there.
  Navigations are **stale-while-revalidate** (instant offline, a deploy lands next
  launch); same-origin shell files are cache-first; the downloaded-songs bucket is
  never filled by the worker. Two shell generations are kept (`SHELL_KEEP`), because
  `skipWaiting` can hand a running page a new worker while it still lazy-imports the
  previous generation's chunks.
- **The install prompt fires once, so it is captured before the island hydrates.**
  `src/components/pwa/InstallPrompt.astro` is an inline head listener (both layouts)
  that calls `preventDefault` and stashes Chromium's one-shot
  `beforeinstallprompt`; `install.ts` adopts that stash when the session mounts, and
  `useInstall` is only the reader. A hook mounted on the Options screen would miss the
  event entirely, and a deferred module listener would race hydration. The row is
  hidden inside the native WebView
  (`html[data-native]`), shows iOS the Share → Add to Home Screen sentence (there is no
  prompt there), and shows a browser without the event its own menu. The manifest is
  **hand-authored** at `public/manifest.webmanifest`; `bun run icons` generates the icon
  set (including the maskable source `brand-maskable.svg`) and deliberately does not
  write the manifest. `/app` and `/open` link the manifest and register the worker; the
  native WebView skips registration because boot sets `data-native` first.
- **A link is an invitation and the game answers it.** `/open?playlist=<url>` and
  `/open?song=<url>` are read once by `src/lib/game/intent.ts`, stripped from the
  address bar, and shown as a dialog; **nothing is fetched, added or played before the
  Add press**. A link arriving during a run is deferred until the game is on a page
  (`isRunScreen`), which is what lets the native shell hand a warm link over as the
  `everythingstar:open` window event instead of reloading a run. The URL rules are the
  existing `fetchableUrl` policy, plus one parameter at a time and an 8 KB cap. The
  canonical link is built with `URL`/`URLSearchParams`, and **Copy link** on a playlist
  (and on a pinned song) produces it. `/open` is `noindex`, not in the sitemap, and
  game-only; static hosting cannot give each link its own social card, so the page is
  deliberately generic. `deeplinks.md` is the contract; keep it in step with
  `intent.ts`.
- **A song can be a source with no playlist around it.** `?song=` adds a **pinned** song:
  the document URL is kept in the `sources` store under `pinned`, read through
  `cachedJson` (so it is offline-readable once seen), and its summary is built by
  `pinnedSong` from the document's own `offerFromDoc`. A pinned song is **not a
  playlist** for the source badge; it is listed under **Songs from links** in the
  Playlists dialog, where it can be refreshed or removed, and it is deduplicated by
  document URL and `id` against the playlists and folders. A `.sng` package is not a
  song link: it needs a one-song playlist entry.
- **The Android app is a separate repository, and the link contract crosses the
  boundary.** The app registers a verified App Link on `/open` (verified by
  `public/.well-known/assetlinks.json` on this site, which carries the release signing
  SHA-256; add a fingerprint when the key changes) and the `everythingstar://open`
  scheme. A cold launch arrives at `appStartPath` without the
  URL, so the app reads `App.getLaunchUrl()` and opens `/embed.html?…`; a warm link
  dispatches `everythingstar:open` with the original URL in `detail.url`; a pending
  query is kept in `sessionStorage` across the app's stale-page reload. The game reads
  only the query, so both the `https:` and custom forms work. `pageOfPath` already
  ignores the query, and the app page check compares the path. See `deeplinks.md` and
  the app's `native/deeplink.ts`.
- **A published document can change under the same URL; the playlist entry is the
  revision.** `Song.revision` is a stable hash of the raw playlist entry (`JSON.stringify`
  before it is interpreted). Song and chart cache entries store that revision, and a
  cache entry whose revision does not match the current entry is fetched again. This
  is what lets a song's chart list, duration or offer change in place without bumping
  `CACHE_VERSION`: change the playlist entry (or add a `revision` field to it when the
  summary would otherwise be identical) and its documents follow. A revision miss
  fetches with `cache: "reload"` so the browser's own HTTP cache cannot serve the old
  copy either. Keep `CACHE_VERSION` for changes to the documents' **shape**.
- **Lead and rhythm are two seats, not one guitar.** `PART GUITAR`/`PART GUITAR COOP`/
  `T1 GEMS` and Clone Hero's `Single`/`DoubleGuitar` are the **lead**; `PART RHYTHM` and
  `DoubleRhythm` are the **rhythm**. `LaneChart.role` and `Player.role`/`BandSlot.role`
  carry `LaneRole` (`lead` | `rhythm`); `chartFor`/`difficultiesFor` accept the role, the
  song offer may list two `guitar` entries, and the band screen asks which one when the
  song carries both. `lineupKey` includes the role, and the audio's `controlledStems` is
  keyed by `guitar:lead`/`guitar:rhythm` so one guitarist's miss does not duck the other.
  A roleless seat on a two-role song takes lead. The parser's dedupe key is
  instrument + role + difficulty.
- **A playlist can be a capability, not a catalogue.** `ondemand: true` in a playlist
  document (or `ondemand: { "param": "search" }`) says it is a **search endpoint**:
  it normally lists no songs, and the jukebox may ask it again with the words in that
  parameter (`searchUrl` in `playlist.ts`, built through `URL` so an existing query
  string and a hash are kept). The answer is the same playlist shape, read against
  the **query URL** with each song's `from` left as the source that was asked. The
  ask is the jukebox's search field: debounced, at least two characters, with Enter
  for now. Results **accumulate for the session** and are never written to the
  playlist cache — typing several searches builds a working set, and a reload starts
  from the capability again. A source is never asked before its manifest has been
  read, and a failed search is said under the field and retried by hand; the
  Refresh-is-a-button rule still holds for the manifest itself. A provider's song
  ids must be stable (the score board and the merge are keyed by them), and its host
  must send CORS headers like any other source.
- **The cache is a cache, not a library.** IndexedDB, one store keyed by the
  shape-versioned URL for all three documents, so the loader is the same code at
  every tier. The policy is pure and in `cache.ts`: **playlists are the last thing
  let go of** (kilobytes, and everything else is reached through them), charts and
  songs go oldest-first under the cap. **Audio is never stored by us** — the browser
  streams and caches it, and megabytes of stems would eat the quota the charts need.
  A browser with no storage at all is a library with no cache, not a broken game.
  **Trims are coalesced** (`coalesce` in `store.ts`): every write asks for one, one
  runs at a time, and a write that lands during it gets another pass afterwards, so a
  burst of charts costs one trim rather than one each. A **blocked or failed
  IndexedDB open is not memoised for ever**: the next caller tries again, so a tab
  that closed or a storage prompt that was dismissed does not leave the library
  cache-less for the visit.
- **A body is indexed by a small record beside it, so eviction never reads the
  cache.** The second object store (`cache-meta`, `DB_VERSION` 3) holds one
  `{ key, url, kind, at, size }` per body and never a body. `writeCache` writes the
  body and its record in **one readwrite transaction over both stores**, and
  `trimCache` reads the index — kilobytes — runs the same pure `evictions` rule
  over it, then deletes body and record together. Do not go back to `getAll()` on the
  cache store to sum sizes: a chart saved near the 48 MB cap made every later write
  deserialise tens of megabytes. The index exists for exactly that cost, not to
  change what is kept: the rules, cap and keys are the same. A browser that predates
  the index has bodies but no records, so the first cache use compares the two
  stores' **keys** and, only if they disagree, reads the cache store once and
  rebuilds the index (`metaOf`/`metaFrom`/`rebuildIndex` are the pure parts). That
  check runs once per page load and the full read once for that browser; old-shape
  bodies are dropped in the rebuild (their metadata with them), and a record whose
  body has gone is removed by the next trim rather than indexed for ever.
- **The stage runs on an empty track until the charts arrive.** `useGameSession`
  hands the stage `load.track ?? shellTrack(song)` — the song's own name and length
  with nothing on any highway — so a panel says **it has nothing to play** rather than the
  stage waiting to exist. The loading screen is not a beat any more: it waits for
  `useSongTrack` to say `ready` **and** the song's stems to say they can play, and
  **a chart that never arrives is said there and the run goes on without it**, because
  a band with one part missing is still a band. Keep the clock's duration coming from
  the song, not from a chart.
- **A band is loaded before the run, not during it.** Choosing a song starts its
  document and charts on the band screen, and `SongAudio` mounts the **same media
  elements the run will play** there. `SongAudioStatusProvider` watches them: the
  band's Play button waits for the charts **and** every stem the run will use to reach
  `HAVE_ENOUGH_DATA` (4 — the browser's "can play through", not merely "can start").
  While it waits the button reads **Loading…** with a count and keeps the player on the
  band screen; when everything is ready it dispatches `start` and the band goes
  **straight to the countdown**, so a ready song never flashes the load page. A stem
  that fails is settled and named under the song's problems; a wait that passes
  `PRELOAD_GRACE_MS` (45s) turns the button into **Play anyway** rather than trapping
  the player. On a phone `preload` is ignored until something plays, so the provider
  **primes** each stem with a muted play and pauses/resets it as soon as it is ready;
  the Play press primes again inside the gesture. **The clock does not start until the
  sound is ready**: `StageDirector` gates `clock.play()` on the same latched readiness,
  for the paths that skip the band (the attract demo, a replay), unless the player
  chose **Play anyway**, which releases the same gate. It is a **start** gate, not a
  mid-run brake — once the run moves, a stall is the source rule's job.
  The pure readiness arithmetic is `src/lib/game/audio/preload.ts`.
- **Audio: one graph, three channels, and a rule about when.** The mixer
  (`src/components/game/audio/`) sits above the screens, so the music outlives every
  one of them. It builds its `AudioContext` **on the welcome, suspended**: a browser
  will not let it run before a gesture, but it will let it **decode**, so every cue is
  in hand and the opening bed is downloading before the welcome's button leaves its
  "Loading…" state — a first click is then a click rather than a fetch. The graph is
  resumed, and nothing is allowed to sound, until the **first gesture**; the wait is
  capped, so a manifest or file that never arrives is a silent game rather than a door
  that will not open. **`kind` decides how a file
  plays**: a `track` plays through and the bank moves on (the menu music is a
  *playlist* — it always opens on the first file the manifest lists, then picks at
  random, never repeating), a `loop` repeats seam-free and is
  never advanced, and a `oneshot` happens. A **bed streams** (an `<audio>` element: a
  four-minute track as a decoded buffer is ~90MB of float samples) and a **one-shot is
  decoded** (it is milliseconds and wants to start now). Which channel a type plays on,
  and whether a screen wants a bed at all, are in `src/lib/game/audio/mix.ts` — pure and
  tested, because **a menu bed over a running song is the one thing the mixer must
  never do**. What to play is a **type** (`click`, `background`), never a file.
  **Asking for the bed that is already playing does nothing**, which is what stops a
  screen change restarting the track somebody is listening to. Asking for a type with
  no file behind it is **silence rather than an error**, which is what makes it safe to
  wire a sound before the sound exists.
- **Which file is the song is not the same question in every chart folder.** One that
  shipped a **multitrack** — three or more distinct instruments, however many files they
  are cut into (a kit's `drums_1..4` is one instrument) — has a `song.ogg` that is
  **not** the song: measured across the test library those masters are 22–88%
  present, some opening with a minute of digital silence, while their parts sum to
  **97% at a full level**. So `full` is the parts there. A chart folder of **one or two
  instruments** is the master *and* its parts: measured the same way, `song.ogg` shares
  **almost nothing** with the instrument files beside it (r ≈ 0.01 over 15 seconds at
  the best lag, where a master containing them would sit near 0.3), so it is the mix
  with those instruments **taken out** — the backing a miss ducks — and the song is
  everything together. Playing the master alone is the song without its guitar, which
  is what a guitar-led song sounded like: vocals and drums, guitar every now and then.
  The rule is `mixPresetsFor` in `sources/files.ts` with the numbers in its comment;
  `SongAudio` also falls back to the parts when the mix will not load at all, because
  some chart folders ship a **0-byte** `song.ogg`.
  The **jukebox clip** (`preview.ogg`) is not one of these questions: it is never a stem
  and never in a preset, just `audio.preview` — see the preview rule below.
- **A run's clock is the song's own audio, and the frame loop is only the fallback.**
  `SongAudio` plays the mix a song document names (`full`: the whole file, or every stem at
  once) through **streamed media elements** — a decoded four-minute buffer is ~90MB — and
  registers a reader with `StageClock.followSource`. The provider then takes the playhead
  from the sound rather than counting frames, because a frame-counted clock drifts against
  the music and nothing may be judged against wall time. **The source is optional on
  purpose**: a song with no audio leaves the frame loop in charge, so nothing that has no
  sound breaks. The transport drives it (play, pause, seek), and `finish()` is the **sound**
  ending the run — the playhead reaching the end cannot say that for a file that stops on
  its own; it is the **last** stem ending, not the first, because a chart folder may cut
  a part short.
  The source is read **monotonically** (`src/lib/game/band/playhead.ts`): the stem the
  clock is read from can change mid-run and a new one can be a few tens of milliseconds
  behind, so a read at or ahead of the playhead is taken and one behind it is not. **A
  deliberate seek is the only thing that may move it back**, and it is guarded for a
  second so the elements' old positions cannot jump the clock while they catch up.
  **Which stem is read is a choice, and it is never the first by position**: of the
  stems that are sounding, `sourceStem` (`audio/stemSync.ts`, pure and tested) reads the
  one **closest to the playhead the game already has**. A stem that started or resumed
  late, or came back from a browser stall, is behind the song — reading it would stall
  the playhead, because a monotonic read cannot go back to meet it — and a stem that has
  run ahead is not the answer either, because it would jump the song forward.
  `SongAudio` also **aligns a newly registered source to the playhead** — a practice
  count-in can seek before the stems exist — so the first read does not undo the move.
  A local song's stems are `folder://…` and must be read into object URLs, exactly like its
  cover.
- **A song can use its YouTube video as the music.** `audio.source: "youtube"` and no
  stems means the official IFrame Player API is both the sound and the backdrop
  (`YouTubeStageAudio`). Its `getCurrentTime()` is a **reference, not a clock**: the stage's
  one frame loop advances `youtubeClock.ts` between reports and corrects when a report
  lands, so the highway does not step at the player's poll rate. The player is created on
  the countdown, hosted outside React's children (the API replaces the node), and its
  `followSource` is registered before it is ready so the stage **waits** rather than
  counting frames. `SongAudio` is not rendered for these songs; `StageBackground` renders
  the player, and hides the picture but keeps it playing when the video setting is off.
  One stream means a miss cannot duck a part, the jukebox row is silent (unless a licensed
  `audio.preview` is supplied), and the video's own captions are suppressed where the API
  allows. `public/_headers` must allow `https://www.youtube.com` in `script-src`, and a
  service must check `status.embeddable`; never extract or proxy the stream.
- **A song's stems are kept in line by a rate, and seated by one move at a start.**
  They are separate media elements, so no two hold quite the same clock, and every one
  of them is kept with the **playhead** — the one timeline the run is judged and drawn
  against, never a stem's own position, because the stem that is wrong may be the one
  being measured. The running rule is `src/lib/game/audio/drift.ts` (pure, tested): a
  stem within 18ms is left alone, one further out is **nudged by its playback rate** (at
  most 2%, which is inaudible as a pitch), and one the room can hear as a flam — past
  40ms — is **seeked**, at most once a second and never while it is still recovering
  from the last move. The seek is a cure rather than a reluctant one: measured in a real
  browser, a nudge-only recovery from a resume's stagger sat at 20–40ms apart for the
  rest of the run — a proportional trim has no muscle left as the gap closes — while one
  seek ends it. A stem that should be playing but is not (a refused start, an
  interrupted `play()`) is **seated on the playhead and asked again** rather than left
  silent and then chased from seconds behind. **An ended stem is none of that**: a chart
  folder may cut a part short, so it is never a clock, never moved and never restarted — `play()` on an ended element starts
  its opening bars over the song's middle — and the run ends when the **last** stem ends.
  Do not go back to pulling every element back on one of them every frame: that made one
  slow, refused or broken file pin **every** other stem at the same instant, over and
  over, and a band came out as a 120ms stutter of itself — which is exactly what "only a
  few channels are working" sounded like.
  **A start is the one moment none of that runs.** A `play()` starts each element a
  moment of its own later, and a `currentTime` write on a starting element **restarts its
  startup**: the settle window this replaces seeked every late stem on every frame for
  eight frames, which turned a six-millisecond natural stagger into a hundred-millisecond
  flam within a second of the song starting. So the stems are **waited for** and seated
  **once**, when the last of them has actually moved (or a 1.2s deadline passes):
  `startSeatAction` in `stemSync.ts`, watched by `SongAudio`'s `seating` state, which
  covers a seek while the song runs as well — a practice loop is a start too — and
  suspends the drift rules until it is done. And **a stem that will not take a move is
  never written to again**: every correction write is read straight back (`seekLanded` in
  `drift.ts`), because a resource that cannot be seeked — a live stream, a host that will
  not answer a range — ignores the write and the rules would otherwise re-issue it a
  second for the rest of the run; such a stem is marked and carried by rate alone, with
  `driftAction`'s `canSeek` keeping a seek that cannot happen from leaving it frozen at
  exactly 1. **A miss is not a refusal while the stem is still arriving**: `seekRefused`
  spares a stem with no current data, and one whose seek is still in flight, because a
  phone reports a timeline long before it can move within it and the old position a
  seek reads back is not the resource saying no — condemning it there would carry a
  stem that only needed a moment by rate for the whole run, which cannot close seconds.
  `tests/e2e/stem-sync.spec.ts` is the browser gate — a real multitrack song
  with real WAV stems, its element clocks and every `currentTime` write sampled through
  misses, a pause and a resume — and only a browser can see any of this. A transport edge
  has its own rule:
  `src/lib/game/audio/stemSync.ts` (pure, tested) puts **every** stem with a timeline on
  the **playhead** (`stemAlignmentsTo`) **while the song is paused** — before a start
  and after a pause — because an element that stops 40–60ms late will never be carried
  back by a 2% nudge and the room hears it as a flam. Aligning to a stem instead was the
  pause bug: that stem could be the one left behind, and the whole band was moved back
  with it. `data-stem-spread` on `.song-audio` is the dev read-out of how far apart the
  alignment last left them.
  **A part a miss has taken out is carried, not pinned** (`HELD_SHARE` in
  `audio/mix.ts`): it is **ducked to a tenth of its own level**, never silenced. A media
  element at `volume = 0` leaves the browser's audio clock and free-runs — measured in
  Chromium, about 30ms ahead in five seconds, snapping back only when it was heard again —
  so the part came back out of phase. The pin that used to compensate made it worse: a
  `currentTime` write every 500ms costs a streamed element its pre-roll (~40ms each), so
  the "pinned" stem sat 40–90ms behind and the room heard a flam. The rule is therefore
  the ordinary drift rule for a ducked stem as for any other, and **putting a part back
  does not seek it**: only a stem the browser itself paused is seated on the playhead
  (and asked to `play()` again). `stillAction` is the pause's rule alone
  (`pausedAction` in `stemSync.ts`), where nobody can hear a correction. Each stalled stem
  has its own retry clock, so one file cannot starve another of its `play()` retry.
- **A miss ducks that part in the song, and never the master.** The rule is
  `src/lib/game/audio/parts.ts`, and it is the song document's own: `parts[].audioControl`
  names the stems a part owns, `controlledStems` turns that into a **part-key → stems**
  map (`words`, `guitar:lead`, `guitar:rhythm`, or a roleless kind) and **drops the
  master from it**, because the master has no instrument: it is the whole song, or the
  backing around the parts, so a miss that silenced it would silence everything. A song
  shipped as one master therefore controls nothing at all, which is the intended answer
  rather than a gap — there is no channel to take out. `PartAudio.tsx` is the one-way
  registry between the runs and the sound: a player's `misses` rising ducks their stems
  to `HELD_SHARE`, their `hits` rising puts them back for `onMiss.restore: "next_hit"`, and `phrase_end`
  holds them out until the chart phrase or melody line that contains the miss has ended
  (the registry is ticked by the stage's own clock, never a second loop). It is kept
  **per seat** so two players on one instrument leave the stem out while *either* of them
  is out. It is a ref registry, not React state, so a miss never re-renders the stage;
  `SongAudio` subscribes and writes `element.volume` — never `pause()`, because a paused
  stem drops out of the drift and the clock. The registry also reports the moment a part
  **goes out** — the first miss of a streak — and that is where the `error` cue is raised:
  once per stop, not once per miss, and on a one-master song too, where the part would
  have gone out but nothing to duck exists. `PlayerPanel` is the lane caller and
  `MelodyRegion`'s per-player score cards are the words'; both go through the same
  `usePartMute`, and the guide vocal is a setting (`guideVocal`): off means a singer
  replaces it — its stems are then **not loaded at all** (`unplayedStems`: a stream nobody
  hears is a download, a decoder and a clock of its own) — and on means it stays under
  them. The mapping follows the **chart folder's names**, with one correction that
  matters: a song with a **bass chart but no `bass.ogg`** gives its `rhythm.ogg` to the
  **bass part** (`stemRoles` in `sources/write.ts`). Measured on a bass-led test song,
  that file is ~22 dB louder below 160 Hz than above 250 Hz — it is the bass, whatever
  it is called — and leaving it with the guitar is what made a missed guitar note take
  the bass out too. A chart folder that ships a real `bass.ogg` (even a silent one)
  keeps the names as they are; a song with no bass chart keeps its rhythm guitar.
- **The mixer has a family per channel, a pause-only crowd, and a duck that belongs to
  the menu.** `CHANNEL_LEVEL` is the default for music, ambience and sfx; the settings
  carry the player's own levels (Options) and the master sits above them. `StageAudio`
  asks `crowdFor(screen, crowd)` — `engine.ambience("crowd")` only while **paused** —
  so the public-domain room is the pause's, never a crowd over the song; the jukebox
  preview owns only the music bed and never stops it. `ducksMusic(type)` is the pure
  rule for which cues dip the **menu's** bed (stings yes, clicks/typing/crowd no), and
  `engine` applies the envelope to the music and ambience channels, never the master.
  **It never reaches a song.** A run's stems are media elements outside the graph, so
  they take no part in the duck at all: a miss, a hero note, the meter or any other cue
  is a sound **beside** the band, never something that turns the band down. Ducking the
  song under its own feedback pumped the music with the player's hands and, after a few
  misses, read as a fault in the mix — which is why `useAudioDucked`, the engine's duck
  listener and the stems' `DUCK_LEVEL` factor are gone. A song's own `crowd.ogg` is not
  part of its mix.
- **The run opens with one hype per part, not one per player.** `src/lib/game/audio/hype.ts`
  turns the band into four `hype_*` cues: guitar (keys share it), bass, drums (dance
  shares it) and vocals for a singer; three guitars are one entrance, a typist brings
  none. The unique cues start on one sample through `engine.playMany` and are spread
  evenly inside ±25% in band order (2 parts = −25/+25, 3 = −25/0/+25). They do **not**
  duck the song: the entrance is the band starting, not a sting over the first bars.
  `opensRun` (loading/replay → countdown, never paused → countdown) makes it a run
  entrance, not a practice count-in. The stage opens on a **quiet beat**: the room —
  the song's background, the progress bar, the score rails and the meter — is on
  screen from the moment the stage mounts, and the **highways** and the **words**
  stay offscreen for `ENTRANCE_LEAD_MS` (1.2s). Then the band's hype and the slide
  begin **together**: the highways rise from the floor and the words drop from the
  top for `ENTRANCE_SLIDE_MS` (650ms). `BandStage` sets `--entrance-lead` and
  `--entrance-slide` from `hype.ts`, so the sound and the picture cannot drift; the
  session keeps the song back for the lead + whichever is longer (the hype or the
  slide) + a 250ms tail (`hypeEntranceMs`). The rails and the melody's score cards
  are not animated, and a run opening does **not** also play the `screen` whoosh.
  There is **no 3-2-1 overlay and no `count`/`go` cue**; a pause or practice restart
  does not remount the stage, so it neither replays the entrance nor waits for it.
- **A full meter is spent on star power.** `LANES`' whammy at a full meter sets
  `meter: 0`, `starUntilMs = now + STAR_POWER_MS` (8s) and `starActive`; every note and
  sustain payment inside the window is ×`STAR_MULTIPLE` (2) on top of the combo
  multiplier. A full gauge **makes no sound of its own** — the rail already draws it, and
  a swell every time a streak topped it up sat over the song: `meter_activate` is the one
  star-power cue, at the moment the thing is spent. The whammy itself is
  still scoreless. A seek/new run clears the window.
- **Drums have a kick column and freestyle fills.** The GH kick pitch (`base − 1`) and
  a `.chart`'s fret 5 become **column 5** on a drum chart, so a kick can share a tick
  with a pad; the keyboard/pad presets reach six columns and the sixth learn step says
  kick. A `LaneChart.fills` span (from `[mix 8]` / `[mix N≠8]` / a section named fill,
  in MIDI or `.chart` events) is a freestyle window: a trigger with no note to judge is
  **not an error**, pays `FILL_POINTS`, fills the meter and is capped at one per
  `FILL_HIT_MS`; it never counts as a judged note. The highway draws the fill band.
- **Choosing a song plays something, and the jukebox is the only place that does.**
  A list of titles does not remind anybody what a song sounds like, so moving onto a
  row or clicking it plays its **preview**: the chart folder's `preview.ogg` clip
  if it has one, otherwise its **master** from `previewStartMs` (`previewFor`). A song
  carrying only parts and no whole mix has nothing to preview — one instrument is a
  preview of the wrong thing — and a song with no audio at all (a mock) simply says
  nothing. The clip is **streamed** through a media element like a bed, routed into the
  **music** channel, and **loops** until another row is chosen or the jukebox is left.
  A local file is read into an object URL by `useSongPreview` and the previous one is
  revoked when the next starts — clicking through a collection must not keep a folder's
  worth of audio alive. **The jukebox has no menu bed**: `bedFor("songs")` is null, so a
  song with no preview is silent rather than playing the room's music. Never play a
  preview on the stage: `bedFor` says the stage wants no bed, and `bed` stops any preview
  the moment a screen asks for one.
- **A button says what it sounds like, and one listener plays it.** `StageAudio` puts a
  single click listener on the island: it reads `data-sound` off the pressed `<button>`
  (`select`, `back`, `open`) and plays `click` for everything else. So a new control is
  audible without anybody wiring it, and there is no sound prop threaded through sixty
  components. **Moving onto a control is the smaller `move` cue**, from the same layer:
  a pointer entering one, or focus arriving by Tab or a pad. **The game's own focus
  placement is silent** — `focusStageTarget(..., { silent: true })` for a screen's
  starting control, a dialog's first field, or a row growing back — or every screen
  change would tick under its own `screen` whoosh; the pad's moves and Tab's are not
  marked and do sound. **`refuse` needs `aria-disabled`, not `disabled`** — a disabled
  button fires nothing at all, and the press is the very thing that has to say "not like
  that". Per-note and per-keystroke feedback is read off the runs' own numbers
  (`run.misses` rising and the part going out, `multiplier(combo)` stepping,
  `errorKeys` rising on a typist's state, `pointer` moving when a word is done) — never
  a second judging path.
- **Every file carries its own measured trim.** Packs are not mastered to each other, so
  each sound in the manifest has a `gainDb` (the same twelve Kenney sounds sat between
  −16 and −33 dBFS RMS, which is audible), plus a `credit` for the licence. A sound
  without a credit is a licence nobody has written down. **Where a family sits is
  `CHANNEL_LEVEL` in `mix.ts`** — the beds at half, the cues at 70%, the master full by
  default — and a test holds the invariant that a cue is always above a bed.
- **The backdrop has a ladder, and the rule is pure.** `src/lib/game/band/media.ts` owns
  `StageMedia` and `backdropFor(song, video)`: a run plays against **the song's own
  video, then its art, then the game's own artwork** — and the menus always sit in the
  game's own artwork (`.band__backdrop`), which a run paints over. `DEFAULT_BACKDROP` is
  that artwork (`/images/background_1.jpg`) and it is the *room*, not the subject, so it
  is the same every time. A song's **art is blurred** into a back (square and often
  small, unblurred it is a picture pulled out of shape), and the dev panel's video
  switch skips *the song's* video rather than the backdrop — a song with nothing of its
  own falls back rather than going black. **`backdropDim`** is one overlay inside
  `.stage-bg` — above the video or art and its scrim, below every panel and note — so
  it dims the backdrop and never the notes, panels, text contrast or focus rings.
- **A page is a scrim over the room, not a sheet of ink.** The screens' background is a
  translucent gradient so the artwork shows through, and the surfaces that are *read* —
  the song list above all — carry their own darker fill. If a surface ever needs to be
  legible over a busy backdrop, the fill is the answer, not the scrim: dimming the room
  hides the thing the menus are for.
- **The room's lights drift, and they are cheap on purpose.** `flarePlan` (pure, tested)
  places a handful of flares — some deliberately hanging off the edge — and
  `BackdropFlares` renders each as a **radial gradient**, not a shadow or a blur: a 60vmax
  blurred layer costs a frame of painting per repaint and these run for a whole session.
  They move on **transform and opacity only** (the compositor does it), sit behind the
  scrim with `mix-blend-mode: screen` because light *adds*, and are decorative — hidden
  from a screen reader, no pointer events, and stopped by the site's one reduced-motion
  rule. The `flares` setting turns them off entirely for a still room; the backdrop's
  dim is a layer over the picture, not over the lights, the notes or the panels. Their
  source brightness looks high (0.35–0.75) because they are **behind** the
  page scrim: a glow of 0.5 arrives at the eye as a fifth of that.
- **Playlists and charts are cross-origin, and the headers have to allow it.** A
  playlist is a URL the player pastes and its files may be anywhere: `fetch` needs
  CORS on the host, and so does **audio** (Web Audio, for the stems and the analyser
  behind singing, needs `crossOrigin`). Artwork does not — an `<img>` is not a fetch.
  `public/_headers` allows `https:` for `connect-src`, `img-src` and `media-src` for
  exactly this reason; tightening it back to `'self'` breaks every added playlist.
- **A chart owns its columns and its difficulty.** Difficulty is not a judging
  setting: it is a *different chart*. `chartFor(track, instrument, difficulty)`
  picks one, and a track carries **whatever chart sets it actually came with** —
  one song is Hard and Expert on the guitar, the next nothing but Easy — so the
  difficulty is *asked for* wherever it is needed (`difficultiesFor`) rather than
  assumed from a list. Asking for one the song does not carry resolves to the
  nearest it has, ties going to the easier (`nearestDifficulty`), because a band is
  remembered across songs and a mismatch is ordinary rather than an error. There are
  four levels; **vocals always carry the first three**, since the tolerance is the
  microphone's rather than the song's, and **lyrics carry none at all** — free play.
- **A note's face is a skin, and every other type is its own channel.** The
  `noteStyle` setting picks a note's **face** (`NoteStyle` in `settings.ts`): **bars**
  is the flat button the game has always drawn, **gems** is a rounded head at the hit
  end with a tail behind it, and **arrows** makes the glyph the note. It is a skin,
  not a rule — the note element is still the span from head to tail, so the mounted
  window, the transform and the judging never change — and `Highway.tsx` renders a
  `.highway__face` inside it, which is the whole note for a bar and the head puck for a
  gem or an arrow. The **bottom of the span is the head** (`noteBox` in
  `band/notes.ts`), which is the end that meets the hit line at the note's own time;
  anchoring the body to the top instead puts a sustain a note's height away from a
  plain note at the same moment — a bug that shipped once and must not again.
  **open** spans the highway (strummed with no frets, alone by
  validation), **sustain** is a tail (the note's own `::after` for a gem or an arrow)
  that ends at the **middle of the face** — the note's own body covers its lower half,
  so a gem's tail meets it under the puck and an arrow's head and point stay clean.
  The note is an `inline-size` container so `100cqw` is its own width and the tail's
  `bottom: calc(100cqw / 2.7)` is half a head, whatever the panel's size. **hero**
  wears a thick cream outer border and a glow, **hopo** flips its face to
  solid white inside its own fret-coloured border *while it can be hammered* — and
  that cue goes the moment its chain breaks, so "you must strum this one" is visible
  rather than memorised. The instrument's **kit** decides the small glyph a bar or gem
  carries (an arrow for a dance mat), and the hit marker (a keyboard, arrows, a bar);
  an arrow skin makes the arrow a hit marker for every instrument too. `notes.ts`
  derives the classes and the glyph, so every treatment is unit-tested rather than
  eyeballed. **Arrows are by column count**: four columns are the dance
  mat's `← ↑ ↓ →`, five are a five-panel layout
  (`↙ ↖ ● ↗ ↘` — a five-column chart has a middle column and four diagonals, and
  repeating one of four arrows would read as two lefts), three are `← ↑ →`, two are
  `← →`, one is a centre dot, and anything else cycles the mat's four.
- **The note zoo is how a treatment regression is caught.** Every chart opens with
  one of every type and combination in its first few seconds — the strummed zoo ends
  with a **slide** link, and the tapped zoo carries one too — and a test asserts each
  one is generated, so a broken treatment is on screen within seconds of pressing
  play. Do not remove it.
- **A highway is one plane, drawn flat or tilted.** The `view` setting
  (`HighwayView` in `settings.ts`) picks between `flat` — the board face-on — and
  `3d` — the same board rotated into perspective, and the default. Both are **one element**,
  `.highway__deck`, so the tilt is `perspective` on `.highway` plus a single
  `rotateX` on the deck and nothing else changes: the notes still sit at fixed
  positions carried by one transform, and judging never knows which view it is in.
  The `noteSpeed` setting scales the same run-up in either view
  (`noteWindowSeconds` in `band/notes.ts`), so a faster neck holds less song; it
  moves the drawing and the mounted window, never a note's time.
  There is no canvas and no three.js, and adding one would be a different game.
  Because the deck is a single plane, a note is a **block** on it — its front face is
  stood up with a `rotateX` — and that is the only reason the third axis is there.
  Nothing on the neck moves: a note in its hit window only glows where it is, and a
  miss goes red where it is, rather than being lifted toward the line — because in a
  tilted plane a `translateZ` also shifts a note **up the screen**, which made a
  judgement look like it had jumped off the line it landed on. A **hit** is the one
  state that leaves the neck: `Highway` stops drawing the note the moment its outcome
  is a hit (a hold is the exception — its tail stays while the fret is down), because
  a dimmed note still sliding out under the line reads as a miss. What says where it
  landed is a **burst** above the pad, in a layer of its own anchored on
  `--hit-fraction` so it does not slide away with the song; `run.hitTimes` records when
  each note landed and `hitBursts` (`band/notes.ts`, pure, `HIT_BURST_MS`) says which
  ones are still alight. A miss keeps its red note travelling past the line, which is
  exactly how the two are told apart. Colour, opacity and a removal, no geometry.
  The **border is the deck's** in the 3D view, not the frame's: the frame is a
  rectangle and the neck is a trapezoid, so a border on the frame sits on the
  bounding box instead of following the columns. The deck is longer than the frame
  on purpose — the tilt compresses its far half, and the same run-up then holds more
  of the song, which is the point of the view. Its `perspective` is in `cqh` so the
  tilt is the same in a small panel and a large one; do not hardcode it in px.
- **A pad on the hit line is the fret under it, and the player's hand is the only
  thing that lights it.** `heldColumns` in `src/lib/game/band/notes.ts` is the rule:
  holding a colour fills that pad with its own colour, instantly, so the player can
  see their own fingers on the line. A note landing or being struck is **not** a pad
  light — that would read as the game pressing a key for the player — so a note
  carries its own treatment (and a hit its burst **above** the line) and nothing but
  the hand ever fills the pad. Pure and unit-tested; the pads only render what it
  returns, and nothing here is ever read into judging.
- **A note is a strum or a hopo, and tapping is a controller.** The chart's
  `LaneNoteKind` is `strum | hopo`; a tapped instrument (keys, dance, or any touch
  pad) plays a strum note by pressing its key, with the tap supplying the strum. Do
  not add `tap` back as a note kind, and do not infer a note's kind from whether the
  instrument is tapped. An older document's `tap` is read as `strum`.
- **A slide is a link, not a kind, and its points are touch-only.** `LaneNote.slideTo`
  names the later note a note glides to; both ends keep the kind they had, so there is
  no `slide` note kind to add. `slideProblems` (`track.ts`, pure) is the rule — both
  ends fretted, a target strictly after the source's **end**, different columns,
  nothing else in either endpoint column between them, one incoming link per target —
  and `chartProblems` includes it. A document has no note ids, so `source.ts` resolves
  the `slides` coordinates after sorting; `cleanSlides` drops a link the chart cannot
  play and the reader names it, keeping the chart. On the stage only a **touch** glide
  can play the link: `lanes.ts` judges a `slide` trigger by the source having landed
  and leaving its own column, pays the span's `holdBasePoints` into `slidePoints`, and
  `ratingScore` takes those points back out so a phone is never rated above a guitar
  for the same chart. A glide with no link, from a note that did not land, or onto a
  target already played does nothing and is **not** an error. The `.chart` exporter has
  no field for a link, so it names each slide and writes the notes without it. Do not
  add `slide` as a kind, and do not pay slide points on a strum, keyboard, gamepad or
  MIDI.
- **A hit marker can be a control, and a tap is a fret and a strum at once.** The
  `tap` setting (on by default, because it is the only way a phone has to play a
  highway) makes each pad a **button**; a press sends a `touch` trigger to that
  panel's own run, which plays **any** note under its column — strum, hopo or
  open — with no hopo chain to read. A tap is stamped with the **event's own
  `timeStamp` projected through `clock.timeOf`**, exactly as a keypress or a MIDI
  note is: a DOM stamp is wall time, and judging it as song time is a tap that never
  lands. `TAP_CHORD_MS` in `lanes.ts` is the chord rule:
  each column wins its own note, but the taps of one moment must be within that
  window of the first, so a chord is still played together even though two fingers
  are never quite simultaneous. A tap at nothing is **not** an error — it is a hand
  finding the screen — and a late second tap is not an error either, it simply does
  nothing and the note passes. `useLaneRun` keeps the pad-held columns apart from the
  keys and holds a sustain while the finger stays; `Highway` gives the pad an
  invisible touch target that is its **whole column**, in a band about 3rem tall
  around the hit line (a pad is `NOTE_SHARE` of a column, so 23.5% of the pad each
  side reaches the column's edges), captures the pointer so a slide-off lets go, and
  stops the click so the mixer's UI click is not raised by playing a note.
  `touch-action: none` is on the **highway** while tapping is on, not only on the
  pads, so a second finger that misses cannot scroll the page and cancel the first.
  The pads are **not** in the tab order: the keys and a gamepad remain the accessible
  route, and a machine-played seat (`auto` or a `none` controller) has no pads to
  press.
- **The beat grid is anchored to song time, not to the window.** A chart's `bpm`
  gives the period and `beatsInWindow` (`scroll.ts`, pure and tested) says which beats
  are in the mounted window, and which of them are bars. The lines are mounted **in the
  track** and positioned exactly as a note is, so they scroll with the notes and a line
  is always where a beat is. Do not draw them as a background pattern on the board:
  a pattern sits still while the song moves, which is the "the grid isn't scrolling"
  the board used to have. A chart that does not know its tempo has **no grid** rather
  than a guessed one — `bpm` is optional on `LaneChart` for exactly that reason.
- **The fret colours are the classic five-fret set, on purpose.** Green, red, yellow,
  blue, orange in that order, with a purple open note, defined on `.highway` rather than
  in the global palette because they are a deliberate exception to it: players
  recognise them, and a note's column is carried by its position too, so nothing
  depends on telling five hues apart.
- **Judging is per player, and nothing reads another player's state.** Not for
  hero notes, not for anything: `src/lib/game/lanes.ts` is one pure reducer per
  player, fed that player's own chart and that player's own input. Band-wide
  mechanics are therefore out by construction, which is the point — nobody's run
  can be blocked by someone else's miss.
- **A chord is implicit.** Notes sharing a moment in one chart *are* the chord:
  `momentAt` groups them, and a strum judges the whole group at once — **all of
  it or none of it**, so every fret must be down for any of the notes to land and
  one hand short misses the chord. (A *fret* press still judges one note, because
  that is what hammering one note of a chord means.) There is no chord id and no
  chord shape. A chord can start **several sustains at once**, so `LaneRun.holding`
  is a list of note indices: letting one fret go stops that hold and leaves the
  others, and a plain note beside a sustain must not cancel it.
- **A miss and an error are different things.** `LaneRun.misses` counts notes that
  were dropped, however it happened; `errors` counts only what the player **did** — a
  strum with a fret missing (one error for the gesture, however many notes of the chord
  it dropped) or a strum with nothing in the window. A note whose window closes without
  a strum is a miss and **not** an error: nobody did anything. A fret pressed on nothing
  is not an error either — a hand travels. Judging is identical either way. The split is
  a **read-out**; the `error` **cue follows the channel**, not the cause: it plays when
  the part **goes out** — the first miss of a streak — whether the player strummed wrong
  or the note passed, and on a song with nothing but a master it plays anyway, because
  the part would have gone out. A further miss while the part is already out is silent.
- **A hopo's gate is the note before it in that player's chart**, across columns,
  and it is only a *miss* that closes it. While the chain is undecided an upcoming
  hopo keeps its ring, so it reads as hammerable before you get there.
- **Input is controls, and a control belongs to a seat.** A player's
  **controller** is what they hold — their own keys on the one keyboard, a gamepad,
  a MIDI kit, the microphone, or **the machine**, which is a controller like any other and is
  not a special case. The **plan** (`src/lib/game/controls/plan.ts`) says which
  player takes what, worked out from the band, the song and how many pads are
  plugged in and remembered nowhere — so a pad plugged in mid-run **re-seats**
  rather than restarts, because input is keyed by the player and never by the
  device. **An explicit `slot.controller` decides `auto`**: `{ on: "none" }` is the
  machine, while an explicit keyboard, pad or MIDI seat stays a person's even past
  the dev panel's `humans` count. Every explicit pad index and keyboard layout is
  **reserved before the automatic seats are placed**, and a bowed-out typist
  (`controller.on === "none"`) does not consume the one typing slot — otherwise
  nobody would be typing at all. A machine seat's **highway player** is not pumped while
  the clock is not playing: its sustained frets stay down, but a count-in or a pause
  cannot judge a note ahead of its time.
  `src/components/game/band/StageControls.tsx` is the **one** listener and
  the **one** frame poll: every player's panel drains its own seat, so nothing reads
  another's, and the two rules that used to be copied into each hook — **a press
  only counts while the stage is moving**, and **a release always lands** — live
  there once. Judging speaks **actions** (`input.ts`: put a fret down, strum, wave)
  and knows nothing about what produced one. A gamepad is **polled**, since the
  browser hands its whole state to whoever asks; a real plastic guitar or drum kit
  presents itself as one, which is why that path matters. MIDI is the other way
  round: a message is an **event**, so it is stamped and handled exactly as a
  keypress is.
- **Keys bind by code, not by character.** `src/lib/game/controls/layout.ts` is
  written in `KeyboardEvent.code` (`"KeyA"`) because a fret is where the finger
  *is* — an AZERTY player gets the same physical five — and `keyCode` folds the left
  and right of a pair into one key. A MIDI control binds by **note number**, not by a
  key's label, because that is what a message carries. A typist types **characters** (`event.key`),
  which is the other way round and lives in `typing.ts`. A layout **reaches** past
  five and the chart's columns say how much of it is used, so the lane count still
  comes from the chart; a seat the song gives nothing to play **claims nothing**, so
  its keys stay free for whoever does have something to play.
- **A player can say what they play with, and it sticks.** Every box on the band
  screen carries a gear: the device — their own keys on the one keyboard, a gamepad,
  a MIDI keyboard or kit, or **the machine** — and, when they want one, a **mapping
  they learn** by pressing each control as the panel asks for it. That flow is the
  only thing that can set up
  a plastic guitar or a drum kit, since all of them arrive as gamepads and only the
  person holding one knows which button is which; it is also how a MIDI kit whose
  pads do not follow General MIDI is set up. It is remembered **per seat** in the band store (`controller`), so it survives a reload, and **a player's own
  setting wins over the dev panel's count** of who is playing: that count is the
  default a seat falls back on, not something that overrules a person. A learned
  mapping has the same shape as a preset, so the key map, the warnings and the
  countdown all read it without knowing the difference — and **a column it does not
  reach falls back to the preset's reach**, because a setting must never be the thing
  that makes a note unplayable. The read-out uses the mapping too (`padLabel` names
  the buttons that player pressed, not the preset's), and **a hole in a learned
  mapping stays a hole** rather than being compacted — the plan fills that column from
  the preset, so the frets after it keep their positions. A control already spoken for
  is refused rather than taken twice, a learn session sits **before every other rule**
  in the input route (the press that answers a question is not a note), and changing
  what a box takes **forgets the mapping** — a guitar's five frets are not a mat's four
  arrows — though it keeps the level, which was about the song rather than the hands.
- **A strum bar may be an axis, and a pedal may be a MIDI control change.** A pad
  mapping's `strum` is `PadControl[]` (`number` for a button, `{ axis, direction }` for
  an axis); `padAxisEdges` gives the axis its own rest/hysteresis edges, one learned
  axis answers both strum steps, and the menu's axis navigation is a separate reader.
  A MIDI mapping's `frets`/`strum`/`whammy` are `MidiControl` (`number` for a note,
  `{ cc }` for a control change); a CC is binary with its own down/up thresholds and
  per-control state, so a pedal held down does not retrigger. Claims are tagged
  (`pad:0:axis:2`, `midi:note:60`, `midi:cc:64`), so a button and an axis or a note and
  a CC with the same number are different controls.
- **One keyboard cannot serve two people the same keys, and the game says so.**
  A keypress carries no device to name it by, so `conflictsOf` reports the seats
  that ask for one control and the dev panel shows the warning — and then it is left
  to work, both seats receiving the press, because a band with one keyboard between
  them is better off playing. The common case is a player on the keys and a typist on
  the words: every letter a typist types *is* whatever the instruments have bound,
  and the remedy is a gamepad, not a different engine. Keyboard auto-repeat is still
  ignored — one event per physical press, which is what stops the whammy being a
  score fountain.
- **A MIDI message is an event, and one access object serves the stage.**
  Web MIDI is the other natural input (a drum kit's pads, a keyboard's notes), and
  it is a **controller like any other**: `{ on: "midi", index?, notes? }`, where a
  `MidiLayout` is `{ frets, strum, whammy }` in **tagged controls** — a note number or
  `{ cc }` for a control change — so a learned mapping, the preset and the conflict
  list all speak the same shape.
  `navigator.requestMIDIAccess({ sysex: false })` is asked for **only from a
  gesture** — choosing MIDI in a seat's gear, or starting a learn session — and
  never on page load. A missing API, a refusal or a browser that throws is a
  sentence in the gear and **the seat keeps what it had**: it must never quietly
  become the machine. One access object is reused for the life of the stage; a
  `midimessage` listener is attached to **every** input and to inputs that arrive
  later via `onstatechange`, and they are all detached (and `close()` asked for,
  where a browser has it) when the stage unmounts. A **note-on with velocity >
  0 is a press**; a note-off, or a note-on with velocity 0, is a release. A **control
  change** is binary: down at ≥ 64, up at ≤ 48, with per-control state so a held pedal
  is one press. Clock, aftertouch and sysex are ignored, and every channel is read
  because a layout names notes/controls rather than channels. A message is stamped with its own `event.timeStamp`
  projected through `clock.timeOf`, exactly as a keypress is — never with the
  frame's playhead — because it is an event, not a poll. A release always lands; a
  press only counts while the stage is moving. The **default is a chromatic run**
  (C4–B4 frets, C5/D5 strums, E5 whammy): a MIDI keyboard sends exactly that with no
  setup, while a kit's pads are not standard beyond GM's *sounds*, so a kit is set
  up in the learn flow like a plastic guitar. The learn capture shows the **note
  number or `CC n` and channel**, refuses a control already used, and stores the map
  as plain data; a column it does not reach falls back to the preset. Two seats bound
  to one control are reported by `conflictsOf` the same way two seats on one key are,
  and a note/CC is never confused with a key code or a typed character. Nothing leaves
  the device: messages are read to play controls and dropped. A **remembered** MIDI seat is
  silent on a later visit until its gear (or a learn press) asks again — access
  cannot be restored without a gesture, and a run must not surprise anybody with a
  prompt.
- **A run must not be handed anything rebuilt every frame.** The stage re-renders on
  every tick (a throttled `useClockMs`), so an array or object built in a render body
  is a *new* value every frame: a hook keyed on its identity starts over every frame.
  That is exactly how typing was impossible to finish once — the typists' configs were
  rebuilt 80ms apart and the run restarted with them. Memoise what a run is built
  from, and key it on what it *means* (`players.join(",")`) rather than on an array.
  `useLaneRun` is the model: it takes numbers and a chart and nothing else.
- **The simulated player goes through the real rules.** `autoInput` (`input.ts`)
  presses frets and strums at the chart's own moments and simply does not press
  when it is going to miss, so chords, hopos, opens and holds are all
  exercised; it never sends a whammy, so it earns no star power. `simulate.ts` is
  the verdict the machine gives a singer or typist, and a typist types through
  `typing.ts`. Do not give any of it a shortcut around the judging.
- **Scoring is 50 points a note, in one place.** `src/lib/game/scoring.ts`: a plain
  note is 50, a chord is the sum of its notes (100/150/200), a **hero** note is
  `HERO_MULTIPLE` (5) times that, and the streak multiplier is ×1 / ×2 / ×3 / ×4 at
  0 / 10 / 20 / 30 notes. A miss resets the chain to ×1. **Timing decides whether a
  note is a hit at all**, not how many points it is worth; there are no perfect /
  great / good score tiers. A **chord is one gesture**: its base total is multiplied
  once, then the combo grows by its note count, so a 2-note chord at ×1 is exactly
  100 even across the tenth-note boundary. Tapped chords share the first tap's
  multiplier. A sustain pays the note again at `HOLD_POINTS_PER_MEASURE` (25) per
  note for each measure held, prorated and multiplied by the current multiplier;
  a measure is four beats from `bpm` (two seconds when the chart has no tempo). The
  **whammy** spends a **full** meter on eight seconds of star power
  (`STAR_POWER_MS`, `STAR_MULTIPLE` ×2 on top of the combo multiplier); the whammy
  itself adds no score. A **drum fill** pays `FILL_POINTS` (10, not multiplied) for a
  freestyle hit, at most once per `FILL_HIT_MS` (120), and never counts as a judged
  note. A run is **lost** (`lostRun`) when the band hit under half of at least ten
  judged notes/words; a lost run is not saved. Sung notes and
  typed words use the same 50-point base; `SUNG_HIT_SHARE` is the one line a sung
  note's share has to cross, not a grade. If a number needs tuning, it is tuned
  there.
- **A note is judged once its own span has passed, not at its onset.** `advanceRun`
  waits for `timeMs + max(lengthMs + SING_GRACE_MS, HIT_WINDOW_MS)`, so a long
  note is scored on what was held across it and a singer who starts wrong but
  corrects still lands it. The pitch is listened to from `SING_LEAD_MS` **before**
  the note and for
  `SING_GRACE_MS` after it, because a singer arrives early or late and the
  detector needs a frame to lock on; without them a short note loses its first or
  last frames and reads as a miss. `judgedAt` is the moment after that grace, and
  the roll reads a note as live until then (`stateOf` in `KeysView`); do not
  judge a long note early or its correction can never count.
- **Typing is its own engine, on its own run, with its own three levels.**
  `src/lib/game/typing.ts` is pure and per typist: easy wants the first letter of
  each word, normal wants the letters with punctuation optional, hard wants the
  punctuation too, and nothing is case-strict. Its `TypingLevel` is deliberately
  **not** `Difficulty`: a chart can carry an expert level and nobody types one, so
  the type keeps that out by construction. Its forgiving rules are TypeStar's, and
  they are the reason it feels fair: a keystroke that cannot continue a word but
  *begins a later one* skips ahead (the words passed over are missed and the chain
  breaks); a line opens up to a second early and its last word stays typeable up to
  a second into the gap after it; and a line's words open together, so a fast player
  is never blocked mid-line.
- **A typist's report is a read-out, not a rule.** `TypingState` stamps
  `firstKeyMs`/`lastKeyMs` on every **meaningful** key — a correct character, a typo
  or a skip — and never on Backspace, an ignored key or a key before the word opens.
  `typingReport(state)` turns that into `{ wpm, accuracy, keys, wrong, spanMs }`:
  five characters to a word over the first-to-last-key span, with a **one-second
  floor** so a burst of keys cannot read as thousands of words a minute (or divide
  by zero), and `null` when no meaningful key landed. `useTyping` publishes it on
  its `RunEntry` as `typing`, so only a typist's results card carries it, and a
  seek or a new run starts from `emptyTyping` with both stamps null. Nothing reads
  it back into judging.
- **A typist's feedback rides on the words**, in whichever view is up, so the
  melody still shows one view. `TypeWord` draws the characters from `typedChars`:
  done, the caret, and the rest. **A pitched song with no singer is lyrics view**, not a
  piano roll nobody is singing; `melodyView(hasPitch, hasSingers)` is the rule. A mixed
  band with a singer keeps the keys view, and its line strips under the bars draw
  **whole words** from `melody.lines` (a typist types `Monkey`, not `Mon` + `key`),
  riding the same scrolling track as the syllable note bars above them; on a
  lyrics-only song the same feedback rides the static lyrics view. A part with no
  singer is neutral, never a red miss.
- **Lyrics mode is for fun.** A song whose words carry no pitch has no singer score at
  all; its typists still score, and Listen is the unscored read-along. That is a decision,
  not an omission — do not "fix" it by inventing a score for it.
- **Typing is case-insensitive, and a typo can reach the next line.** `requiredText` and
  `applyTypingKey` compare lower-case; hard only adds punctuation. A key that begins the
  first word of the next line skips there once that line is open, so the end of a line
  cannot trap the player. A word with nothing to type under normal/easy (a lone comma) is
  skipped rather than waited for. **Normalisation is per level**: easy and normal strip
  diacritics (so `Café` is typeable on a keyboard with no `é`), while hard keeps them and
  both sides are NFC, because an accent is spelling rather than punctuation. A typist
  does not claim Ctrl/Cmd/Alt or a key that is not a character — those stay the
  browser's — and a punctuation key that normalises to nothing at its level is not an
  error, just a key that word has no use for.
- **The clock is a seam.** Everything timed reads `StageClock.timeRef`; when the
  song plays from a file (YouTube, a local MP3, anything) the clock is driven by
  that source and the rAF loop keeps only the drawing. Nothing judges against wall
  clock time.
- **Practice is a plan, not a screen.** A practice run is a `PracticePlan`
  (`src/lib/game/practice.ts`, pure and tested): a **start and end** in the song's
  own time, a **speed** of 0.5–1.0 in 0.1 steps (`1` is the record), and whether
  the span **loops**. The choices come from `practiceSections`: the song's own
  `Track.sections` first, then the first lane chart's `phrases` (numbered
  `Phrase 1…n`), and finally `Whole song`; the list is sorted, empty spans are
  dropped and nothing reaches past `durationMs`. `clampPractice`/`parsePractice`
  keep a plan inside its song and repair a reversed or empty span by stretching it
  to the end, so a tampered plan cannot put a run off the chart.
  **The stage entrance is the count-in**: the machine's one added event is
  `practice`, from `paused` to `countdown` — practice is a *run*, not a screen,
  and the stage, pause and results are the ordinary ones. A pending plan is seated
  by `StageDirector` as the entrance starts (seek to `startMs`, set the rate); the
  screen itself is silent and overlay-less. A new run waits for the hype/slide, while
  a practice pass from the pause has no entrance to replay and starts at once. The
  seek bumps `StageClock`'s **seek serial**, and every run — lanes, singing, typing —
  resets on that serial rather than on a 1 ms backwards comparison, seeding its cursor
  at the new playhead. The section before the stretch is therefore neither missed by a
  person nor played by the machine: it is simply before the cursor.
  **The rate reaches every path**: `StageClock.setRate` scales the fallback frame
  clock's elapsed time (and `projectEventTime`, so an event's offset is song time
  too); `SongAudio` writes `playbackRate` to every stem with `preservesPitch` on,
  and its drift correction **multiplies** the plan's base rate rather than
  overwriting it (`stemRate` — at 80% a 2% nudge is 81.6%, never 102%);
  `YouTubeStageAudio` uses the player's `setPlaybackRate` and, if it is missing or
  refused, plays at 1× with a plain console note. A normal run is the same code
  with a null plan and a rate of 1.
  At `endMs`, a looping plan seeks back to `startMs` (a backward seek already
  resets every run, which is the intended fresh attempt) and a single pass pauses
  **exactly on** `endMs`. A practice run never fires `onEnd`, so the results screen
  is never reached and **no practice score can reach the board**; quitting clears
  the plan, and Stop practice clears it and starts again from the top at the
  record's speed. A lost run is a **results verdict** (`lostRun`), not a mid-song
  fail mode, so practice is not a shield from one.
- **The pause carries the run's own settings, and nothing else.** `PauseMenu` has a
  compact quick panel: the **note speed**, the **audio lag** and the **guide vocal**
  when the band has a singer. They are the same values, the same pure steppers
  (`snapNoteSpeed`, `stepLag`, `formatNoteSpeed`, `formatLag`) and the same session
  `changeSettings` that Options writes — a third **surface**, never a second store,
  so the two screens cannot disagree and a change lands on the run in front of the
  player. The guide vocal row exists only when `setup` has a words player who is not
  typing, because there is nothing to hold under a typist. **Practice this section**
  reads `useClock().timeRef.current` at the press, takes `sectionAt(session
  .practiceSections, time)` (falling back to the first section) and opens the same
  `PracticeDialog` seeded with `{ startMs, endMs, speed: 1, loop: false }`; the
  existing Practice button stays. It is a seeded dialog, not a second practice path:
  every press still goes through `startPractice` and the one `practice` event.

- **The band layout is a pure function — keep it that way.** All region and panel
  geometry lives in `src/lib/game/band/layout.ts` and is unit-tested; components
  only render what it returns. Change a layout rule there (and update the tests),
  never in the JSX. The three engines are real and share the same pattern as the
  sibling TypeStar build (a pure engine + a registry); a fourth way to play is a
  fourth pure engine behind that seam.
- **The screens are one island, one at a time, and never routes.** The whole loop
  (welcome, menu, songs, band, loading, countdown, playing, paused, results — plus the
  menu's two branches) happens inside
  `/play`, with `.band` — the fullscreen target — mounted throughout. **Only one of
  them is the stage.** `onStage(screen)` is true for the countdown, the song and a
  pause in it; the welcome, the menu and its branches, the jukebox, the band screen, the
  load and the results are
  **pages of their own, with the whole viewport to themselves** — a menu drawn over a
  running song is a menu with a song in the way, and a menu with the whole screen is
  one that can grow. A page is **not a card**: `.screen__panel--page` makes the panel
  the screen itself — full width and height, the screen's padding as its gutter, no
  fill, border or shadow — because the working parts inside it (the song list, the
  player boxes, the result cards) already carry their own surfaces, and a card
  floating in the middle of a viewport is exactly what makes a screen with room to
  spare read as a modal. Centred cards remain for the screens that *are* a single
  thing: the welcome and the load. The **menu** is its own split wordmark-and-list
  layout — desktop left/right, mobile top/bottom. The pause is an overlay
  (`.screen--over`), because it is something that happens **during** a song and so is
  scrimmed over the stage rather than replacing it. The **countdown** screen has no
  overlay at all: it is the stage's silent entrance, with the lanes rising and the
  lyric highway dropping while the band's hype plays. The **band screen is the
  loader** for an ordinary run: Play waits there for the charts and every stem, then
  enters the countdown directly with the `start` event; the load page is the attract
  demo's and a fallback. What is mounted for
  **every** screen is the **clock, the input route, the run board and the song's audio
  status**, which live
  above the stage — that is what lets the stage come and go with the song without a
  run losing anything. The machine is `src/lib/game/screens.ts`: pure, unit-tested,
  and the only place that says where an event leads. **`wantsCharts` keeps the charts
  from the band screen through the run and the results**, so a replay is a second run
  of the same song: the countdown and its entrance are built from the real melody
  rather than a shell track. A component renders the screen it
  is handed; it does not decide that it should be up. **The screen is session state,
  not a route**: no hash, no history entry, and a reload starts at the welcome.
- **A branch off the menu is a round trip, and nothing else has to know it exists.**
  `options` and `credits` are reached from `menu` and lead back to it — no other screen
  can get to them, and they can get nowhere else — so they are the menu's business and
  no one else's. Their rows are the *menu's* items; the transition table is what says so.
  **Escape is back** on the menu and on both branches: outside a run the only key the
  game takes is the one that goes back, and a page with a way in needs a way out.
- **What is a player's is not a song's.** There are four small local records and they
  are kept apart: the **band** (`band/store.ts`, per seat), the **board** (`scores.ts`,
  per song), the **settings** (`settings.ts`, this browser — how the game behaves) and
  the **first-run hints** (`onboarding.ts`, per player seat — which seats have already
  seen the highway key labels).
  **Those four are also a profile.** `profile.ts` exports them as one versioned JSON
  file and imports one back, and it deliberately carries **nothing else**: the
  library, the offline downloads and the audio are other people's files reached
  through a URL, not records a player owns, so a profile is small and an import
  leaves them exactly where they are. Options has the two rows; import validates the
  envelope and each record through that record's own parser, asks **Replace this
  browser's settings, band, scores and hints?** before it writes, and then reloads —
  the session reads every one of the four on mount, so the reload is what makes them
  all the import's rather than a mix. A malformed file says why and changes nothing,
  and nothing but the Replace press writes.
  A setting is a *behaviour*, never a piece of the game: the audio lag, the picture
  lag, the master fader and the music/ambience/sfx family levels under it, whether a
  song's own backdrop plays, how fast the notes
  travel, how far the
  backdrop is dimmed, whether the room's lights drift, how the highways are drawn,
  what a note's face looks like, whether the song's guide vocal stays under a singer,
  whether the room's crowd plays while a run is paused, whether a hit marker is a
  control, and whether a miss and a spent star power are felt (`haptics`) or a run
  holds the display on (`keepAwake`). **The audio lag has two ways in and one value**:
  the stepper and the measured calibration (`calibration.ts` + `CalibrationDialog`)
  both write `audioLagMs`. The dialog schedules its own fixed-level clicks on a
  separate audio graph — so a muted master cannot make it silent — and closes that
  graph when the run ends or the dialog goes; the stepper stays as the fine
  adjustment and the fallback when Web Audio will not start. **The picture lag has the
  same two ways in and its own value**: the stepper and the dialog's **Picture** mode
  both write `visualLagMs`. Its sign is **how late the picture is against the sound**:
  positive means the display lags, so the scrolling note layers are drawn that many
  milliseconds **ahead** of the audio clock and a note reaches the hit line when it is
  heard. Only drawing moves — the clock, judging, scoring, the song progress bar and
  the lyrics' active-word timing keep the real playhead — and `useScrollTrack` adds the
  offset to both its transform and its mounted window, so the two stay in one basis.
  Picture mode measures the display with a marker crossing a line on twelve beats; its
  marker runs on one animation frame that exists only while the dialog is listening and
  is cancelled on finish, Cancel, Escape or unmount, and it plays no sound at all
  because a click would answer the question. **Note speed is drawing only**: `noteSpeed` scales
  how many seconds of song fit across the neck (`noteWindowSeconds` in `band/notes.ts`,
  used for the run-up and the mounted window), never the chart, the clock or the hit
  window — the same note is hit at the same moment at 0.5× and 2×. The backdrop dim is
  the backdrop's alone (a video, art or the game's own room, never the notes or the
  panels), and `flares` hides the drifting lights entirely. **A controller
  set up in Options is the same memory the band screen's gears write**, so a mapping
  learned in either place is one mapping. What a player *takes* is deliberately not
  there: that is a question about the song, and the band screen asks it.
  **The fader is owned above the mixer.** `StageAudioProvider` takes `volume` and
  `onVolume` as props rather than holding them, because the value is a setting and
  settings have a page — and the dev panel reads the same value through `useAudio`, so
  the two surfaces cannot disagree. **The master never reaches zero** (`masterVolume` in
  `settings.ts`, applied on load and on every change): the song's stems are media
  elements, and a silent one leaves the audio clock. A fader dragged to nothing lands on
  `AUDIBLE_FLOOR` — about −60 dB — and `familyVolume` floors a stem's level the same way,
  so no fader and no duck can write a zero. The cue graph is Web Audio and would take a
  true zero; it shares the fader, so it takes the floor too (a placeholder for a real
  mute path). **A setting may be read before it can be heard**:
  the audio lag is stored, clamped and applied where a song's own audio meets the clock,
  and a song with no audio of its own leaves the frame loop in charge and the lag moving
  nothing — the same "wired and silent" a type with no file is. Say so in the UI's own
  words rather than pretending it does something. **A silent song is diagnosed, not
  guessed at**: the dev panel reads what each of `.song-audio`'s elements is actually
  doing (`src/lib/game/audio/diagnostics.ts`, pure and tested — file name, its progression
  (`drums_1.ogg 1m12s / 3m10s`), `readyState`, `muted`, volume, decoded audio,
  `MediaError`) plus the page's own autoplay policy and
  any `play()` the browser refused, which is the only way a "no sound" report can be
  answered from the outside. The file name is written on each element (`data-file`), so a
  local object URL or a `.sng` member does not turn into a UUID in the read-out. It also
  reads the counts the player writes on its container:
  **`data-stems`** (what the song document asked for), **`data-sources`** (what the browser
  got), **`data-unreadable`** (local stems the browser would not hand over) and the
  elements' own errors — so "the song names no audio", "half the stems could not be read"
  and "the stems are there and silent" are three different sentences rather than one.
- **Haptics and the wake lock are feedback and comfort, never rules.** A miss and a
  spent star power are read from the run's **published** counts (`run.misses`,
  `run.starUntilMs`, or a singer's or typist's own misses) exactly as the sound cues
  are, and nothing is written back: `haptics.ts` could be deleted and every note would
  be judged, scored and timed the same. The device's buzzer is one between every seat,
  so `hapticAllowed` is the minimum gap that keeps two players' misses from stacking
  into one rattle; a pad's rumble is that seat's own hardware and is not gated. A seat
  the machine covers is passed `enabled: false`, because it has no hands. A browser
  with no `navigator.vibrate`, a pad with no actuator and an iOS device that will not
  vibrate are all silence, and all of it is caught: haptics can never be the reason a
  run stops. **The wake lock is asked for once, in `GameApp`**, because the run is
  what it follows rather than a screen: `shouldHoldWakeLock` is true only for
  `countdown` and `playing`, and never when the setting is off, the document hidden or
  the shell native. **The native WebView is skipped on purpose** — the app's boot
  already holds the display awake for those screens, so a second request is a second
  thing to keep in step. Every refusal is caught and none is retried in a loop; a new
  screen or a return to a visible tab is a new question.
- **Choosing a song and choosing a band are two screens, in that order.** A
  jukebox picker wants the room a few hundred titles need (a scroller, an A–Z
  index, a search) and a band wants the room a slot per player needs; making one
  panel do both is what made the first attempt wrong. `songs` picks what, `band`
  picks who, and back works between them.
- **The song list is one you navigate, not one you browse.** `groupSongs` files
  titles under their letter and gives each a **slot** (`A·03`) that stays its own
  when a search filters the list around it; **the letters come out in
  `INDEX_LETTERS` order, which is what the shortcut bar renders**, so the two can
  never point at different places (`#` first, then A–Z — a title that begins with
  punctuation files under `#`, and collation would have sorted it among the
  letters). The index jumps by scrolling the scroller itself rather than
  `scrollIntoView`, so the panel around the list stays put. The list is a few
  hundred rows in one column: do not turn it back into a card grid, and do not
  render it twice.
- **Only the window is in the DOM, and the list still behaves as one list.**
  A folder of two thousand songs is a list you scroll, so `useJukeboxList`
  computes the rows around the viewport (with a few rows of overscan) and
  `Songs.tsx` mounts only those, with two spacers standing in for everything above
  and below; the letter headings of the groups the
  window touches are mounted too, because a sticky heading that is not mounted
  cannot stick. `src/lib/game/jukeboxWindow.ts` is the pure arithmetic: it
  flattens the groups into items, keeps a running offset, and returns the
  mounted range, each group's row range and the spacer heights, so the spacers
  plus the mounted rows add up to the whole list's height exactly. The hook
  measures **one heading and one row** with a `ResizeObserver` — never a
  hard-coded pixel height — so the three row tiers (`80rem`, `40rem`) settle into
  the same arithmetic and a resize keeps the item at the top where it was. The
  index reads a letter's offset out of that layout rather than a mounted node's
  `offsetTop`, so a letter whose section is nowhere near the DOM still lands with
  its heading at the top; the active letter is the layout's letter at
  `scrollTop`. ArrowUp/ArrowDown **and Tab** move through the *whole* list: the
  row they land on is passed to the window as an `ensure`, so it is mounted even
  beyond the overscan, and the scroller is moved to it before focus lands. Tab is
  intercepted for that reason — the browser can only see the mounted rows — and
  is left alone at the list's two ends, where the next control really is the
  search box or the way on. **The sticky heading is part of the arithmetic**: a row
  brought to the top is seated one heading lower (`scrollTopForItem`), so a focused
  row is never hidden under the letter above it. **A library update keeps the top
  item by identity** (`anchorTop` — a song's id, or a letter), so a refresh that
  inserts a song above does not move the list; only a **query** change starts at the
  top.
- **The list is built after the screen is up, never during the hop to it.** A
  library can be thousands of songs when a folder off this machine is open, and
  grouping and mounting all of them is the heaviest thing the jukebox does. `Songs`
  renders its search, index and a plain **Loading…** line first, then builds the
  list on the next frame (`ready` in `Songs.tsx`), so the press that left the menu
  lands at once instead of waiting behind a list it has not shown yet. Do not compute
  `groupSongs` or `searchSongs` before that frame — the whole point is that the
  screen paints while the library is still just data. Windowing is what keeps
  that frame cheap afterwards: only the rows around the viewport are mounted,
  whatever the library's size.
- **In the jukebox, focus and the selected song are one cursor.** Tab moves focus
  in row order and ArrowUp/ArrowDown move it from row to row with the page's own
  scroll taken away; the focused row becomes the selected song and starts its
  preview, so what the player hears is what they are looking at. Enter or a pad's A
  takes the next step — the same as **Next: your band** — while a mouse/touch press
  auditions the row and stays. Hover is not selection. **The A–Z index is out of the
  tab order** (`tabIndex={-1}`) while still being clickable and reachable by the pad's
  own cursor: Tab belongs to the rows, and the index is a shortcut beside them.
  **Returning from the band lands on the chosen song's row**, seated silently — a
  placement the game makes must not select or preview a song the player did not move
  to (the same rule covers a row growing back).
- **A row says what a song *is*, and nothing about where it sits or how it went.**
  `SongRow` is the cover, the **duration** — the one fact that decides whether somebody
  has time for the song — the title, the artist, and what there is to play. The **slot
  code is not on it**: the slot is the jukebox's own address in the list (this build does
  not draw it), and a column of `B·02` beside a title is noise on a list of a few
  hundred. **A best score is not on it either** — that belongs with the numbers, not
  beside a name, so the row carries none and the display carries it.
- **The time heads the title's line, and costs its width to the title alone.** `4:00
  1999 Forever` is one thing read once, so `time` and `title` share a grid row and the
  artist and the offers **start where the row's text starts** — the time is indented on
  the title's line and nowhere else. Its track is fixed (or the titles would not start at
  the same x down the list) but only as wide as `10:12`, and it is set at
  **`--song-title-size`, the title's own size**, in the mono face: below the wide layout it
  is part of what the row is called rather than small print beside it. The size is one
  variable so the two cannot drift apart.
- **A row loses a line before it loses a fact.** Below `80rem` it goes to **two lines** —
  the title with the artist underneath, the offers keeping their column beside them — and
  below `40rem`, where there is no width for a column beside a title, the offers take a
  line of their own. What it must **not** do is what it used to: hide the artist and the
  offers, which threw away most of what a row is for to keep the title's letters. A
  **taller** row costs a few scrolls; a row that only says "Electric Hearts" costs the
  reader the reason to pick it. The three tiers are the only places the template changes,
  and each one is still fixed tracks placed by `grid-area`, so nothing shuffles.
- **The cover grows with the row, and its column is its size.** `--song-art-size` is set
  on `.song-row` and read by both the track and the art, so a cover can never be a
  different width from the column it sits in — 1.9rem on the wide one-liner, 2.7rem on the
  two-line row, 3.4rem on a phone, each square and spanning every line. A 30px thumbnail
  beside two lines of text is the one thing in a taller row that has not noticed it is
  taller.
- **A song's art is optional, and the tile is not a fallback.** Art is whatever a
  playlist points at, and a playlist may point at nothing — so `SongCover` draws the
  song's initials over its own `accent` when there is no art **and** when the art
  does not arrive, at the same size, so a row cannot move because its neighbour has
  a picture. `songArt` takes the nearest there is: the song's, then its album's,
  then the artist's. Rows load their cover lazily — a few hundred of them is a few
  hundred images.
- **A list row's columns are fixed, or they do not line up.** Every row is its own
  grid, so `fr` tracks resolve against that row's content: one row with long chips
  puts its artist somewhere else from its neighbour's. The template is
  fixed tracks with **one or two `fr` columns for the text**, and the cells are
  placed by `grid-area` rather than by order — so a row without a best still puts
  its time in the time column, and moving a cell to another line on a narrow screen
  cannot shuffle the rest.
- **The jukebox's toolbar is the field and the button on a phone.** Below `40rem` the
  "find a song" label is **set aside, not deleted**: it is still the input's label — a
  placeholder is not a name — but it is drawn at a pixel, so the field and the Playlists
  button share one row and the field keeps the width the label was using. The field's
  `flex-basis` drops with it, or the button would still be pushed to a line of its own on
  a small phone.
- **A run cannot be resumed, and the URL does not pretend otherwise.** There is no
  playhead and no hands on the keys to restore, so a reload starts at the welcome
  with the library, band and scores read back from local storage — never mid-run.
- **The band is remembered, and that is deliberate.** `src/lib/game/band/store.ts`
  keeps the plan in this browser's storage — no account — so walking back to the
  band screen does not mean starting again. The plan is **plain data and nothing
  else** (`BandPlan`: a slot per player), because it has to survive being written
  down; `makeBand` turns it into the `BandSetup` the stage renders — the two differ
  only by a player's `auto` flag — and a tampered store cannot put a broken band on
  stage.
- **The clock starts standing still, and `ended` is what ends a run.** Nothing
  auto-plays: `StageDirector` seeks, plays and pauses for whichever screen is up,
  and the clock's `ended` flag (set when the playhead reaches the end, cleared by
  a rewind) is what sends the run to the results. Keep the transport in step with
  the screens rather than starting the song from an effect anywhere else.
- **Input is gated on the clock moving.** A fret press and a keystroke only mean
  something while the stage is playing (`clock.playing`), so the screens own the
  keyboard — Space activates a focused button, Escape pauses — and a paused song
  cannot be judged. A *release* always lands, so a fret held across a pause is
  still let go. Do not take keys back outside a run.
- **Input is stamped with the event's own time.** A press, a release, a typed
  character, a MIDI note or a pointer tap is projected from `event.timeStamp` onto the audio
  clock (`clock.timeOf`), never stamped with the previous frame's playhead — a
  frame's lag is what reads as an unfair early or late miss. A gamepad is the
  exception: its state is polled, so it has no event to stamp and takes the frame.
- **Difficulty belongs to a chart, and to nobody else.** A song can be easy on the
  guitar and hard to sing, and it can carry a chart at only one level — so difficulty
  is never shown as a song's own chip, never a band-wide setting, and never assumed:
  each slot picks from `difficultiesFor(track, instrument)` (or the three vocals
  always carry, or nothing at all for lyrics), and the score board is keyed by
  **song** with each player's difficulty recorded in the entry. `songChips` is the one
  place that says what a song *offers*, and it lists **additions only** — a solo is
  implied, and Vocals imply the words, so neither `Solo` nor `Lyrics` is said
  alongside them.
- **A band is one list of slots, and the band screen draws them as character
  boxes.** A slot takes an instrument (guitar, bass, drums, simple keys, dance) or
  **the place at the words** — `words`, which is singing or typing on a pitched song
  and typing on a lyrics-only song — each with the difficulty that fits it; a box
  holds everything about its
  player, so there is no separate melody section, no band-wide difficulty and
  nothing else on the screen saying who is playing. **The song owns what there is to
  play** — its parts, whether its words carry pitch, and which charts it carries — so
  the band says who is playing it and whether a words player sings or types:
  **modes the song has no part for are hidden**, the level buttons are the chart
  sets the song has, and Play is refused when active players have no part; an empty
  band may choose **Listen**, which shows the song's lyrics while it runs.
  **An empty box never offers a part the song has none of**
  (`nextSlot` cycles through the song's instruments and words modes), and it says
  what it is offering before it is
  pressed, so a box can never arrive holding an unavailable choice. The level buttons
  **share one row whatever their count** — one is a full-width button, four are a
  quarter each — and "not in this song" is drawn as the same button-shaped slot, so
  it reads as part of the box rather than a note about it.
  What a slot takes is *where the box is*: **four boxes to start with, and a second
  row offered from the action bar once the first is full** — the offer in the middle,
  Play on the right, and the consistent Back button in the page header. "Add more
  players" only appears when there is room to add them. **A phone stops at the first
  row**: it draws one box a row (`max-width: 40rem`), so eight players would be eight
  full-width boxes before Play, and `Band.tsx` therefore never offers the second row
  there — the band is four players. A band remembered with more (picked on a wide
  screen) is still drawn in full on the phone, because no seat the run will play may
  be hidden from the screen that plays it. An empty box is a place in
  the band, and `setSlotAt(plan, at, slot)` puts a new player in the box
  that was pressed, so "Player 3" means the same thing here as on the stage.
  Removing a player leaves a gap rather than renumbering the players behind them.
- **A box answers for its own width.** The grid gives four boxes a row, two on a
  tablet and one on a phone, so the same box is a very different width in each:
  `.slot` is a container and its pickers stack by `@container` (two tiles a row
  until the box is under `10.5rem`, the difficulty three-up until `10rem`) rather
  than by guessing at the viewport. Do not size a box's insides with a media query —
  the box's width is what matters, and it says the longest label ("Simple keys") in
  full at every width because of it. The one-column phone rule is the exception that
  proves it: at half a phone's width the box was under `10.5rem` and its pickers
  stacked one per line, which is why the phone gets the full width instead.
- **A words player's role is per player when the song carries pitch.** The box takes
  the words; that player may **sing** or **type** on a pitched song, while a lyrics-only
  song is typed. `melodyRoles`
  spreads them across the song's parts and shares when there are more players than
  parts, exactly as a duet already shares words. A **singer's** difficulty is settled
  against the three vocals carry (a chart may be expert-only; singing never is); a
  **typist** has none at all and runs at `FREE_PLAY`.
- **The score board is local, and that is a decision.** `src/lib/game/scores.ts`
  keeps finished runs in this browser's storage: no account, no server, no
  leaderboard. It is the shape a real board will arrive in rather than a different
  design, so keep the pure functions (what counts as a best, how many are kept)
  honest and testable, and keep `bestFor` refusing a failed run. A run is kept
  against its **song**, and the comparable unit within that is the **lineup**:
  `lineupKey` names each player's instrument and difficulty, plus whether a words
  player sang or typed, in a stable unlocalised key sorted so seat order does not
  matter (for example `drums:hard+guitar:expert+words:normal:sing`). It is the
  lineup rather than "the song's difficulty" because a song can be Easy on the
  guitar and Expert to sing — difficulty belongs to a player's chart. `bestFor` and
  `topFor` take an optional lineup: with it only that band's runs count, without it
  the song-wide best across lineups is still what the jukebox shows. Entries saved
  before lineups were recorded have no key, so they are their own group and never
  match a specific lineup. **A run with nobody on stage is not saved at all**: Listen
  publishes no run, so `Results` writes nothing — a zero on the board would become
  the song's best. The dev screen jumper lands on that screen too and must not
  pollute the board either.
- **The shortcut index is a wide-screen luxury.** A–Z down the side of the jukebox
  is hidden below `48rem`: on a phone it would take a third of the width and leave
  the list unreadable, and the search box is the way through it there. Hiding it is
  purely presentational — the letters and the list still come from one order
  (`groupSongs` walks `INDEX_LETTERS`), so a hidden index cannot disagree with a
  visible list.
- **The run board is a read-out, never an input.** Every run publishes its totals
  (`usePublishRun`) and the results screen reads them; nothing published is ever
  fed back into judging, so the rule that no player can be affected by another
  still holds by construction. It holds its entries in a ref and has no state of
  its own, so publishing costs no re-render — which matters, because a run
  publishes on its own throttle and there can be a dozen of them. An entry says
  **which seat it is** — a run is a seat's, and the runs report in the order their
  effects happen to run, so the results screen sorts them back into band order
  rather than showing the singers first — and **what its counts are of**, since a
  highway counts notes and a typist counts words. A typist's entry may also carry
  their **`typing` report** (words a minute, key accuracy), which is the same kind
  of read-out and is never read back either.
- **The results screen hands the song to one card per player.** The band's own
  numbers sit above it as **one row of reads** — the band score first and at full
  size, then the notes hit **of what was judged**, the accuracy and the best combo,
  equal tiles so nothing is a headline with a field of nothing beside it — with the
  best line under them. Above that row is the run's **star rating** and the average
  multiplier that earned it. Then a card each, drawn like their box on the band
  screen: a head, the score, the player's own stars and average, and their notes,
  accuracy and combo under the same dashed rule a box keeps for its levels — plus,
  for a typist who landed a key, **words a minute and key accuracy** from their
  run's own `typing` report, appended to that same stats line. Star
  rating is `starRating(score, baseScore, hits, judged, total)`: the score over what
  the song pays at ×1 (`baseScore`, published on every run), with the table's
  thresholds (0.65 / 0.9 / 2.0 / 2.8). Gold needs every note the part **has**
  (`total`), not merely every note judged so far, so a seek or a quit cannot make a
  partial run gold. A run with no base has no rating. It is a read-out rather than a
  place in the band, so **nothing in a card is a control**. The cards are **centred**, at a width that suits
  what is in them, because a handful of players stretched across the panel is a field
  of nothing *between* two cards — and their heading is centred with them. The song's
  own history under it is a **leaderboard**, so it stays rows, kept to their own
  width: each row says **when** it was played and **how big the band was**, rather
  than repeating the song the heading already named, and **which lineup** it was on a
  quiet line under those — so a reader can see why an Expert score sits above an Easy
  one. The history stays **song-wide** (a run is still a run); it is not a per-lineup
  leaderboard, and the best line above it is the one that is for this band. On this
  screen the quiet tones
  are **raised** — the stage is read at a glance from across a room, a results panel
  is read at a desk, and two-thirds opacity that works on the first reads as a smudge
  on the second.
- **A kept run has a brag card, and it is a poster rather than a cover.**
  `src/lib/game/bragCard.ts` is pure and tested: a `BragCard` (the game's name, the
  song, the score, the stars and gold, the accuracy, the best combo, the band size and
  the date) becomes a complete 1200×630 SVG. Every value is **XML-escaped** for text
  and attributes alike, and the same card is the same document — the date is formatted
  in UTC. It **does not fetch or embed song art**: that is somebody else's file at a
  URL this repo does not own, a canvas would need CORS on that host, and this is a
  poster of the run rather than the song's cover; the song's `accent` is one
  restrained mark, and only when it is a hex colour. The dialog
  (`screens/BragCardDialog.tsx`, **lazy**) fetches the self-hosted display and mono
  fonts, base64s them into a `@font-face` block and rebuilds the card; a failed fetch
  falls back to a system stack, so an SVG with no fonts is still valid. The preview
  is an `<img>` over a Blob URL — **never `dangerouslySetInnerHTML`** — Download saves
  the SVG, Share is offered only where `navigator.canShare({ files })` allows it, and
  Copy text is the fallback; every object URL is revoked and an aborted share is not
  an error. The button is on the results **actions** only when the run is one the
  board kept: `save`, not lost, a non-null verdict and at least one run — never
  Listen, the attract demo, a lost run or a stage that judged nothing.
- **A lost run is a verdict, not a mid-song fail mode.** `lostRun(hits, judged)` is the
  rule: at least ten judged notes/words and fewer than half hit. `Results` computes it
  from the published runs, shows the existing "Run over" state and **does not save** the
  run to the board; the force-fail dev toggle is gone. Nothing cuts a player off
  mid-song, so one seat's misses cannot end another's run — which is the same principle
  as per-player judging. Existing saved failed entries stay readable and `bestFor`
  keeps refusing them.
- **The stage is the fullscreen target.** On the game-only entries `.band` is a
  full-viewport (`100dvh`) block. `/play` keeps the site header and footer around it,
  so the **header and the stage share the first viewport**: `BaseLayout`'s `frame`
  wraps the header and `main` in a `100dvh` flex column, and `.site-frame .band`
  fills what the header leaves. The footer is below that frame, one screen down. The
  document remains scrollable to the footer, but at rest the game is wholly on
  screen, so a run never needs scrolling the progress bar off the top to reach the
  bottom of the highway. A stage measured at `100dvh` *below* the header was taller
  than the window, which is the "game doesn't sit in" report. `/app`, `/embed` and
  `/open` are
  the game-only entries and have no shell to hide. Fullscreen removes the browser's
  chrome and, on `/play`, stands the site shell aside (and the stage is fixed at
  `100dvh` again).
  `useFullscreen` (one `fullscreenchange` listener, in the island) asks a single
  question — has **anything of ours** taken the screen — and marks the document
  (`data-game-fullscreen`); global CSS hides `#site-header` and the footer for any
  page that has them, so leaving fullscreen puts everything back.
  Anything of ours counts, because the only candidates in this document are the
  stage and its backdrop, and both mean the same thing. **Entering the stage is
  what asks for it** — the welcome's one button takes the screen (a browser only
  grants it to a gesture, and a refusal leaves the page as it was) — and the button
  on the dev panel is only a second way to it. Panel and view internals size with
  CSS container units (`cqmin`), so do not hardcode px type sizes inside them.
  **The fullscreen element is fixed and `100dvh`**, and the stage's padding is the
  brand gutter **plus `env(safe-area-inset-*)` on the top and the sides**: a phone in
  fullscreen or an installed app draws the page under the status bar, the notch and the
  home indicator (`viewport-fit=cover` is on both layouts), and without the inset a
  lone player's score rail — which sits above the highway — is off the top of the
  screen. **The bottom is the exception**: the lowest thing on the stage is the
  highway's deck, not a control, so the neck runs under the home indicator and the
  gesture bar. Reserving the bottom inset there left a strip of backdrop below the
  deck — a gap the game did not fill — for a system bar with nothing on it to press.
  `BandStage` measures the stage's **content box** (`useElementSize(true)`), so that
  padding is the frame of the play area and the layout does not reserve it a second
  time; measuring the border box is what pushed the lanes off the bottom of a notched
  phone. The progress bar, the practice read-out and `.stage-corner` sit below the top
  inset for the same reason. An author `position` on `.band` overrides the user agent's `:fullscreen`
  rule, which is why the fixed position is stated for the fullscreen case.
- **The melody region is see-through on purpose.** No fill, blur or rule: the
  backdrop should read behind the lyrics, so the text carries contrast itself via
  `--on-video-shadow`. The **active word** is the exception — a yellow fill needs
  no halo, so it sets `text-shadow: none`. Do not give the region a panel back.
- **The stage runs on one frame loop, and nothing re-renders on a frame.**
  `StageClock` owns the loop; a component that follows the playhead subscribes
  and writes to the DOM itself (see `useScrollTrack`). Anything that shows a
  discrete value asks for a throttled one (`useClockMs`, `useSinging`). Do not add a
  `requestAnimationFrame` loop per component, and do not put the playhead in
  React state. **Even the FPS read-out is counted by that loop** (`clock.fpsRef`,
  read through `useFps`): a second frame loop to watch the first is cost spent on
  watching, and it showed up as such in the profiler.
- **Highways scroll by transform, never by re-positioning notes.** A highway's
  notes are mounted at fixed percentages of the axis and one translated layer
  carries them, so a frame is a single style write. `axisPercent` places,
  `nextAxisOffset` moves — they are the same maths with opposite signs, and a
  test pins that they cancel.
- **The transform must be measured from the window the DOM is showing.** When the
  mounted window slides, the notes' positions *and* the transform change basis.
  If they are not committed together the notes jerk by the difference — which is
  exactly what a "scrolls fine, then jumps" report means. `useScrollTrack` keeps
  the two in step in a layout effect, so they land before the paint.
- **The picture offset moves the drawing, not the run.** `visualLagMs` is added to
  a copy of the playhead inside `useScrollTrack`, and that same copy seats the
  mounted window, so a late display's notes are drawn ahead of the sound without
  the transform and the window drifting apart. The melody roll takes the offset
  too, so a singer's bars line up as well; the clock, judging, scoring, the song
  progress bar and the lyrics' active-word timing keep the real playhead.
- **The clock only moves forward.** `elapsed` is clamped at zero, and
  `advanceRun` treats a time at or before zero as the start rather than a rewind.
  A frame timestamp can land a hair before the previous one, and a negative time
  heading into the rewind path would recurse for ever.
- **Only the window is mounted.** `notesInWindow` keeps a couple of seconds
  either side of the playhead in the DOM (about 14 notes per panel) whatever the
  song's length. Keep it that way: mounting a whole chart is what this design
  exists to avoid. Two rules are not optional, though: a **sustain stays mounted
  while any of its tail is in the window**, because its head is meant to scroll
  out below the hit line long before the note ends (a head-only window made long
  notes vanish part-way through a hold), and a **neighbour is the whole moment**,
  because keeping only one note of a chord unmounted the others while it stayed —
  which is what made a held yellow/blue chord come apart on screen.
- **The built-in playlist is EverythingStar FOSS.** The library is published at
  `https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/main/songs/playlist.json`
  and seeded once, like any other source; there is no generated playlist inside this
  repository. The mock is a **fixture generator**, not content: `files.ts` writes its
  songs out as the three documents the tests read back. Do not put the mock's songs
  into the built-in playlist; they are fake. A browser seeded with the old local
  `/playlist/default.json` is migrated onto the FOSS library. The run and the axis
  maths (`run.ts`, `scroll.ts`) are the parts to keep and grow.
- **Melody top, lanes bottom.** The two regions never swap, so gaining or losing
  a singer does not make the layout jump.
- **A lone lane with nothing else fills the stage.** `computeBandLayout` reports
  it as `bare` and hands it the whole region rather than a 1:1 square: the panel
  drops its border, radius and fill (`.player-panel--bare`) so the backdrop shows
  through, the highway is capped in width and centred on the stage, and the rails
  are capped in size — "fill the screen" does not mean everything grows with it.
  **On a portrait phone the rails move above the highway**: at `max-width: 40rem`
  and `orientation: portrait`, `.player-panel--bare` becomes a grid with a compact
  score/meter row at the top and the highway across the full width below it.
  Two rails beside a 390px stage took more than a third of its width from the
  notes; this is the one layout where the highway needs the width more than the
  rails need the height.
- **The stage keeps a gutter.** `STAGE_GUTTER` is passed to `computeBandLayout`
  as an inset *and* applied as the stage's padding, so the two cannot drift; a
  region that needs the full width must account for it.
- **The melody region has one view, never two.** Its `mode` (`lyrics` | `keys`) is the
  song's pitch **and whether somebody is singing**: a pitched song with a singer uses
  `keys` (a piano roll with the words riding its time axis under the bars); a song with
  no pitch, or a pitched song whose words players all chose Type, uses the lyrics view.
  A duet is not a second view either. The region only exists when somebody is on the
  words, and Listen uses the lyrics view. The keys view draws whole words in its line
  strips under the bars for its typists; its syllable note bars above are the singers'.
- **The song owns its parts, not the players.** A solo song stays a solo however
  many are on the words: they all take part 0, read the **one** set of lyrics, and
  keep their own scores. Adding a player must never turn a solo into a duet (which
  is what a player-derived part count did), and removing one must never leave a
  duet row with nobody on it. The count comes from the track; `melodyRoles`
  clamps it and shares the players over it.
- **A song can carry up to three parts.** `MelodyNote.part` says which part sings a
  word; `MelodyLine.parts` says who sings a line, and `offset` 0 is unison while
  anything else is harmony. A duet gives each part a note colour *and* a row of
  words, so two singers on different lyrics are both legible, and the colour is
  never the only cue (the row, and the row's number, say it too). The words-only
  view gives each part its own **block** — side by side with a rule in its colour
  and its number down the side, stacking when there is no room for two — and each
  block is self-contained, so a line both sing simply shows in both.
- **A word stops being lit when it is over.** `isSounding` is the rule for both
  views: a word is lit for its own length plus a short articulation breath
  (`WORD_BREATH_MS`) and no longer. `activeWordIndex` goes back to -1 once the
  last word of a line has run out, rather than leaving it highlighted until the
  next line starts — which, across a break, can be a long time after the singer
  stopped.
- **A line fades up over its run-up.** `introProgress` turns "how close is the
  next line" into 0..1, and the view scales the fade and the rise by it, so a
  singer can watch their own line coming. It is worked out from the clock at
  render time, **not** a CSS animation: an animation would run on through a pause
  and the cue would arrive while the song was standing still.
- **A shared note is one note.** Where two parts land on the same row at the
  same moment they are singing **the same note**: `rollNotes` in `melody.ts` hands
  it back once with both parts, and the roll draws it as a single bar split between
  the two colours. Do not draw one bar per part and let them overlap — that reads as
  two notes.
- **More players than parts share them.** `MAX_PARTS` is 3: the melody is a solo,
  a duet or a trio, and a fourth singer doubles a part rather than adding a colour
  the palette could not tell apart. The sources' `HARM3` is named and shared, not
  drawn as a fourth voice.
- **Every part is scored on its own run.** `partNotes` hands the melody's notes out
  per part and `useSinging` gives each one its own run, so a duet keeps two scores
  and two combos — and **one microphone between them**, since a microphone is one
  between all the singers (`StageControls` owns it). A word both sing is judged for
  **each** of them from the same pitch: they hit or miss it independently, which is
  what two singers are. Never put the melody on one shared run.
- **The microphone is a controller, and singing is judged from a trail.** Permission
  is asked at the **Vocals selection** — the band screen's Vocals button, an empty
  box joining as a singer, or Play when a singer was already remembered — because
  asking needs a gesture and the run must not surprise the player with a prompt.
  `requestPermission` gets a stream and stops it at once: it is permission, not
  listening. The run opens a stream only when `permission === "granted"`, and listens
  only while the transport is moving — never on the band screen or the results, so the
  browser's indicator goes out with the song; a refusal is not an error but a band that
  plays itself (the score rail says `auto`, and the dev read-out says why). Detection is
  YIN (`pitch.ts`, decimated and buffer-reusing, run on the stage's own frame loop — never
  a loop of its own) and the samples are kept as a **trail** (`singing.ts`), because a note
  is judged on **how much of its own span** was held in tune rather than on a single
  sample at its onset: a singer who joins a long note late and corrects it still lands
  it. The trail is **cleared on a seek**, so the previous pass's voice cannot land the
  next section's first note. **Each singer is judged from the microphone only if their
  own seat has it** (`live` on the seat's control): one microphone is one between the
  singers, but a seat the machine covers stays the machine's however loud the room is.
  Nothing leaves the device: the samples are analysed and dropped.
- **A row is a semitone, and the chart says which.** `MelodyChart.rows` and
  `rootMidi` are the roll and its anchor, so a note's pitch is `rootMidi + row`:
  that is what lets a contour drawn from nothing and a frequency measured in hertz
  be the same thing, and it is why `KeysView` draws the rows the *chart* declares
  rather than a constant of the mock's. **Difficulty is the tolerance**
  (`VOCAL_TOLERANCE`), and the comparison **ignores octaves** — a man an octave
  below a woman is singing the same note. A freeform word (spoken, no row) is graded
  on presence, not pitch.
- **Lane kinds are data.** A new instrument is an entry in `INSTRUMENTS` (with
  its kit and its label) — not a new component, and not a lane count, which comes
  from the chart. The band's kinds are those instruments **plus the one place at the
  words** (`words`), which is not an instrument and has no kit.
- **A bar is the note, and never runs into the next one.** `src/lib/game/band/melody.ts`
  owns the roll's row positions and the span a note's bar is drawn for; the views only
  place them. A bar is held for the note's length, with a floor for a very quick note,
  and **stops short of the next note in its part** — two quick notes are two bars with
  a gap, not one long bar with no join. There are no ribbons between notes: a bar is
  the note. A note highway is **buttons** — a note is hit where it lands — so it
  carries no ribbons at all.
- **The words ride the roll in the keys view, and stay put in the lyrics view.** When
  the song carries pitch and somebody is singing, `KeysView` places each lyric line as
  a **strip at its own moment, with its own span as its width, inside the roll's
  translated layer** and under the bars. The notes and the words therefore travel
  together: a singer reads the pitch and the word in one place rather than looking up
  for one and down for the other. Each part keeps its own row under the bars
  (`mountedLines` in `melody.ts` splits the lines by part, so a shared line appears in
  both), a line still to come fades up over its run-up, and its current word is the one
  being sung. A line's words may overhang its drawn span, so the **active strip is
  raised above its neighbours** rather than clipped; do not move the words back out of
  the track. The **lyrics view** — a song with no pitch, or a pitched song whose words
  players all chose Type — has no note axis for them to ride, so it is the whole region
  and does not scroll; `LyricsView`'s old `compact` strip is gone.
  `tests/e2e/keys-view.spec.ts` is the browser gate: the strips and the bars are
  children of the one track, the words sit below the lowest bar, and the track carries
  both while a lyrics-only song has no roll and does not scroll.
- **A word can be freeform.** A melody word with no pitch row (`FreeformNote`) is
  spoken or rapped: it is drawn as the word alone, with no note bar, and graded on
  presence rather than pitch. The roll says so while one is being delivered. Keep
  pitched and freeform words in one time-ordered melody; the view is still one view.
- **The backdrop may be a YouTube embed.** `StageBackground` takes `blank`,
  `video` or `youtube` media; the preview controls switch it. A YouTube backdrop
  autoplays muted and loops (`src/lib/game/band/media.ts`), which is why
  `public/_headers` allows `https://www.youtube.com` in `frame-src`. The video id
  comes from the song document's own `video` block; nothing is hardcoded.
- **`BandControls` and everything it drives are dev tools, not the product.**
  `src/lib/game/dev.ts` is the one flag, and it is **off unless asked for**: `?dev=1`
  shows the tools and nothing else does, so the deployed preview is what a player sees.
  Everything — the **transport** included — sits behind a single `Dev` chip in the
  corner, **closed until the chip is pressed**: the flag decides whether the chip exists,
  and the chip decides whether the panel does, so a review session opens on the game and
  not on a wall of scaffolding. Behind it: the transport (play, pause,
  restart, scrub), the FPS and note-count read-outs, a **screen jumper** (every screen,
  without playing the song before it), **how many players take a keyboard**, the video
  switch, the key map, the volume, and the **controller read-out** — what is plugged in,
  and where two players want the same key, which is the
  only place the conflict warning is shown. The **song-audio read-out** sits beside
  those: one line per stem with its file and progression (`drums_1.ogg 1m12s /
  3m10s`), its readiness and volume, any `MediaError`, the stem counts and the
  alignment spread. The volume and the video switch are **not the
  dev panel's own**: they are the settings `Options` owns (`settings.ts`), read here
  through the same audio context, so the review surface and the product surface can
  never disagree about them. They are marked in the UI with a `dev` badge
  and they come out before release — or ship behind that flag. The **dev panel's
  count of who takes a keyboard** goes with them: a real player's panel takes real
  input, while a seat nobody is holding is still played by the machine
  (`simulate.ts`), because that is product behaviour. It sits above the screens (z 30)
  so the review surface is never covered by the thing it is reviewing. Do not build
  product behaviour on any of it, and do not remove the real thing while removing
  them.
- **`build.format: "file"` means the build-time pathname ends in `.html`.** Active
  nav normalises both `.html` and trailing slashes. URL policy is
  `trailingSlash: "never"`.
- **Permanent Marker has one weight and is decorative.** Use it for headings and
  short labels only; never for body copy, buttons or instructions. Body is Space
  Grotesk; utility text is Space Mono.
- **The accent is sparing, and it is the vocals' colour.** `--color-accent`
  (electric cyan) marks **a singer's** words — never a typist's, which is its own way
  to play and keeps the default schema — plus a few highlights (the roll's notes and
  glides, small spray details). **Every instrument keeps the default yellow/cream
  schema.** `kindTone` in `playerBits.tsx` is that rule (it takes a seat's
  `wordsMode`), `SongChips` accents only a song's Vocals chip, and the welcome strip
  names the parts (Guitar, Bass, Keys, Drums, Typing, Vocals) and accents only Vocals.
  Keep the palette mostly yellow + ink + paper; anything for an error or a "hard"
  state can be introduced when such a state actually exists.
- **Focus on the stage is the stage's own.** The site's ink `:focus-visible` is
  right on paper and wrong on ink, so `band.css` gives `.band` a cream ring,
  mirrors the house hover on focus, and uses an inset ring for rows inside a
  scroller. The welcome's one button, the menu doors and wordmark, and every back
  button use their hover effect as the focus cue instead of a ring. A gamepad moves
  the browser's **real focus**; `data-nav-focus` is the
  marker that keeps the ring visible when the input was not a keyboard. Never
  build a second selection cursor. `data-game-input` on `<html>` says what is
  driving (`pointer`, `keyboard` or `pad`): a pointer suppresses a focus the game
  moved by code on a screen change, so the mouse's hover is the only control that
  looks active. Every screen puts focus on the element that
  screen starts with, and a live region says the screen's name; a swapped screen
  must not leave focus on `<body>`. **A marked root is the starting place**: the
  stage and the loading screen mark themselves `data-nav-default`, and
  `defaultFocus` returns that root rather than its first focusable — focusing the
  stage's first highway pad put the ring on a control the player had not reached.
  **Nothing inside the stage is scrolled into view**: `focusStageTarget` skips
  `scrollIntoView` for an element inside `.band__stage`, because the stage is
  already wholly on screen. A focused pad's `scrollIntoView` used to scroll the
  stage's own `overflow: hidden` by a few dozen pixels (or, with the stage clipped,
  the `/play` document to the footer): the progress bar left the top and a strip of
  backdrop appeared at the bottom, which read as the game not fitting its screen.
  That is why the stage and the highway are `overflow: clip`, not `hidden` — a
  clipped box is not a scroll container at all. Modals are native `<dialog>`s — `useModal`
  supplies the focus trap, Escape, and return-to-opener — and `backEventFor` in
  `screens.ts` is the one rule behind Escape and the pad's B button. **A dialog
  that opens over another is the one on top, and the game keeps that order itself**:
  `ui/modalStack.ts` lists the open dialogs as they are pushed, and `topDialog()` is
  what the pad's cursor, B and the Escape guard ask — `document.querySelector
  ("dialog[open]")` answers with the *first* one, which for the Practice dialog over
  the pause is the pause underneath it. **The press
  that opens the pause owns the Escape**: the handler `preventDefault`s before
  dispatching, or the `<dialog>` opening mid-keydown receives the same Escape as
  its cancel and closes at once, which reads as "Esc does nothing". And **in
  fullscreen the browser keeps Escape to itself** — the page never sees it — so
  `pausesOnFullscreenEnd` makes a run pause when the whole screen goes, because
  leaving it is the only thing that press did. **A text field keeps its own Escape**
  — the jukebox's search clears rather than leaving the screen — so the island's
  Escape handler and the pad's arrows both step aside for one (`isEditable` in
  `ui/nav.ts`). Text fields —
  the song search, a playlist URL — stay the operating system's job: the gamepad
  layer never draws its own keyboard.
- **The pad is a menu cursor when it is not playing.** `GamepadNav` polls on the
  stage's one clock loop and drives DOM focus spatially (`ui/focus.ts`): D-pad and
  left stick move, A confirms, B backs/cancels, Start pauses/resumes, LB/RB step
  through tab order. The main menu's arrow keys use the same spatial rule as the
  D-pad, and take the page's scroll away. While a song is moving the pad belongs
  to the players, and only Start is read; while a controller is being learned the
  whole UI layer is suspended, so the button pressed is the answer and never a
  menu press. A range takes left/right to step and up/down still moves focus.
- **One radius scale, three values.** `--radius-brand` (surfaces), `--radius-inner`
  (small things inside a surface) and `--radius-pill` (pills). The one exception
  is the `.mark` spray blot, which is deliberately irregular. In the game UI
  (`band.css`) the rule is exact: **brand** for a surface (a panel, a control bar,
  the jukebox's slot), **inner** for a control or an inset (a button, an option
  row, the letter index, a note) and **pill only for a text label** (a chip, a
  tag, a badge). A pill on a small square control is a blob, not a rounding.
- **The scrollbars are the stage's, and thin.** `band.css` thins every scroller
  inside `.band` (8px, a cream thumb at quarter opacity on a transparent track)
  in both the standard properties and the WebKit pseudo-elements, since
  `scrollbar-width` does not inherit and old Safari only reads the latter. It is
  scoped to the stage on purpose: the paper pages keep the browser's own, which
  suits them. Do not thin the document scrollbar globally — a cream thumb would
  vanish on paper and an ink one on the stage.
- **Accessibility is a constraint, not a nice-to-have.** Focus rings, reduced
  motion, the skip link, the `<details>` mobile menu and 44px targets are all
  deliberate; do not regress them. Decorative layers are `aria-hidden`.
- **Fonts are self-hosted** in `public/fonts/` and declared in `global.css`;
  `bun run fonts` re-downloads them. `BaseLayout` preloads the display font.
- **Icons are generated** with the `favicons` package (`bun run icons`) from
  `public/icons/brand-mark.svg`; do not hand-edit the PNG set.
- **`public/og-image.png` is a designed asset.** Its source is
  `scripts/og-card.html`, rendered in a browser with the self-hosted fonts at
  **1200×630** for Open Graph and at **1280×640** for the GitHub repository social
  preview (`.github/social-preview.png`, which GitHub only takes by hand from the
  settings). `bun run cards` renders both from the one layout; re-render it (do not
  build it) if the branding changes, and bump `OG_IMAGE_VERSION` when the picture
  a visitor sees actually changed.
- **A documentation screenshot is a test in `tests/e2e/docs`, and it is never
  committed.** A page says `[description](shot:<id>)`; a test carries
  `annotation: [{ type: "doc", description: "<id>" }]`, and the automatic
  fixture takes the picture in its teardown, once per Playwright project, only
  for a test that **passed**. The `desktop` and `mobile` projects in
  `playwright.config.ts` write `public/docs/test-output/<id>-<variant>.webp`,
  ignored by Git. `src/lib/docs/shots.ts` renders one `<details>` per promised
  variant, so the page ships no island, and `references.test.ts` fails if a page
  names a shot no test takes, a test no page shows, or a narrowed shot whose
  `docshots.config.ts` entry and annotation disagree. The **build runs before the
  captures in CI**: it writes the image tags, the e2e shards fill them, and
  `bun run docs:bundle` copies them into `dist/`; `check:docs` fails if a named
  image is missing. A local `bun run build` still captures first. Do not hand-write
  `![…](/docs/test-output/…)`, and do not commit the folder. The Astro dev toolbar
  is disabled in `astro.config.mjs` for the same reason: it is a floating overlay
  at the foot of every page, and the captures run against the dev server.
- **A sound that never answers must not hold the run — and a sound that is only
  slow must not be abandoned.** `StageClock` waits for a registered source while it
  is buffering — right for a moment, fatal for a run. A folder whose every stem
  failed and a refused YouTube player both used to leave the playhead at 0:00 for
  ever, with no message and no results. Silence has **two windows**: a source that
  says it has failed (every stem errored, the video refused) is given up on at
  `SOURCE_STALL_MS` (1.5 s), and one that is merely slow — a seek in flight, a buffer
  refilling — at `SOURCE_STALL_SOFT_MS` (6 s). Giving up earlier advances the
  playhead through sound that is still coming and judges the notes in between as
  misses. The frame clock then takes over, the run ends normally and the stage says
  the sound is gone (`StageNotice`); the source stays registered, and when it
  returns it is **seated on the playhead** rather than freezing the highway until it
  catches up. A cleanup's `followSource(null)` must not clear a loss already
  declared, or the notice flickers and the playhead creeps.
- **A failed read is not an empty answer.** The library's trim compares the index
  with the cache store's keys. Folding a failed `getAllKeys` into `[]` made every
  record look like an orphan, and one transient IndexedDB error could delete the
  whole 48 MB cache. `keysIn` returns `null` and the trim does nothing. Do not give a
  "nothing" and a "could not ask" the same value.
- **A `200` is not a document.** The offline worker keeps a saved document fresh from
  the network, and a captive portal answers `200 text/html` while a provider's error
  is a `5xx`. Only a response that is JSON (by content type, or by parsing a clone)
  may replace a saved copy; anything else serves the copy the player already has.
  Whether a URL *is* a document comes from the cached response's content type — a
  service may answer `/search?q=…` — with the `.json` extension only as a fallback.
- **Every fetched number has a ceiling.** A note at `1e12` ms is a song that never
  ends and a sustain held for the session; a `Math.min(...notes)` over a large
  karaoke chart is a `RangeError` that drops the song silently. A note past six hours
  is dropped and named, a hold over ten minutes is clamped, and a range is found with
  `minMax` rather than a spread.
- **A verdict belongs to every player on the note.** Two singers sharing one bar get
  their own verdicts; the roll draws `is-mixed` rather than letting the first singer
  speak for both, and the melody meter never rewinds `atMs` to take a verdict (that
  drained the same gap twice and made a singer's gauge fall on a hit).
- **A take belongs to the pane it was armed on.** Changing panes mid-take used to
  keep recording and then convert the events against the new chart's instrument and
  columns. The pane change ends the take where it was played; the grid is part of the
  undo snapshot, because every exported tick is measured from the BPM.
- **This repo has no server, and must not grow one.** `wrangler.jsonc` is
  assets-only: no `main`, no Worker script, no `/api/*` and no bindings.
  Everything the game reads at runtime is fetched by the browser from a URL it
  was given — a playlist, its song documents, its charts and its audio (see
  `playlist-api.md`) — so a provider is a **separate project** reached through the
  Playlists feature. If a feature seems to need an API, the answer is a different
  project, not a Worker here.
- **`workers_dev` and `preview_urls` are `false`**, and stay false: only a push to
  `main` deploys automatically, from the deploy job in `.github/workflows/ci.yml`,
  so a deploy must not re-enable the workers.dev route or a version-preview URL.
  `previews: {}`
  is inert now that Workers Builds is disconnected — nothing runs
  `wrangler preview` — and is kept because removing it buys nothing.
