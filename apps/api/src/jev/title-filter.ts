import { readFileSync } from "node:fs";

// The path is relative to apps/api, like the tier config's default; the API image copies config/ to the same place.
const DEFAULT_PATH = "../../config/title-filter.json";

export interface TitleFilter {
  // A title passes when it holds an include phrase and no exclude word; exempt phrases are removed before the exclude check only.
  passes(title: string): boolean;
}

// Whole words, ignoring case: any run of characters other than letters and digits is one boundary, so "Sr." and "co-op" match their words and "Internal" does not match "intern".
function words(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function list(value: unknown, key: string, mayBeEmpty: boolean): string[] {
  if (!Array.isArray(value))
    throw new Error(`title filter: ${key} must be a list`);
  if (!mayBeEmpty && value.length === 0)
    throw new Error(`title filter: ${key} must not be empty`);
  return value.map((entry, i) => {
    if (typeof entry !== "string" || !words(entry))
      throw new Error(`title filter: ${key}[${i}] must be a non-blank string`);
    return words(entry);
  });
}

function parseFile(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `title filter: the file is not valid JSON (${err instanceof Error ? err.message : String(err)})`,
      { cause: err },
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error("title filter: the file must be an object");
  return parsed as Record<string, unknown>;
}

// Pure, so a spec can feed it bad files. It ignores `searchTerms`, which `loadSearchTerms` reads.
export function loadTitleFilter(text: string): TitleFilter {
  const file = parseFile(text);
  const include = list(file.include, "include", false);
  const exclude = list(file.exclude, "exclude", true);
  const exempt = list(file.exempt, "exempt", true);

  // Matching runs on space-padded word strings, so a phrase can only match whole words.
  const has = (padded: string, phrase: string) =>
    padded.includes(` ${phrase} `);
  return {
    passes(title) {
      const padded = ` ${words(title)} `;
      // Exempt phrases leave only the exclude check, so their own words (such as "Staff" in "Member of Technical Staff") name no level. The include check still sees them, because that phrase is also an include phrase. Two spaces keep the words on either side from joining.
      let stripped = padded;
      for (const phrase of exempt)
        stripped = stripped.split(` ${phrase} `).join("  ");
      return (
        include.some((p) => has(padded, p)) &&
        !exclude.some((p) => has(stripped, p))
      );
    },
  };
}

// JobSpy's search terms live in the same file but are sent to a board as written, so unlike the filter lists they keep their case.
export function loadSearchTerms(text: string): string[] {
  const value = parseFile(text).searchTerms;
  if (!Array.isArray(value))
    throw new Error("title filter: searchTerms must be a list");
  if (value.length === 0)
    throw new Error("title filter: searchTerms must not be empty");
  return value.map((entry, i) => {
    if (typeof entry !== "string" || !entry.trim())
      throw new Error(
        `title filter: searchTerms[${i}] must be a non-blank string`,
      );
    // The adapter wraps each term in quotes, so a quote inside one would unbalance the query.
    if (entry.includes('"'))
      throw new Error(`title filter: searchTerms[${i}] must not contain "`);
    return entry.trim();
  });
}

function readConfig(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(
      `title filter: cannot read ${path} (${err instanceof Error ? err.message : String(err)})`,
      { cause: err },
    );
  }
}

export function readTitleFilter(path: string = DEFAULT_PATH): TitleFilter {
  return loadTitleFilter(readConfig(path));
}

let loaded: TitleFilter | undefined;

// Read once per process: it runs on every row of every poll. `ingest` calls it at startup, so a bad file stops the process before the first tick.
export function getTitleFilter(): TitleFilter {
  loaded ??= readTitleFilter();
  return loaded;
}

export function titlePasses(title: string): boolean {
  return getTitleFilter().passes(title);
}

// Read once per process, like the filter. The ingest module builds both JobSpy adapters from it at startup, so a bad list stops `ingest` before the first tick.
let loadedTerms: string[] | undefined;
export function getSearchTerms(): string[] {
  loadedTerms ??= loadSearchTerms(readConfig(DEFAULT_PATH));
  return loadedTerms;
}
