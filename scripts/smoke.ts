/**
 * The production smoke test: is the live site the build we shipped?
 *
 * Cloudflare Workers Builds deploys on every push to `main`, but GitHub only
 * learns that a *check* finished — it never learns whether the deploy worked,
 * and it records no deployment. So the deploy workflow waits for the build and
 * then runs this: the pages, the PWA shell, the App Link and the headers are
 * requested from the real origin, and the service worker's build identity is
 * held against the version this commit produced.
 *
 * It is deliberately dependency-free — `fetch` and Bun built-ins, nothing from
 * `src/` or `node_modules` — so it can run on a bare runner with Bun installed.
 *
 *   bun scripts/smoke.ts [--base <url>] [--expect <version>]
 *
 * `--expect` is the `v<version>+<sha>` the site must serve. When it is omitted
 * the build-identity check is skipped; everything else still runs.
 */
// An empty export makes this a module, which is what allows the top-level
// `await` below; the script itself deliberately imports nothing at all.
export {};

const DEFAULT_BASE = "https://everythingstar.happypaul55.com";
const REQUEST_TIMEOUT_MS = 15_000;
const IDENTITY_RETRY_MS = 5_000;
const IDENTITY_DEADLINE_MS = 90_000;

interface Options {
  base: string;
  expect: string | null;
}

interface Probe {
  base: string;
  expect: string | null;
  get(path: string): Promise<Response>;
}

/** A check passes with `null` and fails with the sentence that says why. */
type Detail = string | null;

interface Check {
  name: string;
  run: () => Promise<Detail>;
}

function usage(message: string): never {
  console.error(message);
  console.error("usage: bun scripts/smoke.ts [--base <url>] [--expect <version>]");
  process.exit(2);
}

function parseOptions(argv: string[]): Options {
  let base = DEFAULT_BASE;
  let expect: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? "";
    if (flag === "--help" || flag === "-h") {
      console.log("usage: bun scripts/smoke.ts [--base <url>] [--expect <version>]");
      process.exit(0);
    }
    if (flag !== "--base" && flag !== "--expect") {
      usage(`Unknown argument "${flag}".`);
    }
    const value = argv[index + 1];
    if (value === undefined) usage(`${flag} needs a value.`);
    index += 1;
    if (flag === "--base") base = value;
    else expect = value.trim() || null;
  }

  base = base.replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    usage(`--base is not a URL: "${base}".`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    usage(`--base must be http or https, not ${parsed.protocol}`);
  }
  return { base: parsed.toString().replace(/\/+$/, ""), expect };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Does a page say `noindex` on its robots meta tag?
 *
 * Read a tag at a time because the attributes can come in either order, and a
 * plain body search would also match the word in prose or in a comment.
 */
function hasNoindex(html: string): boolean {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\bname=["']robots["']/i.test(tag)) continue;
    if (/\bcontent=["'][^"']*noindex/i.test(tag)) return true;
  }
  return false;
}

/**
 * The cache-safe form of a version, which is what a minifier can leave behind
 * when it folds the service worker's cache-name call: every character outside
 * `[0-9A-Za-z._-]` becomes `-`. `v1.0.0+abc1234` -> `v1.0.0-abc1234`.
 */
function cacheSafe(version: string): string {
  return version.replace(/[^0-9A-Za-z._-]/g, "-");
}

function identityMatches(body: string, expect: string): boolean {
  return body.includes(expect) || body.includes(cacheSafe(expect));
}

/** The build the live worker names, for a failure that can be diagnosed. */
function liveIdentity(body: string): string {
  const shell = /everythingstar-shell-[0-9A-Za-z][0-9A-Za-z-]*/.exec(body);
  if (shell) return shell[0];
  const version = /v\d+\.\d+\.\d+\+[0-9A-Za-z._-]+/.exec(body);
  if (version) return version[0];
  return "no build identity in /sw.js";
}

function parseJson(body: string): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(body) as unknown };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function checksFor(probe: Probe): Check[] {
  return [
    {
      name: "home",
      run: async () => {
        const response = await probe.get("/");
        if (response.status !== 200) return `status ${response.status}`;
        const type = response.headers.get("content-type") ?? "(none)";
        if (!type.includes("text/html")) return `content-type is ${type}`;
        const body = await response.text();
        if (!body.includes("EverythingStar")) return "body does not name EverythingStar";
        if (hasNoindex(body)) return "body carries a robots noindex";
        return null;
      },
    },
    {
      name: "play",
      run: async () => {
        const response = await probe.get("/play");
        if (response.status !== 200) return `status ${response.status}`;
        const body = await response.text();
        if (!body.includes('<link rel="canonical"')) return "body has no canonical link";
        if (hasNoindex(body)) return "body carries a robots noindex";
        return null;
      },
    },
    {
      name: "app",
      run: async () => {
        const response = await probe.get("/app");
        if (response.status !== 200) return `status ${response.status}`;
        const body = await response.text();
        if (!body.includes("noindex")) return "body does not carry noindex";
        return null;
      },
    },
    {
      name: "privacy",
      run: async () => {
        const response = await probe.get("/privacy");
        if (response.status !== 200) return `status ${response.status}`;
        return null;
      },
    },
    {
      name: "not found",
      run: async () => {
        const path = `/definitely-not-a-page-${Math.random().toString(36).slice(2, 10)}`;
        const response = await probe.get(path);
        if (response.status !== 404) return `${path} answered ${response.status}, not 404`;
        const body = await response.text();
        const type = response.headers.get("content-type") ?? "";
        if (!type.includes("text/html") && !/<html[\s>]/i.test(body)) {
          return `${path} answered 404 with no HTML body`;
        }
        return null;
      },
    },
    {
      name: "service worker",
      run: async () => {
        const response = await probe.get("/sw.js");
        if (response.status !== 200) return `status ${response.status}`;
        const cache = response.headers.get("cache-control") ?? "(none)";
        if (!cache.includes("no-cache")) return `cache-control is ${cache}`;
        let body = await response.text();
        if (!probe.expect) return null;
        if (identityMatches(body, probe.expect)) return null;

        // Edge caches can lag a fresh deploy, so the identity is the one check
        // that is given time. The rest of the worker's answer has already passed.
        const deadline = Date.now() + IDENTITY_DEADLINE_MS;
        while (Date.now() < deadline) {
          await Bun.sleep(IDENTITY_RETRY_MS);
          const retry = await probe.get("/sw.js");
          if (retry.status !== 200) continue;
          body = await retry.text();
          if (identityMatches(body, probe.expect)) return null;
        }

        const expected =
          cacheSafe(probe.expect) === probe.expect
            ? `"${probe.expect}"`
            : `"${probe.expect}" (or "${cacheSafe(probe.expect)}" in the minified form)`;
        return `expected ${expected} in /sw.js, but the live build is ${liveIdentity(body)}`;
      },
    },
    {
      name: "manifest",
      run: async () => {
        const response = await probe.get("/manifest.webmanifest");
        if (response.status !== 200) return `status ${response.status}`;
        const parsed = parseJson(await response.text());
        if ("error" in parsed) return `body is not JSON: ${parsed.error}`;
        const value = parsed.value;
        if (!isRecord(value)) return "body is not a JSON object";
        if (value.start_url !== "/app") {
          return `start_url is ${JSON.stringify(value.start_url)}, not "/app"`;
        }
        return null;
      },
    },
    {
      name: "app links",
      run: async () => {
        const response = await probe.get("/.well-known/assetlinks.json");
        if (response.status !== 200) return `status ${response.status}`;
        const parsed = parseJson(await response.text());
        if ("error" in parsed) return `body is not JSON: ${parsed.error}`;
        if (!Array.isArray(parsed.value)) return "body is not a JSON array";
        const hasTarget = parsed.value.some(
          (entry) => isRecord(entry) && isRecord(entry.target),
        );
        return hasTarget ? null : "no entry carries a target";
      },
    },
    {
      name: "security.txt",
      run: async () => {
        const response = await probe.get("/.well-known/security.txt");
        if (response.status !== 200) return `status ${response.status}`;
        return null;
      },
    },
    {
      name: "robots",
      run: async () => {
        const response = await probe.get("/robots.txt");
        if (response.status !== 200) return `status ${response.status}`;
        const body = await response.text();
        if (!body.includes("Sitemap:")) return "body names no Sitemap:";
        return null;
      },
    },
    {
      name: "sitemap",
      run: async () => {
        const response = await probe.get("/sitemap-index.xml");
        if (response.status !== 200) return `status ${response.status}`;
        return null;
      },
    },
    {
      name: "social card",
      run: async () => {
        const response = await probe.get("/og-image.png");
        if (response.status !== 200) return `status ${response.status}`;
        const type = response.headers.get("content-type") ?? "(none)";
        if (!type.includes("image/png")) return `content-type is ${type}`;
        return null;
      },
    },
    {
      name: "headers",
      run: async () => {
        const response = await probe.get("/");
        const header = (name: string) => response.headers.get(name) ?? "";
        if (!header("content-security-policy").includes("frame-ancestors 'self'")) {
          return "content-security-policy does not allow frame-ancestors 'self'";
        }
        if (!header("strict-transport-security")) return "no strict-transport-security";
        if (!header("x-content-type-options").includes("nosniff")) {
          return "x-content-type-options is not nosniff";
        }
        if (!header("referrer-policy")) return "no referrer-policy";
        return null;
      },
    },
  ];
}

const options = parseOptions(process.argv.slice(2));
const probe: Probe = {
  base: options.base,
  expect: options.expect,
  get: (path) =>
    fetch(`${options.base}${path}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }),
};

const checks = checksFor(probe);
let passed = 0;
const failures: string[] = [];

for (const check of checks) {
  let detail: Detail;
  try {
    detail = await check.run();
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }
  if (detail === null) {
    passed += 1;
    console.log(`ok    ${check.name}`);
  } else {
    failures.push(check.name);
    console.log(`FAIL  ${check.name} — ${detail}`);
  }
}

const expected = options.expect ? ` (expected ${options.expect})` : "";
console.log(
  `\n${passed} of ${checks.length} checks passed against ${options.base}${expected}.`,
);
if (failures.length > 0) {
  console.log(`Failed: ${failures.join(", ")}.`);
  process.exitCode = 1;
}
