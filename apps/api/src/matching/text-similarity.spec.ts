import {
  MIN_WORDS,
  shingleSimilarity,
  snippetInside,
  wordsOf,
} from "./text-similarity";

const sentence = (n: number, seed = "a") =>
  Array.from({ length: n }, (_, i) => `${seed}${i}`).join(" ");

describe("wordsOf", () => {
  it("lowercases, drops tags and entities, and splits on punctuation", () => {
    expect(wordsOf("<p>Build &amp; ship,  <b>Fast</b>!</p>")).toEqual([
      "build",
      "ship",
      "fast",
    ]);
  });
});

describe("shingleSimilarity", () => {
  it("is 1 for equal text and ignores markup and case", () => {
    const text = sentence(60);
    expect(shingleSimilarity(text, `<p>${text.toUpperCase()}</p>`)).toBe(1);
  });

  it("stays high when one board adds a short footer to a long text", () => {
    const text = sentence(300);
    expect(
      shingleSimilarity(text, `${text} Apply now on Indeed`),
    ).toBeGreaterThan(0.9);
  });

  it("is low for different text", () => {
    expect(shingleSimilarity(sentence(80, "a"), sentence(80, "b"))).toBe(0);
  });

  it("is null when either side is under the minimum length", () => {
    expect(shingleSimilarity(sentence(MIN_WORDS - 1), sentence(80))).toBeNull();
  });
});

describe("snippetInside", () => {
  const full = sentence(80);
  const snippet = sentence(20);

  it("finds a snippet word for word and drops the trailing ellipsis", () => {
    expect(snippetInside(`${snippet}...`, full)).toBe(true);
  });

  it("ignores a last word that the ellipsis may have cut", () => {
    expect(snippetInside(`${snippet.slice(0, -1)}...`, full)).toBe(true);
  });

  it("rejects a snippet with one changed word", () => {
    expect(snippetInside(snippet.replace("a5", "zz"), full)).toBe(false);
  });

  it("rejects a snippet under the minimum length", () => {
    expect(snippetInside(sentence(5), full)).toBe(false);
  });
});
