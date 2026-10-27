import { useEffect, useState } from "react";

/**
 * Is the browser asking for **reduced motion**?
 *
 * `global.css` stops every animation in the site when it is — one rule, for the whole
 * site, rather than a copy per effect — which means decorations like the backdrop flares
 * go *still* rather than going away. That is the point of the preference, but it also
 * means "the flares are not moving" has two possible causes, and only one of them is a
 * bug. The dev panel reads this so the difference is visible.
 *
 * It listens, because the setting can be changed while the page is open.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether this browser is asking for reduced motion **now**.
 *
 * The first render has to know, not a frame later: a decoration that starts its
 * animation and is then told to stop has already played. A browser with no
 * `matchMedia` is simply not asking.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(QUERY).matches
  );
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(QUERY);
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
