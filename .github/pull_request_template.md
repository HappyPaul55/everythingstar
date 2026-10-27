## What changed

<!-- One or two sentences. The diff says how; this says what and where. -->

## Why

<!-- The bug, the gap, or the reason this is the right shape. Link the issue if there is one. -->

## How it was checked

- [ ] `bun run verify` passes <!-- lint, knip, astro check, test types, unit tests, build, budget -->
- [ ] `bun run test:e2e` passes, if the stage, a screen or the library changed
- [ ] A pure rule changed in `src/lib/game/**` has a colocated `*.test.ts` change

```
<!-- paste the last line of verify, or the failing one -->
```

## Screenshots

<!-- For anything visible: desktop and phone width, and say what each shows. Delete this section if nothing is drawn. -->

## Accessibility

- [ ] The keyboard path works, and focus lands on the screen's starting control
- [ ] A dialog returns focus to its opener, and Escape still backs out
- [ ] Nothing regresses at 200% zoom or with reduced motion on

## The static rule

- [ ] No server, API, Worker, binding or new `fetch` path — providers live in their own project
- [ ] No new runtime dependency, or a reason it earns its bytes

## Docs

- [ ] `README.md` and/or `AGENTS.md` updated if behaviour changed
