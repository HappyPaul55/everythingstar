---
title: Design and accessibility
description: "The graffiti-arcade look, the utility vocabulary, the type and radius rules, focus as the game's cursor, motion, contrast and the accessibility constraints a change must not regress."
updated: "2026-11-02"
order: 14
---

These are constraints, not decoration. The documents that specify each one are [Writing docs](writing-docs.md) and the [accessibility statement](https://everythingstar.happypaul55.com/accessibility).

## The look

- The look is a **graffiti-arcade stage**: ink (`--color-ink`), paper
  (`--color-paper`) and electric yellow (`--color-yellow`), plus **one**
  restrained accent (`--color-accent`, electric cyan, used sparingly).
- Motifs: spray-speckle backdrops (`spray-ink` / `spray-paper`), hazard-tape rules
  (`hazard`), sticker cards (`sticker`), the spray-blot highlighter (`mark`), and
  marker tag labels (`comment` / `comment-ink`).
- **One radius scale** — `--radius-brand` for surfaces, `--radius-inner` for
  small things sitting inside one, `--radius-pill` for pills. Do not invent a
  fourth.
- **Permanent Marker is for headings and short labels only** — never body copy,
  buttons or instructions.

## How a surface is styled

The product is **utility-first**. A surface is a Tailwind utility in the markup;
a look that repeats is a named utility in `src/styles/utilities.css`; a value is a
token in `src/styles/theme.css`. There are exactly two exceptions, and both have a
reason a utility cannot answer:

- **Markdown prose** (`.doc`, `.legal`). The documentation's HTML is generated from
  Markdown: its headings, lists, tables and code blocks have no author-written
  attributes, so there is nothing to hang a utility on. These rules stay in
  `global.css` and take their type roles from the vocabulary with `@apply`.
- **The stage's inline geometry.** A note's position, its column colour, its scroll
  and its state arrive per frame as inline custom properties written by the run
  loop; no class can carry them. The classes beside them are utilities, built by
  the pure modules (`lib/game/band/notes.ts`, `partClasses.ts`) so the role map is
  tested and Tailwind can see every literal it must generate.
- **A handful of document-level rules and two casings.** The scrollbars, the game
  cursor, the stage's `[data-nav-focus]` focus rules and `.band` itself; and two
  note pseudo-element casings (a sustain tail in `cqw`, the 3D side wall). Every
  other class in the stage — including the jukebox, the option tile and the song
  chips — is utilities in the markup.

  The stage is the **second Tailwind root**: `band.css` imports only the
  utilities with `source(none)` and scans `components/game`, `components/charter`
  and `lib/game`; `global.css` excludes all three. Without that split a class
  written on the stage is generated into the site's stylesheet and inlined into
  every marketing page. Utilities are not free — see
  [Gotchas](gotchas.md) for what the conversion cost and why the caps moved with it.

### The vocabulary

A name in `utilities.css` is a **role**, never a place. `panel`, not
`results-card`; `kicker`, not `options-label`. If a utility would only ever be
used on one screen, it belongs inline.

- A **token** is a value (`--color-*`, `--radius-*`, `--text-*`, `--shadow-*`,
  `--animate-*`). A raw colour, radius, or type size outside `theme.css` is a bug.
- A **utility** is a look. It may be composed (`charter-btn charter-btn-primary`)
  and it may carry its own states, but it must not be restated at a call site.
- A **variant** (`max-[760px]:`, `aria-[current=page]:`, `[&[open]>nav]:`) is how
  a responsive or state difference is said, including on a state hook
  (`aria-[current=page]:bg-yellow`).
- **State hooks** are attributes or classes with no declarations: `is-active`,
  `[data-nav-focus]`, `on-ink`, `aria-current`. They are the contract with the
  tests, the gamepad's focus and the screen reader, and utilities may key off them.
  Do not delete one to tidy a `className`.

### Why not `@apply` everywhere

`@apply` compiles the declarations into every selector that uses it, so a screen
styled that way is the old stylesheet with different names. Use it for the two
exceptions above; everywhere else, put the utility on the element.

## Accessibility

- Accessibility is a hard requirement: high-contrast focus rings, full
  `prefers-reduced-motion` handling, a skip link, semantic landmarks, a
  JavaScript-free mobile menu (`<details>`), and touch targets of at least 44px.
  Inside the game, the stage gets its own **cream focus ring**, every screen puts
  focus on its starting control and announces its name, and every overlay is a
  native `<dialog>` with a trapped, restored focus. The gamepad drives that same
  focus rather than a second cursor, so keyboard, screen reader and pad always
  agree about what is selected.
- Prefer static, JavaScript-free pages; reach for React only where
  interactivity genuinely needs it (the game island).
