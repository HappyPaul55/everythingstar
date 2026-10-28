---
title: Documentation
description: "EverythingStar's documentation: how to play, how to make charts, how the game is built and tested, and the notices that come with it."
updated: "2026-10-28"
order: 0
---

EverythingStar is a free browser rhythm game: guitar, bass, keys and drums as falling
notes, the words typed on a keyboard, and karaoke into a microphone — three ways to
play on one stage, with no account and nothing to install.

## Four audiences

The documentation is written for the four people who arrive here:

- **Players** want to pick a song and play it. Start with
  [Getting started](players/getting-started.md).
- **Charters** have a chart, or want to make one, and want the game to play it.
  Start with [What a chart is](charters/what-a-chart-is.md).
- **Developers** want to change the game, add a format or host a library. Start with
  [Architecture](developers/architecture.md).
- **Everyone else** wants the notices: [Privacy](other/privacy.md), terms, copyright and
  credits, under Other below.

## One source, two readers

Every page is a Markdown file in `docs/` in the repository, with a little frontmatter.
GitHub shows the files as they are; this site builds a page from the very same file. A
correction made in either place is made in both, and a relative link between two pages
works on both.

The frontmatter is the only site-specific part:

```yaml
---
title: Instruments
description: Guitar, bass, keys and drums on one highway — and what a note asks of you.
updated: "2026-10-28"
order: 3
---
```

`order` is the page's place in its section's sidebar, and `updated` is printed at the
foot of the page: a reference that does not say when it was true is one nobody can
trust. The folder is the section, so a page cannot be filed in the wrong list.

## Finding things

The game is at
[everythingstar.happypaul55.com](https://everythingstar.happypaul55.com/play), and the
[sources](https://github.com/HappyPaul55/everythingstar) are on GitHub. The pages here
are also in the sitemap, so a search engine can find them — and every page in a section
is listed below.
