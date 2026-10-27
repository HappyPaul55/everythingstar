/**
 * The dialogs that are open, in the order they were opened.
 *
 * `<dialog>` owns its own modality — `showModal()` makes the rest of the document
 * inert — but the DOM has no "which one is on top": `document.querySelector
 * ("dialog[open]")` answers with the **first** one in document order. A Practice
 * dialog rendered over a pause is therefore invisible to that question: the pause
 * came first, so the pad would walk the pause's inert controls and B would close
 * the pause, resuming the run underneath the dialog the player was looking at.
 *
 * One ordered list, written by `useModal` (the one place a game dialog opens),
 * is the answer. The last open, connected dialog is the top one; everything that
 * asks "what is the player on?" asks here.
 *
 * Each entry carries the **owner's own closer**. A dialog that refuses to go —
 * an import still copying, a link still being added — must refuse the pad's B
 * exactly as it refuses Escape, the backdrop and its ×, or B leaves the React
 * owner mounted but hidden and an import nobody can stop.
 */
interface StackedDialog {
  element: HTMLDialogElement;
  close: () => void;
}

const open: StackedDialog[] = [];

/**
 * Note a dialog as open. Opening the same element twice moves it to the top
 * rather than listing it twice.
 *
 * `close` is the owner's close, not `element.close()`; left out, the element is
 * closed directly, which is right for a dialog with nothing to guard.
 */
export function pushDialog(element: HTMLDialogElement, close?: () => void): void {
  removeDialog(element);
  open.push({ element, close: close ?? (() => element.close()) });
}

/** Forget a dialog: it closed, or it unmounted while open. */
export function removeDialog(element: HTMLDialogElement): void {
  const at = open.findIndex((entry) => entry.element === element);
  if (at >= 0) open.splice(at, 1);
}

/**
 * The entry on top.
 *
 * An entry that has closed or left the document is skipped rather than trusted:
 * a close can land a frame before React unmounts the screen, and a dialog that is
 * no longer modal must not be handed focus.
 */
function topEntry(): StackedDialog | null {
  for (let at = open.length - 1; at >= 0; at -= 1) {
    const entry = open[at]!;
    if (entry.element.open && entry.element.isConnected) return entry;
  }
  return null;
}

/**
 * The dialog on top — the one the player is looking at, the pad is on and B
 * closes — or null when none is open.
 */
export function topDialog(): HTMLDialogElement | null {
  return topEntry()?.element ?? null;
}

/**
 * Close the dialog on top the way its owner says, answering whether there **was**
 * one. The answer is yes even when the owner refused: the press belonged to the
 * dialog, and falling through to the screen behind it is how B closed a pause
 * under a dialog that would not go.
 */
export function closeTopDialog(): boolean {
  const entry = topEntry();
  if (!entry) return false;
  entry.close();
  return true;
}
