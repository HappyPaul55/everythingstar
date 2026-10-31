# Browser tests

The unit suite proves the pure parts; this is the only gate that mounts the island
and drives the screen machine in a real browser. `playwright.config.ts` runs it
against the dev server, `tests/e2e/fixture.ts` answers every external document, and
`bun run test:pwa` is the separate offline run against a production build.

## The documentation captures

`tests/e2e/docs/` holds one spec per documentation screenshot. It imports `test`
from `../support` and carries `annotation: [{ type: "doc", description: "<id>" }]`;
the page names the same id with `[description](shot:<id>)`. Every shot is taken on
**desktop and mobile by default** — the projects of the same names in
`playwright.config.ts` run the suite once per variant — so the guide shows the screen
a player uses and the phone it is checked on; `doc-viewport` is for a variant a screen
genuinely does not support, declared in `docshots.config.ts`'s `shots` map, and
`doc-crop` keeps the foot of a phone frame that is mostly runway.

The specs share their journeys with the behavioural suite: `docs-screens.ts` for the
player pages, `docs-charts.ts` for the duet and lyrics fixture, `note-guide.ts` for
the note-types page, and `helpers.ts` underneath all of them. Coverage is the whole
game rather than the player pages alone — the welcome, menu and options; playlists
and import; Listen and the results; pause and both practice screens; typing and the
duet; the keyboard, gamepad and MIDI controllers; and the charter's picker, editor
and charts.

`bun run test:e2e` runs them with the behavioural suite; `bun run docs:shots` is the
focused capture run. The build writes the image tags first, the shards fill the WebPs,
and the package step copies them into `dist/`. `src/lib/docshots/references.test.ts`
fails when a page and a test disagree, or when a narrowed shot and its config entry do.

## The rule

A browser test earns its place only when **no cheaper gate can see the regression**:
real DOM geometry, the CSS cascade, real event timestamps, real timing, or a browser
API (OPFS, gamepad, MIDI, service worker, media). If a build script, a `bun test` or
another browser test already catches it, it belongs there instead.

So: static HTML and build artifacts go to `scripts/check-pwa.ts` (which already
reads `dist/`) or `scripts/check-docs.ts` (the documentation's built pages, sitemap
and offline shell), a pure rule goes to `src/**/*.test.ts`, and this suite keeps the
things that need a page.

## What is here

| spec | tests | what only a browser can see |
| --- | --- | --- |
| `a11y.spec.ts` | 7 | axe scans of the paper pages (including the docs hub and a doc page) and the game's screens, pause, Practice and results |
| `arcade.spec.ts` | 2 | the attract demo's machine run; the homepage's same-origin, silent iframe window and the frame link a keyboard can follow |
| `band.spec.ts` | 2 | a phone's one-box-a-row band and its missing second row, against the desk's four |
| `brag-card.spec.ts` | 1 | a kept run's card as a Blob image and the SVG the browser really downloads |
| `bundle.spec.ts` | 2 | the **dev** module graph (no translator is fetched while browsing); a lazy dialog is still native |
| `comfort.spec.ts` | 2 | the Screen Wake Lock asked for on a run, released on a pause and re-asked on a resume; a miss reaching `navigator.vibrate` and the pad actuator of the seat holding one |
| `import.spec.ts` | 2 | a copy into OPFS that survives a reload; the directory input's file list |
| `intent.spec.ts` | 4 | `?playlist=` / `?song=` read from the address, confirmed, added, and stripped |
| `jukebox-window.spec.ts` | 1 | a 2,000-song list windowed in the DOM |
| `keyboard.spec.ts` | 1 | a `keydown`'s own timestamp projected onto the song clock; a chord |
| `keys-view.spec.ts` | 2 | the words riding the pitch roll's own translated layer, and a lyrics-only song with no roll |
| `loop.spec.ts` | 8 | the screen machine end to end, the pause's quick panel, the practice loop, Listen, the search field's Escape, jukebox focus, a breakpoint, portrait rails |
| `menu.spec.ts` | 2 | the menu's two branches, Escape as back, both calibration dialogs |
| `midi.spec.ts` | 3 | Web MIDI as an event route, learning a mapping, a refusal that changes nothing |
| `note-style.spec.ts` | 1 | the setting reaching the highway's drawing |
| `pad.spec.ts` | 1 | a gamepad cursor over a stack of dialogs (the browser's poll) |
| `play-frame.spec.ts` | 2 | the header and the stage sharing the first viewport, at two sizes |
| `play-style.spec.ts` | 1 | the CSS layer order, read from computed styles (dev **and** the built preview) |
| `preload.spec.ts` | 2 | the band's Play button waiting for a stem that is still arriving, then starting without the load page; a ready band skipping it |
| `profile.spec.ts` | 1 | a profile file through the input, the confirmation and the reload — and IndexedDB unchanged |
| `seo.spec.ts` | 1 | the head's canonical, Open Graph and JSON-LD wiring |
| `sng.spec.ts` | 1 | one package fetched once for the preview and the band |
| `stage-entrance.spec.ts` | 1 | the room arriving before the highways, in two beats |
| `stage-safe-area.spec.ts` | 1 | safe-area insets keeping the score rail on screen |
| `stem-sync.spec.ts` | 1 | a multitrack song's media-element clocks through misses, a ten-second pause and a resume — with every `currentTime` write timestamped, so the seek storm's burst is visible and no runner load can argue with it |
| `tap.spec.ts` | 1 | two fingers, a real `PointerEvent` timestamp, and a column-sized target |
| `welcome.spec.ts` | 1 | the wordmark renaming at two shapes, the Star held in place, and the name kept until the wordmark is hovered |

`pwa.spec.ts` and `play-style.spec.ts` also run under `playwright.pwa.config.ts`
(`bun run test:pwa`) against a production build: the first installs the worker and
reloads offline, the second proves the built CSS kept its layer order. The dev
behavioural suite is 56 tests in 28 files; the capture projects add one run per shot
per configured variant.

## What moved out, and why

- `shell.spec.ts` → `scripts/check-pwa.ts`. Header and footer on `/play`, absent on
  the action entries, is static HTML. The gate reads `dist/` and now checks it; the
  proof is that removing either from `dist/play.html` fails `bun run check:pwa`.
- `seo.spec.ts`'s game-entries test → `check-pwa.ts`, which already reads every
  built page: no canonical, no `og:url`, no `og:image`, and `noindex, nofollow`.
- `seo.spec.ts`'s sitemap test → deleted. It was skipped in CI (there is no build
  before the browser suite) and `check-pwa.ts` asserts the same list.
- The two welcome tests became one over two viewports; the two calibration tests
  became one round trip. Both were the same code path twice.
- The repeated "Quick Play → pick → band → remove player 2 → Play" is
  `openBand`/`startRun` in `helpers.ts`.
- `bundle.spec.ts`'s dev-graph test stays. A static import walk would be a second
  implementation of a fact the browser reports directly, and the built-graph check
  in `scripts/check-budget.ts` cannot see the dev graph.

## Flakes

CI runs the suite as three shards, one retry per test, and one worker per core but one
(never fewer than two) inside each shard; a local run is one worker and no retries.
**A test that needs its retry is a test to fix** — the retry is a safety net, not a
plan. Timing assertions must watch a signal that lasts (the practice loop's score
**drop**, not a transient zero).

## Running a subset

```bash
bun run test:e2e tests/e2e/loop.spec.ts
bun run test:e2e -g "practise"
CI=1 bun run test:e2e        # the CI shape: 2+ workers, one retry
```
