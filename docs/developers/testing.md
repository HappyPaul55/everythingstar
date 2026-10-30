---
title: Testing
description: "The gates a change has to pass: the unit suite, the browser suite and its rule, the documentation captures, the build gates, and what only a real browser can prove."
updated: "2026-10-30"
order: 13
---

`bun run verify` is the gate CI runs. It builds the documentation's screenshots with a
real browser on the way (see [Documentation captures](#documentation-captures)), but the
**browser suite** is still the one thing it does not run. The rule for all of them is the
same: a check belongs where it is cheapest and where it can actually see the regression.

## The commands

```bash
bun install
bun run dev              # dev server on http://localhost:4321
bun run build            # static build into dist/ (captures the docs screenshots first)
bun run docs:shots       # capture the documentation's screenshots (Playwright)
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
bun run verify           # all of the above that CI runs, in order
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
release archives, in that order. CI runs the same command.

Every script that calls Astro says `bun --bun astro …`: without `--bun` Bun hands the
bin to the machine's Node through its shebang, and Astro then refuses to run on a Node
below its own floor. Lint is **oxlint**: one fast binary, one small rules file, and no
formatter — this repo's formatting is left as it is. The gates are configured in
`.oxlintrc.json`, `knip.jsonc` and `tsconfig.test.json`; `tsconfig.json` leaves tests
out of `astro check`, and the test config includes them with the runner's types.

## What the build gates read

- **`check:pwa`** — the manifest, the built worker's precache, the game-only entries and
  `_headers`, and the sitemap against the pages that say they are indexable.
- **`check:docs`** — a built page per Markdown file in `docs/`, each with the site shell
  and a canonical, in the sitemap, shipping no island and absent from the offline
  shell; plus the privacy notice, which the installed game must still carry.
- **`budget`** — `dist/_astro` JavaScript, the **initial `/play` graph** raw and
  gzipped, `dist/` as a whole and `public/audio`, and a walk of the initial graph that
  fails if a source-translator marker has leaked into it.
- **`release:assets` + `check:release`** — one `dist/` into the `game`, `arcade` and
  `website` archives (zip and tar.gz) and back again: each archive holds its plan, both
  formats agree, and every root-absolute URL its entry page names is inside it. See
  [Deployment and releases](deployment.md#the-release-archives).

The budget was measured on 2026-10-28: 644 KiB of `_astro` JS, an initial graph of
560 KiB raw / 182 KiB gzipped, 11.2 MiB in `dist/` before the docs and 8.8 MiB of
audio; the docs added ~3 MiB of pages, each carrying the inlined site CSS. The caps sit
just above those numbers — 650 KiB, 566 KiB, 190 KiB, 18 MiB, 10 MiB — and the lower
whole-build cap was raised when the documentation landed, then again for the
note-types page's twenty-four captures (twelve examples on desktop and mobile),
because a prose page is upload and first-visit weight but not code. The **initial graph
is the number to watch**: the next feature-sized byte belongs behind a lazy boundary,
not in a bigger cap.

## Browser tests

`bun run test:e2e` drives the real island in headless Chromium through Playwright
(`playwright.config.ts`, specs in `tests/e2e/`), starting `bun run dev` itself. It is
not part of `bun test`: the unit suite is `*.test.ts` under `src/`, and `bunfig.toml`
keeps `tests/e2e/**` out of Bun's discovery. Locally the suite runs on one worker; in
CI it uses every core but one, never fewer than two, with a single retry per test.

[`tests/e2e/README.md`](https://github.com/HappyPaul55/everythingstar/blob/main/tests/e2e/README.md)
carries the suite's rule and inventory: **a browser test is kept only when no cheaper
gate can see the regression** — real DOM geometry, the CSS cascade, a real event
timestamp, a real browser API. Static HTML and build artifacts belong to
`check:pwa`/`check:docs`; a pure rule belongs to `bun test`.

The tests are hermetic. `tests/e2e/fixture.ts` answers the seeded FOSS playlist, its
song document and its chart with a tiny four-second fixture by routing the URLs the
game already asks for; every other external request is aborted and recorded. Use
`context.route` (not an app hook) for any new network dependency, and keep each test on
a fresh context so it starts at the welcome. The test browser refuses native
fullscreen, so Escape reaches the game rather than the browser's own way out.

## Documentation captures

A documentation screenshot is a Playwright test in a Markdown fence, so the picture is
always of a screen that passes its assertions. `bun run docs:shots` reads every fence,
writes a generated spec per capture, runs it once per variant in `docshots.config.ts`
(desktop, mobile) and writes `.docshots/manifest.json` plus the WebP files in
`docs/screenshots/` — both ignored by Git. **`bun run build` runs it first**, which is
why the gate now needs Chromium installed.

The capture is taken in `afterEach` only when the test passed, with animations disabled,
the caret hidden, fonts settled and CSS-pixel scale, so a failed assertion writes
nothing. A fence may narrow itself with `viewports=desktop`. `--only <doc>` is the
authoring loop; `src/lib/docshots/*.test.ts` covers the fence parser and the manifest
without a browser. The mock is the published FOSS library: `bun run docs:library`
refreshes `tests/e2e/docs-library/` from it, and every other run is offline.
[Writing docs](writing-docs.md#screenshots) is the authoring rule.

## The documentation gate

The documentation's source rules run in `bun test` (`src/lib/docs/content.test.ts`):
frontmatter, a unique slot per section, every relative link and image, and no page
outside a section. The built side is `check:docs`. Between them, a broken link is
caught before a reader finds it. [Writing docs](writing-docs.md) is the system.
