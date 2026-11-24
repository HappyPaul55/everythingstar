/**
 * The room server's address.
 *
 * One address for the whole app: the same origin in production and self-hosting,
 * and the local room server beside Astro's dev server. `?rooms=` is a deliberate
 * development override; it must be a WebSocket URL.
 */

const OVERRIDE = "rooms";

export function roomEndpoint(
  locationLike: Pick<Location, "protocol" | "host" | "hostname" | "port" | "search"> = window.location,
): string {
  const override = new URLSearchParams(locationLike.search).get(OVERRIDE)?.trim();
  if (override) {
    try {
      const url = new URL(override);
      if (url.protocol === "ws:" || url.protocol === "wss:") return url.toString();
    } catch {
      // Fall through to the built-in answer.
    }
  }
  // Astro's dev server and the room server are two processes; a built site — the
  // public one or a self-hosted Bun server — is same-origin. `import.meta.env`
  // is Vite's build-time flag, so a production build can never take this branch.
  if (import.meta.env.DEV) {
    return `ws://${locationLike.hostname}:8788/api/room`;
  }
  const scheme = locationLike.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${locationLike.host}/api/room`;
}
