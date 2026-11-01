---
title: Deployment and releases
description: "How a build reaches Cloudflare, why GitHub records the deployment, how the live site is watched, and what a release tag has to agree with."
updated: "2026-11-01"
order: 16
---

The live site is `https://everythingstar.happypaul55.com`. A deploy is static files and
nothing else: **GitHub Actions builds and uploads, Cloudflare serves, GitHub records and
verifies.**

## What a deploy is

The `deploy` job in `.github/workflows/ci.yml` runs only on a push to `main`, after
`verify` and `e2e` have passed, and downloads the `site-dist` artifact that the same
run packaged. `.github/workflows/deploy.yml` is the manual path: it builds and verifies
the checkout itself, which is the rollback route. `bunx wrangler deploy` uploads that
`dist/` as static assets — configured by `wrangler.jsonc` (`name:
client-everythingstar-happypaul55-com`, `assets.directory: ./dist`, **no `main`**). There
is no Worker script, no `/api/*`, no binding and no database in this project. Every
runtime document — a playlist, its songs, charts and audio — is fetched by the browser
from the URL the player gave it (see [Playlist API](playlist-api.md)), which is what lets
a provider live in its own project.

CI builds once. The `build` job writes the documentation's image tags before the
captures exist; the capture jobs take the screenshots, and the `package` job joins the two
into `site-dist`. The deploy job therefore moves an agreed package rather than
building a second time, and Cloudflare does not rebuild the same commit either.

- **The domain.** Production is `everythingstar.happypaul55.com`, and a push to `main`
  is the only automatic deploy. `workers_dev` and `preview_urls` are `false` and stay
  false, so a deploy never exposes the workers.dev route or a version-preview URL.
  Branch previews went with Workers Builds. Keep `astro.config.mjs` (`site`),
  `src/content/site/settings.json` (`url`) and `public/robots.txt` in step if the
  domain ever changes.
- **The service worker is built after Astro.** `bun run build` also runs
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
  Version history → roll back. The site serves that version until the next push to
  `main` deploys over it. To make the record and the smoke test describe the rollback,
  dispatch the workflow at that build's ref — `gh workflow run deploy.yml --ref vX.Y.Z`;
  a plain `gh workflow run deploy.yml` would build and deploy the head of `main` again.

## The record

The job declares the `production` environment, which is what creates the GitHub
Deployment entry and its live URL. The automatic deploy is the last job in CI: it runs
after `verify` and `e2e`, downloads `site-dist`, and does not run `verify` or rebuild. A
manual dispatch builds and verifies the checkout, then deploys that. The environment is
created on the first run.

Its `if:` starts with **`always()`** on purpose. `verify` needs the
pull-request-only `review` job, which is *skipped* on `main`; a job whose dependency was
skipped does not run on a plain `if:`, so the deploy was silently skipped for a build
that had passed everything. The condition now checks `needs.verify.result` and
`needs.e2e.result` explicitly, which is the gate; `always()` only lets it be evaluated.

When the upload finishes, the job smokes the live origin (`scripts/smoke.ts`) with the
version this checkout produced (`bun scripts/version.ts`) and fails the deployment when
the site is not right. The build-identity check retries while an edge cache catches up;
the other checks are immediate. There is deliberately no concurrency group: a burst of
merges must each deploy, the last one wins, and no merge is left without a record.

**Two facts live in the dashboard, not in this repository.** The workflow reads the
repository secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit) and
`CLOUDFLARE_ACCOUNT_ID`, and Workers Builds must be disconnected in the Cloudflare
dashboard so it does not build and deploy the same commit a second time.

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

`verify` is the aggregate job, and it requires `unit`, `package`, `workflows` and — on
a pull request — `review`. The security and workflow-lint jobs were outside both
required aggregates, so a high-severity dependency or a broken workflow file could fail
and still merge green; the aggregate now says no to that. `review` is a pull-request job
and is legitimately *skipped* on `main`, which the aggregate allows; a failure is never
allowed.

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
`.github/workflows/release.yml` refuses anything else and otherwise **builds that
commit**, runs `bun run release:assets` and publishes a GitHub Release with generated
notes and the six archives attached. It builds because a tag has no other way to get the
artefacts, and the commit is already `main`'s, where `verify` built and checked the same
archives. Tags cannot be moved or deleted, and a published release is immutable.

## The release archives

One build is three views of `dist/`, never three builds. `src/lib/release/bundles.ts` is
the plan — pure, unit-tested — and both the builder (`scripts/release-assets.ts`) and the
gate (`scripts/check-release.ts`) read it.

| Archive | What it is | Carrier |
| --- | --- | --- |
| `game.zip` / `game.tar.gz` | `/embed`, the native app's game-only page, promoted to `index.html` | the game's own files, a manifest, `BUILD.txt` |
| `arcade.zip` / `arcade.tar.gz` | `/arcade`, the attract entry, promoted to `index.html` | the same, for a kiosk or a wall display |
| `website.zip` / `website.tar.gz` | the whole site, `dist/` untouched | everything, including the worker |

Both game archives are **standalone folders**: the game's own directories, a page of
their own at the root, a manifest rewired to `id`/`start_url`/`scope` `/` and a
`BUILD.txt`, and none of the website around it. They are deliberately **served at an
origin's root** — the build addresses everything from `/`, so a subfolder or `file://`
is a page with no JavaScript. They carry **no service worker** on purpose: the site's
worker precaches `app.html`/`play.html` and falls back to `/app.html` offline, so in a
folder that has neither it is a worker that answers 503. The manifest does ship, so the
folder is still installable, and both game entries stay `noindex`: `/play` is the page a
search should land on.

`check:release`'s real question is **reachability** — every root-absolute URL the entry
page names must be in the archive, and every manifest icon with it — because a missing
`_astro` chunk draws a page that never hydrates.

The archive step is deterministic: sorted entries, the commit's timestamp on every file,
`zip -X` and a bare gzip header, so the same `dist/` is the same bytes twice. The
**build** is not byte-reproducible — Astro stamps per-build ids into the pages and the
worker names the moment it was built — so a rebuild of the same commit has the same file
names and byte-identical chunks, not the same page bytes. `release/` is ignored by Git;
the GitHub Release is its home.

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
