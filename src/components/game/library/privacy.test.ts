import { describe, expect, test } from "bun:test";
import { STORE_NAMES } from "./store";

/**
 * The privacy notice promises what the library keeps, so the database's own
 * store names are read back out of the notice rather than remembered twice.
 */
const privacy = await Bun.file(
  new URL("../../../content/legal/privacy.md", import.meta.url),
).text();

describe("the privacy notice", () => {
  test("names every IndexedDB store the library opens", () => {
    for (const store of STORE_NAMES) {
      expect(privacy).toContain(`\`${store}\``);
    }
  });

  test("counts the stores it names", () => {
    expect(privacy).toContain("four stores");
  });
});
