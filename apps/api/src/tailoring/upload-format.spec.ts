import { uploadFormat } from "./upload-format";

describe("uploadFormat", () => {
  it("is PDF on Greenhouse", () =>
    expect(uploadFormat("greenhouse")).toBe("pdf"));
  it("is DOCX on Workday", () => expect(uploadFormat("workday")).toBe("docx"));
  it("is DOCX on Taleo", () => expect(uploadFormat("taleo")).toBe("docx"));
  it("is PDF on an ATS the rule does not name", () => {
    expect(uploadFormat("lever")).toBe("pdf");
    expect(uploadFormat("ashby")).toBe("pdf");
  });
  it("is PDF when the Posting's ATS is unknown", () =>
    expect(uploadFormat(null)).toBe("pdf"));
});
