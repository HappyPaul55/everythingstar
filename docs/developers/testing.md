---
title: Testing
description: "The gates a change has to pass: the unit suite, the browser suite and its rule, the documentation captures, the build gates, and what only a real browser can prove."
updated: "2026-11-01"
order: 13
---

`bun run verify` is the gate, and the one command that runs it locally. CI runs the same
checks in a pipeline: one `build` (which also runs the installed-game test against
that build), a `unit` job, three behavioural browser shards and two capture jobs, then
a `package` job that joins the build to the screenshots the captures took; the required
checks are `verify` and `e2e`. The rule for all of them is the same: a check belongs
where it is cheapest and where it can actually see the regression.

## The commands

```bash
bun install
bun run dev              # dev server on http://localhost:4321
bun run build            # static build into dist/ (captures the docs screenshots first)
bun run build:quick      # the static build with whatever captures are on disk
bun run docs:shots       # capture the documentation's screenshots (Playwright)
bun run docs:bundle      # copy captures from public/ into a built dist/
bun run preview          # serve the built site
bun run check            # astro check — the app's type gate
bun run lint             # oxlint — the lint gate
bun run typecheck:tests  # tsc over src/**/*.test.ts (tsconfig.test.json)
bun test                 # unit tests (bun test)
bun run test:e2e         # browser tests (Playwright, starts the dev server)
bun run test:pwa         # installs the worker against a build, then reloads offline
bun run knip             # dead-code check (knip)
bun run budget           # dist/, audio and initial-JS size caps
bun run check:pwa        # manifest and worker gate (scripts/check-pwa.ts)
bun run check:docs       # the built documentation, the sitemap and the offline shell
bun run release:assets   # game, arcade and website archives into release/
bun run check:release    # every archive holds its plan, and both formats agree
bun run verify           # the gate in one command (CI splits it into parallel jobs)
bun run version          # the build's version: v<package.json>+<7-char sha>
bun run version:bump     # bump package.json and print the release steps
bun run import           # a folder of charts into the three documents
bun run playlist:check   # hold a playlist URL to the game's own reader
bun run icons            # regenerate public/icons from brand-mark.svg
bun run fonts            # re-download the self-hosted fonts
bun run cards            # render the social cards from og-card.html
```

Verify every change with `bun run verify`: lint, knip, `astro check`, the tests'
typecheck, the unit tests, the build, the PWA gate, the docs gate, the size budget and the
release archives, in that order. CI splits the same checks into a fast `unit` job, one
`build` job (plus the installed-game test), three behavioural browser shards and two
capture jobs, then a `package` job. The build runs first with the documentation's
`<img>` tags but no images; the captures fill the images,
`docs:bundle` puts them into `dist/`, and the package runs `check:docs` and the PWA
test against that same build. The local command remains one sequence, so a checkout
needs nothing more than Bun and Chromium.

Every script that calls Astro says `bun --bun astro …`: without `--bun` Bun hands the
bin to the machine's Node through its shebang, and Astro then refuses to run on a Node
below its own floor. Lint is **oxlint**: one fast binary, one small rules file, and no
formatter — this repo's formatting is left as it is. The gates are configured in
`.oxlintrc.json`, `knip.jsonc` and `tsconfig.test.json`; `tsconfig.json` leaves tests
out of `astro check`, and the test config includes them with the runner's types.

## What the build gates read

- **`check:pwa`** — the manifest, the built worker's precache (including its total
  against the 20 MiB install budget), the game-only entries and `_headers`, and the
  sitemap against the pages that say they are indexable.
- **`check:docs`** — a built page per Markdown file in `docs/`, each with the site shell
  and a canonical, in the sitemap, shipping no island and absent from the offline
  shell; every screenshot the page names present in `dist/`; plus the privacy, terms
  and accessibility notices, which the installed game must still carry.
- **`budget`** — `dist/_astro` JavaScript, the **initial `/play` graph** raw and
  gzipped, `dist/` as a whole and `public/audio`, and a walk of the initial graph that
  fails if a source-translator marker has leaked into it.
- **`release:assets` + `check:release`** — one `dist/` into the `game`, `arcade` and
  `website` archives (zip and tar.gz) and back again: each archive holds its plan, both
  formats agree, and every root-absolute URL its entry page names is inside it. See
  [Deployment and releases](deployment.md#the-release-archives).

The budget was measured on 2026-11-01: 709 KiB of `_astro` JS, an initial graph of
578 KiB raw / 186 KiB gzipped across 22 files, 17.8 MiB in `dist/` and 8.8 MiB of
audio. The caps sit just above those numbers — 710 KiB, 580 KiB, 190 KiB, 20 MiB,
10 MiB. The **whole-build cap is the one that keeps moving**, raised when the
documentation landed and again for its pictures: the [note-types page](../charters/note-types.md)
in charters, then the screens across the loop, the players and the charter, each
captured on desktop and mobile. A prose page and a screenshot are upload and
first-visit weight but not code. The raw cap moved by 6 KiB for **slides**, whose
model, judging, ribbon and document reader are all part of the first download because
a chart and a highway are the game. The **initial graph is the number to watch**: the
next feature-sized byte belongs behind a lazy boundary, not in a bigger cap.

## Browser tests

`bun run test:e2e` drives the real island in headless Chromium through Playwright
(`playwright.config.ts`, specs in `tests/e2e/`), starting `bun run dev` itself. The
`desktop` and `mobile` projects are the documentation captures, so the same run both
validates the app and writes the images the build names. It is not part of `bun test`:
the unit suite is `*.test.ts` under `src/`, and `bunfig.toml` keeps `tests/e2e/**` out
of Bun's discovery. Locally the suite runs on one worker. In CI it is split into three
shards, and each shard uses every core but one, never fewer than two, with a single
retry per test. A red shard is a red `e2e` check: the aggregate job exists so the
ruleset still has one check to require when the shard count changes.

[`tests/e2e/README.md`](https://github.com/HappyPaul55/everythingstar/blob/main/tests/e2e/README.md)
carries the suite's rule and inventory: **a browser test is kept only when no cheaper
gate can see the regression** — real DOM geometry, the CSS cascade, a real event
timestamp, a real browser API. Static HTML and build artifacts belong to
`check:pwa`/`check:docs`; a pure rule belongs to `bun test`.

The tests are hermetic. `tests/e2e/fixture.ts` answers the seeded FOSS playlist, its
song document and its chart with a tiny four-second fixture by routing the URLs the
game already asks for; every other external request is aborted and recorded. The
suite's `test` (`tests/e2e/base.ts`) checks that record after **every** test as an
automatic fixture, so a spec that forgets to keep the returned list still fails on an
unexpected host — five specs used to abort one silently and pass. Use
`context.route` (not an app hook) for any new network dependency, and keep each test on
a fresh context so it starts at the welcome. The test browser refuses native
fullscreen, so Escape reaches the game rather than the browser's own way out.

## Documentation captures

A documentation screenshot is a Playwright test in `tests/e2e/docs` with
`annotation: [{ type: "doc", description: "<id>" }]`, and the page names the same id
with `[description](shot:<id>)`. The `desktop` and `mobile` projects in
`playwright.config.ts` run every capture test once per variant and write one WebP per
project, `<id>-<variant>.webp`, into `public/docs/test-output/`, which is ignored by
Git. `bun run docs:shots` is the focused form: it clears the images and runs only those
two projects. `bun run build` runs it before Astro for a local full build.

The **README** cannot use the `shot:` rewrite — GitHub does not run it — so its images
link the deployed copies at
`https://everythingstar.happypaul55.com/docs/test-output/<id>-<variant>.webp`.
`src/lib/docs/readme.test.ts` holds that to the same shots the specs declare, and
refuses a link back into the old committed `docs/screenshots/` folder.

CI splits the two halves. The **build** runs first and writes the `<img>` tags for the
variants `docshots.config.ts` promises, even before a WebP exists. The e2e shards then
take the pictures; `bun run docs:bundle` copies them into `dist/`, and `check:docs`
fails if a page names an image that is not there. A `phone-pads`-style exception is
declared in `docshots.config.ts` and checked against the test annotation by
`references.test.ts`.

The capture is taken in `afterEach` only when the test passed, with animations
disabled, the caret hidden, fonts settled and the project's own device scale, so a
failed assertion writes nothing. `src/lib/docshots/references.test.ts` holds the two
halves together: every `shot:` has a `doc` annotation, every annotated test is shown by
a page, and a narrowed shot is declared. The mock is the published FOSS library:
`bun run docs:library` refreshes `tests/e2e/docs-library/` from it, and every other run
is offline. [Writing docs](writing-docs.md#screenshots) is the authoring rule: which
variants a shot is captured in, how a frame is narrowed, and how a test drives its
screen.

## The cost of a frame

A change that touches the stage's drawing is measured on the same fixture rather
than argued about: four guitar panels on the docs library, eight seconds after the
entrance, with Chrome DevTools' CPU throttled 4x (`Emulation.setCPUThrottlingRate`
on a CDP session). The run records `TaskDuration`, `ScriptDuration`, `LayoutCount`,
`RecalcStyleCount`, `JSHeapUsedSize` and rAF deltas. Headless Chromium caps rAF at
about 15 fps, so **frame rate is not the number to compare**; CPU time and layout
and style counts are.

The note-view pass moved the same eight seconds from **6.1 s to 4.2–5.3 s of
script**, **95 to 34–43 layouts** and frame p50 from 150 ms to 84–117 ms across
three post-change runs; the heap moved within noise. Re-run it before and after a drawing change; a change that is not visible in
these numbers is not worth the rewrite. The harness is a throwaway Playwright spec
(the fixture and the CDP session are the whole of it); its numbers go in the commit
that changes the drawing.

## The front load is 20 MB

The game may warm and precache **up to 20 MB** before the welcome admits the player,
and an installed game may keep up to 20 MB offline. A startup load is expected; a
stall after it is not. Spend the budget on one deliberate preload rather than a lazy
fetch on a press that then stutters — and do not add work to a frame that is already
moving. The backdrop and the one-shot cues are front-loaded; the song's own stems are
still fetched per song and behind the band's Play gate.

## The installed game's update

`test:pwa` proves a **first** install: the worker takes the page, the shell cache holds
the pages and cues, and a reload with no network still draws the welcome. The
generation after that is `src/lib/pwa/worker.test.ts`: a new build precaches into its
own shell cache, the previous generation stays for the page still running, a third
build lets the oldest go, and a navigation is served the new build's page. What that
does not cover is the real browser wiring between two `dist/` trees (`skipWaiting`,
`clients.claim` and the registration's own update check), which needs a second build
served in one test; the module's contract is what a regression would break, and it is
pinned.

## The documentation gate

The documentation's source rules run in `bun test` (`src/lib/docs/content.test.ts`):
frontmatter, a unique slot per section, every relative link and image, and no page
outside a section. The built side is `check:docs`. Between them, a broken link is
caught before a reader finds it. [Writing docs](writing-docs.md) is the system.
