/**
 * The one import a documentation capture test uses.
 *
 * The `docShot` fixture is automatic: it reads the test's `doc` annotations,
 * skips a shot that is not taken in this project, and lets
 * `src/lib/docshots/capture.ts` take the picture on the way out — only when the
 * test passed. Nothing else is added to a test.
 */
import { test as base } from "./base";
import { captureDoc, docOf } from "../../src/lib/docshots/capture";

export const test = base.extend<{ docShot: void }>({
  docShot: [
    async ({ page }, use, testInfo) => {
      const doc = docOf(testInfo);
      if (doc?.viewports && !doc.viewports.includes(testInfo.project.name)) {
        testInfo.skip();
      }
      await use();
      if (doc && testInfo.status === "passed") await captureDoc(page, testInfo);
    },
    { auto: true },
  ],
});

export * from "./fixture";
export * from "./docs-library";
export * from "./docs-screens";
export * from "./docs-charts";
export * from "./note-guide";
export * from "./helpers";
