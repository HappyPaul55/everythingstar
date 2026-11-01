import { useEffect, useState } from "react";

/**
 * Is this a device whose main pointer is a finger?
 *
 * `(pointer: coarse)` is the browser's own answer, and it is about the device
 * rather than the width: a small window on a desktop still has a mouse, and a
 * tablet in landscape is still a touch screen. The first render says no, so the
 * server and the client agree; the effect settles it before the first frame a
 * player could press.
 *
 * Used for the one control a phone has no other way to reach: the pause.
 */
const QUERY = "(pointer: coarse)";

export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia(QUERY);
    const settle = () => setCoarse(media.matches);
    settle();
    media.addEventListener("change", settle);
    return () => media.removeEventListener("change", settle);
  }, []);

  return coarse;
}
