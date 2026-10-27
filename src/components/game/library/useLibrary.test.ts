import { describe, expect, test } from "bun:test";
import type { Song } from "../../../lib/game/song";
import type { RestoredFolder } from "./folder";
import {
  canForget,
  isCurrentRead,
  libraryLoading,
  loadingEntry,
  mergeEntries,
  mergeFolderSources,
  mergeSources,
  nextGeneration,
  pendingReads,
  refreshEntries,
  withoutFolder,
  type Entry,
  type FolderRow,
} from "./useLibrary";

function row(id: string, status: FolderRow["status"] = "ready"): FolderRow {
  return { id, name: id, count: 0, status, locked: false, imported: false };
}

function entry(
  url: string,
  status: Entry["status"] = "ready",
  fresh = false,
  generation = 1,
): Entry {
  return { url, status, at: null, read: null, error: null, fresh, generation };
}

function restored(
  id: string,
  songs: number,
  access: RestoredFolder["access"] = "granted",
): RestoredFolder {
  return {
    id,
    name: id,
    songs: Array.from({ length: songs }, (_, index) => ({ id: `${id}-${index}` }) as Song),
    access,
    imported: false,
  };
}

describe("mergeFolderSources", () => {
  test("a restored folder is added beside a folder picked while it was reading", () => {
    const picked = { row: row("picked", "scanning"), songs: [] };
    const merged = mergeFolderSources(
      [picked],
      [restored("picked", 3), restored("remembered", 2)],
    );

    // The folder on screen was added after the restore read the record, so its row
    // wins; the remembered folder nobody has yet is appended.
    expect(merged.map((entry) => entry.row.id)).toEqual(["picked", "remembered"]);
    expect(merged[0]).toBe(picked);
    expect(merged[1].row).toMatchObject({ count: 2, status: "ready", locked: false });
  });

  test("a restored folder that is still locked says so", () => {
    const merged = mergeFolderSources([], [restored("locked", 1, "prompt")]);
    expect(merged[0].row.locked).toBe(true);
  });
});

describe("canForget", () => {
  test("a ready folder can be forgotten, locked or not", () => {
    // A locked folder is a record whose charts want permission, not a copy being
    // written: its row is `ready`, and forgetting it is safe.
    expect(canForget(row("ready"))).toBe(true);
    expect(canForget({ ...row("locked"), locked: true })).toBe(true);
  });

  test("a folder that is still being copied or read is not forgotten", () => {
    // Forget deletes `imports/<id>/`; doing that under the writer is an import that
    // fails with its bytes already gone.
    expect(canForget(row("copying", "copying"))).toBe(false);
    expect(canForget(row("scanning", "scanning"))).toBe(false);
  });

  test("a reconnect is a walk in progress too", () => {
    expect(canForget({ ...row("busy"), busy: true })).toBe(false);
  });
});

describe("libraryLoading", () => {
  test("a folder still being read keeps the library loading", () => {
    // A big import can spend its first seconds copying and scanning with nothing to
    // list yet: counting only playlists showed the jukebox's empty state over it.
    expect(libraryLoading([], [], [row("scan", "scanning")])).toBe(true);
    expect(libraryLoading([], [], [row("copy", "copying")])).toBe(true);
    // A reconnect is a walk in progress too.
    expect(libraryLoading([], [], [{ ...row("busy"), busy: true }])).toBe(true);
  });

  test("a folder that has answered is not a reason to wait", () => {
    expect(libraryLoading([], [], [row("ready")])).toBe(false);
    // A locked folder is a record whose charts want permission, and a failed
    // reconnect is an answer: both are finished this visit.
    expect(libraryLoading([], [], [{ ...row("locked"), locked: true }])).toBe(false);
    expect(libraryLoading([], [], [{ ...row("failed"), error: "failed" }])).toBe(false);
  });

  test("a playlist or a pinned song still to answer counts too", () => {
    expect(libraryLoading([entry("a", "loading")], [], [])).toBe(true);
    expect(libraryLoading([], [{ status: "loading" }], [])).toBe(true);
    expect(
      libraryLoading([entry("a")], [{ status: "ready" }], [row("ready")]),
    ).toBe(false);
  });
});

describe("withoutFolder", () => {
  test("closing one picker leaves a scan that is still running", () => {
    const first = { row: row("first", "scanning"), songs: [] };
    const second = { row: row("second", "scanning"), songs: [] };
    // A picker that was closed may only remove the row it opened: the first scan is
    // still reading, and a filter on every scanning row would lose it for the visit.
    expect(withoutFolder([first, second], "second").map((entry) => entry.row.id)).toEqual([
      "first",
    ]);
    expect(withoutFolder([first], "absent").map((entry) => entry.row.id)).toEqual(["first"]);
  });
});

describe("pendingReads", () => {
  test("every loading source is picked up once", () => {
    const entries = [entry("a", "loading"), entry("b", "loading")];
    expect(pendingReads(entries, new Map()).map((one) => one.url)).toEqual(["a", "b"]);
  });

  test("a URL already being read is not started again", () => {
    const entries = [entry("a", "loading"), entry("b", "loading")];
    // The first read has not settled yet, so the pass that follows it must not fetch
    // the same playlist a second time.
    expect(pendingReads(entries, new Map([["a", 1]])).map((one) => one.url)).toEqual([
      "b",
    ]);
  });

  test("a source that is not loading is never read", () => {
    const entries = [
      entry("a"),
      entry("b", "cached"),
      entry("c", "failed"),
      entry("d", "disabled"),
      entry("e", "loading"),
    ];
    // A disabled playlist is deliberately out of the library: reading it is work
    // nobody can see.
    expect(pendingReads(entries, new Map()).map((one) => one.url)).toEqual(["e"]);
  });
});

describe("refreshEntries", () => {
  test("one source is refreshed, and the others are left alone", () => {
    const first = entry("first");
    const second = entry("second");
    const [one, two] = refreshEntries([first, second], 2, "first");
    expect(one).toMatchObject({ url: "first", status: "loading", fresh: true });
    expect(one.generation).toBe(2);
    expect(two).toBe(second);
  });

  test("a disabled source is never marked loading", () => {
    const off = entry("off", "disabled");
    // Refresh is not Enable: a playlist that is switched off stays off and is not
    // downloaded behind the player's back.
    expect(refreshEntries([off], 2)[0]).toBe(off);
    expect(refreshEntries([off], 2, "off")[0]).toBe(off);
  });

  test("refresh all leaves the disabled sources off", () => {
    const rows = refreshEntries([entry("on"), entry("off", "disabled")], 2);
    expect(rows.map((one) => one.status)).toEqual(["loading", "disabled"]);
  });

  test("a refresh is a new read even while the old generation is in flight", () => {
    // The initial cached read is still running when Refresh is pressed.
    const first = entry("a", "loading", false, nextGeneration());
    const inFlight = new Map([["a", first.generation]]);
    expect(pendingReads([first], inFlight)).toEqual([]);

    const refreshed = refreshEntries([first], nextGeneration())[0];
    // The row now waits for a newer generation, so the URL being read for the old one
    // does not stop the new read: a press is not swallowed by a read already out.
    expect(refreshed.generation).toBeGreaterThan(first.generation);
    expect(pendingReads([refreshed], inFlight)).toEqual([refreshed]);
    // And it is only started once: once its own generation is the one in flight, the
    // pass that follows it leaves it alone.
    expect(
      pendingReads([refreshed], new Map([["a", refreshed.generation]])),
    ).toEqual([]);
  });

  test("a stale settled entry is discarded by the generation guard", () => {
    const started = entry("a", "loading", true, 4);
    const settled = { ...started, status: "ready" as const, at: 1234 };

    // The row is waiting for a newer answer now: the one that just landed belongs to
    // a row nobody is looking at.
    expect(isCurrentRead({ ...started, generation: 5 }, started)).toBe(false);
    // Still the row that asked, still loading: it takes it.
    expect(isCurrentRead(started, settled)).toBe(true);
    // A row switched off, or one re-added as a different row, takes nothing either.
    expect(isCurrentRead({ ...started, status: "disabled" }, started)).toBe(false);
    expect(isCurrentRead(entry("b", "loading", true, 4), started)).toBe(false);
  });
});

describe("a URL removed and added again", () => {
  test("starts a fresh generation, so the removed row's answer cannot land", () => {
    // A read is out for the row as it was when it was added.
    const before = loadingEntry("a", nextGeneration(), true);
    const afterRemoval = [before].filter((one) => one.url !== "a");
    expect(afterRemoval).toEqual([]);
    // Adding it back asks a new question: the counter has moved on, and it is never
    // reused, so the new row's generation cannot be the removed row's.
    const readded = loadingEntry("a", nextGeneration(), true);
    expect(readded.generation).toBeGreaterThan(before.generation);

    const inFlight = new Map([["a", before.generation]]);
    // The re-added row is read even though a read for the same URL is still running…
    expect(pendingReads([readded], inFlight)).toEqual([readded]);
    // …and the old answer is dropped rather than painted onto the new row.
    const settled = { ...before, status: "ready" as const, at: 1 };
    expect(isCurrentRead(readded, before)).toBe(false);
    expect(isCurrentRead(readded, settled)).toBe(false);
  });

  test("the counter never hands the same generation out twice", () => {
    const first = nextGeneration();
    const second = nextGeneration();
    const third = nextGeneration();
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });
});

describe("merging the seeded list", () => {
  test("a playlist added while storage was being read survives the seeding", () => {
    const added = entry("added", "loading", true);
    expect(mergeSources(["stored"], ["added"])).toEqual(["stored", "added"]);
    expect(mergeEntries([entry("stored", "loading")], [added])).toEqual([
      entry("stored", "loading"),
      added,
    ]);
  });

  test("a URL that is both stored and just added is one row", () => {
    // The added entry is newer than the record, so its read is the one kept.
    const added = entry("both", "loading", true);
    const merged = mergeEntries([entry("both", "disabled")], [added]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(added);
    expect(mergeSources(["both"], ["both"])).toEqual(["both"]);
  });
});
