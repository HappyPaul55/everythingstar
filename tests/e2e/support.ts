/**
 * The one import a documentation capture test uses.
 *
 * `tests/e2e/docs/jukebox.spec.ts` imports `docshot`, `test` and its capture
 * helper from here; the page it belongs to names the id with
 * `[description](shot:jukebox)`.
 */
export { test } from "@playwright/test";
export { docshot } from "../../src/lib/docshots/capture";
export * from "./fixture";
export * from "./docs-library";
export * from "./docs-screens";
export * from "./note-guide";
export * from "./helpers";
