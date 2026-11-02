import { normalizeName } from "./normalize-name";

describe("normalizeName", () => {
  it.each([
    ["RBC", "rbc"],
    ["Acme Inc", "acme"],
    ["Acme, Inc.", "acme"],
    ["Acme Ltd.", "acme"],
    ["Acme Corp", "acme"],
    ["Acme Corp.", "acme"],
    ["Shopify Canada", "shopify"],
    ["Acme Canada Inc.", "acme"],
    ["  Acme   Labs ", "acme labs"],
    ["Canada Life", "canada life"],
    ["Incredible Co", "incredible co"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });
});
