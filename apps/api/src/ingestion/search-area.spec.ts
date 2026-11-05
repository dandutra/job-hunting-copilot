import { inSearchArea } from "./search-area";

describe("inSearchArea", () => {
  it.each([
    "Toronto",
    "Mississauga",
    "Brampton",
    "Markham",
    "Vaughan",
    "Richmond Hill",
    "Oakville",
    "Milton",
    "Pickering",
    "Ajax",
    "Whitby",
    "Oshawa",
    "Newmarket",
    "Aurora",
  ])("accepts %s", (city) => {
    expect(inSearchArea([`${city}, ON`])).toBe(true);
  });

  it.each([
    "Toronto, ON",
    "TORONTO, Ontario, Canada",
    "CAN-ON-TORONTO",
    "Remote - Canada",
    "Hybrid (Toronto)",
    "Remote",
    "Remote, Ontario",
    "Remote, ON",
    "CAN-Remote",
    "CAN-ON-Remote",
    "Remote - Worldwide",
    "Remote (Global)",
    "Remote - Ottawa, ON",
    "Remote, Waterloo, ON, CA",
    "CAN-ON-Ottawa-Remote",
    "Remote (ON)",
    "richmond-hill, on",
    "Toronto; New York",
  ])("accepts the form %s", (location) => {
    expect(inSearchArea([location])).toBe(true);
  });

  it.each([
    "Remote - US",
    "Remote, United States",
    "Remote - EMEA",
    "Remote, CA",
    "Remote or On-site, Austin, TX",
    "Remote (based on EST hours), US",
    "Remote - can be anywhere in US",
    "Montreal, QC",
    "Hamilton, ON",
    "Vancouver, BC",
    "",
  ])("rejects %s", (location) => {
    expect(inSearchArea([location])).toBe(false);
  });

  it("accepts a list when any location is in the area", () => {
    expect(inSearchArea(["New York, NY", "Toronto, ON"])).toBe(true);
  });

  it("rejects an empty list", () => {
    expect(inSearchArea([])).toBe(false);
  });

  it("does not match a city inside a longer word", () => {
    expect(inSearchArea(["Torontoville"])).toBe(false);
  });
});
