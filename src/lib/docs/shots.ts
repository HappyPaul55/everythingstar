/**
 * A page's shot reference, rendered.
 *
 * The page says `[the description](shot:jukebox "caption")`; this reads the
 * manifest the capture run wrote and replaces the paragraph with the figure —
 * one `<details>` per variant, a real mdast `image` for each (so Astro still
 * copies, hashes and sizes the WebP), and no JavaScript.
 *
 * The test that took the picture lives in `tests/e2e/docs`, named by the same
 * id. This side never runs a browser; the other side never renders HTML.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MdastContent, MdastPluginDefinition } from "satteri";
import { MANIFEST_PATH, imageUrl, type Manifest, type Shot } from "../docshots/manifest";
import { docIdFromPath } from "./paths";

export interface DocsShotsOptions {
  /** Absolute repository root. */
  root: string;
  /** A dev server (or the PWA preview): an uncaptured reference is a placeholder. */
  allowPlaceholder: boolean;
}

// The manifest is rewritten by every capture; a dev server outlives that, so the
// cache is the file's mtime rather than "read once".
let cache: { mtime: number; manifest: Manifest } | null = null;

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

function frame(
  shot: Shot,
  alt: string,
  caption: string | undefined,
  docPath: string,
  root: string,
  outDir: string,
): MdastContent[] {
  const images = shot.variants.map((variant): MdastContent => {
    const url = imageUrl(docPath, root, outDir, variant.file);
    return { type: "paragraph", children: [{ type: "image", url, alt }] };
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
      value: caption
        ? `<figcaption>${escapeHtml(caption)}</figcaption></figure>`
        : "</figure>",
    },
  ];
}

export function docsShots({
  root,
  allowPlaceholder,
}: DocsShotsOptions): MdastPluginDefinition {
  return {
    name: "docs-shots",
    link(node, ctx) {
      if (!node.url.startsWith("shot:")) return;

      const id = node.url.slice("shot:".length).trim();
      if (!/^[a-z][a-z0-9-]*$/.test(id)) {
        ctx.report({ message: `"shot:${id}" is not a shot id`, severity: "error" });
        return;
      }

      // The reference must be a paragraph of its own: the figure is a block, and
      // a link on the end of a sentence cannot become one.
      const parent = ctx.parent(node);
      if (!parent || parent.type !== "paragraph" || parent.children.length !== 1) {
        ctx.report({
          message: `[${ctx.textContent(node)}](shot:${id}) must be a paragraph of its own`,
          severity: "error",
        });
        return;
      }

      const alt = ctx.textContent(node).trim();
      if (!alt) {
        ctx.report({ message: `shot:${id} needs link text for its alt`, severity: "error" });
        return;
      }

      const fileURL = ctx.fileURL;
      if (!fileURL) return;
      const docPath = fileURLToPath(fileURL);
      if (!docIdFromPath(docPath)) return;

      const manifest = readAt(root);
      const shot = manifest?.shots[id];
      if (!shot || shot.variants.some((variant) => !existsSync(join(root, manifest.outDir, variant.file)))) {
        const message = `shot:${id} has no capture — run \`bun run docs:shots\``;
        if (allowPlaceholder) {
          ctx.replaceNode(parent, {
            type: "html",
            value: `<p class="doc-shot doc-shot--missing"><strong>Screenshot not generated.</strong> Run <code>bun run docs:shots</code>.</p>`,
          });
        } else {
          ctx.report({ message, severity: "error" });
        }
        return;
      }

      ctx.replaceNode(
        parent,
        frame(shot, alt, node.title ?? undefined, docPath, root, manifest.outDir),
      );
    },
  };
}
