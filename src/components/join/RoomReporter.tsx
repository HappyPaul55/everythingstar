import { useEffect, useRef } from "react";
import type { RunEntry } from "../game/band/RunBoard";
import { useRunBoard } from "../game/band/RunBoard";
import { useClock } from "../game/band/StageClock";
import { useStageControls } from "../game/band/StageControls";
import type { GuestRoom } from "../room/useGuestRoom";
import { trailInWindow } from "../../lib/game/singing";
import type { RoomRunEntry } from "../../lib/net/protocol";

/** Send the guest's own run to the host, and its pitch for the host's roster. */
export function RoomReporter({ room, singing }: { room: GuestRoom; singing: boolean }) {
  const clock = useClock();
  const board = useRunBoard();
  const { mic } = useStageControls();
  const roomRef = useRef(room);
  roomRef.current = room;
  const lastSent = useRef("");
  const lastPitch = useRef(0);
  const lastPublished = useRef(0);

  useEffect(() => {
    return clock.subscribe(() => {
      const now = clock.timeRef.current;
      if (now - lastPublished.current < 100) return;
      lastPublished.current = now;
      const entry = [...board.entries()][0];
      if (entry) {
        const json = JSON.stringify(entry);
        if (json !== lastSent.current) {
          lastSent.current = json;
          roomRef.current.sendReport(toWire(entry));
        }
      }
      if (!singing || mic.status !== "listening") return;
      if (now < lastPitch.current) lastPitch.current = now;
      if (now - lastPitch.current < 100) return;
      const from = lastPitch.current;
      const samples: { atMs: number; midi: number }[] = [];
      trailInWindow(mic.trail, from, now, (atMs, midi) => {
        if (samples.length < 60) samples.push({ atMs, midi });
      });
      lastPitch.current = now;
      if (samples.length > 0) roomRef.current.sendPitch(samples);
    });
  }, [clock, board, singing, mic.status, mic.trail]);

  // The last frame is sent as the host moves to the results. The guest's run
  // stops publishing there; without this the host could keep its previous
  // snapshot.
  useEffect(() => {
    if (room.state?.phase !== "results") return;
    const entry = [...board.entries()][0];
    if (entry) roomRef.current.sendReport(toWire(entry));
  }, [board, room.state?.phase]);

  // The guest's own clock reaching the end is the earliest final report: the
  // host's results screen may already be saving by the time its `results` phase
  // reaches this phone.
  useEffect(() => {
    if (!clock.ended) return;
    const entry = [...board.entries()][0];
    if (entry) roomRef.current.sendReport(toWire(entry));
  }, [board, clock.ended]);

  // The results phase unmounts the stage. The last frame is sent on the way out,
  // so a note judged just before the switch is not lost to the remount.
  useEffect(
    () => () => {
      const entry = [...board.entries()][0];
      if (entry) roomRef.current.sendReport(toWire(entry));
    },
    [board],
  );

  return null;
}

function toWire(entry: RunEntry): RoomRunEntry {
  return { ...entry };
}
