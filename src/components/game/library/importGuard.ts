/**
 * One import's claim on the Playlists dialog.
 *
 * A drop is accepted the moment its files land, before the directory tree is
 * walked — a walk can take a while, and a dialog that is not busy during it can
 * be closed, leaving the walk to resolve into a copy nobody can see or stop.
 * So the dialog is claimed **synchronously** when a drop arrives, and that claim
 * is what refuses a second import and a close.
 *
 * The `epoch` names the attempt. A walk that resolves after the dialog has gone
 * holds a claim nobody owns any more, so it disbands rather than starting a copy.
 * Everything here is pure: the dialog keeps the claim in a ref and the helpers
 * hand back the next one.
 */
export interface ImportClaim {
  /** Which attempt holds the dialog; a cancelled attempt is never reused. */
  epoch: number;
  /** An import is walking or copying, so the dialog may not close. */
  busy: boolean;
}

/** A dialog with nothing in flight. */
export const NO_IMPORT: ImportClaim = { epoch: 0, busy: false };

/**
 * Claim the dialog for one attempt, or null while one is already running.
 *
 * This is the one-import-at-a-time rule: a file input, a folder input and a
 * drop all ask here, so whichever is first owns the row and the progress line.
 */
export function claimImport(current: ImportClaim): ImportClaim | null {
  if (current.busy) return null;
  return { epoch: current.epoch + 1, busy: true };
}

/** Is `epoch` still the attempt holding the dialog? */
export function ownsImport(current: ImportClaim, epoch: number): boolean {
  return current.busy && current.epoch === epoch;
}

/** Let go of the dialog: the attempt that owns it has finished, however it went. */
export function releaseImport(current: ImportClaim): ImportClaim {
  return { epoch: current.epoch, busy: false };
}

/**
 * Take the dialog back because it has gone away.
 *
 * The epoch moves on, so a walk that was accepted just before the unmount cannot
 * resolve as the owner and must not start a copy. A dialog that comes back is a
 * new component with its own ref, so the numbers only have to be unique within
 * one visit.
 */
export function cancelImport(current: ImportClaim): ImportClaim {
  return { epoch: current.epoch + 1, busy: false };
}
