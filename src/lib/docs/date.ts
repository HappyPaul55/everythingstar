/**
 * The date a documentation page prints at its foot.
 *
 * `updated` is stored as an ISO day (`2026-10-28`) because that sorts, compares
 * and is unambiguous in frontmatter. A reader gets the day, the month's name and
 * the year, formatted in UTC so the build machine's timezone cannot move it.
 * Pure, and shared by the documentation and the notices.
 */
export function readableDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
