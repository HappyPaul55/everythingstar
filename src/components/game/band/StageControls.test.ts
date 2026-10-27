import { describe, expect, test } from "bun:test";
import type { LearnDevice } from "./StageControls";

/**
 * A learn session's device, as plain data. The route reads `device.index` to know
 * which pad a button belongs to, so a pad session must always name one.
 */
describe("a learn session's device", () => {
  test("a pad is named by its own index — there is no 'still being found'", () => {
    const chosen: LearnDevice = { on: "pad", index: 2 };
    expect(chosen.index).toBe(2);

    // The old shape allowed `index: null` for a pad the browser had not reported,
    // and every branch that handled it was dead: the gear names the pad a session
    // listens to (`learnDevice`), so there is no unknown pad to discover.
    // @ts-expect-error a pad session always knows which pad it is listening to
    const unnamed: LearnDevice = { on: "pad", index: null };
    expect(unnamed.on).toBe("pad");
  });
});
