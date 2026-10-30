/**
 * The one import a documentation fence uses.
 *
 * A fence is written in `docs/`, where the generated spec and its `./support`
 * shim do not exist. It imports `@docshots/support` instead: `tsconfig.json`
 * maps that name here, so an editor resolves it from the Markdown, and the
 * capture generator rewrites the import to `./support` beside the spec it
 * writes. One name, the same surface in both places.
 */
export { expect, test } from "@playwright/test";
export * from "./fixture";
export * from "./docs-library";
export * from "./docs-screens";
export * from "./note-guide";
export * from "./helpers";
