import { useEffect, useState, type CSSProperties } from "react";
import { flarePlan, type Flare } from "../../../lib/game/band/flares";

/**
 * A flare: a soft radial glow that wanders slowly and out of step with the others.
 * Its place, size and timing come from the plan on the element; the look is here.
 * (`screen`, the drift keyframes and the reduced-motion handling are the room's,
 * not one flare's.)
 */
const FLARE =
  "flare absolute rounded-[50%] [transform:translate(-50%,-50%)_scale(0.92)] bg-[radial-gradient(closest-side,rgba(255,212,0,0.55),rgba(255,212,0,0)_72%)] animate-[flare-drift_ease-in-out_infinite_alternate] will-change-[transform,opacity]";

/**
 * The room's lights, drawn.
 *
 * Each flare is a soft radial glow that wanders slowly and out of step with the others,
 * so the backdrop is a room rather than a picture of one. They are placed from
 * `flarePlan` and moved by **transform and opacity only**, so the browser's compositor
 * does the work — a blurred 60vmax layer animated for a whole session is a frame of
 * painting per repaint, and this has to be free.
 *
 * The plan is drawn **after mount**, not during render: it comes from `Math.random`, and
 * this island is server-rendered, so a plan made during render would differ between the
 * two and React would report a hydration mismatch. The lights arrive a tick later, which
 * nobody can see.
 *
 * Decorative, so it is `aria-hidden` and takes no pointer events; and under
 * `prefers-reduced-motion` the room simply stands still.
 *
 * `hidden` sets the lights aside while a song's own video is the backdrop: they
 * are the *game's* room, and drifting over somebody's footage they look like
 * smudges on the film. `display` rather than opacity, so the animations cost
 * nothing too.
 */
interface Props {
  hidden?: boolean;
}

export function BackdropFlares({ hidden = false }: Props) {
  const [flares, setFlares] = useState<Flare[]>([]);

  useEffect(() => {
    setFlares(flarePlan());
  }, []);

  return (
    <div
      className={[
        "flares pointer-events-none absolute inset-0 z-[1] overflow-hidden mix-blend-screen",
        hidden && "flares--hidden hidden",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      {flares.map((flare, index) => (
        <span
          key={index}
          className={FLARE}
          style={
            {
              left: `${flare.x}%`,
              top: `${flare.y}%`,
              width: `${flare.size}vmax`,
              height: `${flare.size}vmax`,
              opacity: flare.opacity,
              animationDuration: `${flare.durationS}s`,
              animationDelay: `${flare.delayS}s`,
              "--flare-drift": `${flare.drift}vmax`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
