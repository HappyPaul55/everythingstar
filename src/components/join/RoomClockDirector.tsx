import { useEffect, useRef } from "react";
import type { Settings } from "../../lib/game/settings";
import type { GuestRoom } from "../room/useGuestRoom";
import { useClock } from "../game/band/StageClock";

/**
 * The guest's clock is the host's, delayed by what it takes the room's sound to
 * reach this phone.
 *
 * There is no `<audio>` on a guest: the host's speakers are the room. The host
 * sends its playhead; this registers a source that extrapolates from the last
 * message and subtracts the guest's own sync calibration (`audioLagMs`). The
 * clock therefore reads the song at the moment this player *hears* it, and every
 * note is judged against the same sound they are listening to.
 */
export function RoomClockDirector({
  room,
  settings,
}: {
  room: GuestRoom;
  settings: Settings;
}) {
  const clock = useClock();
  const playhead = useRef(room.playhead);
  playhead.current = room.playhead;
  const lag = useRef(settings.audioLagMs);
  lag.current = settings.audioLagMs;
  const serverNow = useRef(room.serverNow);
  serverNow.current = room.serverNow;

  useEffect(() => {
    const read = (): number | null => {
      const latest = playhead.current;
      if (!latest) return null;
      const elapsed = latest.playing
        ? Math.max(0, Math.min(2_000, serverNow.current() - latest.serverMs))
        : 0;
      return Math.max(0, latest.songMs + elapsed - lag.current);
    };
    clock.followSource(read, null, null);
    return () => clock.followSource(null);
  }, [clock]);

  const phase = room.state?.phase ?? "lobby";

  // The source read is the clock while the room plays; a phase edge is the only
  // thing that starts, stops or resets it. Per-message syncing would let network
  // jitter step the playhead backwards, which a run reads as a rewind.
  useEffect(() => {
    if (phase === "playing") {
      clock.play();
      return;
    }
    if (phase === "countdown") {
      // A countdown is a **new run**: a replay or a restart starts every run
      // over, so this is the deliberate seek, not a room-sync correction.
      clock.seek(0);
      clock.pause();
      return;
    }
    clock.pause();
  }, [clock, phase]);

  // A pause has no frames to carry the correction, so its own message is where
  // the phone is seated on the host's stopped point.
  useEffect(() => {
    if (phase !== "paused" || !room.playhead) return;
    clock.syncTo(Math.max(0, room.playhead.songMs - lag.current));
  }, [clock, phase, room.playhead]);

  return null;
}
