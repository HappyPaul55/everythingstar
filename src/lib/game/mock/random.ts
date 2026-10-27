/**
 * A tiny seeded PRNG (mulberry32). Deterministic, so a mock run is repeatable —
 * which makes it reviewable and testable. Throwaway with the rest of `mock/`.
 */

/** A generator producing values in [0, 1). The same seed always repeats. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [min, max]. */
export function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

// `hashString` and `hashUnit` are not the mock's business — a simulated player, a
// song's seed and a hero word all want them — so they live in `../hash`.

