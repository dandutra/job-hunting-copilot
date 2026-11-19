// Levels the user is not applying for. `lead` and `architect` stay out because some junior-friendly titles use them.
// See the "Jev judges a narrow set of Postings" decision.
const WORDS = [
  "senior",
  "sr",
  "staff",
  "principal",
  "director",
  "head",
  "vp",
  "vice president",
  "manager",
  "intern",
  "internship",
  "co-op",
  "coop",
  "student",
];

// Whole words only, ignoring case; any other character counts as a boundary, so "Sr." and "(Senior)" match and "Internal" does not.
const PATTERN = new RegExp(
  `(?<![a-z0-9])(?:${WORDS.map((w) => w.replace(/[-\s]/g, "[-\\s]")).join("|")})(?![a-z0-9])`,
  "i",
);

export function titleFiltered(title: string): boolean {
  return PATTERN.test(title);
}
