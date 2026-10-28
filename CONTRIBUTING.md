# Contributing to EverythingStar

EverythingStar is a small AGPL project with one maintainer, so the most useful
contributions are focused ones — a chart format read correctly, a playlist provider, an
accessibility bug fixed, a rule made testable.

**The guide lives in the documentation**, so the commands, the conventions and the
reasons are written once:

- **[Contributing](docs/developers/contributing.md)** — what is welcome and what is out
  of scope.
- **[Setting up](docs/developers/contributing-setup.md)** — Bun, the dev server and the
  gate.
- **[House rules](docs/developers/contributing-code.md)** — pure engines, screens and
  the recipes for a new chart source or a new screen.
- **[Commits and pull requests](docs/developers/contributing-pulls.md)** — the shape of
  a change, dependencies and reporting.
- **[Releases](docs/developers/contributing-releases.md)** — a checkpoint, not a build.
- **[Testing](docs/developers/testing.md)** — the gates and what only a browser proves.

Read [Architecture](docs/developers/architecture.md) and
[Gotchas](docs/developers/gotchas.md) before a structural change. They are the map and
the rules that are easy to break.

```bash
bun install
bun run dev       # http://localhost:4321 — the game is /play
bun run verify    # what CI runs
```

Contributions use **Bun**, keep the documentation in step with the code, and pass
`bun run verify` before a pull request. `main` is PR-only: the checks `verify` and `e2e`
must pass and conversations must be resolved.

**Do not open a public issue for a vulnerability.** [SECURITY.md](SECURITY.md) says how
to report one privately.

The code is [AGPL-3.0-only](LICENSE). The songs are not: the built-in library is a
separate repository and any other playlist belongs to whoever publishes it.
