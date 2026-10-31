/**
 * The shape of `docshots.config.ts`.
 *
 * Pure: no Astro, no Playwright, no filesystem. The same object is read by the
 * capture tests (`tests/e2e/docs`) and by the Playwright config, which is why
 * the variant names can be trusted as Playwright project names.
 */

export interface Viewport {
  width: number;
  height: number;
}

/**
 * What one variant changes about the browser.
 *
 * A subset of Playwright's own `use` options, deliberately: a project per
 * variant is Playwright's answer to "the same test on several screens", and
 * anything else a project may set is better set in `playwright.config.ts` than
 * invented here.
 */
export interface VariantOptions {
  viewport: Viewport;
  isMobile?: boolean;
  hasTouch?: boolean;
  deviceScaleFactor?: number;
}

export interface DocshotsConfig {
  /** Where captures are written, relative to the repository root. */
  outDir: string;
  /** WebP quality, 1–100. */
  quality: number;
  /** One Playwright project each; the keys are the labels the page shows. */
  variants: Record<string, VariantOptions>;
  /**
   * Shots captured in only some variants, keyed by shot id.
   *
   * The page renders the variants listed here even before the capture run has
   * written them; the build no longer has to wait for the browser to know which
   * images the page will name. Omitted means every variant.
   */
  shots?: Record<string, string[]>;
}

const NAME = /^[a-z][a-z0-9-]*$/;

/**
 * Validate and return the config.
 *
 * The failures are the ones that would otherwise surface as a mysterious empty
 * directory: a variant name Playwright cannot use as a project, a viewport of
 * zero, an `outDir` that escapes the repository.
 */
export function defineDocshots(config: DocshotsConfig): DocshotsConfig {
  const names = Object.keys(config.variants);
  if (names.length === 0) throw new Error("docshots: at least one variant is required");

  for (const name of names) {
    if (!NAME.test(name)) {
      throw new Error(`docshots: variant "${name}" must be lower-case words joined by -`);
    }
    const { width, height } = config.variants[name]!.viewport;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error(`docshots: variant "${name}" needs a positive integer viewport`);
    }
  }

  if (config.outDir.startsWith("/") || config.outDir.split("/").includes("..")) {
    throw new Error("docshots: outDir must be a path inside the repository");
  }
  if (!Number.isInteger(config.quality) || config.quality < 1 || config.quality > 100) {
    throw new Error("docshots: quality must be an integer from 1 to 100");
  }

  for (const [id, variants] of Object.entries(config.shots ?? {})) {
    if (!NAME.test(id)) {
      throw new Error(`docshots: shot "${id}" must be lower-case words joined by -`);
    }
    if (variants.length === 0) {
      throw new Error(`docshots: shot "${id}" must name at least one variant`);
    }
    for (const variant of variants) {
      if (!names.includes(variant)) {
        throw new Error(`docshots: shot "${id}" names unknown variant "${variant}"`);
      }
    }
  }

  return config;
}
