/**
 * Development tools, and how to be rid of them.
 *
 * Everything below is **review scaffolding, not the product**: the transport (play,
 * pause, restart, scrub), the screen jumper, the frame-rate and note-count read-outs,
 * the per-player auto toggles with their key map, the video switch and the controller
 * read-out. They exist so the game can be judged while it is
 * being built, and they come out before release — or ship behind this flag, which is
 * what it is for.
 *
 * **Off unless asked for.** `?dev=1` shows them and nothing else does, so the deployed
 * preview is what a player sees; the review surface is one query string away. Everything
 * — the transport included — sits behind a single `Dev` chip, so a screenshot of the
 * stage is a screenshot of the stage.
 */

/** Whether the dev tools should show, given an address bar's query string. */
export function devToolsEnabled(search: string): boolean {
  const value = new URLSearchParams(search).get("dev");
  return value === "1" || value === "true";
}
