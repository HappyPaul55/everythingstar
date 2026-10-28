---
title: Links into the game
description: "The contract for Open in EverythingStar, Add Playlist and Add Song: the URLs, the confirmation rule, limits, the Android App Link and the native hand-off."
updated: "2026-10-28"
order: 8
---

A link is an invitation, never a command. The game's reader is `src/lib/game/intent.ts`; where this document and that file disagree, the code wins and this document is the bug.

**Version 1 — the contract for "Open in EverythingStar", "Add Playlist to EverythingStar" and "Add Song to EverythingStar".**

A link is an invitation, never a command. It opens the game, shows who it is from, and
changes the player's library only when they press **Add**. Nothing is fetched before that
press, nothing is added behind their back, and nothing starts playing.

This document is for two readers: a provider publishing an **Add** button beside its
library, and the **native app** receiving the same links from Android or iOS. The game's
reader is `src/lib/game/intent.ts`; where this document and that file disagree, the code
wins and this document is the bug.

---

## 1. The three links

All three are the same family, and they all land on `/open`:

| Button | Address |
| --- | --- |
| **Open in EverythingStar** | `https://everythingstar.happypaul55.com/open` |
| **Add Playlist to EverythingStar** | `https://everythingstar.happypaul55.com/open?playlist=<encoded playlist URL>` |
| **Add Song to EverythingStar** | `https://everythingstar.happypaul55.com/open?song=<encoded song-document URL>` |

The address is an ordinary `https:` link, so it can be posted in a chat, put in a QR code,
or linked from a page. On a device with the native app installed and verified it can open
the app; otherwise it opens the website, where an installed PWA may take it. The same page
is the fallback in every case.

`?playlist=` and `?song=` also work on `/play` and `/app`. `/open` is the canonical form:
it is the one to publish, and the one the native app recognises.

---

## 2. What happens when it opens

1. The game reads the query **once** and immediately removes it from the address bar. A
   reload is therefore a normal visit, not a second Add.
2. If the query names a **playlist**, the game asks:

   > **Add this playlist?**
   > From `example.com`.
   > EverythingStar will fetch it, and its songs will join your library.

   If it names a **song**:

   > **Add this song?**
   > From `example.com`.
   > The song document will be kept in your library on its own.

3. **Add** is the only thing that changes the library. **Not now** closes the question and
   nothing else happens.
4. A playlist becomes a source like any other: it is listed in **Playlists**, can be
   refreshed, disabled or removed, and its songs join the jukebox. A song becomes a
   library entry of its own, listed under **Playlists → Songs from links**, where it can be
   refreshed or removed.
5. A link arriving while a song is running is held until the game is back on a page; it
   never interrupts a run.

A playlist is read by the same reader as a pasted one, so its name and song count arrive
in the dialog once the fetch has answered. A song document is read before it is kept: a
document that is not a song, or a host that does not answer, is said in the dialog and not
stored. A song already in the library (same document URL or same `id`) is reported as
already there.

---

## 3. What a link may name

The target is fetched by the browser, so it follows the same rules as a pasted playlist
(`playlist-api.md`):

- an **absolute** `http:` or `https:` address with a host;
- **no credentials** (`https://user:pass@host/…` is refused, because `fetch` throws an
  opaque error for it);
- **CORS headers** on the host, on documents and audio, or the browser will not read them;
- a **`.sng` package is not a song link**. A package is a container that a playlist entry
  names; for one shared package, publish a one-song playlist and use `?playlist=`.
- on an `https:` page, an `http:` target will be blocked by the browser as mixed content.
  The dialog says so; use `https:`.

The whole payload is capped at **8 KB** after trimming, so a link cannot be a document in
disguise. Anything longer, both parameters at once, a relative address, a `javascript:`,
`data:` or `file:` address, or a non-URL is refused with a sentence and changes nothing.

**A link carries the whole target URL.** If your playlist URL contains a token, a signed
query or a private key, that token is in every copy of the link. Do not publish a link for
a URL you would not give away; use a public playlist or an on-demand endpoint that issues
short-lived URLs.

---

## 4. Building the link

Encode the target with `URLSearchParams`, not by pasting it after an `=`:

```js
const link = new URL("https://everythingstar.happypaul55.com/open");
link.searchParams.set("playlist", playlistUrl);
// https://everythingstar.happypaul55.com/open?playlist=https%3A%2F%2Fexample.com%2F…
```

```html
<a href="https://everythingstar.happypaul55.com/open?playlist=https%3A%2F%2Fexample.com%2Fplaylist.json">
  Add Playlist to EverythingStar
</a>
<a href="https://everythingstar.happypaul55.com/open?song=https%3A%2F%2Fexample.com%2Fsongs%2Fone.json">
  Add Song to EverythingStar
</a>
```

One parameter, one link. `?playlist=…&song=…` is refused rather than guessed.

The game itself can produce these links: **Copy link** on a playlist row, or on a song
under **Songs from links**, copies the canonical address above.

---

## 5. The native app

The Android app receives the same links through two routes:

1. **Verified App Links** for `https://everythingstar.happypaul55.com/open`. This is the
   one to prefer: it makes an ordinary shared `https:` link open the app, and it needs no
   choice from the player. It is verified by
   `https://everythingstar.happypaul55.com/.well-known/assetlinks.json`, which this site
   publishes in `public/.well-known/assetlinks.json` with the release signing
   certificate:

   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "com.happypaul55.everythingstar",
         "sha256_cert_fingerprints": [
           "64:33:05:7E:F0:E7:3D:7F:07:4E:1A:A4:58:FB:71:AE:EB:5E:12:7B:53:F8:74:6A:55:23:01:D4:A5:53:79:E0"
         ]
       }
     }
   ]
   ```

   The fingerprint is the **signing** certificate's, not a debug certificate's. A build
   signed with a different key (a local release build, or Play App Signing re-signing
   an upload) will not verify until its fingerprint is added to the same array; Android
   re-checks the file when the app is installed or updated. The custom scheme below keeps
   working however the build is signed.

2. **The `everythingstar` custom scheme** for a direct app launch:
   `everythingstar://open?playlist=…` or `everythingstar://open?song=…`. It needs no
   verification and works with any signing certificate. A page should use it only behind a
   fallback, because a browser with no handler shows its own error.

### The intent filters

```xml
<!-- https://everythingstar.happypaul55.com/open… -->
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data
    android:scheme="https"
    android:host="everythingstar.happypaul55.com"
    android:pathPrefix="/open" />
</intent-filter>

<!-- everythingstar://open… -->
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="everythingstar" android:host="open" />
</intent-filter>
```

### Handing the link to the game

The app's only page is `/embed.html`, so a link is a **query on that page**:

- **Cold start.** Read `App.getLaunchUrl()`, take its `playlist`/`song` parameter, and open
  `/embed.html?…` with it. Capacitor's `appStartPath` does not carry the incoming URL, and
  the app's stale-page check reloads `/embed.html` without a query; keep the pending intent
  in the native layer (or in session storage) until the game page has it.
- **Warm start.** Do not reload a run. Dispatch the link to the page instead:

  ```js
  App.addListener("appUrlOpen", ({ url }) => {
    window.dispatchEvent(new CustomEvent("everythingstar:open", { detail: { url } }));
  });
  ```

  The game reads the query from `detail.url`, holds it while a song is playing, and shows
  the confirmation when the game is back on a page. Accepting either the `https:` or the
  `everythingstar://` form is fine: only the query is read.
- `pageOfPath` in the app already ignores the query, and the app page check compares the
  **path**, so `/embed.html?playlist=…` is still the game page.

- **iOS.** Universal Links need `apple-app-site-association` in the same
  `.well-known/` directory and the `applinks:` associated domain in the app; the custom
  scheme needs `CFBundleURLTypes`. The URL's query is the same.

---

## 6. The installed web app

The website is a PWA with `scope: "/"`, `start_url: "/app"`, and a service worker that keeps
the shell for offline play. An installed PWA may take an in-scope link itself (Chromium
supports link capturing and `launch_handler`; Safari varies), in which case the link opens
inside the installed game. When it does not, the browser opens `/open`, which is the same
game in a normal tab. In both cases the query is read by the same code and the confirmation
is the same dialog.

`/open` and `/app` are `noindex` and are not in the sitemap: they are actions, not pages to
find in a search.

---

## 7. Acceptance checklist

- [ ] `GET https://everythingstar.happypaul55.com/open` opens the game and asks nothing.
- [ ] `?playlist=<encoded>` shows **Add this playlist?** with the host, and no request is
      made until **Add**.
- [ ] **Not now** adds nothing, and a reload does not ask again.
- [ ] **Add** lists the playlist in the Playlists dialog with its name and count; its songs
      are in the jukebox.
- [ ] `?song=<encoded>` shows **Add this song?**, and **Add** lists the song under
      **Songs from links**.
- [ ] A relative address, `javascript:`, a credentialled URL, both parameters, or a target
      over 8 KB is refused with a sentence and changes nothing.
- [ ] The same link on Android opens the native app when the App Link is verified or the
      custom scheme is registered; otherwise it opens the website.
- [ ] A link arriving during a run does not interrupt it.
- [ ] `/open?dev=1` still opens the review tools; the intent parameters are the only ones
      the game removes.

---

## 8. Versioning

The link format is versionless in the URL: `?playlist=` and `?song=` are the contract, and
a new parameter is an addition. The native app and the website may be different builds; a
link the older one does not know is ignored by the game (and the game is the side that
asks). If the meaning of a parameter ever has to change, it is a new parameter name, and
this document is the place that says so.

---

## 9. Worked example

A provider at `https://songs.example.com` has a playlist and a single shared song:

```html
<p>
  <a href="https://everythingstar.happypaul55.com/open?playlist=https%3A%2F%2Fsongs.example.com%2Fplaylist.json">
    Add Playlist to EverythingStar
  </a>
</p>
<p>
  <a href="https://everythingstar.happypaul55.com/open?song=https%3A%2F%2Fsongs.example.com%2Fsongs%2Fthree-little-birds.json">
    Add Song to EverythingStar
  </a>
</p>
```

`songs.example.com` serves every document with CORS and HTTPS. The first link adds the
catalogue; the second adds only that song, read from its own document, and lists it under
**Songs from links**. Neither downloads the song's audio: that happens when a band plays
it, or when the player presses **Download**.
