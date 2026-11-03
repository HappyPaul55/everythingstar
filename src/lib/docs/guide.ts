/**
 * What the printable guide holds, and where each chapter is.
 *
 * The guide is a book made of the documentation that readers need away from the
 * site: **players**, **charters** and the **notices** (`other/`). The developers'
 * pages are about changing the game and stay online.
 *
 * Pure, like `nav.ts` beside it: the page, the print step and the tests all ask
 * this module the same question, so the table of contents, the chapters and the
 * in-PDF links cannot disagree.
 */

import { docGroups, type DocGroup, type DocSummary } from "./nav";

/** The sections the guide prints, in reading order. */
export const GUIDE_SECTIONS = ["players", "charters", "other"] as const;

/**
 * The guide's chapters, grouped.
 *
 * `docGroups` already sorts each section by the frontmatter `order`, which is the
 * same order the sidebar prints, so a page moved in the docs is moved here too.
 * The developers' section and the hub are dropped: the hub is the guide's
 * introduction, not a chapter.
 */
export function guideGroups(entries: readonly DocSummary[]): DocGroup[] {
  return docGroups(entries).filter((group) =>
    (GUIDE_SECTIONS as readonly string[]).includes(group.section),
  );
}

/**
 * The anchor a chapter is filed under: `players/songs` becomes
 * `doc-players-songs`.
 *
 * The prefix keeps a document's own heading ids from colliding with another
 * document's in one long page — several pages have an "Options" or "Checks"
 * heading — and the print step prefixes the headings themselves with the same
 * value.
 */
export function guideAnchor(id: string): string {
  return `doc-${id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}
