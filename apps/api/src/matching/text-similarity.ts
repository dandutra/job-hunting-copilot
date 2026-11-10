export const MIN_WORDS = 30;
export const SNIPPET_MIN_WORDS = 10;
const SHINGLE_WORDS = 5;

export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, " ")
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function shinglesOf(words: string[]): Set<string> {
  const shingles = new Set<string>();
  for (let i = 0; i + SHINGLE_WORDS <= words.length; i++) {
    shingles.add(words.slice(i, i + SHINGLE_WORDS).join(" "));
  }
  return shingles;
}

// Jaccard on word shingles. Null when a side is too short to judge, so a stub never counts as evidence.
export function shingleSimilarity(a: string, b: string): number | null {
  const left = wordsOf(a);
  const right = wordsOf(b);
  if (left.length < MIN_WORDS || right.length < MIN_WORDS) return null;
  const x = shinglesOf(left);
  const y = shinglesOf(right);
  let shared = 0;
  for (const shingle of x) if (y.has(shingle)) shared++;
  return shared / (x.size + y.size - shared);
}

// The ellipsis may have cut the last word, so that word is not compared.
export function snippetInside(snippet: string, full: string): boolean {
  const cut = /(?:\.{3}|…)\s*$/.test(snippet.trim());
  const words = wordsOf(snippet);
  if (cut) words.pop();
  if (words.length < SNIPPET_MIN_WORDS) return false;
  return ` ${wordsOf(full).join(" ")} `.includes(` ${words.join(" ")} `);
}
