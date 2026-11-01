/**
 * The whole English dictionary: the merge the Astro pages and the tests read.
 *
 * The game island imports only `enGame`; the charter imports `enCharter`. Keeping
 * the three files apart is what keeps the docs/charter strings out of /play's first
 * download.
 */
import { enCharterOnly } from "./en.charter";
import { enGame } from "./en.game";
import { enSite } from "./en.site";

export const en = { ...enGame, ...enSite, ...enCharterOnly };

/** Every key the site can ask for. */
export type MessageKey = keyof typeof en;

