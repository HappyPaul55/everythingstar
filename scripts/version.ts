/**
 * The build's version, and the bump that changes it.
 *
 * `git describe --tags --always` used to answer this, but a CI clone is shallow
 * and has no tags: it returns a bare commit sha, so a deploy could not be matched
 * to the version it shipped. The version therefore comes from `package.json`,
 * which every checkout has, with the short commit appended — `v1.0.0+abc1234` —
 * so a deployment can be checked against the exact commit it was built from.
 * When no commit can be read the build says `+dev` rather than pretending.
 */
import { execFileSync } from "node:child_process";

const PACKAGE_JSON = new URL("../package.json", import.meta.url);
const pkg = (await Bun.file(PACKAGE_JSON).json()) as { version?: unknown };

/** `v<version>+<7-char sha>`, or `+dev` when there is no commit to name. */
export function formatVersion(version: string, sha: string | null): string {
  return `v${version}+${sha ? sha.slice(0, 7) : "dev"}`;
}

function commitSha(): string | null {
  const fromEnv = process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv;
  try {
    const sha = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return sha || null;
  } catch {
    return null;
  }
}

/** The `package.json` version with the commit this checkout is on. */
export function readVersion(): string {
  const version = typeof pkg.version === "string" ? pkg.version : "0.0.0";
  return formatVersion(version, commitSha());
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

/** The next `major.minor.patch`, dropping any prerelease or build suffix. */
export function nextVersion(
  current: string,
  bump: "patch" | "minor" | "major",
): string {
  if (bump !== "patch" && bump !== "minor" && bump !== "major") {
    throw new Error(`Unknown bump "${bump}": expected patch, minor or major.`);
  }
  const match = SEMVER.exec(current);
  if (!match) {
    throw new Error(
      `Cannot bump "${current}": expected a major.minor.patch version.`,
    );
  }
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

if (import.meta.main) console.log(readVersion());
