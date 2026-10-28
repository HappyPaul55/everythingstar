---
title: Commits and pull requests
description: "How a change is written down: the commit and pull request shape, the pinned actions and dependency rule, and how to report a problem without opening a public issue."
updated: "2026-10-28"
order: 12
---

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
- **Docs**: the README, `AGENTS.md` and the documentation in `docs/` are part of the
  product. If behaviour changed, a sentence in one of them is probably wrong now.
  [Writing docs](writing-docs.md) says which page a fact belongs on.

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

## Reporting

- **A bug or a feature request**: use the issue templates. Include the browser and
  OS, the controller (keyboard, gamepad, MIDI, microphone, touch), the song's source
  (the playlist URL, or "built-in"), console errors, and the read-out from `?dev=1`
  where it applies.
- **A security issue**: do not open a public issue. See
  [`SECURITY.md`](https://github.com/HappyPaul55/everythingstar/blob/main/SECURITY.md).
