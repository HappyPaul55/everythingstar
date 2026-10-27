// @ts-check
import { execFileSync } from "node:child_process";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

const buildVersion = (() => {
  try {
    return execFileSync("git", ["describe", "--tags", "--always"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "dev";
  }
})();

export default defineConfig({
  site: "https://everythingstar.happypaul55.com",
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
      filter: (page) => !/\/(?:app|arcade|embed|open|404|500)\/?$/.test(page),
    }),
    react(),
  ],
  vite: {
    define: { __BUILD_VERSION__: JSON.stringify(buildVersion) },
    plugins: [tailwindcss()],
  },
});
