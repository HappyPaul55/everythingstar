---
title: House rules
description: "The conventions a change keeps to: pure engines, a screen is session state, tests beside the rule, and the two recipes for a new chart source or a new screen."
updated: "2026-10-28"
order: 11
---

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
   `src/i18n/ui/en.game.ts` (or `en.site.ts`/`en.charter.ts` for that surface).
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
