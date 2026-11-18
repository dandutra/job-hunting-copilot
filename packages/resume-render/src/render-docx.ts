import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { ResumeModel } from "./model";
import { HEADINGS, viewOf, type JobView } from "./view";

const FONT = "Arial";
// docx sizes are half-points.
const BODY = 21;

const para = (runs: TextRun[], extra: { spacingBefore?: number } = {}) =>
  new Paragraph({
    children: runs,
    alignment: AlignmentType.LEFT,
    spacing: { before: extra.spacingBefore ?? 0, after: 40 },
  });
// Each run names the font too, because some previewers ignore the document default.
const text = (t: string, opts: { bold?: boolean } = {}) =>
  new TextRun({ text: t, bold: opts.bold, font: FONT });
const heading = (t: string) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: t })],
  });
const bullet = (t: string) =>
  new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [text(t)],
    spacing: { after: 20 },
  });

function jobParagraphs(j: JobView): Paragraph[] {
  return [
    para([text(j.title, { bold: true }), text(`, ${j.org}`)], {
      spacingBefore: 160,
    }),
    para([text(`${j.location} | ${j.dates}`)]),
    ...j.lines.map(bullet),
  ];
}

export async function renderDocx(model: ResumeModel): Promise<Buffer> {
  const v = viewOf(model);
  const contact = [v.details.join(" | "), v.links.join(" | ")]
    .filter((s) => s.length > 0)
    .join(" | ");

  const body: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: v.name })],
    }),
    para([text(contact)]),
  ];
  if (v.experience.length > 0) {
    body.push(
      heading(HEADINGS.experience),
      ...v.experience.flatMap(jobParagraphs),
    );
  }
  if (v.projects.length > 0) {
    body.push(
      heading(HEADINGS.projects),
      ...v.projects.map((p) =>
        para([text([p.name, p.links.join(" | ")].filter(Boolean).join(" | "))]),
      ),
    );
  }
  if (v.education.length > 0) {
    body.push(
      heading(HEADINGS.education),
      ...v.education.map((e) =>
        para([
          text(e.program, { bold: true }),
          text(`, ${e.school} | ${e.dates}`),
        ]),
      ),
    );
  }
  if (v.skills.length > 0) {
    body.push(heading(HEADINGS.skills), para([text(v.skills.join(", "))]));
  }
  if (v.volunteer.length > 0) {
    body.push(
      heading(HEADINGS.volunteer),
      ...v.volunteer.flatMap(jobParagraphs),
    );
  }

  const doc = new Document({
    title: v.title,
    creator: v.name,
    // docx writes "Un-named" here until told otherwise.
    lastModifiedBy: v.name,
    styles: {
      default: { document: { run: { font: FONT, size: BODY } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: 32, bold: true },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: 23, bold: true },
          paragraph: { spacing: { before: 200, after: 60 } },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 240 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          // US Letter with 0.75 in margins, as in the PDF.
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
          },
        },
        children: body,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
