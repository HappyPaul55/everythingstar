/**
 * The manifest: the one artifact the capture side writes and the page side reads.
 *
 * It exists so neither side imports the other. Playwright never renders HTML and
 * Astro never launches a browser; both agree on `players/songs#jukebox` and on
 * `<variant>-<id>.webp`. It is written by `bun run docs:shots`, ignored by Git,
 * and read by the Markdown plugin during a production build.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/** Where the CLI writes it, relative to the repository root. */
export const MANIFEST_PATH = ".docshots/manifest.json";

export interface ShotVariant {
  /** A key of `variants` in `docshots.config.ts`, and a Playwright project name. */
  name: string;
  /** The file inside `outDir`. */
  file: string;
  width: number;
  height: number;
}

/**
 * A crop of one variant's capture.
 *
 * A phone highway is mostly runway: the note a page is about sits near the foot
 * and the rest is empty board. Cropping keeps the note, the hit line and the
 * pads, and drops the space nothing is in. It is applied per variant, because
 * the desktop shot is already the frame the page wants.
 */
export interface ShotCrop {
  edge: "bottom";
  /** How much of the viewport's height to keep, from `edge`. */
  percent: number;
}

export interface Shot {
  /** The document's id, as `src/lib/docs/paths.ts` names it: `players/songs`. */
  doc: string;
  /** The fence's `id`, unique across every document. */
  id: string;
  /** What a screen reader hears. Required: a test title is not a description. */
  alt: string;
  /** The visible caption, when the page shows one. */
  caption?: string;
  /** Per-variant crops, keyed by variant name. */
  crop?: Record<string, ShotCrop>;
  variants: ShotVariant[];
}

export interface Manifest {
  version: 1;
  outDir: string;
  quality: number;
  shots: Record<string, Shot>;
}

export function shotKey(doc: string, id: string): string {
  return `${doc}#${id}`;
}

/** `<variant>-<id>.webp`: the variant first, so a folder sorts by screen. */
export function variantFile(id: string, variant: string): string {
  return `${variant}-${id}.webp`;
}

export function readManifest(root: string): Manifest | null {
  const path = join(root, MANIFEST_PATH);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

export function writeManifest(root: string, manifest: Manifest): void {
  const path = join(root, MANIFEST_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Where a capture sits relative to the document that shows it.
 *
 * Astro resolves a Markdown image against the file, and only a relative path
 * goes through its image pipeline; a `/`-rooted `<img>` would bypass it and ship
 * the capture unoptimised.
 */
export function imageUrl(docPath: string, root: string, outDir: string, file: string): string {
  const target = join(root, outDir, file);
  return relative(dirname(docPath), target).split(/[\\/]/).join("/");
}
