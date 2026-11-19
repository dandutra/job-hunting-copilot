import JSZip from "jszip";
import { extractText, getDocumentProxy, getMeta } from "unpdf";
import type { LetterModel, ResumeModel } from "../src/model";
import { HEADINGS, formatDates, formatLetterDate } from "../src/view";

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

export async function readPdf(buf: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const meta = await getMeta(pdf);
  const page = await pdf.getPage(1);
  // Text items grouped by baseline, so a test can tell a URL on one line from one that wrapped.
  const content = await page.getTextContent();
  const byY = new Map<number, string>();
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const y = Math.round(item.transform[5]);
    byY.set(y, (byY.get(y) ?? "") + item.str);
  }
  return {
    lines: [...byY.values()],
    text: squash(text),
    pages: totalPages,
    info: meta.info as Record<string, unknown>,
    // [x0, y0, x1, y1] in points; US Letter is 612 by 792.
    view: page.view as number[],
  };
}

export async function readDocx(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const file = async (name: string) => {
    const f = zip.file(name);
    return f ? f.async("string") : "";
  };
  const documentXml = await file("word/document.xml");
  const paragraphs = [...documentXml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(
    (p) =>
      [...p[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(""),
  );
  return {
    text: squash(paragraphs.join(" ")),
    documentXml,
    coreXml: await file("docProps/core.xml"),
    settingsXml: await file("word/settings.xml"),
    parts: Object.keys(zip.files),
  };
}

// Every string the model prints, in the order the templates print it.
export function expectedStrings(m: ResumeModel): string[] {
  const jobs = (js: ResumeModel["experience"]) =>
    js.flatMap((j) => [
      j.title,
      j.org,
      j.location,
      formatDates(j.start, j.end),
      ...j.lines,
    ]);
  const out = [
    m.contact.name,
    m.contact.city,
    m.contact.email,
    ...(m.contact.phone ? [m.contact.phone] : []),
    ...m.contact.links,
  ];
  if (m.highlights.length) out.push(HEADINGS.highlights, ...m.highlights);
  if (m.experience.length) out.push(HEADINGS.experience, ...jobs(m.experience));
  if (m.projects.length) {
    out.push(
      HEADINGS.projects,
      ...m.projects.flatMap((p) => [p.name, ...p.links]),
    );
  }
  if (m.education.length) {
    out.push(
      HEADINGS.education,
      ...m.education.flatMap((e) => [
        e.program,
        e.school,
        formatDates(e.start, e.end),
      ]),
    );
  }
  if (m.skills.length) out.push(HEADINGS.skills, ...m.skills);
  if (m.volunteer.length) out.push(HEADINGS.volunteer, ...jobs(m.volunteer));
  return out;
}

// Every string the letter prints, in order. The name comes back after the sign-off.
export function expectedLetterStrings(m: LetterModel): string[] {
  return [
    m.contact.name,
    m.contact.city,
    m.contact.email,
    ...(m.contact.phone ? [m.contact.phone] : []),
    ...m.contact.links,
    formatLetterDate(m.date),
    m.company,
    m.greeting,
    ...m.paragraphs,
    m.signOff,
    m.contact.name,
  ];
}

// Throws naming the first string that is missing or out of order.
export function assertInOrder(text: string, strings: string[]): void {
  let from = 0;
  for (const s of strings) {
    const at = text.indexOf(squash(s), from);
    if (at < 0) {
      throw new Error(`"${s}" is missing or out of order after offset ${from}`);
    }
    from = at + s.length;
  }
}
