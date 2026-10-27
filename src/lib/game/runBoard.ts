/**
 * The run board's registry: where each run leaves its last word, and how the
 * screen that reads it makes sure the last frame is in hand.
 *
 * Judging lives in refs and is published on a throttle, so a run's final notes
 * can land after the last publish and before the stage unmounts. Each run
 * therefore **registers** a `publishNow` while it is mounted, and `flush()` calls
 * every one of them before the screen changes. The entries stay in a map with no
 * React state behind them, so an ordinary report costs no render; only a flush
 * bumps the revision, which is what tells the results screen its snapshot is
 * current.
 *
 * Pure and framework-free, so the contract — callbacks first, entries second,
 * version once — can be tested without a DOM.
 */

export interface RunBoardRegistry<T extends { key: string }> {
  /** Keep a run's latest entry, replacing an earlier one with the same key. */
  report(entry: T): void;
  /** Register a callback that writes its run's latest ref state. Returns removal. */
  register(publishNow: () => void): () => void;
  /**
   * Write every mounted run's latest state, then announce it once. The callbacks
   * run first, so `entries()` read from a listener already sees the flush.
   */
  flush(): void;
  /** Every entry that has reported, in the order the keys first arrived. */
  entries(): T[];
  /** Forget the last song's runs, for the start of a new one. */
  clear(): void;
  /** Listen for a flush. Reports and clears do not notify. */
  subscribe(listener: () => void): () => void;
  /** The number of flushes so far, for a snapshot keyed on the flush. */
  version(): number;
}

export function createRunBoard<T extends { key: string }>(): RunBoardRegistry<T> {
  const entries = new Map<string, T>();
  const flushers = new Set<() => void>();
  const listeners = new Set<() => void>();
  let revision = 0;

  return {
    report: (entry) => {
      entries.set(entry.key, entry);
    },
    register: (publishNow) => {
      flushers.add(publishNow);
      return () => {
        flushers.delete(publishNow);
      };
    },
    flush: () => {
      // A snapshot, because a callback may unregister another (or itself) as the
      // stage unmounts. Every callback still runs once, in registration order.
      for (const publishNow of Array.from(flushers)) publishNow();
      revision += 1;
      for (const listener of Array.from(listeners)) listener();
    },
    entries: () => [...entries.values()],
    clear: () => {
      entries.clear();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    version: () => revision,
  };
}
