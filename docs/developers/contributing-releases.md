---
title: Releases
description: "Why a release is a checkpoint rather than a build, how the version is named, and what the tag and the GitHub release are allowed to contain."
updated: "2026-11-03"
order: 17
---

The version is `package.json`'s and nothing else's. [Deployment and releases](deployment.md)
is the whole deployment picture; this is the press itself. To cut one:

1. On a `release/vX.Y.Z` branch, run `bun run version:bump patch` (or `minor`,
   `major`); it edits `package.json` and prints the rest.
2. Open a PR titled `chore(release): vX.Y.Z` and merge it like any other change —
   `main` takes pull requests only, with `verify` and `e2e` green.
3. That is the release. When the merge's CI run on `main` succeeds, the Release
   workflow tags the commit and publishes; the tag is created after the artifacts are
   built and checked, so a failed build leaves no tag and a later run can retry.

The workflow reads `package.json`'s version and releases it when `vX.Y.Z` has no
release yet, so a merge that does not change the version does nothing. A `v*` tag
pushed by hand still publishes if it agrees with `package.json` and is on `main`; it is
the backfill route, not the normal one. Tags cannot be moved or deleted, and a
published release is immutable: a mistake is fixed by the next patch, not by rewriting
the old one.
