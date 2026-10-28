# EverythingStar playlist API

The wire contract has moved into the documentation, where providers and the site read
the same file:

- **[Playlist API](docs/developers/playlist-api.md)** — the playlist, song and chart
  documents, URL resolution, CORS, timing, a worked example and an acceptance checklist.
- **<https://everythingstar.happypaul55.com/docs/developers/playlist-api>** — the same
  page on the website.

The game's readers are `src/lib/game/playlist.ts` and `src/lib/game/source.ts`; where
the contract and those disagree, the readers win and the contract is the bug.
