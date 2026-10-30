// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import { satteri } from "@astrojs/markdown-satteri";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { readVersion } from "./scripts/version.ts";
import { docIdFromPath, resolveDocLink } from "./src/lib/docs/paths.ts";
import { docsShots } from "./src/lib/docs/shots.ts";

const buildVersion = readVersion();

/**
 * A relative `*.md` link in the documentation is rewritten to the route the site
 * builds for that document.
 *
 * The files are read by GitHub too, where a relative link is the only one that
 * works — so the source keeps GitHub's form and the build translates it. The
 * rules live in `src/lib/docs/paths.ts` (pure, tested); this is the four lines
 * that hand it the document being compiled.
 *
 * @type {import("satteri").MdastPluginDefinition}
 */
const docsLinks = {
  name: "docs-links",
  link(node, ctx) {
    if (!ctx.fileURL) return;
    const id = docIdFromPath(fileURLToPath(ctx.fileURL));
    if (!id) return;
    const target = resolveDocLink(id, node.url);
    if (target !== node.url) ctx.setProperty(node, "url", target);
  },
};

export default defineConfig({
  site: "https://everythingstar.happypaul55.com",
  // The dev toolbar is a floating overlay at the foot of every page, and the
  // documentation captures run against the dev server: it would be in every
  // screenshot. The repo has its own accessibility and browser gates.
  devToolbar: { enabled: false },
  build: {
    format: "file",
    inlineStylesheets: "always",
  },
  trailingSlash: "never",
  integrations: [
    // `/play` is the product, not a stray app route: it is indexable (its head
    // says so) and it is the page somebody searching for the game should land
    // on, so it belongs in the sitemap. `/app` is the game-only embed used by
    // the native app; it is noindex and has no site furniture, so it stays out
    // with the error pages.
    sitemap({
      filter: (page) => !/^https?:\/\/[^/]+\/(?:app|arcade|embed|open|charter|404|500)\/?$/.test(page),
    }),
    react(),
  ],
  markdown: {
    // The docs have tables, code and commands; the light theme is the paper
    // page's. Everything the game itself shows is components, not Markdown.
    shikiConfig: { theme: "github-light" },
    processor: satteri({
      mdastPlugins: [
        docsLinks,
        // A capture fence becomes the image `bun run docs:shots` took for it. In
        // a build an ungenerated fence is an error; in dev it is a placeholder,
        // so `bun run dev` works on a checkout that has never run Playwright.
        docsShots({
          root: fileURLToPath(new URL(".", import.meta.url)),
          // `test:pwa` builds the site without the capture run — its subject is
          // the installed game, not a documentation page — and asks for the
          // placeholder instead of failing. The build scripts set
          // `DOCSHOTS_BUILD=1`; neither a dev server nor `astro check` is a build.
          strict:
            process.env.DOCSHOTS_BUILD === "1" &&
            process.env.DOCSHOTS_PLACEHOLDER !== "1",
        }),
      ],
    }),
  },
  vite: {
    define: { __BUILD_VERSION__: JSON.stringify(buildVersion) },
    plugins: [tailwindcss()],
  },
});
