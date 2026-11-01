/**
 * What the installed game keeps on the device before anybody asks.
 *
 * The shell is what makes a cold start work with no network: the pages, their
 * hashed JavaScript, the fonts and icons, the room artwork, the small cues and the
 * opening bed. The other menu beds are megabytes each and are cached the first time
 * they are played, rather than making every install download them — and **which**
 * ones those are is the manifest's answer, not a list here.
 *
 * Pure, so the build script is only file reading and `Bun.build`.
 */

/** Directories whose files the shell needs. Hashed names live under `_astro`. */
const SHELL_DIRECTORIES = ["/_astro/", "/fonts/", "/icons/", "/images/", "/audio/"];

/** Pages that are precached by name: the entry points and the paper pages. */
export const PAGE_FILES = [
  "app.html",
  "embed.html",
  "play.html",
  "open.html",
  "index.html",
  "privacy.html",
  "terms.html",
  "accessibility.html",
] as const;

/** Files every install needs even though no page's head names them. */
const EXTRA = [
  "/manifest.webmanifest",
  "/audio/sounds.json",
  // Every width of the room: a phone and a retina laptop ask for different files,
  // and an install that kept one would draw the wrong edge offline.
  "/images/background_1-960.webp",
  "/images/background_1-1600.webp",
  "/images/background_1-2048.webp",
];

/**
 * The root-absolute asset URLs a page's own markup names.
 *
 * Only the game's own directories are taken: a page may link somewhere else (the
 * privacy page's contact link, a YouTube script) and those are not the shell. A
 * query or hash is dropped because the cache key is the file. Astro names an
 * island's chunk on a `component-url` / `renderer-url` attribute rather than in a
 * `src`, so those are read too — missing them is a page that draws offline and
 * never hydrates.
 */
export function assetRefs(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/(?:src|href|[a-z-]+-url)="(\/[^"]*)"/g)) {
    const raw = match[1] ?? "";
    if (raw.startsWith("//")) continue;
    const path = raw.split(/[?#]/, 1)[0] ?? "";
    if (!SHELL_DIRECTORIES.some((directory) => path.startsWith(directory))) continue;
    found.add(path);
  }
  return [...found];
}

/**
 * The audio files an install should take.
 *
 * Every cue plus the opening bed. `late` is the rest of the track bank, named by
 * the **manifest** (`build-sw.ts` reads it): those are left to the first time they
 * play, because precaching them would add megabytes to an install that may never
 * hear them.
 */
export function precacheAudio(
  files: readonly string[],
  late: readonly string[] = [],
): string[] {
  const skipped = new Set(late);
  return files
    .filter((file) => file.endsWith(".ogg") && !skipped.has(file))
    .map((file) => `/audio/${file}`)
    .sort();
}

/**
 * The whole precache list, in install order: pages, their assets, the extras, then
 * the audio. Duplicated references are one entry; a foreign URL is never taken.
 */
export function precacheUrls(input: {
  /** Page files (`app.html`) to their contents. */
  pages: Readonly<Record<string, string>>;
  /** Every file in the game's audio directory, by bare name. */
  audio: readonly string[];
  /**
   * Every built asset to keep, whatever the pages name.
   *
   * The `_astro` directory is passed whole: an island's chunk imports other chunks
   * and a lazy dialog is not named by the page, and an install that only kept the
   * entry would draw the page offline and then fail to hydrate it. This is the one
   * bundle the game is; lazy chunks are small.
   */
  assets?: readonly string[];
  /**
   * Audio files the bank may reach but that an install skips: the manifest's late
   * beds, which are cached when they are first played instead.
   */
  late?: readonly string[];
}): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const take = (url: string) => {
    if (!url.startsWith("/") || url.startsWith("//") || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };

  for (const name of PAGE_FILES) {
    const html = input.pages[name];
    if (html === undefined) continue;
    take(`/${name}`);
    for (const ref of assetRefs(html)) take(ref);
  }
  for (const asset of input.assets ?? []) take(asset);
  for (const url of EXTRA) take(url);
  for (const url of precacheAudio(input.audio, input.late)) take(url);
  return urls;
}
