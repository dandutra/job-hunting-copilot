import { metroOf, sameMetro } from "./metro";

describe("metroOf", () => {
  it.each([
    ["Toronto, ON", "gta"],
    ["Mississauga, Ontario, Canada", "gta"],
    ["Remote, Canada", "remote-canada"],
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
  it("joins two Other places only when the text is equal", () => {
    expect(sameMetro("Calgary, AB", "calgary,  ab")).toBe(true);
    expect(sameMetro("Calgary, AB", "Vancouver, BC")).toBe(false);
  });
});
