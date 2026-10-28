# Contributing to EverythingStar

EverythingStar is a browser rhythm game with **three ways to play** — Instruments,
Typing and Vocals — and all three are built. The honest state of each is in the
[README](README.md#status-what-is-built-and-where-it-stops). It is a small AGPL
project with one maintainer, so the most useful contributions are focused ones — a
chart format read correctly, a playlist provider that works, an accessibility bug
fixed, a rule made testable.

Before a structural change, read [`AGENTS.md`](AGENTS.md). It is the deep map: why
each seam is where it is, and the vocabulary this codebase keeps to.

## What is welcome

- **A new chart source.** A format the game cannot read yet — another karaoke or
  rhythm-game format, a lyric sheet, a container. The readers are pure, and the
  real chart library is the test.
- **A playlist provider.** A library or an on-demand search service. It lives in its
  own project; [`PLAYLIST-API.md`](PLAYLIST-API.md) is the contract to build it
  against.
- **Accessibility.** Focus order, screen-reader announcements, reduced motion,
  contrast, touch targets. These are product requirements here, not polish.
- **Engine and stage work.** Lanes, typing, singing, the mixer, the jukebox.
- **Documentation.** If a sentence in `README.md`, `AUDIO.md` or `PLAYLIST-API.md`
  has drifted from the code, that is a bug.

## What is out of scope

- **A server, an API, or a Worker.** This repository is static files only:
  `wrangler.jsonc` has no `main`, `run_worker_first` or bindings, and that is
  deliberate. Anything the game needs at runtime is fetched by the browser from a
  URL the player gave it. A provider is a **separate project**, reached through the
  Playlists feature — not a route here.
- **Accounts, analytics, trackers, cookies.** The game is local: the band, the
  settings and the scores stay in the player's browser.
- **A new runtime dependency** without a reason that survives review. The first
  download is measured, and `scripts/check-budget.ts` fails when it grows past its
  cap.
- **Songs and audio.** Nothing here ships a song. The built-in library is the
  separate [EverythingStar FOSS](https://github.com/HappyPaul55/everythingstar-foss)
  playlist, and `src/lib/game/mock/` is a **fixture generator** the tests read back —
  no product module imports it for behaviour.

## Setting up

Use **[Bun](https://bun.sh)** for everything — `bun` and `bunx`, never `npm` or
`npx`. The version is pinned by `packageManager` in `package.json`, and the lockfile
is `bun.lock`.

```bash
bun install
bun run dev              # http://localhost:4321; the game is /play
```

### The gate

`bun run verify` is what CI runs, and what a change has to pass:

```bash
bun run lint             # oxlint
bun run knip             # dead code and unused dependencies
bun run check            # astro check (the app's type gate)
bun run typecheck:tests  # tsc over src/**/*.test.ts
bun test                 # unit tests
bun run build            # static build into dist/
bun run budget           # dist/ and public/audio size caps, and the lazy split
```

Run the whole thing before opening a pull request. The browser tests are separate,
because they need Chromium:

```bash
bunx playwright install --with-deps chromium
bun run test:e2e         # starts its own dev server
```

Two other scripts are useful but not part of the gate:

```bash
bun run import --from <charts> --to <library>   # a folder of charts into the three documents
bun run icons / bun run fonts                   # regenerate the icon set / self-hosted fonts
```

CI (`.github/workflows/ci.yml`) runs `verify` and the Playwright suite on every pull
request, and on `main`.

## House rules

1. **Pure logic lives in `src/lib/game/**`, with a colocated `*.test.ts`.** The
   screen machine, the judging, the geometry, the cache policy, the settings and the
   source readers are all pure functions. If a rule can be a function over data, it
   should be — that is how it gets tested without a browser.
2. **Components render; they do not decide.** A screen is handed a screen. The rule
   that says where an event leads is in `src/lib/game/screens.ts`; the geometry a
   panel is drawn at is in `src/lib/game/band/layout.ts`. Do not re-derive either in
   JSX.
3. **The vocabulary is exact:** *player, panel, highway, column, part, role, chart,
   seat, controller, layout*. A **player** is someone on stage; a **seat** is their
   place in the band; a **panel** is their 1:1 area; a **highway** is the scrolling
   note area; a **column** is one lane of it; a **part** is a melodic line; a
   **role** is what a melody player does with one; a **chart** is one instrument at
   one difficulty; a **controller** is what a player holds; a **layout** is what its
   controls mean. "Lane" is not a synonym for any of these.
4. **All copy goes through `t()` or `localePath()`.** English ships alone today, but
   a hard-coded string is a future refactor, not a shortcut. The dictionary is
   `src/i18n/ui/en.ts`.
5. **Accessibility is a constraint.** Focus rings, reduced motion, 44px targets, a
   skip link, native `<dialog>`s for overlays, and one focus cursor shared by the
   keyboard, the screen reader and a gamepad. A change that regresses one of these
   will be sent back.
6. **Formatting is left alone.** There is no formatter and no format check: match the
   file you are editing. Lint is oxlint with a small rule set in `.oxlintrc.json`;
   do not add rules to silence a finding.
7. **One place fetches a document.** `src/components/game/library/store.ts` is the
   only module that fetches a playlist, song, chart or package, and the only one that
   touches IndexedDB. It enforces `src/lib/game/url.ts` (an absolute `http(s)` URL with
   a host) and the body ceilings. The mixer reads the files its own manifest names;
   that is the only other `fetch`. Do not add a third path, and do not call `fetch`
   from a component.
8. **One frame loop, one transform per highway.** The stage is driven by `StageClock`;
   components that follow the playhead write to the DOM themselves. Do not add a
   `requestAnimationFrame` loop per component, and do not put the playhead in React
   state.
9. **Three kinds of local state, kept apart.** The **band** (per seat), the **board**
   (per song) and the **settings** (this browser). A setting is a behaviour, never a
   piece of the game.
10. **No build-time secrets, no environment variables.** There is nothing to
    configure: the deploy is static assets and every runtime URL comes from the player.

## Adding a chart source

The translators all hand back one shape, `ParsedSource` (`src/lib/game/sources/types.ts`),
and nothing downstream knows a format:

1. Add `src/lib/game/sources/<format>.ts` with a pure reader that returns the shared
   shape: meta, audio, lanes, melody, sections, problems.
2. Add its format to `SourceFormat` and the sniffing in `sources/detect.ts` — the
   bytes decide, not the file name.
3. Add a `case` to `parseSource` in `sources/parse.ts`. That function stays
   synchronous and pure.
4. Hold the result to `chartProblems` in a test, and add a fixture beside the readers'
   existing tests. Include the awkward case: a truncated file, a wrong encoding, a
   section that does not exist.

`write.ts` already turns a `ParsedSource` into the three documents, so the importer
and the runtime both get the new format for free. The browser reads these readers
lazily, so a new one belongs behind `parse.ts` and nothing else.

## Adding a screen

A screen is session state, not a route — no hash, no history entry.

1. `src/lib/game/screens.ts`: add it to `Screen` and `SCREENS`, give it its
   transitions in `TRANSITIONS`, and say what `backEventFor`, `onStage` and
   `wantsCharts` mean for it. Add the unit test.
2. `src/components/game/screens/ScreenHost.tsx`: one entry in `PAGES` — or in
   `STAGE_OVERLAYS` for a countdown or a pause. That is the whole registry.
3. The screen reads what it needs from context and takes callbacks for the rest.
   `ScreenFocus` puts focus on its starting control; `backEventFor` is the only rule
   behind Escape and a pad's B.

## Commits and pull requests

History uses conventional-ish prefixes with a scope, in the imperative and lower
case, and commits are small and single-purpose:

```
fix(audio): keep stems in phase on start and resume
feat(stage): put a lone player's rails above the highway on a portrait phone
refactor(jukebox): extract the list window hook
docs: bring the handover in step with the quality pass
```

Branch from `main` and name the branch for the work (`fix/...`, `feat/...`,
`docs/...`). A pull request should say:

- **What changed**, and why the change is the right shape.
- **How it was checked**: the `bun run verify` result, and `bun run test:e2e` when the
  stage or a screen changed. Paste the failing line, not a screenshot of a terminal.
- **A screenshot** for anything visible, at a phone width as well as a desktop one.
  Say what it shows.
- **The accessibility note**: keyboard path, focus, reduced motion.
- **Docs**: `README.md` and `AGENTS.md` are part of the product. If behaviour changed,
  one of them usually has a sentence that is now wrong.

The pull request template asks for these; keep it short enough to answer honestly.
Do not commit generated output (`dist/`, `.astro/`, `test-results/`) or anything under
`node_modules/`.

## Dependencies and actions

`.github/dependabot.yml` keeps both current, once a week. `bun` updates arrive as one
grouped pull request for minor and patch bumps, and a major on its own — an Astro or
React major is read before it is merged, not swept in with five others. Action updates
are grouped the same way.

An action is pinned to a commit sha with its version beside it in a comment
(`actions/checkout@<sha> # v5`), and the repository requires that pinning: an unpinned
action is refused at push. A new action is added the same way — resolve the tag to its
sha, put the version in the comment — and Dependabot keeps it current from there.

## Releases

The version is `package.json`'s and nothing else's. To cut one:

1. On a `release/vX.Y.Z` branch, run `bun run version:bump patch` (or `minor`,
   `major`); it edits `package.json` and prints the rest.
2. Open a PR titled `chore(release): vX.Y.Z` and merge it like any other change —
   `main` takes pull requests only, with `verify` and `e2e` green.
3. Wait for that merge's deployment to be green — `gh run list --workflow deploy.yml`
   — then tag the merge commit `vX.Y.Z` and push the tag. The `Release` workflow
   refuses a tag that disagrees with `package.json` or that is not on `main`, and
   otherwise publishes the generated release notes.

Tags cannot be moved or deleted, and a published release is immutable: a mistake is
fixed by the next patch, not by rewriting the old one.

## Reporting

- **A bug or a feature request**: use the issue templates. Include the browser and
  OS, the controller (keyboard, gamepad, MIDI, microphone, touch), the song's source
  (the playlist URL, or "built-in"), console errors, and the read-out from `?dev=1`
  where it applies.
- **A security issue**: do not open a public issue. See
  [`SECURITY.md`](SECURITY.md).

## Licence

EverythingStar is **AGPL-3.0** (see [`LICENSE`](LICENSE)). By contributing you agree
that your work is licensed under the same terms. Only contribute charts, audio or
art you have the right to redistribute.
