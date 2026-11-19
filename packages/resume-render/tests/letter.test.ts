import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  renderDocx,
  renderLetterDocx,
  renderLetterPdf,
  renderPdf,
  type LetterModel,
  type ResumeModel,
} from "../src";
import { formatLetterDate } from "../src/view";
import { fakeLetter, fakeResume } from "./fixtures";
import {
  assertInOrder,
  expectedLetterStrings,
  readDocx,
  readPdf,
} from "./read";

describe("contract: every letter string appears, in order", () => {
  for (const [name, model] of [
    ["full letter", fakeLetter],
    [
      "letter with no phone and no links",
      {
        ...fakeLetter,
        contact: { ...fakeLetter.contact, phone: undefined, links: [] },
      },
    ],
  ] as [string, LetterModel][]) {
    it(`PDF and DOCX, ${name}`, async () => {
      const want = expectedLetterStrings(model);
      assertInOrder((await readPdf(await renderLetterPdf(model))).text, want);
      assertInOrder((await readDocx(await renderLetterDocx(model))).text, want);
    });
  }

  it("fails when a paragraph is dropped or moved", async () => {
    const want = expectedLetterStrings(fakeLetter);
    const { text } = await readPdf(await renderLetterPdf(fakeLetter));
    const middle = fakeLetter.paragraphs[1];
    expect(() => assertInOrder(text.replace(middle, ""), want)).toThrow(
      /At Northwind/,
    );
    const [first, last] = [fakeLetter.paragraphs[0], fakeLetter.paragraphs[2]];
    const swapped = text
      .replace(first, "@@")
      .replace(last, first)
      .replace("@@", last);
    expect(() => assertInOrder(swapped, want)).toThrow();
  });
});

describe("letter template rules", () => {
  it("1. one column, with no table, text box, image, header, footer or hidden text", async () => {
    const docx = await readDocx(await renderLetterDocx(fakeLetter));
    for (const tag of [
      "<w:tbl",
      "<w:txbxContent",
      "<w:drawing",
      "<w:pict",
      "<w:vanish",
    ]) {
      expect(docx.documentXml).not.toContain(tag);
    }
    expect(docx.parts.filter((p) => /header|footer/.test(p))).toEqual([]);
    // The same source scan as the resume's rule 1, because a PDF's columns can't be read from its text.
    const template = readFileSync(join(__dirname, "../src/letter.typ"), "utf8");
    for (const word of [
      "table",
      "grid",
      "columns",
      "image",
      "place",
      "header:",
      "footer:",
      "hide(",
    ]) {
      expect(template).not.toContain(word);
    }
  });

  it("2. the contact block comes first, and a long URL stays whole", async () => {
    const long =
      "https://github.com/example-jordan/inventory-tracker-with-a-long-name";
    const model = {
      ...fakeLetter,
      contact: { ...fakeLetter.contact, links: [long] },
    };
    const want = [
      model.contact.name,
      model.contact.email,
      long,
      formatLetterDate(model.date),
    ];
    const pdf = await readPdf(await renderLetterPdf(model));
    assertInOrder(pdf.text, want);
    expect(pdf.lines.some((l) => l.includes(long))).toBe(true);
    assertInOrder((await readDocx(await renderLetterDocx(model))).text, want);
  });

  it("5. US Letter, with no justification or hyphenation", async () => {
    const pdf = await readPdf(await renderLetterPdf(fakeLetter));
    expect(pdf.view).toEqual([0, 0, 612, 792]);
    expect(pdf.pages).toBe(1);
    const docx = await readDocx(await renderLetterDocx(fakeLetter));
    expect(docx.documentXml).toContain('w:w="12240"');
    expect(docx.documentXml).toContain('w:h="15840"');
    expect(docx.documentXml).not.toContain('w:val="both"');
    expect(docx.settingsXml).not.toContain("autoHyphenation");
  });

  it("6. the date prints as Month D, YYYY in both files", async () => {
    expect(formatLetterDate("2026-11-19")).toBe("November 19, 2026");
    expect(formatLetterDate("2026-01-05")).toBe("January 5, 2026");
    expect(() => formatLetterDate("2026-02-30")).toThrow(/Bad letter date/);
    expect(() => formatLetterDate("Nov 19 2026")).toThrow(/Bad letter date/);
    assertInOrder((await readPdf(await renderLetterPdf(fakeLetter))).text, [
      "November 19, 2026",
    ]);
    assertInOrder((await readDocx(await renderLetterDocx(fakeLetter))).text, [
      "November 19, 2026",
    ]);
  });

  it("7. metadata is set in both files", async () => {
    const pdf = await readPdf(await renderLetterPdf(fakeLetter));
    expect(pdf.info.Title).toBe(fakeLetter.title);
    expect(pdf.info.Author).toBe(fakeLetter.contact.name);
    expect(String(pdf.info.Creator)).not.toBe("");
    const { coreXml } = await readDocx(await renderLetterDocx(fakeLetter));
    expect(coreXml).toContain(`<dc:title>${fakeLetter.title}</dc:title>`);
    expect(coreXml).toContain(
      `<dc:creator>${fakeLetter.contact.name}</dc:creator>`,
    );
    expect(coreXml).toContain(
      `<cp:lastModifiedBy>${fakeLetter.contact.name}</cp:lastModifiedBy>`,
    );
  });

  it("8. planted Entry IDs and a Do-not-claim never reach the body or the metadata", async () => {
    // The types reject these fields. The views drop them if a caller casts past the types.
    const model = {
      ...fakeLetter,
      sources: ["E1", "E2"],
      rules: ["R1"],
      doNotClaims: ["Never claim a law degree"],
    } as unknown as LetterModel;
    const pdfBuf = await renderLetterPdf(model);
    const docxBuf = await renderLetterDocx(model);
    const pdf = await readPdf(pdfBuf);
    const docx = await readDocx(docxBuf);
    const places = [
      pdf.text,
      JSON.stringify(pdf.info),
      docx.text,
      docx.coreXml,
      docx.documentXml,
    ];
    for (const place of places) {
      expect(place).not.toMatch(/\bE[12]\b/);
      expect(place).not.toContain("law degree");
    }
    for (const buf of [pdfBuf, docxBuf]) {
      expect(buf.includes("law degree")).toBe(false);
    }
  });

  it("9. each file is under 100 KB", async () => {
    expect((await renderLetterPdf(fakeLetter)).length).toBeLessThan(100_000);
    expect((await renderLetterDocx(fakeLetter)).length).toBeLessThan(100_000);
  });
});

describe("a bad date", () => {
  // A caller can `.catch()` or `Promise.all` the renderers only if every failure is a rejection.
  it("rejects every renderer instead of throwing", async () => {
    const letter = { ...fakeLetter, date: "2026-02-30" };
    const resume = {
      ...fakeResume,
      experience: [{ ...fakeResume.experience[0], start: "2026-13" }],
    } as ResumeModel;
    await expect(renderLetterPdf(letter)).rejects.toThrow(/Bad letter date/);
    await expect(renderLetterDocx(letter)).rejects.toThrow(/Bad letter date/);
    await expect(renderPdf(resume)).rejects.toThrow(/Bad resume date/);
    await expect(renderDocx(resume)).rejects.toThrow(/Bad resume date/);
  });
});
