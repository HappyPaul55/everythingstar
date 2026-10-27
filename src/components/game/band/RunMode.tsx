import { createContext, useContext, type ReactNode } from "react";

/**
 * How this visit's machine players are tuned.
 *
 * The attract demo is played by the same machine every other seat nobody is holding
 * uses; the only difference is that it hits every note. Keeping that as a small
 * context rather than a prop threaded through the stage means the three engines
 * that judge a seat — lanes, singing and typing — all read the same answer.
 *
 * It is **not** a setting: a player never chooses it, and an ordinary visit is the
 * default (`perfect: false`).
 */
export interface RunMode {
  perfect: boolean;
}

const DEFAULT_MODE: RunMode = { perfect: false };

/** The one object a perfect visit shares, so the value does not change every render. */
const PERFECT: RunMode = { perfect: true };

const RunModeContext = createContext<RunMode>(DEFAULT_MODE);

export function RunModeProvider({
  perfect,
  children,
}: {
  perfect: boolean;
  children: ReactNode;
}) {
  return (
    <RunModeContext.Provider value={perfect ? PERFECT : DEFAULT_MODE}>
      {children}
    </RunModeContext.Provider>
  );
}

export function useRunMode(): RunMode {
  return useContext(RunModeContext);
}
