---
title: Setting up
description: "Bun, the repository, the dev server and the gate: everything a new contributor needs to run the game and prove a change before opening a pull request."
updated: "2026-10-31"
order: 10
---

Use **[Bun](https://bun.sh)** for everything — `bun` and `bunx`, never `npm` or
`npx`. The version is pinned by `packageManager` in `package.json`, and the lockfile is
`bun.lock`.

```bash
bun install
bun run dev              # http://localhost:4321; the game is /play
```

## The gate

`bun run verify` is the gate a change has to pass, and the local shorthand for every
check CI runs. In order:

```bash
bun run lint             # oxlint
bun run knip             # dead code and unused dependencies
bun run check            # astro check (the app's type gate)
bun run typecheck:tests  # tsc over src/**/*.test.ts
bun test                 # unit tests
bun run build            # static build into dist/, then dist/sw.js
bun run check:pwa        # the manifest, the worker and every game-only page
bun run check:docs       # the built documentation, the sitemap and the offline shell
bun run budget           # dist/, audio and initial-JS size caps
bun run release:assets   # game, arcade and website archives into release/
bun run check:release    # every archive holds its plan, and both formats agree
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

CI (`.github/workflows/ci.yml`) runs the same checks in parallel on every pull request
and on `main`: a `unit` job, one `build` job (which also runs the PWA test against that
build) and three browser shards. The required checks are `verify` and `e2e`; the local
`bun run verify` remains the one-command gate. [Testing](testing.md) says what each gate
is for and what only a browser can prove.
