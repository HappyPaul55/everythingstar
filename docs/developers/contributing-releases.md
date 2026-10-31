---
title: Releases
description: "Why a release is a checkpoint rather than a build, how the version is named, and what the tag and the GitHub release are allowed to contain."
updated: "2026-10-28"
order: 17
---

The version is `package.json`'s and nothing else's. [Deployment and releases](deployment.md)
is the whole deployment picture; this is the press itself. To cut one:

1. On a `release/vX.Y.Z` branch, run `bun run version:bump patch` (or `minor`,
   `major`); it edits `package.json` and prints the rest.
2. Open a PR titled `chore(release): vX.Y.Z` and merge it like any other change —
   `main` takes pull requests only, with `verify` and `e2e` green.
3. Wait for that merge's deployment to be green —
   `gh run list --workflow ci.yml --branch main` — then tag the merge commit
   `vX.Y.Z` and push the tag. The `Release` workflow
   refuses a tag that disagrees with `package.json` or that is not on `main`, and
   otherwise publishes the generated release notes.

Tags cannot be moved or deleted, and a published release is immutable: a mistake is
fixed by the next patch, not by rewriting the old one.
