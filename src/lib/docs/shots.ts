/**
 * Markdown in, a captured screen out.
 *
 * A fence is replaced by a real mdast `image`, not a raw `<img>`: Astro's image
 * pipeline is what copies, hashes and sizes the capture (the same path a
 * hand-written `![…](../screenshots/x.webp)` takes). The raw HTML around it is
 * only the frame — one `<details>` per variant, so the selector needs no
 * JavaScript and the page keeps its "no island" promise.
 *
 * The manifest is read, never Playwright: a production build with no capture for
 * a fence fails here rather than shipping a placeholder.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MdastContent, MdastPluginDefinition } from "satteri";
import { parseFenceMeta } from "../docshots/fence";
import { MANIFEST_PATH, imageUrl, shotKey, type Manifest, type Shot } from "../docshots/manifest";
import { docIdFromPath } from "./paths";

export interface DocsShotsOptions {
  /** Absolute repository root. */
  root: string;
  /** A build: a missing capture is an error. In dev it is a visible placeholder. */
  strict: boolean;
}

function readAt(root: string): Manifest | null {
  const path = join(root, MANIFEST_PATH);
  try {
    const mtime = statSync(path).mtimeMs;
    if (cache?.mtime !== mtime) {
      cache = { mtime, manifest: JSON.parse(readFileSync(path, "utf8")) as Manifest };
    }
    return cache.manifest;
  } catch {
    return null;
  }
}

// The manifest changes between a capture run and the build that reads it, and a
// dev server outlives both; cache on the file's mtime rather than forever.
let cache: { mtime: number; manifest: Manifest } | null = null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function label(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function frame(shot: Shot, docPath: string, root: string, outDir: string): MdastContent[] {
  const images = shot.variants.map((variant): MdastContent => {
    const url = imageUrl(docPath, root, outDir, variant.file);
    return { type: "paragraph", children: [{ type: "image", url, alt: shot.alt }] };
  });

  // One variant needs no selector: a lone "Desktop" disclosure is furniture that
  // hides the only picture a reader came for.
  const variants =
    shot.variants.length === 1
      ? images
      : shot.variants.flatMap((variant, index): MdastContent[] => [
          {
            type: "html",
            value: `<details class="doc-shot__variant"${index === 0 ? " open" : ""}><summary>${label(variant.name)}</summary>`,
          },
          images[index]!,
          { type: "html", value: "</details>" },
        ]);

  return [
    { type: "html", value: '<figure class="doc-shot">' },
    ...variants,
    {
      type: "html",
      value: shot.caption
        ? `<figcaption>${escapeHtml(shot.caption)}</figcaption></figure>`
        : "</figure>",
    },
  ];
}

export function docsShots({ root, strict }: DocsShotsOptions): MdastPluginDefinition {
  return {
    name: "docs-shots",
    code(node, ctx) {
      if (node.lang !== "ts" && node.lang !== "typescript") return;
      const meta = parseFenceMeta(node.meta ?? "");
      if (!meta.id) return;

      const fileURL = ctx.fileURL;
      if (!fileURL) return;
      const doc = docIdFromPath(fileURLToPath(fileURL));
      if (!doc) return;

      const manifest = readAt(root);
      const shot = manifest?.shots[shotKey(doc, meta.id)];
      // The manifest is written before the browser runs, so a capture that has
      // not been taken yet is a file that does not exist. In dev that is a
      // placeholder — the dev server must not fail a page for the picture the
      // capture run is about to make.
      if (
        !shot ||
        !manifest ||
        shot.variants.some((variant) => !existsSync(join(root, manifest.outDir, variant.file)))
      ) {
        const message = `${doc}:${node.position?.start.line ?? 0}: no capture for "${meta.id}" — run \`bun run docs:shots\``;
        if (strict) throw new Error(message);
        ctx.replaceNode(node, {
          type: "html",
          value: `<p class="doc-shot doc-shot--missing"><strong>Screenshot not generated.</strong> Run <code>bun run docs:shots</code>.</p>`,
        });
        return;
      }

      ctx.replaceNode(node, frame(shot, fileURLToPath(fileURL), root, manifest.outDir));
    },
  };
}
