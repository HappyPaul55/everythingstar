---
title: Deployment and releases
description: "How a build reaches Cloudflare, why GitHub records the deployment, how the live site is watched, and what a release tag has to agree with."
updated: "2026-10-28"
order: 16
---

The live site is `https://everythingstar.happypaul55.com`. A deploy is static files and
nothing else: **Cloudflare deploys, GitHub records and verifies.**

## What a deploy is

`bun run build` writes `dist/`, and Cloudflare Workers Builds uploads it as static
assets — configured by `wrangler.jsonc` (`name:
client-everythingstar-happypaul55-com`, `assets.directory: ./dist`, **no `main`**). There
is no Worker script, no `/api/*`, no binding and no database in this project. Every
runtime document — a playlist, its songs, charts and audio — is fetched by the browser
from the URL the player gave it (see [Playlist API](playlist-api.md)), which is what lets
a provider live in its own project.

- **The domain.** Production is `everythingstar.happypaul55.com`; branch previews are
  served from `<branch>.everythingstar.happypaul55.com` through that custom domain, so
  `workers_dev` and `preview_urls` are `false` and stay false. The empty `previews: {}`
  block is required by `wrangler preview`, which a branch build runs. Keep
  `astro.config.mjs` (`site`), `src/content/site/settings.json` (`url`) and
  `public/robots.txt` in step if the domain ever changes.
- **The worker is built after Astro.** `bun run build` also runs
  `scripts/build-sw.ts`, which names the build's hashed chunks in the precache list.
  `public/_headers` serves `sw.js` no-cache; without that line a browser keeps an old
  worker.
- **Android App Links** are verified by `/.well-known/assetlinks.json` (see
  [Links into the game](deeplinks.md)), published from `public/.well-known/` with the
  release signing certificate's SHA-256. If the signing key changes — a new release key,
  or Play App Signing re-signing an upload — add the new fingerprint to the same array,
  redeploy, and confirm `https://everythingstar.happypaul55.com/open` opens the app on a
  device. The `everythingstar://` scheme works with any certificate.
- **Rolling back** is Cloudflare's: Workers & Pages → the worker → Deployments →
  Version history → roll back. Then run `gh workflow run deploy.yml` so the record
  matches what is live.

## The record

Workers Builds builds `main` on every push and posts a `Workers Builds:` check run, but
never a GitHub Deployment — so `.github/workflows/deploy.yml` supplies one. The job
declares the `production` environment (which is what creates the entry), waits for
`verify`, `e2e` and the Cloudflare run on that exact SHA
(`scripts/wait-for-deploy.ts`), then smokes the live origin (`scripts/smoke.ts`) and
fails the deployment when the site is not right. It can sit "in progress" for 10–15
minutes; that is the wait, not a hang.

**A burst of merges is the case that shapes it.** Only the newest commit is the head of
`main`, and Cloudflare coalesces the burst into the build that matters, so an older
commit may never get a `Workers Builds:` check at all. Such a run is **recorded, not
verified** — it exits as soon as `main` has moved on, smoke tests without asserting the
build identity, and says which commit owns production now. There is deliberately no
concurrency group: serialising the records would cancel the queued ones, and a merge
with no record is worse than a second job.

**The live site is checked when it is not deploying.**
`.github/workflows/production-check.yml` runs `scripts/smoke.ts` daily and on demand,
then asks `smoke.ts --live` which build is being served and whether that commit is on
`main` (the compare API: `identical` or `behind` is on it; `ahead` or `diverged` is
not). It deliberately does **not** expect the head — a deploy in flight is not a fault —
which is why the question is asked of the commit graph rather than the version string.
A deploy-time check only sees the moment of the deploy; this is what notices a header
edited in the dashboard, an outage, or a build promoted from a branch. It reads the
repository and nothing else, and it gates nothing.

**`main` takes pull requests only**, with `verify` and `e2e` green. A ruleset enforces
it, and a direct push is refused even for the maintainer. A check renamed in `ci.yml`
must be renamed in the ruleset too, or merges block.

## Versions and releases

The version lives in `package.json`, and every build stamps it with the commit it came
from: `v1.0.0+abc1234`. The welcome screen shows it, and it names the service worker's
shell cache, so **the live site can be asked what build it is** — the deploy workflow
reads it out of `/sw.js` and fails when production is not serving the commit that was
just merged. `bun run version` prints it; `astro.config.mjs` and `scripts/build-sw.ts`
both read it from `scripts/version.ts`. Never reintroduce a second `git describe`: a CI
clone has no tags.

A release is a **checkpoint, not a build**:

1. `bun run version:bump patch` (or `minor`, `major`) on a `release/vX.Y.Z` branch.
2. Open a PR titled `chore(release): vX.Y.Z` and merge it.
3. Wait for that commit's **Deploy** run to be green, then tag the merge commit —
   `git tag -a vX.Y.Z -m "EverythingStar vX.Y.Z" <sha>` — and push the tag.

The tag must equal `package.json`'s version and be on `main`;
`.github/workflows/release.yml` refuses anything else and otherwise publishes a GitHub
Release with generated notes. It runs no build and attaches nothing. Tags cannot be
moved or deleted, and a published release is immutable.

## The rules that keep it that way

- **Actions are pinned to commit shas.** Every `uses:` in `.github/workflows/` is a sha
  with the version in a comment (`actions/checkout@<sha> # v5`);
  `sha_pinning_required` refuses an unpinned one at push, and
  `.github/dependabot.yml` keeps the pins current — weekly, with minor and patch bumps
  grouped and a major on its own. The actionlint job lints the workflows from a pinned
  container tag, because an unpinned action to lint the actions would defeat the rule it
  enforces. A new action is added the same way, or the push is refused.
- **`refs/tags/v*` is immutable**, and so is a published release.
- **Do not add a `main`, a Worker script or bindings to `wrangler.jsonc`** for a game
  feature. This repo is the client; a service it needs is a separate project, reached
  through the Playlists feature.
- **Keep this page accurate.** A deployment fact that lives only in a workflow is a
  fact the next maintainer finds by reading YAML.
