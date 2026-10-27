import { useEffect, useState, type CSSProperties } from "react";
import { flarePlan, type Flare } from "../../../lib/game/band/flares";

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
 * smudges on the film.
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
    <div className={hidden ? "flares flares--hidden" : "flares"} aria-hidden="true">
      {flares.map((flare, index) => (
        <span
          key={index}
          className="flare"
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
