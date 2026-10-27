/**
 * The one-visit cache for `.sng` packages.
 *
 * A package is tens of megabytes and two readers want the same bytes in one visit:
 * the jukebox fetches it to play a row's preview, and the band fetches it again to
 * take its chart and stems. This is the second read in the same visit, **not**
 * persistence — nothing here goes near IndexedDB or localStorage.
 *
 * Two caps hold it: an entry count so a few small packages cannot collect, and a
 * byte budget so one huge one cannot. The index is LRU, and a package larger than
 * the whole byte budget is handed back to its caller but not kept, because holding
 * it would evict everything else and then itself.
 */

/** One package's place in the index. */
export interface SngCacheSlot {
  url: string;
  /** What the package costs, in bytes. */
  size: number;
  /** When it was last loaded or read, ms since the epoch. */
  at: number;
}

export interface SngCacheLimits {
  entries: number;
  bytes: number;
}

/** What a loader hands back: the value, and what keeping it costs. */
export interface SngCacheLoad<T> {
  value: T;
  size: number;
}

/**
 * Two packages, 64 MB. One covers the jukebox's preview and the other covers a
 * song whose band is being opened; a package bigger than 64 MB can still be played,
 * it simply will not be the one that stays.
 */
export const SNG_CACHE_LIMITS: SngCacheLimits = {
  entries: 2,
  bytes: 64 * 1024 * 1024,
};

type Loader<T> = (url: string, signal?: AbortSignal) => Promise<SngCacheLoad<T> | null>;

interface Pending<T> {
  promise: Promise<T | null>;
  controller: AbortController;
  /** How many callers are still waiting; the last one to leave stops the fetch. */
  waiters: number;
}

export class SngCache<T> {
  private slots: SngCacheSlot[] = [];
  private values = new Map<string, T>();
  private pending = new Map<string, Pending<T>>();

  constructor(
    private readonly loader: Loader<T>,
    readonly limits: SngCacheLimits = SNG_CACHE_LIMITS,
  ) {}

  /** The index, least recently used first. */
  get index(): readonly SngCacheSlot[] {
    return this.slots;
  }

  /** A value we already have, marked as used now. */
  get(url: string, at = Date.now()): T | undefined {
    const found = SngCache.find(this.slots, url);
    if (!found) return undefined;
    this.slots = SngCache.touch(this.slots, { ...found, at });
    return this.values.get(url);
  }

  /**
   * A package by URL. A hit does not call the loader; a miss loads it once and
   * stores it. Concurrent callers share the one load.
   *
   * The shared fetch is **not tied to one caller's signal**. A caller that leaves
   * stops waiting at once, and the download is aborted only when the last waiter
   * has gone — so closing the jukebox while the band is opening cannot cancel the
   * bytes the band is waiting for. A caller that has aborted never receives a value.
   */
  async load(url: string, signal?: AbortSignal): Promise<T | null> {
    if (signal?.aborted) return null;
    const hit = this.get(url);
    if (hit !== undefined) return hit;

    const current = this.pending.get(url);
    // A pending promise whose last waiter has left is already being aborted;
    // joining it would only hand the new caller the cancellation. Start again.
    const pending =
      current && !current.controller.signal.aborted ? current : this.start(url);
    return this.wait(pending, signal);
  }

  /** Forget everything, and stop anything still loading. */
  clear(): void {
    this.slots = [];
    this.values.clear();
    for (const pending of this.pending.values()) pending.controller.abort();
    this.pending.clear();
  }

  private start(url: string): Pending<T> {
    const controller = new AbortController();
    const pending: Pending<T> = {
      promise: Promise.resolve(null),
      controller,
      waiters: 0,
    };
    pending.promise = (async () => {
      try {
        const loaded = await this.loader(url, controller.signal);
        // A fetch nobody is waiting for any more is not a cached one.
        if (!loaded || controller.signal.aborted) return null;
        this.remember(url, loaded);
        return loaded.value;
      } catch {
        return null;
      } finally {
        // Do not delete a newer pending for this URL that a fresh load created.
        if (this.pending.get(url) === pending) this.pending.delete(url);
      }
    })();
    this.pending.set(url, pending);
    return pending;
  }

  private wait(pending: Pending<T>, signal?: AbortSignal): Promise<T | null> {
    pending.waiters += 1;
    return new Promise<T | null>((resolve) => {
      let settled = false;
      const settle = (value: T | null) => {
        if (settled) return;
        settled = true;
        pending.waiters -= 1;
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        pending.waiters -= 1;
        signal?.removeEventListener("abort", onAbort);
        if (pending.waiters <= 0) pending.controller.abort();
        resolve(null);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      pending.promise.then((value) => settle(signal?.aborted ? null : value));
    });
  }

  private remember(url: string, loaded: SngCacheLoad<T>): void {
    const fit = SngCache.put(
      this.slots,
      { url, size: loaded.size, at: Date.now() },
      this.limits,
    );
    this.slots = [...fit.kept];
    for (const gone of fit.dropped) this.values.delete(gone);
    if (this.slots.some((entry) => entry.url === url)) this.values.set(url, loaded.value);
  }

  /* ----------------------------------------------------- pure bookkeeping */

  /** The slot for a URL, without changing its age. */
  static find(index: readonly SngCacheSlot[], url: string): SngCacheSlot | undefined {
    return index.find((entry) => entry.url === url);
  }

  /** Move a slot to the recent end, or add it there. */
  static touch(index: readonly SngCacheSlot[], slot: SngCacheSlot): SngCacheSlot[] {
    return [...index.filter((entry) => entry.url !== slot.url), { ...slot }];
  }

  /** Everything that fits both caps, dropping the least recently used first. */
  static evict(
    index: readonly SngCacheSlot[],
    limits: SngCacheLimits = SNG_CACHE_LIMITS,
  ): { kept: SngCacheSlot[]; dropped: string[] } {
    const kept = [...index];
    const dropped: string[] = [];
    let bytes = kept.reduce((sum, entry) => sum + entry.size, 0);
    while (kept.length > 0 && (kept.length > limits.entries || bytes > limits.bytes)) {
      const oldest = kept.shift();
      if (!oldest) break;
      dropped.push(oldest.url);
      bytes -= oldest.size;
    }
    return { kept, dropped };
  }

  /**
   * Put a slot in and evict whatever no longer fits. A package larger than the
   * whole byte budget is not admitted: it is named in `dropped` so the caller does
   * not keep its value, but the packages already there are left alone.
   */
  static put(
    index: readonly SngCacheSlot[],
    slot: SngCacheSlot,
    limits: SngCacheLimits = SNG_CACHE_LIMITS,
  ): { kept: SngCacheSlot[]; dropped: string[] } {
    if (slot.size > limits.bytes || limits.entries < 1) {
      return { kept: [...index], dropped: [slot.url] };
    }
    return SngCache.evict(SngCache.touch(index, slot), limits);
  }
}
