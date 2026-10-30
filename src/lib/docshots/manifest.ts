/**
 * The manifest: what the capture run wrote, keyed by the shot's id.
 *
 * It exists so a page can show both renders without naming a file. The test is
 * the source of truth for the capture; the page only says `shot:<id>`, and this
 * record says which variants that id produced. Written in `afterEach`, only for
 * a test that passed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export const MANIFEST_PATH = ".docshots/manifest.json";

export interface ShotVariant {
  /** A key of `variants` in `docshots.config.ts`, and a Playwright project name. */
  name: string;
  /** The file inside `outDir`. */
  file: string;
  width: number;
  height: number;
}

export interface Shot {
  variants: ShotVariant[];
}

export interface Manifest {
  version: 1;
  outDir: string;
  quality: number;
  shots: Record<string, Shot>;
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

/** Add (or replace) one variant of one shot. Called once per passing capture. */
export function recordVariant(
  root: string,
  outDir: string,
  quality: number,
  id: string,
  variant: ShotVariant,
): void {
  const manifest = readManifest(root) ?? {
    version: 1 as const,
    outDir,
    quality,
    shots: {},
  };
  const shot = manifest.shots[id] ?? { variants: [] };
  shot.variants = [
    ...shot.variants.filter((entry) => entry.name !== variant.name),
    variant,
  ];
  manifest.shots[id] = shot;
  writeManifest(root, manifest);
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
