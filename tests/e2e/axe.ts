import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
 * The axe gate, shared by the accessibility specs.
 *
 * Critical and serious violations only: the house style is part of the design,
 * so this catches the things that stop somebody using a screen — a control with
 * no name, a missing landmark, a label that is not attached — rather than every
 * contrast preference.
 */
export async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
}

export function describeViolations(
  violations: Awaited<ReturnType<typeof seriousViolations>>,
): string {
  return violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n${violation.nodes
          .map((node) => `  ${node.target.join(" ")} — ${node.failureSummary ?? ""}`)
          .join("\n")}`,
    )
    .join("\n\n");
}
