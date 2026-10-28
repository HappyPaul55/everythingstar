---
title: Credits
description: "Who made EverythingStar, every sound credit as the manifest records it, the fonts and tools behind it, and where its songs come from."
updated: "2026-10-28"
order: 4
---

EverythingStar is made by **HappyPaul55**, with sounds, fonts and software from
other people under their own licences. This page lists them; the game's own
**Credits** screen, reached from the main menu, shows the sound credits from the
same file the game plays them from.

## The game

- **EverythingStar**, published by [HappyPaul55](https://www.happypaul55.com).
- **Source**: [github.com/HappyPaul55/everythingstar](https://github.com/HappyPaul55/everythingstar),
  licensed **AGPL-3.0**
  ([the licence](https://www.gnu.org/licenses/agpl-3.0.html)).
- **In the game**: **Menu → Credits**, or
  [everythingstar.happypaul55.com/play](https://everythingstar.happypaul55.com/play).
  It reads each sound's credit out of the manifest and counts the files under it,
  so a replaced sound shows its new credit without a code change.
- **The audio contract**: [Audio](../developers/audio.md) explains what each sound
  is for and what a replacement has to meet.

## Sounds

`public/audio/sounds.json` is the game's own sound — everything it plays that is
not a song: 24 types across 34 files when this page was written. Every file
carries the credit it is used under, and the strings below are reproduced exactly
as the manifest records them, grouped by what they are for. A sound's type is what
the game asks for; a type may have several files behind it.

### Menu music

| Type | Files | Credit as recorded | Licence |
| --- | --- | --- | --- |
| `background` | 4 | HappyPaul55, made with Suno | The author's own; the manifest names no separate licence |

The four beds are the author's own generations, and the first is the one the game
always opens on.

### Interface cues

| Type | Files | Credit as recorded | Licence |
| --- | --- | --- | --- |
| `click` | 3 | Kenney UI Audio, CC0 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `select` | 2 | Kenney UI Audio, CC0 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `move` | 3 | Kenney UI Audio, CC0 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `back` | 1 | Kenney UI Audio, CC0 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `open` | 1 | Kenney UI Audio, CC0 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `refuse` | 1 | Kenney UI Audio, CC0 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `screen` | 1 | Kenney UI Audio, CC0 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

These come from Kenney's [UI Audio](https://kenney.nl/assets/ui-audio) pack. Each
file has its own measured trim in the manifest, because a pack is not mastered to
itself.

### The band's entrance

| Type | Files | Credit as recorded | Licence |
| --- | --- | --- | --- |
| `hype_guitar` | 1 | Fontaine12, freesound.org/s/163070, CC0 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `hype_bass` | 1 | Fontaine12, freesound.org/s/163070, CC0 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `hype_drums` | 1 | BuddhistIsTheWaterfallTheHueGo, freesound.org/s/786070, CC0 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `hype_vocals` | 1 | susychristiansen, freesound.org/s/149034, CC0 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

One entrance per part, not per player. The bass is the guitar recording pitched
down, the guitar is also the keys' entrance, and the drum roll is the dance mat's.

### Playing

| Type | Files | Credit as recorded | Licence |
| --- | --- | --- | --- |
| `miss` | 1 | Generated for EverythingStar (CC0) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `sparkle` | 1 | Generated for EverythingStar (CC0) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `meter_activate` | 1 | Generated for EverythingStar (CC0) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `error` | 1 | Pixabay Content License — pixabay.com/service/license-summary | [Pixabay Content License](https://pixabay.com/service/license-summary) |

`miss`, `sparkle` and `meter_activate` are a generated chiptune first pass, and
they are the part of the sound the game most expects to replace. `error` is not
the sound of a miss but of a part going out of the mix; it is a Pixabay sound, and
the licence asks for no attribution, but the manifest records it anyway.

### The end of a run

| Type | Files | Credit as recorded | Licence |
| --- | --- | --- | --- |
| `win` | 1 | Generated for EverythingStar (CC0) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `fail` | 1 | Generated for EverythingStar (CC0) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `best` | 1 | Generated for EverythingStar (CC0) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tick` | 1 | Kenney UI Audio, CC0 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

`tick` counts the results score up; the other three frame the end of the run.

### Typing

| Type | Files | Credit as recorded | Licence |
| --- | --- | --- | --- |
| `type_key` | 3 | Kenney UI Audio, CC0 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `type_word` | 1 | Kenney UI Audio, CC0 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `type_miss` | 1 | Generated for EverythingStar (CC0) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

### The pause

| Type | Files | Credit as recorded | Licence |
| --- | --- | --- | --- |
| `crowd` | 1 | stephan, pdsounds.org, public domain | Public domain |

A restaurant room recorded by stephan and published at
[pdsounds.org](http://pdsounds.org), trimmed, faded and encoded for the game. It
is the pause's alone: no crowd plays over a song.

A sound with no file is silent rather than an error, which is why a type can be
wired before a sound exists. A replacement file keeps its type and takes its own
credit in the manifest; a file with no credit is said on the in-game screen rather
than hidden.

## Fonts

| Font | Used for | Designer | Licence |
| --- | --- | --- | --- |
| Permanent Marker | headings and short labels | Font Diner | [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) |
| Space Grotesk | body text | Florian Karsten | [SIL Open Font License 1.1](https://openfontlicense.org) |
| Space Mono | utility labels and code | Colophon Foundry | [SIL Open Font License 1.1](https://openfontlicense.org) |

All three are self-hosted from this site's own `/fonts/` directory, so no request
goes to Google Fonts. The files are the latin subsets; `bun run fonts` fetches
them again.

## Artwork and icons

The backdrop, the brand mark, the icon set drawn from it, and the social card are
the game's own, by the author. The icons are generated from
`public/icons/brand-mark.svg` by `bun run icons`, and the social card is laid out
in `scripts/og-card.html` and rendered at 1200×630.

A **song's** cover is not the game's: it belongs to the song's source and is
credited there. Where a song has no art, the jukebox draws its own tile — the
initials on the song's accent colour.

## Software

| Tool | What it does | Link |
| --- | --- | --- |
| Astro | the site, these documentation pages and the build | [astro.build](https://astro.build) |
| React | the game island | [react.dev](https://react.dev) |
| Tailwind CSS | the site's styles | [tailwindcss.com](https://tailwindcss.com) |
| Bun | package manager, test runner and build scripts | [bun.sh](https://bun.sh) |
| Playwright | the browser tests | [playwright.dev](https://playwright.dev) |
| oxlint | the lint gate | [oxc.rs](https://oxc.rs/docs/guide/usage/linter.html) |
| knip | unused code and dependencies | [knip.dev](https://knip.dev) |
| favicons | the generated icon set | [github.com/itgalaxy/favicons](https://github.com/itgalaxy/favicons) |

Astro, React and Tailwind are compiled into the files a browser downloads. Bun,
Playwright, oxlint, knip and `favicons` run only on a machine that builds or tests
the game, and are not shipped. Each is under its own licence, as are their
dependencies.

## Songs

The game ships no songs. Playing one fetches it from a playlist: the built-in
library is [EverythingStar FOSS](https://github.com/HappyPaul55/everythingstar-foss),
a separate, non-commercial library of UltraStar songs converted for EverythingStar
and Guitar Hero-compatible players — 37 songs when this page was written. It
includes only works whose licences permit derivative use; every folder keeps its
source `license.txt`, and `ATTRIBUTION.md` and `songs/licenses.json` there are the
full audit.

Most songs carry the UltraStar vocal chart they were converted from, and *Code
Monkey* carries NoisyPuppet's source full-band charts. The lyrics, recordings and
cover art belong to each song's source, and its licence travels with it. The
people who made and charted those songs are named in that library, song by song —
the game does not restate them, because it does not own them.

If you add another playlist, its songs are credited by whoever publishes it.

## A credit that is wrong

A missing or wrong credit is a bug. Open an issue at
[github.com/HappyPaul55/everythingstar/issues](https://github.com/HappyPaul55/everythingstar/issues),
or use the contact details at [happypaul55.com](https://www.happypaul55.com), and
say which sound, font or picture is meant and what the credit should be.
