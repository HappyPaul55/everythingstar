/**
 * The four audiences, as the site names them.
 *
 * The sections are folders (`src/lib/docs/paths.ts`), and these are the labels
 * and one-line descriptions the sidebar and the hub print. Keys rather than
 * strings so a second locale translates the frame before the documents.
 */

import type { MessageKey } from "../../i18n";
import type { DocSection } from "./paths";

export const SECTION_LABELS: Record<DocSection, MessageKey> = {
  players: "docs.section.players",
  charters: "docs.section.charters",
  developers: "docs.section.developers",
  other: "docs.section.other",
};

export const SECTION_LEDES: Record<DocSection, MessageKey> = {
  players: "docs.playersLede",
  charters: "docs.chartersLede",
  developers: "docs.developersLede",
  other: "docs.otherLede",
};
