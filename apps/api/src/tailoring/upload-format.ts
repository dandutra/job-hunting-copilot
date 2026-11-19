export type UploadFormat = "pdf" | "docx";

// The one place the rule lives. Low confidence: Workday and Taleo are thought to parse a DOCX
// better, and the smoke test with a real ATS can change this list.
const DOCX_ATS = new Set(["workday", "taleo"]);

// The file to upload for a Posting's ATS. PDF on Greenhouse and on anything not named, or unknown.
export function uploadFormat(ats: string | null): UploadFormat {
  return ats !== null && DOCX_ATS.has(ats.toLowerCase()) ? "docx" : "pdf";
}
