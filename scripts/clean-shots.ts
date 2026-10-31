/**
 * Start a documentation capture run from nothing.
 *
 * Every capture writes its own WebP and its manifest entry, and a full run takes
 * every shot. Beginning empty means a reference to a shot that no test takes any
 * more fails the build instead of showing a picture from yesterday.
 *
 * A one-shot loop does not use this script: run the spec directly
 * (`playwright test tests/e2e/docs/jukebox.spec.ts --project=desktop --project=mobile`).
 */
import { rmSync } from "node:fs";

rmSync("public/docs/test-output", { recursive: true, force: true });
