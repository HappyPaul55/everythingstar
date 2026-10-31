# AGENTS.md

The short map for anybody — human or agent — changing EverythingStar. The depth lives
in **[`docs/`](docs/README.md)**, written once for GitHub and for the site; this file is
the orientation and the rules that are easiest to break.

## What this repo is

A standalone **game site** for **EverythingStar**
(`everythingstar.happypaul55.com`), built as one self-contained repository — no
monorepo, no shared template, no workspace. It is a **browser rhythm game** with **three
ways to play on one stage**: **Instruments** (guitar, bass, keys, drums), **Typing** (the
words on a keyboard) and **Vocals** (karaoke into a microphone). The marketing pages are
plain Astro; `/play` is a React island holding the stage inside the loop around a run.

**Static files only.** `wrangler.jsonc` uploads `dist/` as Cloudflare static assets — no
`main`, no Worker script, no API. A playlist and its documents live in other projects and
are fetched by the browser from a URL the player gave it.

## Read the right page before you change anything

| For | Read |
| --- | --- |
| the loop, the stage, the seams | [Architecture](docs/developers/architecture.md) |
| every module and what it owns | [Project map](docs/developers/project-map.md) |
| the rules that have already been broken once | [Gotchas](docs/developers/gotchas.md) |
| the cache, folders, downloads and local records | [Libraries and local records](docs/developers/library.md) |
| what is built and what is out of scope | [Status](docs/developers/status.md) |
| the words the code keeps to | [Vocabulary](docs/developers/gotchas.md) (first entry) |
| running it, the gates | [Setting up](docs/developers/contributing-setup.md) |
| the gates and what only a browser can prove | [Testing](docs/developers/testing.md) |
| a screen, a chart source, a convention | [House rules](docs/developers/contributing-code.md) |
| the audio contract | [Audio](docs/developers/audio.md) |
| the provider contract | [Playlist API](docs/developers/playlist-api.md) |
| links into the game | [Links](docs/developers/deeplinks.md) |
| a provider's documents | [Libraries](docs/charters/libraries.md) |
| a chart, a take, an export | [Charter](docs/developers/charter.md) |
| making a chart, as a player | [Making a chart](docs/charters/editing-a-chart.md) |
| a note, a chord, a sustain | [Note types](docs/charters/note-types.md) |

## The vocabulary is exact

**player, panel, highway, column, part, role, chart, seat, controller, layout.** "Lane"
used to mean two things and the confusion showed up in every conversation about the
stage, so it is gone. A **player** is someone on stage; a **seat** is their one place in
the band (`Player.seat`), so "Player 3" means the same person on the band screen, on the
stage, in the plan and in the results; a **panel** is their 1:1 area; a **highway** is
the scrolling note area inside it; a **column** is one vertical lane of that highway; a
**part** is a melodic line in the track; a **role** is what a melody player does with a
part (`sing` or `type`); a **chart** is one instrument at one difficulty; a
**controller** is what a player holds (their own keys, a gamepad, a MIDI kit, the
microphone, or the machine); a **layout** is what that controller's controls mean.

## The rules

- **`bun run verify` is the gate.** Lint, knip, `astro check`, the tests' typecheck, the
  unit tests, the build, the PWA and docs checks, the budget — in that order. CI runs
  one `build`, a `unit` job and four browser shards, then a `package` job that joins
  the build to the screenshots the shards took; `verify` and `e2e` are the required
  checks. `bun run test:e2e` is the browser suite. Use **Bun**, never npm/npx.
- **Pure logic lives in `src/lib/game/**` with a colocated `*.test.ts`.** Components
  render; they do not decide. A rule that needs testing goes in a module, not in JSX.
- **The screen is session state, not a route.** One island, one screen at a time, no
  hash, no history; a reload starts at the welcome. `src/lib/game/screens.ts` is the only
  place that says where an event leads.
- **One clock, no per-component frame loops.** Everything timed reads `StageClock`;
  components subscribe and write to the DOM. Never put the playhead in React state.
- **Judging is per player, and nothing reads another player's state.** Feedback (sound,
  haptics, the part ducking out) is read from a run's published numbers and is never fed
  back into judging.
- **The first download is a budget.** Parsers and rarely opened dialogs are
  `React.lazy`/`import()`; `scripts/check-budget.ts` fails when the initial `/play`
  graph or `dist/` grows past its cap. Do not lazy-load a main screen.
- **No server, no API, no accounts, no analytics, no cookies.** If a feature needs an
  API it is a different project, reached through Playlists.
- **Everything fetched is untrusted.** `src/lib/game/url.ts` is the URL policy (absolute
  http(s), no credentials); documents are capped at 8 MB and packages at 128 MB;
  `chartProblems` validates a chart before it reaches the stage.
- **The site's own pages are plain Astro with no island** — the only scripts are the
  inline worker registration and install-prompt listener. Reach for React only where
  interactivity genuinely needs it: `/play` and the game-only entries.
- **Accessibility is a constraint.** Focus rings, reduced motion, the skip link, 44 px
  targets, native dialogs and a pad that drives real focus. Do not regress them.
- **The documentation is part of the change.** A rule that changes is a doc page that
  changes; [Writing docs](docs/developers/writing-docs.md) is the system. A screenshot
  is a Playwright test in `tests/e2e/docs` and a `[description](shot:<id>)` reference
  in the page; the e2e shards make the images, `bun run docs:bundle` puts them in the
  build, and neither they nor `.docshots/` are committed.

## Commands

```bash
bun install
bun run dev              # http://localhost:4321; the game is /play
bun run check            # astro check (the app's type gate)
bun run test             # unit tests
bun run test:e2e         # Playwright, starts the dev server
bun run build            # captures the docs screenshots, then builds into dist/ and dist/sw.js
bun run build:quick      # the static build with whatever captures are on disk
bun run docs:shots       # capture the documentation's screenshots (Playwright)
bun run docs:bundle      # copy captures into a built dist/ before check:docs
bun run docs:library     # refresh the capture fixture from the published FOSS library
bun run verify           # the gate in one command (CI splits it into parallel jobs)
bun run version          # v<package.json>+<sha>
bun run import --from <dir> --to <dir>     # a folder of charts into a library
bun run playlist:check <url>               # a playlist against the game's own reader
bun run check:docs       # the built docs pages, the sitemap and the offline shell
bun run release:assets   # game, arcade and website archives into release/
bun run check:release    # every archive holds its plan, and both formats agree
```

## Deployment

Cloudflare static assets, built and uploaded by GitHub Actions after CI succeeds on
`main` (`site-dist` → `bunx wrangler deploy`), configured by `wrangler.jsonc`; `dist/`
and nothing else. GitHub records the automatic deployment in
`.github/workflows/ci.yml` (the manual `deploy.yml` is the rollback path), watches
the live site daily (`production-check.yml`), and refuses a release tag that disagrees
with `package.json` or is not on `main` — a tag builds that commit and attaches the six
archives (`game`, `arcade` and `website`, each zip and tar.gz) to the GitHub Release.
`main` is PR-only, actions are pinned to commit shas, and the full contract is
[Deployment and releases](docs/developers/deployment.md).

## Working notes

- **The documentation is the source of truth**, and it is in `docs/` as Markdown with
  frontmatter. Update it in the same change as the code; `bun run verify` proves the
  links and the built pages. Keep `README.md` a landing page and this file a map — the
  detail belongs in `docs/developers/`.
- **Do not add generated content to `docs/`**, and do not copy a page between GitHub and
  the site: there is one file.
- **A change that touches a rule in `docs/developers/gotchas.md`** updates that entry.
  The file is long on purpose: each rule was learned the hard way.
- **Never commit `dist/`, `.astro/`, `test-results/` or `.wrangler/`.** The build output
  is disposable; the source is not.
