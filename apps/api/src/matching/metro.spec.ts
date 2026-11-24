import { metroOf, sameMetro } from "./metro";

describe("metroOf", () => {
  it.each([
    ["Toronto, ON", "gta"],
    ["Mississauga, Ontario, Canada", "gta"],
    ["London, ON", "london-on"],
    ["London, Ontario, Canada", "london-on"],
    ["Halifax, NS", "halifax"],
    ["Halifax, Nova Scotia", "halifax"],
    ["Remote, Canada", "remote-canada"],
    ["London, United Kingdom", "other"],
    // Board adapters join places with "; ", and a province must sit in the same entry as its city.
    [
      "London, UK; Ottawa, ON; Remote, London, UK; Remote, Ottawa, ON",
      "remote-canada",
    ],
    ["Halifax, England; Remote - Canada; Dartmouth, NS", "remote-canada"],
    ["New York; London, ON", "london-on"],
    ["USA - Remote; CAN-Remote", "remote-canada"],
    ["Vancouver, BC; ON - Remote", "remote-canada"],
    ["Remote", "remote-canada"],
    ["Vancouver, BC", "other"],
    ["Remote, USA", "other"],
    ["", "other"],
  ])("puts %j in %s", (location, metro) => {
    expect(metroOf(location)).toBe(metro);
  });
});

describe("sameMetro", () => {
  it("ignores a difference inside the GTA", () => {
    expect(sameMetro("Toronto, ON", "Markham, ON")).toBe(true);
  });
  it("keeps the GTA and remote apart", () => {
    expect(sameMetro("Toronto, ON", "Remote, Canada")).toBe(false);
  });
  it("keeps London, Halifax, the GTA and remote apart", () => {
    const places = [
      "Toronto, ON",
      "London, ON",
      "Halifax, NS",
      "Remote, Canada",
    ];
    for (const a of places) {
      for (const b of places) {
        expect(sameMetro(a, b)).toBe(a === b);
      }
    }
  });
  it("joins two spellings of one new place", () => {
    expect(sameMetro("London, ON", "London, Ontario, Canada")).toBe(true);
    expect(sameMetro("Halifax, NS", "Halifax, Nova Scotia")).toBe(true);
  });
  it("joins two Other places only when the text is equal", () => {
    expect(sameMetro("Calgary, AB", "calgary,  ab")).toBe(true);
    expect(sameMetro("Calgary, AB", "Vancouver, BC")).toBe(false);
  });
});
