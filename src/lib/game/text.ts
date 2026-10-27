/**
 * Small text helpers shared by the readers, the writers and the fixtures.
 *
 * Both rules are deliberately **no-fallback**: an empty name has no slug, and a
 * path with no slash has no directory. Only the caller knows what a missing name
 * means in its own context ("song", "folder"), so it adds that itself.
 */

/**
 * A name as an id: lower-case, every run of anything that is not a letter or a
 * digit becomes one hyphen, and no hyphen is left at either end.
 *
 * "A letter" is Unicode's, not ASCII's: `Zürich` is `zürich` and `Café` is
 * `café`, because their letters *are* letters and cutting them out would make the
 * id a different word from the name. NFC first, so a decomposed `e` + acute and a
 * precomposed `é` are one letter in the id as they are on screen.
 *
 * The result may be empty — punctuation alone is not a name. Callers that need
 * one add their own fallback rather than inheriting somebody else's word.
 */
export function slug(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}

/** The last segment of a `/`-separated path, or the path itself when it has none. */
export function basename(path: string): string {
  const at = path.lastIndexOf("/");
  return at < 0 ? path : path.slice(at + 1);
}
