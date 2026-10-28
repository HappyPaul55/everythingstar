/**
 * The documentation as a navigation tree.
 *
 * A document's section is its folder and its place in that section is its
 * frontmatter `order`, so the sidebar, the previous/next links and the hub can
 * all be built from the same list without any of them maintaining a second one.
 * Pure and tested.
 */

import { DOC_SECTIONS, type DocSection, docSectionOf } from "./paths";

/** The part of a collection entry this module needs. */
export interface DocSummary {
  id: string;
  data: {
    title: string;
    description: string;
    updated: string;
    order: number;
  };
}

export interface DocGroup {
  section: DocSection;
  docs: DocSummary[];
}

/** Every section that has documents, in the order the site names them. */
export function docGroups(entries: readonly DocSummary[]): DocGroup[] {
  const groups: DocGroup[] = [];
  for (const section of DOC_SECTIONS) {
    const docs = entries
      .filter((entry) => docSectionOf(entry.id) === section)
      .sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
    if (docs.length > 0) groups.push({ section, docs });
  }
  return groups;
}

/** One section's documents, empty for the hub or a stray file. */
function docsInSection(
  entries: readonly DocSummary[],
  section: DocSection | null,
): DocSummary[] {
  if (!section) return [];
  return docGroups(entries).find((group) => group.section === section)?.docs ?? [];
}

/**
 * The documents either side of one, inside its own section.
 *
 * Reading a reference page should not mean going back to the hub, and the ends
 * of a section simply have one side. A document that is not in a section (the
 * hub) has neither.
 */
export function docNeighbours(
  entries: readonly DocSummary[],
  id: string,
): { previous: DocSummary | null; next: DocSummary | null } {
  const docs = docsInSection(entries, docSectionOf(id));
  const at = docs.findIndex((doc) => doc.id === id);
  if (at === -1) return { previous: null, next: null };
  return {
    previous: docs[at - 1] ?? null,
    next: docs[at + 1] ?? null,
  };
}
