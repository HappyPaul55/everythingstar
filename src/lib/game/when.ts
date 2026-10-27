/**
 * When something happened, short enough to sit in a list row — a run played, a
 * playlist fetched.
 *
 * The locale is named rather than left to the browser, for the same reason
 * `formatScore` names it: one date, whichever machine it is read on.
 */
export function shortDate(at: number): string {
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
