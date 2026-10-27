/**
 * Register the website's service worker, once per page, in production only.
 *
 * The worker is what makes the installed game work with no network and what lets
 * a downloaded song play from Cache Storage. It is deliberately **not** registered
 * in development (there is no `dist/sw.js` to fetch), nor inside the native app's
 * WebView (the app shell registers its own worker and has its own handshake).
 *
 * Pure decisions live here so the conditions can be tested without a browser.
 */

export interface RegisterEnv {
  /** `import.meta.env.PROD`: a dev server has no built worker. */
  production: boolean;
  protocol: string;
  hostname: string;
  hasServiceWorker: boolean;
  /** The app repository's boot sets `html[data-native]`. */
  native: boolean;
}

/** Should this page register the website worker? */
export function shouldRegister(env: RegisterEnv): boolean {
  if (!env.production || !env.hasServiceWorker || env.native) return false;
  return (
    env.protocol === "https:" ||
    env.hostname === "localhost" ||
    env.hostname === "127.0.0.1"
  );
}

/**
 * Register `/sw.js` with the whole origin as its scope.
 *
 * Failure is silent on purpose: a browser with no service worker, a blocked
 * registration or a private mode that refuses it still plays the game; the only
 * thing missing is the offline half.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;

  const env: RegisterEnv = {
    production: import.meta.env.PROD,
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    hasServiceWorker: "serviceWorker" in navigator,
    native: document.documentElement.dataset.native !== undefined,
  };
  if (!shouldRegister(env)) return;

  try {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => registration.update())
      .catch(() => undefined);
  } catch {
    // A browser that will not register the worker is still a browser that plays.
  }
}
