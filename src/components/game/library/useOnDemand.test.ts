import { describe, expect, test } from "bun:test";
import { blankRecord, readRecord, writeRecord } from "./useOnDemand";

/**
 * A record keyed by player input, held to its one rule: a query is a key.
 *
 * The queries below are the names a plain `{}` answers from `Object.prototype`,
 * which is how `constructor` once came back as a function and `new Set(...)` threw
 * while the jukebox rendered.
 */
const HOSTILE = ["constructor", "toString", "__proto__"];

describe("a record keyed by player input", () => {
  test("an empty record inherits nothing", () => {
    const record = blankRecord<string[]>();
    expect(Object.getPrototypeOf(record)).toBeNull();
    for (const key of HOSTILE) expect(readRecord(record, key)).toBeUndefined();
  });

  test("`constructor`, `toString` and `__proto__` are keys, not members", () => {
    let record = blankRecord<string[]>();
    for (const key of HOSTILE) record = writeRecord(record, key, [key]);
    for (const key of HOSTILE) {
      expect(new Set(readRecord(record, key) ?? [])).toEqual(new Set([key]));
    }
  });

  test("writing keeps the record free of inherited keys", () => {
    // A spread with `...current` would give the result `Object.prototype` again,
    // and an unasked query would read `Array` out of it.
    let record = blankRecord<string[]>();
    record = writeRecord(record, "verse", ["one"]);
    expect(Object.getPrototypeOf(record)).toBeNull();
    expect(readRecord(record, "not-asked")).toBeUndefined();
    // `__proto__` is written as an ordinary own key, never as a prototype.
    record = writeRecord(record, "__proto__", ["two"]);
    expect(readRecord(record, "__proto__")).toEqual(["two"]);
    expect(Object.getPrototypeOf(record)).toBeNull();
  });

  test("a search state can be built from any query without a throw", () => {
    // What the hook does with the record: `new Set(ids)` where `ids` may once
    // have been the inherited `constructor` or `Array`.
    let ids = blankRecord<string[]>();
    ids = writeRecord(ids, "hello", ["song-1"]);
    for (const key of HOSTILE) {
      expect(() => new Set(readRecord(ids, key) ?? [])).not.toThrow();
    }
    expect(new Set(readRecord(ids, "hello") ?? [])).toEqual(new Set(["song-1"]));
  });
});
