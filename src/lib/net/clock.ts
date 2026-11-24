/**
 * The room clock: a server time reference for scheduling a start and reading a
 * host's playhead. The maths is NTP's own, kept pure so it can be tested without
 * a socket.
 */

export interface ClockSample {
  /** The server's estimate minus this browser's `Date.now()`. */
  offsetMs: number;
  /** Round trip, in ms. */
  rttMs: number;
  atMs: number;
}

/** One ping's four timestamps: client send, server receive, server send, client receive. */
export function clockOffset(t0: number, t1: number, t2: number, t3: number): ClockSample | null {
  if (![t0, t1, t2, t3].every((value) => Number.isFinite(value))) return null;
  const offsetMs = ((t1 - t0) + (t2 - t3)) / 2;
  const rttMs = Math.max(0, (t3 - t0) - (t2 - t1));
  return { offsetMs, rttMs, atMs: t3 };
}

/**
 * The best offset from recent samples.
 *
 * The lowest round trip is the least ambiguous one — a sample delayed by a queue
 * tells us less about the clock — so the median of the best third wins. Ties and
 * too few samples fall back to the best single sample or zero.
 */
export function bestClockOffset(samples: readonly ClockSample[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a.rttMs - b.rttMs || b.atMs - a.atMs);
  const take = Math.max(1, Math.ceil(sorted.length / 3));
  const best = sorted.slice(0, take).map((sample) => sample.offsetMs).sort((a, b) => a - b);
  const middle = Math.floor(best.length / 2);
  return best.length % 2 === 1
    ? (best[middle] ?? 0)
    : ((best[middle - 1] ?? 0) + (best[middle] ?? 0)) / 2;
}

export function serverNow(offsetMs: number, localNow = Date.now()): number {
  return localNow + offsetMs;
}

/**
 * A smooth server reference. It keeps a short window of pings, exposes the latest
 * offset and turns a server timestamp into the local `Date.now()` wall clock.
 */
export class ServerClock {
  private samples: ClockSample[] = [];

  add(sample: ClockSample): void {
    this.samples.push(sample);
    if (this.samples.length > 12) this.samples.shift();
  }

  get offsetMs(): number {
    return bestClockOffset(this.samples);
  }

  get rttMs(): number {
    const best = [...this.samples].sort((a, b) => a.rttMs - b.rttMs)[0];
    return best?.rttMs ?? Number.POSITIVE_INFINITY;
  }

  now(localNow = Date.now()): number {
    return serverNow(this.offsetMs, localNow);
  }

  /** How long from now until a server moment, in local ms. */
  until(serverAtMs: number, localNow = Date.now()): number {
    return serverAtMs - this.now(localNow);
  }

  clear(): void {
    this.samples = [];
  }
}
