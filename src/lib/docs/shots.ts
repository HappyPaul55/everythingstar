/**
 * Markdown in, a captured screen out.
 *
 * A fence is replaced by a real mdast `image`, not a raw `<img>`: Astro's image
 * pipeline is what copies, hashes and sizes the capture (the same path a
 * hand-written `![…](../screenshots/x.webp)` takes). The raw HTML around it is
 * only the frame — one `<details>` per variant, so the selector needs no
 * JavaScript and the page keeps its "no island" promise.
 *
 * The paths come from the **config and the fence**, not the manifest: the
 * manifest is the capture side's business, and a build that read it could ship a
 * stale placeholder when the two disagreed. A missing file in a build is Astro's
 * own `ImageNotFound`, which names the path; only a dev server, told to allow it,
 * draws a placeholder.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MdastContent, MdastPluginDefinition } from "satteri";
import docshots from "../../../docshots.config";
import { parseFenceMeta } from "../docshots/fence";
import { imageUrl, variantFile } from "../docshots/manifest";
import { docIdFromPath } from "./paths";

export interface DocsShotsOptions {
  /** Absolute repository root. */
  root: string;
  /** A dev server: a capture that is not on disk yet is a visible placeholder. */
  allowPlaceholder: boolean;
}

interface FrameShot {
  id: string;
  alt: string;
  caption?: string;
  variants: { name: string }[];
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
  shot: FrameShot,
  docPath: string,
  root: string,
  outDir: string,
): MdastContent[] {
  const images = shot.variants.map((variant): MdastContent => {
    const file = variantFile(shot.id, variant.name);
    const url = imageUrl(docPath, root, outDir, file);
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

export function docsShots({
  root,
  allowPlaceholder,
}: DocsShotsOptions): MdastPluginDefinition {
  return {
    name: "docs-shots",
    code(node, ctx) {
      if (node.lang !== "ts" && node.lang !== "typescript") return;
      const meta = parseFenceMeta(node.meta ?? "");
      if (!meta.id) return;

      const fileURL = ctx.fileURL;
      if (!fileURL) return;
      const docPath = fileURLToPath(fileURL);
      const doc = docIdFromPath(docPath);
      if (!doc) return;

      const names = meta.viewports
        ? meta.viewports.split(",").map((name) => name.trim())
        : Object.keys(docshots.variants);
      const variants = names
        .filter((name) => docshots.variants[name])
        .map((name) => ({ name }));
      if (variants.length === 0) return;

      const missing = variants.some(
        (variant) =>
          !existsSync(join(root, docshots.outDir, variantFile(meta.id, variant.name))),
      );
      if (missing && allowPlaceholder) {
        ctx.replaceNode(node, {
          type: "html",
          value: `<p class="doc-shot doc-shot--missing"><strong>Screenshot not generated.</strong> Run <code>bun run docs:shots</code>.</p>`,
        });
        return;
      }

      ctx.replaceNode(
        node,
        frame(
          {
            id: meta.id,
            alt: meta.alt ?? "",
            ...(meta.caption ? { caption: meta.caption } : {}),
            variants,
          },
          docPath,
          root,
          docshots.outDir,
        ),
      );
    },
  };
}
