/**
 * The release archives: one build, three views of `dist/`.
 *
 * `website.zip` is the build as Cloudflare receives it — every page, the worker,
 * the manifest and the deploy files — and the two others are **standalone
 * folders**: the same game assets, a page of their own promoted to `index.html`,
 * and nothing of the site around it.
 *
 * - **game** is `/embed` (the native app's page): the stage and nothing else.
 * - **arcade** is `/arcade` (the attract entry): the same page, left to play
 *   itself, which is what a kiosk or the marketing window wants.
 *
 * The two standalone archives differ in **one file**, so they are one plan with an
 * entry argument rather than two implementations, and the list is derived from the
 * build's own file names: a second copy of the site's layout would be a second
 * thing to keep in step.
 *
 * Two rules are load-bearing and are why this is pure and tested:
 *
 * - **Every path is root-absolute.** Astro writes `/_astro/…`, and the island
 *   fetches `/audio/sounds.json`, `/images/background_1.jpg` and `/fonts/…` at
 *   runtime. A standalone folder is therefore served at an origin's **root**, not
 *   opened from disk and not mounted under a path. Rewriting the references would
 *   mean rewriting built HTML, inlined CSS and JS chunk specifiers, which is a
 *   different and much worse job than saying how to serve it.
 * - **A standalone folder carries no service worker.** The site's `sw.js`
 *   precaches `app.html` and `play.html` and its offline navigation falls back to
 *   `/app.html`; in a folder that has neither, it is a worker that answers with a
 *   503. The manifest stays (rewritten to start at `/`) so the folder is still
 *   installable, and offline play remains the website's.
 *
 * The checker (`scripts/check-release.ts`) holds the archives to this plan, so an
 * archive cannot quietly lose a chunk, gain a page or keep a URL that is not there.
 */

/** The three archives a release publishes. */
export type ReleaseBundle = "game" | "arcade" | "website";

/** Every bundle, in the order the commands build and print them. */
export const RELEASE_BUNDLES: readonly ReleaseBundle[] = ["game", "arcade", "website"];

/**
 * Directories every archive carries **whole**.
 *
 * Whole because the build is the answer to what is in them: `_astro` holds the
 * island's chunks including the lazily imported ones, and a list here would be a
 * second inventory of the game. The artwork, the cursors, the fonts and the sound
 * are the same argument.
 */
const SHARED_DIRECTORIES = [
  "_astro/",
  "audio/",
  "cursors/",
  "fonts/",
  "icons/",
  "images/",
] as const;

/** The built page a standalone archive promotes to its root. */
const ENTRY_PAGE: Record<Exclude<ReleaseBundle, "website">, string> = {
  game: "embed.html",
  arcade: "arcade.html",
};

/** What a standalone archive calls its entry page. */
export const ENTRY_NAME = "index.html";

/** The build's manifest, rewritten to start at the folder's own root. */
export const MANIFEST_NAME = "manifest.webmanifest";

/** A downloaded folder's own label: version, how to serve it, and the licence. */
export const BUILD_NOTE_NAME = "BUILD.txt";

/**
 * Files the island fetches by a literal that no page's markup names.
 *
 * The sound manifest is read on the welcome and the room's artwork is the backdrop
 * of every screen, and both are asked for by `useSounds` and `backdropFor` rather
 * than written in the HTML. They are in the game's own directories, so the plan
 * carries them anyway; this list is here so the **check** can say so, because an
 * archive without them draws a silent, black game and no listing would notice.
 */
const RUNTIME_FILES = ["audio/sounds.json", "images/background_1.jpg"];

/**
 * A page a standalone archive carries beside its entry.
 *
 * The charter is reached from the menu and is a page of its own, so a game folder
 * without it has a menu link that 404s. It is not the entry and never becomes
 * `index.html`; it is the one extra document the game's own menu names.
 */
const EXTRA_PAGES = ["charter.html"];

export interface BundlePlan {
  bundle: ReleaseBundle;
  /**
   * Build files the archive carries at their own path, sorted.
   *
   * The entry page is **not** here: it is `entry`, because the archive carries it
   * under a different name.
   */
  files: string[];
  /** The page that becomes `index.html`, or null for the website. */
  entry: { from: string; to: string } | null;
  /** Files the builder generates rather than copies, by archive path. */
  generated: string[];
}

/**
 * What one archive holds, chosen from the build's own file names.
 *
 * `distFiles` are `dist/`-relative and `/`-separated (`_astro/GameApp.abc.js`).
 * Nothing here reads the disk: the builder and the checker both ask this and so
 * answer the same question.
 */
export function planBundle(
  bundle: ReleaseBundle,
  distFiles: readonly string[],
): BundlePlan {
  if (bundle === "website") {
    return {
      bundle,
      files: [...distFiles].sort(),
      entry: null,
      generated: [],
    };
  }

  return {
    bundle,
    files: distFiles
      .filter(
        (file) =>
          SHARED_DIRECTORIES.some((directory) => file.startsWith(directory)) ||
          EXTRA_PAGES.includes(file),
      )
      .sort(),
    entry: { from: ENTRY_PAGE[bundle], to: ENTRY_NAME },
    // The built manifest cannot be copied as it is: it starts at `/app`, which a
    // standalone folder does not have. `BUILD.txt` is the folder saying what it
    // is, since a downloaded zip has no tag beside it.
    generated: [MANIFEST_NAME, BUILD_NOTE_NAME],
  };
}

/** Every path the archive holds, sorted: the one list the builder and the check share. */
export function archiveFiles(plan: BundlePlan): string[] {
  const files = plan.files.filter((file) => file !== plan.entry?.from);
  if (plan.entry) files.push(plan.entry.to);
  files.push(...plan.generated);
  return files.sort();
}

/**
 * The build's manifest, pointed at the folder it ships in.
 *
 * `id`, `start_url` and the shortcut's `url` were `/app` — the website's installed
 * entry. In a standalone folder that is a page nobody has, so they become `/`,
 * which is the promoted entry. Everything else (name, colours, icons, display,
 * launch handling) is the site's and is left exactly as built.
 */
export function standaloneManifest(text: string): string {
  const manifest = JSON.parse(text) as Record<string, unknown>;
  manifest.id = "/";
  manifest.start_url = "/";
  manifest.scope = "/";
  if (Array.isArray(manifest.shortcuts)) {
    manifest.shortcuts = (manifest.shortcuts as Record<string, unknown>[]).map(
      (shortcut) => ({ ...shortcut, url: "/" }),
    );
  }
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * A downloaded folder's label.
 *
 * A zip has no tag beside it, and the first question a person asks of one is
 * "what is this and how do I run it". The answer is two lines: the version the
 * build already shows on its welcome screen, and the one thing a root-absolute
 * build needs said out loud.
 */
export function buildNote(version: string): string {
  return [
    `EverythingStar ${version}`,
    "",
    "This folder is the whole game: serve it at the ROOT of an origin over HTTP(S)",
    "— for example `python3 -m http.server` beside it, or a static host's deploy",
    "directory. The game addresses its files from `/`, so a subfolder or `file://`",
    "will load a page with no JavaScript, and that is why it says so here.",
    "",
    "Source: https://github.com/HappyPaul55/everythingstar",
    "Licence: AGPL-3.0-only — https://www.gnu.org/licenses/agpl-3.0.html",
    "",
  ].join("\n");
}

/**
 * Every root-absolute URL a built page names.
 *
 * Both the ways a page names a file matter: an attribute (`src`, `href`, an
 * island's `component-url`/`renderer-url`) and a CSS `url(/…)` — the stylesheet is
 * inlined in the page, so the cursors and the fonts are in the HTML and not in a
 * file of their own. A query or hash is dropped because it is not part of the
 * path, and a protocol-relative `//host/x` is somebody else's.
 */
export function rootRefs(html: string): string[] {
  const found = new Set<string>();
  const take = (raw: string) => {
    if (!raw.startsWith("/") || raw.startsWith("//")) return;
    const path = raw.split(/[?#]/, 1)[0] ?? "";
    if (path.length > 1) found.add(path);
  };
  for (const match of html.matchAll(/(?:src|href|[a-z-]+-url)="(\/[^"]*)"/g)) {
    take(match[1] ?? "");
  }
  for (const match of html.matchAll(/url\((["']?)(\/[^)"']+)\1\)/g)) {
    take(match[2] ?? "");
  }
  return [...found];
}

/** Every icon a manifest names, its shortcuts' icons included. */
export function manifestIcons(text: string): string[] {
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return [];
  }
  const icons: string[] = [];
  const collect = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const icon of value as Record<string, unknown>[]) {
      if (typeof icon?.src === "string") icons.push(icon.src);
    }
  };
  collect(manifest.icons);
  if (Array.isArray(manifest.shortcuts)) {
    for (const shortcut of manifest.shortcuts as Record<string, unknown>[]) {
      collect(shortcut?.icons);
    }
  }
  return icons;
}

/**
 * What is wrong with one archive, as a list of sentences.
 *
 * This is the release's whole gate and it is deliberately about **reachability**:
 * an archive is right when it holds exactly what the plan says and the entry page
 * cannot name a file that is not in it — including the two the island fetches by a
 * literal of its own (`RUNTIME_FILES`). A missing `_astro` chunk is a page that
 * draws and never hydrates, which is the failure a file listing is for.
 *
 * `html` is the archive's own `index.html` (null for the website, whose pages are
 * served by a host that maps `/play` to `play.html`); `manifest` is its rewritten
 * manifest, when it carries one.
 */
export function bundleProblems(input: {
  plan: BundlePlan;
  /** Every path the archive lists. */
  listing: readonly string[];
  html: string | null;
  manifest: string | null;
}): string[] {
  const problems: string[] = [];
  const listed = new Set(input.listing);
  const expected = new Set(archiveFiles(input.plan));

  for (const file of expected) {
    if (!listed.has(file)) problems.push(`missing ${file}`);
  }
  for (const file of input.listing) {
    if (!expected.has(file)) problems.push(`unexpected ${file}`);
  }

  if (input.html !== null) {
    for (const ref of rootRefs(input.html)) {
      const path = ref.replace(/^\//, "");
      if (!listed.has(path)) {
        problems.push(`${ref} is named by the page but is not in the archive`);
      }
    }
    for (const file of RUNTIME_FILES) {
      if (!listed.has(file)) {
        problems.push(`${file} is fetched by the game but is not in the archive`);
      }
    }
  }

  if (input.manifest !== null) {
    let manifest: Record<string, unknown> | null = null;
    try {
      manifest = JSON.parse(input.manifest) as Record<string, unknown>;
    } catch {
      problems.push("the manifest is not JSON");
    }
    if (manifest) {
      for (const field of ["id", "start_url", "scope"] as const) {
        if (manifest[field] !== "/") {
          problems.push(`the manifest's ${field} is ${String(manifest[field])}, not "/"`);
        }
      }
    }
    for (const icon of manifestIcons(input.manifest)) {
      if (!icon.startsWith("/")) continue;
      if (!listed.has(icon.replace(/^\//, ""))) {
        problems.push(`the manifest's icon ${icon} is not in the archive`);
      }
    }
  }

  return problems;
}
