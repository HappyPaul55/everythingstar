/**
 * Bump `package.json`'s version, and say how to release it.
 *
 * This writes one value and nothing else: the branch and the pull request are a
 * person's decisions; the tag and the release follow when the change merges and
 * CI on `main` succeeds. Run it as `bun run version:bump patch|minor|major`.
 */
import { nextVersion } from "./version";

const packageJson = new URL("../package.json", import.meta.url);
const pkg = (await Bun.file(packageJson).json()) as { version?: unknown };

const bump = process.argv[2];
if (pkg.version === undefined || typeof pkg.version !== "string") {
  console.error("package.json has no version to bump.");
  process.exit(1);
}

let next: string;
try {
  next = nextVersion(pkg.version, bump as "patch" | "minor" | "major");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

pkg.version = next;
await Bun.write(packageJson, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`Version ${next}`);
console.log("");
console.log("Next steps:");
console.log(`  1. Create a branch named release/v${next}.`);
console.log(`  2. Open a pull request titled "chore(release): v${next}".`);
console.log("  3. Merge it. CI tags the merge commit and publishes the release.");
