import { useEffect, useRef } from "react";
import { hitRate, lostRun, ratingScore, starRating } from "../../lib/game/scoring";
import type { RoomRunEntry, RoomResults } from "../../lib/net/protocol";
import { partKeyOf } from "../../lib/game/audio/parts";
import { usePartAudio } from "../game/band/PartAudio";
import { useRunBoard, useRunBoardVersion, type RunEntry } from "../game/band/RunBoard";
import { useClock } from "../game/band/StageClock";
import type { GameSession } from "../game/useGameSession";
import { useRoom } from "./useHostRoom";

/**
 * The host's headless room duties: send its playhead, merge a guest's report into
 * the board, duck the guest's part on the host's speakers, and publish the room's
 * results.
 *
 * It lives below the providers so it can reach the clock and the board, and it
 * never judges a guest: the guest reports its own run. The host's board is the
 * one place the totals meet.
 */
export function HostRoomBridge({ session }: { session: GameSession }) {
  const room = useRoom();
  const clock = useClock();
  const board = useRunBoard();
  const partAudio = usePartAudio();
  const version = useRunBoardVersion();
  const roomRef = useRef(room);
  roomRef.current = room;
  const previous = useRef(new Map<string, RoomRunEntry>());
  const lastPlayhead = useRef(0);
  const resultsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The host's playhead is the room's clock reference. Ten a second is plenty:
  // the guest extrapolates between messages.
  useEffect(() => {
    if (!room.active) return;
    return clock.subscribe(() => {
      if (session.screen === "room" || session.screen === "results") return;
      if (session.screen === "countdown" || session.screen === "loading") return;
      const now = performance.now();
      if (now - lastPlayhead.current < 100) return;
      lastPlayhead.current = now;
      roomRef.current.sendPlayhead(clock.timeRef.current, clock.playing);
    });
  }, [clock, room.active, session.screen]);

  // A pause is an edge, not a tick: the clock's loop is quiet while it stands
  // still, so the last message must not leave the guest extrapolating a playing
  // song. The same is true of the first frame of a play and a resume.
  useEffect(() => {
    if (!room.active) return;
    if (session.screen === "playing") {
      roomRef.current.sendPlayhead(clock.timeRef.current, true);
    } else if (session.screen === "paused") {
      roomRef.current.sendPlayhead(clock.timeRef.current, false);
    }
  }, [clock, room.active, session.screen]);

  // A guest's report is a board entry like any other. The host fills the name and
  // seat from the room so a guest cannot relabel another player's card.
  useEffect(() => {
    if (!room.active) return;
    for (const [memberId, entry] of room.remoteRuns) {
      const member = room.members.find((candidate) => candidate.id === memberId);
      if (!member) continue;
      const before = previous.current.get(memberId);
      const next: RunEntry = {
        ...entry,
        seat: member.seat ?? entry.seat,
        label: member.name,
      };
      board.report(next);
      if (member.slot) {
        const part = partKeyOf(member.slot.kind, member.slot.role);
        if (!before || entry.misses < before.misses || entry.hits < before.hits) {
          partAudio.set(entry.seat, part, false);
        } else {
          if (entry.misses > before.misses) partAudio.set(entry.seat, part, true);
          if (entry.hits > before.hits) partAudio.set(entry.seat, part, false);
        }
      }
      previous.current.set(memberId, entry);
    }
    if (session.screen === "results") board.flush();
  }, [board, partAudio, room.active, room.members, room.remoteRuns, room.runVersion, session.screen]);

  // A result that lands while the results screen is up still has to show.
  useEffect(() => {
    if (!room.active || session.screen === "results") return;
    previous.current.clear();
    roomRef.current.setResults(null);
  }, [room.active, session.screen]);

  useEffect(() => {
    if (!room.active || session.screen !== "results") return;
    if (resultsTimer.current !== null) clearTimeout(resultsTimer.current);
    resultsTimer.current = setTimeout(() => {
      resultsTimer.current = null;
      const runs = [...board.entries()].sort((a, b) => a.seat - b.seat);
      const score = runs.reduce((total, run) => total + run.score, 0);
      const hits = runs.reduce((total, run) => total + run.hits, 0);
      const judged = runs.reduce((total, run) => total + run.judged, 0);
      const baseScore = runs.reduce((total, run) => total + run.baseScore, 0);
      const total = runs.reduce((sum, run) => sum + run.total, 0);
      const fillHits = runs.reduce((sum, run) => sum + (run.fillHits ?? 0), 0);
      const slidePoints = runs.reduce((sum, run) => sum + (run.slidePoints ?? 0), 0);
      const bestCombo = runs.reduce((best, run) => Math.max(best, run.bestCombo), 0);
      const rating = starRating(
        ratingScore(score, fillHits, slidePoints),
        baseScore,
        hits,
        judged,
        total,
      );
      const results: RoomResults = {
        score,
        stars: rating.stars,
        gold: rating.gold,
        accuracy: hitRate(hits, judged),
        bestCombo,
        failed: lostRun(hits, judged),
        entries: runs,
      };
      roomRef.current.setResults(results);
    }, 600);
    return () => {
      if (resultsTimer.current !== null) {
        clearTimeout(resultsTimer.current);
        resultsTimer.current = null;
      }
    };
  }, [board, room.active, session.screen, version]);

  return null;
}
