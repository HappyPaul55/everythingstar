---
title: Writing docs
description: "How this documentation is written and built: one Markdown source for GitHub and the site, the frontmatter, the link rules, the four sections, the screenshot tests and the checks."
updated: "2026-10-30"
order: 5
---

The documentation is Markdown in `docs/` at the root of the repository. GitHub shows
the files; this site builds a page from each one. Nothing is duplicated and nothing is
generated into `docs/` — a correction made for one reader is made for both. The one
exception is `docs/screenshots/`, which a build fills with captures and Git ignores.

## Where a page goes

The folder decides the section and the URL:

| Folder | Section | URL | For |
| --- | --- | --- | --- |
| `docs/players/` | Players | `/docs/players/<name>` | people playing the game |
| `docs/charters/` | Charters | `/docs/charters/<name>` | people making charts and libraries |
| `docs/developers/` | Developers | `/docs/developers/<name>` | people changing the game |
| `docs/other/` | Other | `/<name>` | the notices: `/privacy`, `/terms`, `/credits` |

`docs/README.md` is the hub at `/docs`. The notices keep root URLs on purpose: they
are not documentation and `/privacy` in particular is load-bearing — it is in the
footer, the installed game's offline shell and the Android app. `src/lib/docs/paths.ts`
is the one place that rule lives.

## The frontmatter

```yaml
---
title: Writing docs
description: "How this documentation is written and built: one Markdown source for GitHub and the site, the frontmatter, the link rules, the four sections, the screenshot tests and the checks."
updated: "2026-10-30"
order: 5
---
```

- **`title`** is the page's `<h1>` and the sidebar's label. Sentence case, no
  trailing full stop. Do **not** repeat it as a `#` heading in the body.
- **`description`** is the meta description and the line on the hub. Say what the page
  is for, in 90–170 characters.
- **`updated`** is when the page was last true. The layout prints it at the foot. A
  reference page that does not say when it was true is one nobody can trust.
- **`order`** is the page's place in its section's sidebar. Unique within a section;
  ties sort by title.

The schema is in `src/content.config.ts` and is enforced by `astro check`, so a page
with a missing or malformed field does not reach the build.

## The Markdown

- Relative links between docs end in `.md`: `[Formats](formats.md)`,
  `[the contract](../developers/playlist-api.md)`, and anchors work
  (`songs.md#downloads`). GitHub resolves them and the build rewrites them to the
  site's routes.
- A link to anything **outside** `docs/` uses a full URL — the site
  (`https://everythingstar.happypaul55.com/play`) or the repository
  (`https://github.com/HappyPaul55/everythingstar/blob/main/SECURITY.md`). A relative
  link to a root file works on GitHub and not on the site, so it is not used.
- A screenshot is a **test** in `tests/e2e/docs`, not a file: the page names its id
  with `[description](shot:<id>)`. See [Screenshots](#screenshots) below. Nothing
  under `docs/screenshots/` is committed.
- `<kbd>` is the one raw tag the content uses, for a key: `<kbd>Space</kbd>`.
  Everything else is Markdown — no MDX, no components, no scripts.
- Tables and fenced code blocks (with a language) are styled by the layout. Keep a
  table to four columns and a code block to what a reader has to copy.
- British English, sentence case, plain words, "you". Say what happens, what is
  optional and what it costs. If a thing is not built, say so rather than describing
  what it will do.

## Screenshots

A picture of the game is a Playwright test that carries a `doc` annotation, and
the page names the same id:

```markdown
[The jukebox: an A–Z index down the side, song rows with their length and offers, and the now-playing panel on the right.](shot:jukebox "The jukebox on a desktop")
```

```ts
import { captureJukebox, test } from "../support";

test(
  "the jukebox shows its index, rows and now-playing panel",
  { annotation: [{ type: "doc", description: "jukebox" }] },
  async ({ context, page }) => {
    await captureJukebox(context, page);
  },
);
```

- The link **text is the alt** and is required; the link **title is the caption**
  and is optional; `shot:jukebox` is the id.
- The `doc` annotation is the only thing added to the test. An automatic fixture
  in `tests/e2e/support.ts` reads it and takes the WebP **only when the test
  passed**, once per Playwright project — `desktop` and `mobile` from
  `docshots.config.ts`.
- Two more annotations narrow a shot without code:
  - `{ type: "doc-viewport", description: "desktop" }` — capture it only there
    (the jukebox on a phone opens the now-playing panel as a sheet).
  - `{ type: "doc-crop", description: "mobile:bottom 40%" }` — keep the foot of
    the phone frame. A highway is mostly runway, so a phone note is the note, the
    hit line and the pads.
- The test drives the screen — `captureJukebox`, `captureGuitarHighway`,
  `captureBandScreen`, `captureSinger`, `capturePhonePads`
  (`tests/e2e/docs-screens.ts`) or `captureNoteType` (`tests/e2e/note-guide.ts`)
  — and asserts it arrived.
- The files land in `public/docs/test-output/<id>-<variant>.webp`, ignored by Git
  and served as written. The page shows one `<details>` per variant that exists;
  one variant needs no selector.
- `bun run docs:shots` clears the captures, runs every test in `tests/e2e/docs`;
  `bun run build` runs it first. `bun run build:quick` reuses the images already
  on disk, and a one-shot loop runs the spec directly with the docs config.
- Two checks in `bun test` hold the halves together: every `shot:` reference has
  a `doc` annotation, and every annotated test is shown by a page.
- Use `/app` (the game alone) rather than `/play` (the site shell around it).
- The fixture is the **published FOSS library**, not an invented one:
  `installDocsFixtures` serves a snapshot of its playlist and cover art, so the
  jukebox, the band and the stage show real songs. Code Monkey is the one song
  with guitar, bass, drums and vocals, so the stage captures use it.
- GitHub shows the link text rather than the picture — the page is the site's.

## Adding a page

1. Write `docs/<section>/<name>.md` with the four frontmatter fields.
2. Pick an `order` that puts it where a reader needs it — the sidebar and the hub
   update themselves; there is no link list to edit.
3. Link it from the pages that should lead to it.
4. Run `bun run verify`. `bun run check:docs` (part of it) proves the built page exists,
   carries the site shell and a canonical, is in the sitemap, is not in the offline
   shell, and that every relative link and image resolves.

A new **section** is rarer: add it to `DOC_SECTIONS` in `src/lib/docs/paths.ts`, its
label and lede in `src/i18n/ui/en.ts` and `src/lib/docs/sections.ts`, and (if it is not
served under `/docs/`) the rule in `docHref`. Then add one page so the sidebar has
somewhere to land.

## How it is built

- `src/content.config.ts` reads the folder as a content collection, base `./docs`,
  keeping the path as the id (`players/songs`).
- `astro.config.mjs` adds one mdast plugin that rewrites relative `.md` links through
  `resolveDocLink` — the rules are pure and tested in `src/lib/docs/paths.ts`.
- `src/pages/docs/[...slug].astro` builds a page per sectioned document;
  `src/pages/[...legal].astro` builds the notices at the site root; `src/pages/docs/index.astro`
  builds the hub.
- `src/layouts/DocsLayout.astro` is the frame: sidebar, article, table of contents,
  updated line, edit link and pager.

## The checks

- `src/lib/docs/paths.test.ts` — the URL and link arithmetic.
- `src/lib/docs/nav.test.ts` — grouping, ordering and the pager.
- `src/lib/docs/content.test.ts` — every document's frontmatter, a unique `order`, every
  relative link and image, and no page outside a section.
- `scripts/check-docs.ts` — the built site: a page per document, the site shell, a
  canonical, the sitemap, no island script, and nothing in the service worker's
  precache.
