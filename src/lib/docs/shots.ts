/**
 * A page's shot reference, rendered.
 *
 * The page says `[the description](shot:jukebox "caption")`; this replaces the
 * paragraph with the figure: one `<details>` per configured variant, and a plain
 * image for a shot taken in one shape only.
 *
 * The build runs **before** the capture tests in CI, so it cannot ask whether the
 * WebP exists. It writes the tags for the variants `docshots.config.ts` promises;
 * the e2e shards fill those files, and `scripts/check-docs.ts` fails if one is
 * missing. A dev server or the PWA's throwaway build still gets a placeholder
 * when nothing has been captured yet.
 *
 * The test lives in `tests/e2e/docs` with `annotation: [{ type: "doc",
 * description: "jukebox" }]`; there is no manifest and no generated code. The
 * capture directory is under `public/`, so the image is served as written.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MdastContent, MdastPluginDefinition } from "satteri";
import docshots from "../../../docshots.config";
import { docIdFromPath } from "./paths";

export interface DocsShotsOptions {
  /** Absolute repository root. */
  root: string;
  /** A dev server (or the PWA preview): an uncaptured reference is a placeholder. */
  allowPlaceholder: boolean;
}

interface VariantImage {
  name: string;
  file: string;
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

/** The variants this shot promises, in the config's order. */
function variantsOf(id: string): VariantImage[] {
  const names = docshots.shots?.[id] ?? Object.keys(docshots.variants);
  return names.map((name) => ({ name, file: `${id}-${name}.webp` }));
}

/** The variants already on disk, for a dev server or a throwaway build. */
function filesOf(root: string, id: string): VariantImage[] {
  return variantsOf(id).filter((entry) =>
    existsSync(join(root, docshots.outDir, entry.file)),
  );
}

/** Where a file in `public/` is served from. */
function publicUrl(file: string): string {
  return `/${docshots.outDir.replace(/^public\//, "")}/${file}`;
}

function frame(
  variants: VariantImage[],
  alt: string,
  caption: string | undefined,
): MdastContent[] {
  const images = variants.map(
    (variant): MdastContent => ({
      type: "paragraph",
      children: [
        { type: "image", url: publicUrl(variant.file), alt },
      ],
    }),
  );

  // One variant needs no selector: a lone "Desktop" disclosure is furniture that
  // hides the only picture a reader came for.
  const body =
    variants.length === 1
      ? images
      : variants.flatMap((variant, index): MdastContent[] => [
          {
            type: "html",
            value: `<details class="doc-shot__variant"${index === 0 ? " open" : ""}><summary>${label(variant.name)}</summary>`,
          },
          images[index]!,
          { type: "html", value: "</details>" },
        ]);

  return [
    { type: "html", value: '<figure class="doc-shot">' },
    ...body,
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

      const existing = filesOf(root, id);
      if (existing.length === 0 && allowPlaceholder) {
        ctx.replaceNode(parent, {
          type: "html",
          value: `<p class="doc-shot doc-shot--missing"><strong>Screenshot not generated.</strong> Run <code>bun run docs:shots</code>.</p>`,
        });
        return;
      }

      // A build renders every promised variant even before the captures exist;
      // the e2e run fills them and `check:docs` proves the files arrived. A dev
      // server still renders only what is on disk.
      const variants = allowPlaceholder ? existing : variantsOf(id);
      ctx.replaceNode(parent, frame(variants, alt, node.title ?? undefined));
    },
  };
}
