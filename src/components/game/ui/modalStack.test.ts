import { afterEach, describe, expect, test } from "bun:test";
import { closeTopDialog, pushDialog, removeDialog, topDialog } from "./modalStack";

/**
 * The stack without a browser: it reads only `open` and `isConnected`, and the
 * closer is the owner's, so a pair of fakes says exactly what a press did.
 */
interface FakeDialog {
  element: HTMLDialogElement;
  calls: () => number;
  close: () => void;
}

function fakeDialog(closes = true): FakeDialog {
  let calls = 0;
  const element = {
    open: true,
    isConnected: true,
  };
  const close = () => {
    calls += 1;
    // A refused close leaves the dialog exactly where it is.
    if (closes) element.open = false;
  };
  return {
    element: element as unknown as HTMLDialogElement,
    calls: () => calls,
    close,
  };
}

/** Every dialog a test pushed, so the module's one stack is empty afterwards. */
const pushed: HTMLDialogElement[] = [];

function stack(dialog: FakeDialog): FakeDialog {
  pushDialog(dialog.element, dialog.close);
  pushed.push(dialog.element);
  return dialog;
}

afterEach(() => {
  for (const element of pushed.splice(0)) removeDialog(element);
});

describe("the dialog stack", () => {
  test("the dialog opened last is the one on top", () => {
    const pause = stack(fakeDialog());
    const practice = stack(fakeDialog());
    expect(topDialog()).toBe(practice.element);
    removeDialog(practice.element);
    expect(topDialog()).toBe(pause.element);
  });

  test("B closes the top dialog through its owner's closer", () => {
    const pause = stack(fakeDialog());
    const practice = stack(fakeDialog());
    expect(closeTopDialog()).toBe(true);
    // The closer ran, not `element.close()` directly: the owner is the one who
    // knows whether the dialog can go.
    expect(practice.calls()).toBe(1);
    expect(pause.calls()).toBe(0);
  });

  test("a refused close consumes the press and closes nothing", () => {
    const busy = stack(fakeDialog(false));
    expect(closeTopDialog()).toBe(true);
    // The press belonged to the dialog, so the screen behind it must not hear it.
    expect(busy.calls()).toBe(1);
    expect(topDialog()).toBe(busy.element);
    expect(busy.element.open).toBe(true);
  });

  test("a dialog that closed, or left the document, is not the top", () => {
    const behind = stack(fakeDialog());
    const gone = stack(fakeDialog());
    gone.element.open = false;
    expect(topDialog()).toBe(behind.element);
    expect(closeTopDialog()).toBe(true);
    expect(behind.calls()).toBe(1);
    expect(gone.calls()).toBe(0);
  });

  test("opening one dialog twice moves it to the top with its new closer", () => {
    const dialog = fakeDialog();
    const replacement = fakeDialog();
    stack(dialog);
    pushDialog(dialog.element, replacement.close);
    expect(topDialog()).toBe(dialog.element);
    expect(closeTopDialog()).toBe(true);
    expect(replacement.calls()).toBe(1);
    // It came off the stack with the close, so the next B belongs to the screen.
    removeDialog(dialog.element);
    expect(closeTopDialog()).toBe(false);
  });

  test("nothing open consumes nothing", () => {
    expect(topDialog()).toBeNull();
    expect(closeTopDialog()).toBe(false);
  });
});
