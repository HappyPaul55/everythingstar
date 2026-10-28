/**
 * Wait for one commit's checks before recording a production deployment.
 *
 * The deploy workflow records a GitHub Deployment for every push to `main`, and
 * that record should not exist before production is real. Cloudflare Workers
 * Builds and CI both report as check runs on the commit — Cloudflare through its
 * GitHub App, CI through `.github/workflows/ci.yml` — so this waits for them:
 *
 *   - `verify` and `e2e`, the repo's own gates;
 *   - every run whose name starts with `Workers Builds:`, the Cloudflare deploy.
 *
 * It exits 1 the moment a required run concludes with anything but `success`,
 * and exits 1 after thirty minutes if a run never appeared at all — usually the
 * Cloudflare GitHub App is no longer connected to the repository.
 *
 * Environment: `GITHUB_REPOSITORY`, `GITHUB_SHA`, `GITHUB_TOKEN`.
 * No dependencies: `fetch` and `Bun.sleep`.
 */
// An empty export makes this a module, which is what allows the top-level
// `await` below; the script itself imports nothing at all.
export {};

const API = "https://api.github.com";
const POLL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 15_000;
const DEADLINE_MS = 30 * 60 * 1000;
const REQUIRED = ["verify", "e2e"];
const WORKERS_PREFIX = "Workers Builds:";

interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  details_url: string;
  started_at: string | null;
}

interface CheckRunsBody {
  total_count?: number;
  check_runs?: CheckRun[];
}

class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const repository = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
const token = process.env.GITHUB_TOKEN;

if (!repository || !sha || !token) {
  console.error("GITHUB_REPOSITORY, GITHUB_SHA and GITHUB_TOKEN must all be set.");
  process.exit(1);
}

const shortSha = sha.slice(0, 7);

async function fetchCheckRuns(): Promise<CheckRun[]> {
  const url = `${API}/repos/${repository}/commits/${sha}/check-runs?per_page=100`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `GET check-runs answered ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as CheckRunsBody;
  return Array.isArray(body.check_runs) ? body.check_runs : [];
}

/**
 * One run per name. A re-run leaves both attempts on the commit, so the later
 * start is the one that counts — otherwise yesterday's failure would fail a
 * commit whose retry is green.
 */
function latestByName(runs: CheckRun[]): Map<string, CheckRun> {
  const latest = new Map<string, CheckRun>();
  for (const run of runs) {
    const seen = latest.get(run.name);
    if (!seen || (run.started_at ?? "") >= (seen.started_at ?? "")) {
      latest.set(run.name, run);
    }
  }
  return latest;
}

function describe(run: CheckRun): string {
  return `${run.name} (${run.status})`;
}

/**
 * The production build, not a branch preview.
 *
 * One commit can carry more than one `Workers Builds:` run — a preview build for a
 * branch and the production build for `main` — and the name cannot tell them apart.
 * The details URL can, and it matters in both directions: a failed preview must not
 * fail the production record, and a passing preview must not stand in for a
 * production build that failed. A re-run leaves more than one attempt, so the latest
 * start is the one that counts.
 */
function productionWorkers(runs: CheckRun[]): CheckRun | null {
  const builds = runs.filter((run) => run.name.startsWith(WORKERS_PREFIX));
  if (builds.length === 0) return null;
  const production = builds.filter((run) => run.details_url.includes("/production/builds/"));
  const pool = production.length > 0 ? production : builds;
  return pool.reduce((latest, run) =>
    (run.started_at ?? "") >= (latest.started_at ?? "") ? run : latest,
  );
}

function isGreen(run: CheckRun): boolean {
  return run.status === "completed" && run.conclusion === "success";
}

const started = Date.now();
let lastError: string | null = null;

while (true) {
  let runs: CheckRun[];
  try {
    runs = await fetchCheckRuns();
    lastError = null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A bad token or a missing repository is a verdict, not a slow deploy.
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
      console.error(`FAIL  GitHub API — ${message}`);
      process.exit(1);
    }
    lastError = message;
    console.log(`wait  could not read the check runs — ${message}`);
    if (Date.now() - started >= DEADLINE_MS) {
      console.error(`\nCould not read the checks for ${shortSha} within 30 minutes.`);
      console.error(`Last error: ${message}`);
      process.exit(1);
    }
    await Bun.sleep(POLL_MS);
    continue;
  }

  const latest = latestByName(runs);
  const required = new Map<string, CheckRun>();
  for (const name of REQUIRED) {
    const run = latest.get(name);
    if (run) required.set(name, run);
  }
  const workers = productionWorkers(runs);
  const watched = [...required.values(), ...(workers ? [workers] : [])];

  const failed = watched.filter(
    (run) => run.status === "completed" && run.conclusion !== "success",
  );
  if (failed.length > 0) {
    for (const run of failed) {
      console.error(`FAIL  ${run.name} — ${run.conclusion ?? "no conclusion"}`);
      console.error(`      ${run.html_url}`);
    }
    console.error(`A required check did not pass on ${shortSha}.`);
    process.exit(1);
  }

  const missing = REQUIRED.filter((name) => !latest.has(name));
  const workersMissing = workers === null;
  const done = missing.length === 0 && !workersMissing && watched.every(isGreen);
  if (done) {
    for (const run of watched) console.log(`ok    ${run.name} — ${run.conclusion}`);
    console.log(`All checks green on ${shortSha}.`);
    break;
  }

  if (Date.now() - started >= DEADLINE_MS) {
    console.error(`\nNo verdict on ${shortSha} after 30 minutes.`);
    if (missing.length > 0 || workersMissing) {
      const absent = [...missing];
      if (workersMissing) absent.push(`"${WORKERS_PREFIX} …"`);
      console.error(`Never appeared: ${absent.join(", ")}.`);
      console.error(
        "A required check run never appeared — the Cloudflare GitHub App may be disconnected from the repository.",
      );
    }
    const pending = watched.filter((run) => !isGreen(run));
    if (pending.length > 0) {
      console.error(`Still running: ${pending.map(describe).join(", ")}.`);
    }
    if (lastError) console.error(`The last read of the checks failed: ${lastError}`);
    process.exit(1);
  }

  console.log(
    `wait  ${watched.map(describe).join(", ") || "no required checks yet"}` +
      (missing.length > 0 ? `; missing ${missing.join(", ")}` : "") +
      (workersMissing ? `; missing "${WORKERS_PREFIX} …"` : ""),
  );
  await Bun.sleep(POLL_MS);
}
