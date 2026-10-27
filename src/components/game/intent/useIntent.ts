/**
 * The game's side of a link: read it, ask, add, forget the query.
 *
 * A link is **never** applied on its own. `?playlist=` and `?song=` put a question
 * on screen — "Add this playlist? From github.com" — and only the Add press
 * changes the library. The parameters are taken out of the address bar as soon as
 * they are read, so a reload does not ask again and the URL stops being a command.
 *
 * A link that arrives while a song is running is held until the game is back on a
 * page (`isRunScreen`). The native shell hands a warm link over with the
 * `everythingstar:open` event rather than reloading a run; this listener is why
 * that can be a dialog instead of a lost song.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readIntent,
  readIntentFromUrl,
  withoutIntent,
  type Intent,
  type IntentRefusal,
} from "../../../lib/game/intent";
import { isRunScreen, type Screen } from "../../../lib/game/screens";
import type { Library } from "../library/useLibrary";

/** What happened after Add, in the words a screen can render. */
export type IntentOutcome =
  | { kind: "playlist"; name: string | null; count: number; problems: number }
  | { kind: "song"; title: string }
  | { kind: "already" }
  | { kind: "failed"; reason: string };

export type IntentRequest =
  | { phase: "ask"; intent: Intent }
  | { phase: "working"; intent: Intent }
  | { phase: "done"; intent: Intent; outcome: IntentOutcome }
  | { phase: "invalid"; reason: IntentRefusal };

export interface IntentController {
  /** The dialog, or null when no link is waiting. */
  request: IntentRequest | null;
  /** Add the link's target. A refused add stays on screen with its reason. */
  accept: () => void;
  /** Look at it later — or never. */
  dismiss: () => void;
}

/**
 * A link that has been read but is not on screen yet: a question, or a refusal.
 * Either waits the same way, so a bad warm link cannot interrupt a song.
 */
type PendingIntent =
  | { state: "ask"; intent: Intent }
  | { state: "invalid"; reason: IntentRefusal };

export function useIntent(library: Library, screen: Screen): IntentController {
  const [pending, setPending] = useState<PendingIntent | null>(null);
  const [request, setRequest] = useState<IntentRequest | null>(null);
  const requestRef = useRef(request);
  requestRef.current = request;

  const offer = useCallback((read: ReturnType<typeof readIntent>) => {
    if (read.state === "invalid") {
      // A refusal is queued like a question: a bad link is still a link, and it
      // must not put a modal over a song that is still running.
      setPending({ state: "invalid", reason: read.reason });
      return;
    }
    if (read.state === "intent") setPending({ state: "ask", intent: read.intent });
  }, []);

  // The address this page was opened with. Read once, then taken out of it.
  useEffect(() => {
    const read = readIntent(window.location.search);
    if (read.state === "none") return;
    const clean = withoutIntent(window.location.search);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${clean}${window.location.hash}`,
    );
    offer(read);
  }, [offer]);

  // A warm link from the native shell, which must not reload a run.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: unknown }>).detail;
      if (typeof detail?.url !== "string") return;
      offer(readIntentFromUrl(detail.url, window.location.href));
    };
    window.addEventListener("everythingstar:open", onOpen);
    return () => window.removeEventListener("everythingstar:open", onOpen);
  }, [offer]);

  // Hold the question — or the refusal — until the game is somewhere a dialog
  // belongs. A link never interrupts a song, and an invalid one is no different.
  useEffect(() => {
    if (!pending || isRunScreen(screen)) return;
    setRequest(
      pending.state === "invalid"
        ? { phase: "invalid", reason: pending.reason }
        : { phase: "ask", intent: pending.intent },
    );
    setPending(null);
  }, [pending, screen]);

  // A playlist is read by the library, not here: its row is the answer. While it
  // is loading the dialog waits; once it settles, the count (or the failure) is
  // the outcome. A link added to a library that is still restoring still finds its
  // row, because the row appears as soon as `add` has written it.
  useEffect(() => {
    const current = request;
    if (!current || current.phase !== "working" || current.intent.kind !== "playlist") {
      return;
    }
    const row = library.playlists.find((entry) => entry.url === current.intent.url);
    if (!row || row.status === "loading") return;
    const outcome: IntentOutcome =
      row.status === "failed"
        ? { kind: "failed", reason: row.error ?? "could not be read" }
        : {
            kind: "playlist",
            name: row.name,
            count: row.count,
            problems: row.problems.length,
          };
    setRequest({ phase: "done", intent: current.intent, outcome });
  }, [request, library.playlists]);

  const accept = useCallback(() => {
    const current = requestRef.current;
    if (!current) return;
    const retry = current.phase === "done" && current.outcome.kind === "failed";
    if (current.phase !== "ask" && !retry) return;

    const intent = current.intent;
    if (intent.kind === "playlist") {
      const known = library.playlists.find((row) => row.url === intent.url);
      if (known?.status === "failed") {
        // A link whose first read failed is retried in place; adding it again
        // would find the row already there and never ask the host.
        setRequest({ phase: "working", intent });
        library.refresh(intent.url);
        return;
      }
      if (known?.status === "loading") {
        setRequest({ phase: "working", intent });
        return;
      }
      // A playlist already in the list is not added twice; saying "added" about a
      // source that was there all along would be a small lie.
      if (known) {
        setRequest({ phase: "done", intent, outcome: { kind: "already" } });
        return;
      }
      setRequest({ phase: "working", intent });
      library.add(intent.url);
      return;
    }

    setRequest({ phase: "working", intent });
    void library.pinSong(intent.url).then((result) => {
      const latest = requestRef.current;
      if (
        !latest ||
        latest.phase !== "working" ||
        latest.intent.url !== intent.url
      ) {
        return;
      }
      const outcome: IntentOutcome = result.ok
        ? { kind: "song", title: result.song.title }
        : result.problem === "already"
          ? { kind: "already" }
          : { kind: "failed", reason: result.detail ?? result.problem };
      setRequest({ phase: "done", intent, outcome });
    });
  }, [library]);

  const dismiss = useCallback(() => {
    setRequest((current) => (current?.phase === "working" ? current : null));
  }, []);

  return { request, accept, dismiss };
}
