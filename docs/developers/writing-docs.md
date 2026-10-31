---
title: Writing docs
description: "How this documentation is written and built: one Markdown source for GitHub and the site, the frontmatter, the link rules, the four sections, the screenshot tests and the checks."
updated: "2026-10-31"
order: 5
---

The documentation is Markdown in `docs/` at the root of the repository. GitHub shows
the files; this site builds a page from each one. Nothing is duplicated and nothing is
generated into `docs/` — a correction made for one reader is made for both. The one
exception is `public/docs/test-output/`, which the capture run fills and Git ignores.

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
updated: "2026-10-31"
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
[The jukebox: an A–Z index down the side, song rows with their length and offers, and the now-playing panel on the right.](shot:jukebox "The jukebox, with a row picked")
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
- One spec per shot, in `tests/e2e/docs/`; the `doc` annotation is the only thing
  a capture test adds.
- **Desktop and mobile are the default.** Every shot is captured once for each
  variant in `docshots.config.ts`, because a phone is where a highway's framing, a
  menu's overflow and a jukebox's sheet actually fail. Add a picture because it
  shows something a reader needs, not because a screen has two shapes.
- Two annotations narrow a shot without code, and both are the exception:
  - `{ type: "doc-viewport", description: "mobile" }` — only for a variant a
    screen genuinely does not support: `phone-pads` is a phone picture by
    definition. Declare the same variant in `docshots.config.ts`'s `shots` map;
    `references.test.ts` fails if the annotation and the map disagree. The page
    still writes its image tag before the capture exists; the build does not wait
    for the browser.
  - `{ type: "doc-crop", description: "mobile:bottom 40%" }` — keep the foot of a
    phone frame that is mostly runway. A highway is mostly runway, so a phone note
    is the note, the hit line and the pads.
- The test drives the screen through a journey helper — the same helpers the
  behavioural suite uses, so a capture and a test that asserts the same screen
  cannot drift apart: `captureJukebox`, `captureGuitarHighway`,
  `captureBandScreen`, `captureSinger`, `capturePhonePads`
  (`tests/e2e/docs-screens.ts`), the duet and lyrics fixtures
  (`tests/e2e/docs-charts.ts`), `captureNoteType` (`tests/e2e/note-guide.ts`),
  and the rest, all on `helpers.ts`. It asserts the screen arrived.
- The page shows one `<details>` per configured variant; one variant needs no
  selector. The image may not exist yet when the build runs — the e2e capture and
  `check:docs` close that gap.
- Use `/app` (the game alone) rather than `/play` (the site shell around it).
- The fixture is the **published FOSS library**, not an invented one:
  `installDocsFixtures` serves a snapshot of its playlist and cover art, so the
  jukebox, the band and the stage show real songs. Code Monkey is the one song
  with guitar, bass, drums and vocals, so the stage captures use it.
- GitHub shows the link text rather than the picture — the page is the site's.

[Testing](testing.md#documentation-captures) runs the captures, writes one WebP per
variant, bundles them into the built site and holds the references and the tests
together.

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
