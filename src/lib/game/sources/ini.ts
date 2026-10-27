/**
 * `song.ini`: the metadata that sits beside a Guitar Hero or Clone Hero chart.
 *
 * A plain `key = value` file under one `[song]` header, but written by a decade of
 * different tools, so reading it is tolerant on purpose: keys are lower-cased,
 * a value may contain `=` (a charter name with markup in it does), a matching pair
 * of quotes is stripped, and a line that is not a setting is passed over rather
 * than thrown. Nothing here is trusted to be present — every caller asks for what
 * it wants and takes what it gets.
 */

/** The settings a `song.ini` was read into: lower-cased keys, last write wins. */
export type IniValues = Map<string, string>;

export function readIni(text: string): IniValues {
  const values: IniValues = new Map();
  // A file written on an old Mac ends its lines in `\r` alone, and one written on
  // Windows often begins with a byte-order mark that a caller may have decoded into
  // the text. Either would make the first key unreadable, so both are dealt with here
  // rather than by every caller.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (const rawLine of body.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("//") || line.startsWith("#")) {
      continue;
    }
    // A section header carries no setting; the keys inside every section share one
    // namespace, which is fine because these files only ever use `[song]`.
    if (/^\[.*\]$/.test(line)) continue;
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim().toLowerCase();
    let value = line.slice(equals + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (key) values.set(key, value);
  }
  return values;
}

/** A setting as text, or null when it is missing or empty. */
export function iniText(values: IniValues, key: string): string | null {
  const value = values.get(key.toLowerCase());
  return value !== undefined && value.trim() !== "" ? value.trim() : null;
}

/** A setting as a number, or the fallback. `-1` is the sources' "not set". */
export function iniNumber(values: IniValues, key: string, fallback: number): number {
  const raw = iniText(values, key);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** A setting as a flag: `true`, `1`, `yes` all mean yes. */
export function iniFlag(values: IniValues, key: string): boolean {
  const raw = iniText(values, key)?.toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}
