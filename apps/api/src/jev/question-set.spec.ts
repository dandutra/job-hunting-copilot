import { CAP_QUESTIONS } from "./question-set";

describe("CAP_QUESTIONS", () => {
  // The Search area is the GTA, London (Ontario) and Halifax (Nova Scotia), so the location cap must not name only the GTA, or Noul would cap a Posting there.
  it("names every Search-area place in the location cap", () => {
    const question = CAP_QUESTIONS.outside_gta;
    expect(question).toContain("Greater Toronto Area");
    expect(question).toContain("London (Ontario)");
    expect(question).toContain("Halifax (Nova Scotia)");
  });
});
