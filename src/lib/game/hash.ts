/**
 * A stable hash of a string.
 *
 * Determinism without state: a note's id hashes to the same number on every machine
 * and every reload, which is what lets a simulated player, a song's seed and a hero
 * word all be *decided* rather than stored. Pure, so it is unit-tested.
 */

/** A stable 32-bit hash of a string. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // FNV alone leaves near-identical strings clustered; this spreads them out, so
  // `note-0` and `note-1` land far apart.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** A stable value in [0, 1) for a string. */
export function hashUnit(value: string): number {
  return hashString(value) / 4294967296;
}
