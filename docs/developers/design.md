---
title: Design and accessibility
description: "The graffiti-arcade look, the type and radius rules, focus as the game's cursor, motion, contrast and the accessibility constraints a change must not regress."
updated: "2026-10-28"
order: 14
---

These are constraints, not decoration. The documents that specify each one are [Writing docs](writing-docs.md) and the [accessibility statement](https://everythingstar.happypaul55.com/accessibility).

## The look

- The look is a **graffiti-arcade stage**: ink (`--color-ink`), paper
  (`--color-paper`) and electric yellow (`--color-yellow`), plus **one**
  restrained accent (`--color-accent`, electric cyan, used sparingly).
- Motifs: spray-speckle backdrops (`.spray-ink` / `.spray-paper`), hazard-tape
  rules (`.hazard`), sticker cards (`.sticker`), the spray-blot highlighter
  (`.mark`), and marker tag labels (`.comment`).
- **One radius scale** — `--radius-brand` for surfaces, `--radius-inner` for
  small things sitting inside one, `--radius-pill` for pills. Do not invent a
  fourth.
- **Permanent Marker is for headings and short labels only** — never body copy,
  buttons or instructions.
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
