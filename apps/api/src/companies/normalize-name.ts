const SUFFIX = /[\s,]+(?:inc|ltd|corp|canada)\.?$/;

export function normalizeName(name: string): string {
  let result = name.toLowerCase().replace(/\s+/g, " ").trim();
  // Loop because "Acme Canada Inc." loses two suffixes.
  for (let previous = ""; previous !== result;) {
    previous = result;
    result = result.replace(SUFFIX, "").trim();
  }
  return result.replace(/^(?:inc|ltd|corp|canada)\.?$/, "");
}
