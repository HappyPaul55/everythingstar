import { useEffect, useRef } from "react";
import type { CharterGrid } from "../../lib/game/charter/grid";
import { barMs, stepMs } from "../../lib/game/charter/grid";
import { familyVolume } from "../../lib/game/audio/mix";
import { loadSettings } from "../../lib/game/settings";
import { useClock } from "../game/band/StageClock";

/**
 * A click on the grid: the charter's own metronome, not the mixer.
 *
 * It is one oscillator on one context, made on the first click (a press is the
 * gesture a browser needs) and kept while the workspace is up. The clock is the only
 * schedule: a frame that crosses a step plays it, and a frame never plays more than
 * one even if the tab was away, because a burst of clicks would be worse than
 * silence.
 *
 * The context is **closed when the workspace goes**. A charter is remounted per song
 * and on every return to the picker, and browsers cap concurrent contexts (Chromium
 * at about six): the metronome used to go silent after a few songs, and it ignored
 * the master fader while it worked.
 */
export function useMetronome(grid: CharterGrid, enabled: boolean): void {
  const clock = useClock();
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const context = useRef<AudioContext | null>(null);
  const last = useRef<number | null>(null);
  /** The player's own master × effects level, read on the first click. */
  const level = useRef<number | null>(null);

  useEffect(() => {
    const held = context;
    return () => {
      // The oscillator route is the context's alone; closing it lets the browser
      // give the next workspace a fresh one.
      const ctx = held.current;
      held.current = null;
      if (ctx) void ctx.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      last.current = null;
      return;
    }
    const click = (accent: boolean) => {
      try {
        if (level.current === null) {
          const settings = loadSettings();
          level.current = familyVolume(settings.volume, settings.levels.sfx);
        }
        const volume = level.current;
        if (!(volume > 0)) return;
        const ctx =
          context.current ??
          new (window.AudioContext ??
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        context.current = ctx;
        if (ctx.state === "suspended") void ctx.resume();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "square";
        oscillator.frequency.value = accent ? 1568 : 1046;
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(
          (accent ? 0.12 : 0.07) * volume,
          now + 0.004,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
        oscillator.connect(gain).connect(ctx.destination);
        // A stopped oscillator is silent but stays wired into `destination` for
        // the life of the context; a 4-minute pass at 120 bpm leaves thousands of
        // them. The engine's one-shots already disconnect on end.
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(now);
        oscillator.stop(now + 0.05);
      } catch {
        // A browser that will not make an audio context is a silent click, not a
        // reason the charter cannot record.
      }
    };
    return clock.subscribe(() => {
      if (!clock.playing) {
        last.current = null;
        return;
      }
      const now = clock.timeRef.current;
      const step = stepMs(gridRef.current);
      const index = Math.floor(now / step);
      if (last.current === index) return;
      last.current = index;
      const bar = barMs(gridRef.current);
      click(index % Math.max(1, Math.round(bar / step)) === 0);
    });
  }, [clock, enabled]);
}
