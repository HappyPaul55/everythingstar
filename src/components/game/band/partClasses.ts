/**
 * Where a part's colour is said, for the marks that carry one.
 *
 * The palette itself (`--part-0`, `--part-1`, `--part-2`) is set once on the
 * melody region and inherited by the lyric lines, the roll's words and the
 * scores, so a duet's second singer reads as their own and a trio of harmonies
 * does too. These are the utilities that read it, written as literals rather
 * than a template because Tailwind only generates a class it can see in the
 * source it scans.
 */

/** The colour of a part's own mark: its tag, its number, its roll of words. */
export const PART_TEXT = [
  "[color:var(--part-0)]",
  "[color:var(--part-1)]",
  "[color:var(--part-2)]",
] as const;

/** The same colour as a rule down the side of a part's block. */
export const PART_RULE = [
  "[border-left-color:var(--part-0)]",
  "[border-left-color:var(--part-1)]",
  "[border-left-color:var(--part-2)]",
] as const;

/**
 * The shape a part's note is drawn in, so the voices are told apart without
 * leaning on colour alone: the lead a rounded bar, the second square ends and
 * the third a pill.
 */
export const PART_SHAPE = ["rounded-inner", "rounded-none", "rounded-pill"] as const;

/** The bar's fill, in that shape. */
export const PART_BAR = [
  "rounded-inner [background:var(--part-0)]",
  "rounded-none [background:var(--part-1)]",
  "rounded-pill [background:var(--part-2)]",
] as const;

/** A part's entry in one of those lists, with the first part as the fallback. */
export function partClass(list: readonly string[], part: number): string {
  return list[part] ?? list[0] ?? "";
}
