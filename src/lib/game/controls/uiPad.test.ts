import { describe, expect, test } from "bun:test";
import {
  UI_BUTTON,
  UI_STICK_DEADZONE,
  UI_STICK_RELEASE,
  uiButtonActions,
  uiDirection,
} from "./uiPad";

function buttons(...pressed: number[]): boolean[] {
  const list = Array.from({ length: 16 }, () => false);
  for (const button of pressed) list[button] = true;
  return list;
}

describe("uiButtonActions", () => {
  test("A, B, Start and the shoulders are UI actions", () => {
    expect(uiButtonActions(buttons(UI_BUTTON.confirm), undefined)).toEqual(["confirm"]);
    expect(uiButtonActions(buttons(UI_BUTTON.back), undefined)).toEqual(["back"]);
    expect(uiButtonActions(buttons(UI_BUTTON.systemBack), undefined)).toEqual(["back"]);
    expect(uiButtonActions(buttons(UI_BUTTON.start), undefined)).toEqual(["start"]);
    expect(uiButtonActions(buttons(UI_BUTTON.pagePrev), undefined)).toEqual(["pagePrev"]);
    expect(uiButtonActions(buttons(UI_BUTTON.pageNext), undefined)).toEqual(["pageNext"]);
  });

  test("a held button is not a second press", () => {
    const held = buttons(UI_BUTTON.confirm);
    expect(uiButtonActions(held, held)).toEqual([]);
  });

  test("fret buttons are not UI actions", () => {
    expect(uiButtonActions(buttons(2, 3, 7), undefined)).toEqual([]);
  });

  test("B and the system Back button are one action", () => {
    expect(uiButtonActions(buttons(UI_BUTTON.back, UI_BUTTON.systemBack), undefined)).toEqual([
      "back",
    ]);
  });
});

describe("uiDirection", () => {
  test("the D-pad is read from its own buttons", () => {
    expect(uiDirection(buttons(UI_BUTTON.up), [])).toBe("up");
    expect(uiDirection(buttons(UI_BUTTON.down), [])).toBe("down");
    expect(uiDirection(buttons(UI_BUTTON.left), [])).toBe("left");
    expect(uiDirection(buttons(UI_BUTTON.right), [])).toBe("right");
  });

  test("the stick has a dead zone", () => {
    expect(uiDirection(buttons(), [UI_STICK_DEADZONE - 0.01, 0])).toBeNull();
    expect(uiDirection(buttons(), [0, UI_STICK_DEADZONE - 0.01])).toBeNull();
    expect(uiDirection(buttons(), [-1, 0])).toBe("left");
    expect(uiDirection(buttons(), [0, 1])).toBe("down");
  });

  test("the stick's stronger axis wins, and a tie is horizontal", () => {
    expect(uiDirection(buttons(), [0.8, 0.2])).toBe("right");
    expect(uiDirection(buttons(), [0.2, 0.9])).toBe("down");
    expect(uiDirection(buttons(), [-0.8, 0.8])).toBe("left");
  });

  test("the D-pad wins over a drifting stick", () => {
    expect(uiDirection(buttons(UI_BUTTON.up), [1, 0])).toBe("up");
  });

  test("a held direction lets go later than it was pressed", () => {
    // Inside the press band but outside the release one: the direction is kept, so
    // a worn stick resting near the threshold cannot twitch the cursor.
    expect(uiDirection(buttons(), [UI_STICK_DEADZONE - 0.01, 0], "right")).toBe("right");
    expect(uiDirection(buttons(), [0, -(UI_STICK_DEADZONE - 0.01)], "up")).toBe("up");
    // Once it is inside the release band the hold is over, and it has to press again.
    expect(uiDirection(buttons(), [UI_STICK_RELEASE - 0.01, 0], "right")).toBeNull();
    expect(uiDirection(buttons(), [0, UI_STICK_RELEASE - 0.01], "up")).toBeNull();
    // The same stick with nothing held is not a direction yet.
    expect(uiDirection(buttons(), [UI_STICK_DEADZONE - 0.01, 0], null)).toBeNull();
  });

  test("a held direction is only kept while the stick stays on its own side", () => {
    // An unpressed drift to the other way is not a turn: it is a release.
    expect(uiDirection(buttons(), [0.5, 0], "left")).toBeNull();
    expect(uiDirection(buttons(), [0, -0.45], "down")).toBeNull();
    // Crossing all the way is the deliberate press of the new direction.
    expect(uiDirection(buttons(), [-0.8, 0], "right")).toBe("left");
  });
});
