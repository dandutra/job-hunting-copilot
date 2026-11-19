import { chmod, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderDocx, renderPdf, type ResumeModel } from "../src";
import { formatDates } from "../src/view";
import { fakeResume, longFakeResume } from "./fixtures";
import { assertInOrder, expectedStrings, readDocx, readPdf } from "./read";

afterEach(() => vi.unstubAllEnvs());

const pinnedPattern = new RegExp(
  readFileSync(join(__dirname, "../typst-version"), "utf8")
    .trim()
    .replaceAll(".", "\\."),
);

describe("contract: every model string appears, in order", () => {
  for (const [name, model] of [
    ["one-page resume", fakeResume],
    ["two-page resume", longFakeResume()],
    [
      "resume with no phone, highlights, projects, volunteer or skills",
      {
        ...fakeResume,
        highlights: [],
        contact: { ...fakeResume.contact, phone: undefined },
        projects: [],
        skills: [],
        volunteer: [],
      },
    ],
  ] as [string, ResumeModel][]) {
    it(`PDF and DOCX, ${name}`, async () => {
      const want = expectedStrings(model);
      assertInOrder((await readPdf(await renderPdf(model))).text, want);
      assertInOrder((await readDocx(await renderDocx(model))).text, want);
    });
  }

  it("the two-page fixture takes two pages in the PDF", async () => {
    expect((await readPdf(await renderPdf(longFakeResume()))).pages).toBe(2);
  });

  it("fails when a section is dropped or moved", async () => {
    const want = expectedStrings(fakeResume);
    const { text } = await readPdf(await renderPdf(fakeResume));
    const dropped = text
      .replace("Education", "")
      .replace("Lakeview College", "");
    expect(() => assertInOrder(dropped, want)).toThrow(/Education|Lakeview/);
    const swapped = text.replace(
      "Volunteer Experience",
      "Experience Volunteer",
    );
    expect(() => assertInOrder(swapped, want)).toThrow();
  });
});

describe("template rules", () => {
  const template = readFileSync(join(__dirname, "../src/resume.typ"), "utf8");

  it("1. one column, no table, text box, image, header, footer or hidden text", async () => {
    const docx = await readDocx(await renderDocx(fakeResume));
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
    // The PDF's column count can't be read from its text, so the template is checked for
    // the constructs that make columns, boxes and images. The in-order read-back above
    // is what failed on a two-column PDF in the research.
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
    // Long enough to need its own line after the contact details, with hyphens a browser-style wrap would use.
    const long =
      "https://github.com/example-jordan/inventory-tracker-with-a-long-name";
    const model = {
      ...fakeResume,
      contact: { ...fakeResume.contact, links: [long] },
    };
    const want = [model.contact.name, model.contact.email, long, "Experience"];
    const pdf = await readPdf(await renderPdf(model));
    assertInOrder(pdf.text, want);
    // Joined text hides a wrap, so the check is that one line holds the whole URL.
    expect(pdf.lines.some((l) => l.includes(long))).toBe(true);
    assertInOrder((await readDocx(await renderDocx(model))).text, want);
  });

  it("3. the five headings are plain, with volunteer last", async () => {
    const { text } = await readPdf(await renderPdf(fakeResume));
    assertInOrder(text, [
      "Experience",
      "Projects",
      "Education",
      "Skills",
      "Volunteer Experience",
      "Mentor",
    ]);
    expect(text.indexOf("Mentor")).toBeGreaterThan(
      text.indexOf("Volunteer Experience"),
    );
  });

  it("4. a project prints its name and links only", async () => {
    const model = {
      ...fakeResume,
      projects: [
        { name: "Trail Notes", links: [], repo: "private/trail-notes" },
      ],
    };
    const { text } = await readPdf(await renderPdf(model));
    expect(text).toContain("Trail Notes");
    expect(text).not.toContain("private/trail-notes");
  });

  it("5. US Letter, with no justification or hyphenation", async () => {
    const pdf = await readPdf(await renderPdf(fakeResume));
    expect(pdf.view).toEqual([0, 0, 612, 792]);
    expect(template).toContain("justify: false");
    expect(template).toContain("hyphenate: false");
    const docx = await readDocx(await renderDocx(fakeResume));
    expect(docx.documentXml).toContain('w:w="12240"');
    expect(docx.documentXml).toContain('w:h="15840"');
    expect(docx.documentXml).not.toContain('w:val="both"');
    expect(docx.settingsXml).not.toContain("autoHyphenation");
  });

  it("6. one date format, with and without an end date", async () => {
    expect(formatDates("2022-03", "2024-08")).toBe("Mar 2022 - Aug 2024");
    expect(formatDates("2023-01-15")).toBe("Jan 2023 - Present");
    expect(() => formatDates("March 2022")).toThrow(/Bad resume date/);
    const want = [
      "Mar 2022 - Aug 2024",
      "Jun 2020 - Feb 2022",
      "Jan 2023 - Present",
    ];
    assertInOrder(
      (await readPdf(await renderPdf(fakeResume))).text,
      want.slice(0, 2),
    );
    assertInOrder((await readDocx(await renderDocx(fakeResume))).text, want);
  });

  it("7. metadata is set in both files", async () => {
    const pdf = await readPdf(await renderPdf(fakeResume));
    expect(pdf.info.Title).toBe(fakeResume.title);
    expect(pdf.info.Author).toBe(fakeResume.contact.name);
    expect(String(pdf.info.Creator)).not.toBe("");
    const { coreXml } = await readDocx(await renderDocx(fakeResume));
    expect(coreXml).toContain(`<dc:title>${fakeResume.title}</dc:title>`);
    expect(coreXml).toContain(
      `<dc:creator>${fakeResume.contact.name}</dc:creator>`,
    );
    expect(coreXml).toContain(
      `<cp:lastModifiedBy>${fakeResume.contact.name}</cp:lastModifiedBy>`,
    );
  });

  it("8. planted IDs, a Do-not-claim and a repo never print", async () => {
    const planted = {
      ...fakeResume,
      id: "E9",
      doNotClaims: ["Never claim a law degree"],
      experience: [
        {
          ...fakeResume.experience[0],
          id: "E1",
          lines: ["Built a report."],
        },
      ],
      projects: [{ name: "Widget Tool", links: [], repo: "owner/secret-repo" }],
    };
    // The types reject these fields, and the views drop them if a caller casts past the types.
    const bad: ResumeModel = {
      ...fakeResume,
      // @ts-expect-error an Entry ID is not a model field
      id: "E9",
    };
    expect(bad).toBeDefined();
    const model = planted as unknown as ResumeModel;
    const pdf = await readPdf(await renderPdf(model));
    const docx = await readDocx(await renderDocx(model));
    // Body text, PDF metadata and the DOCX XML parts, each searched for every planted value.
    const places = [
      pdf.text,
      JSON.stringify(pdf.info),
      docx.text,
      docx.coreXml,
      docx.documentXml,
    ];
    for (const place of places) {
      expect(place).not.toMatch(/\bE[19]\b/);
      for (const secret of ["law degree", "secret-repo"]) {
        expect(place).not.toContain(secret);
      }
    }
    for (const buf of [await renderPdf(model), await renderDocx(model)]) {
      expect(buf.includes("secret-repo")).toBe(false);
    }
  });

  it("9. each file is under 100 KB, even at two pages", async () => {
    for (const model of [fakeResume, longFakeResume()]) {
      expect((await renderPdf(model)).length).toBeLessThan(100_000);
      expect((await renderDocx(model)).length).toBeLessThan(100_000);
    }
  });
});

describe("working folder", () => {
  async function inEmptyTmp(fn: () => Promise<unknown>) {
    const tmp = await mkdtemp(join(tmpdir(), "rr-test-"));
    vi.stubEnv("TMPDIR", tmp);
    try {
      await fn();
      return await readdir(tmp);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  it("is gone after a successful render", async () => {
    expect(await inEmptyTmp(() => renderPdf(fakeResume))).toEqual([]);
  });

  it("is gone after a failed render", async () => {
    // A stand-in typst that reports the pinned version, then fails the compile.
    const bin = await mkdtemp(join(tmpdir(), "rr-bin-"));
    const pinned = readFileSync(
      join(__dirname, "../typst-version"),
      "utf8",
    ).trim();
    await writeFile(
      join(bin, "typst"),
      `#!/bin/sh\n[ "$1" = "--version" ] && { echo "typst ${pinned} (fake)"; exit 0; }\necho boom >&2\nexit 1\n`,
    );
    await chmod(join(bin, "typst"), 0o755);
    const tmp = await mkdtemp(join(tmpdir(), "rr-test-"));
    vi.stubEnv("TMPDIR", tmp);
    vi.stubEnv("PATH", `${bin}:${process.env.PATH}`);
    try {
      // "boom" comes from the fake's compile, so the working folder existed when it failed.
      await expect(renderPdf(fakeResume)).rejects.toThrow(/boom/);
      expect(await readdir(tmp)).toEqual([]);
    } finally {
      await rm(tmp, { recursive: true, force: true });
      await rm(bin, { recursive: true, force: true });
    }
  });
});

describe("the pinned Typst", () => {
  it("fails naming the pinned version when typst is missing", async () => {
    vi.stubEnv("PATH", "/nonexistent");
    await expect(renderPdf(fakeResume)).rejects.toThrow(pinnedPattern);
  });

  it("fails naming the pinned version when typst is another version", async () => {
    const bin = await mkdtemp(join(tmpdir(), "rr-bin-"));
    await writeFile(
      join(bin, "typst"),
      '#!/bin/sh\necho "typst 0.14.0 (fake)"\n',
    );
    await chmod(join(bin, "typst"), 0o755);
    vi.stubEnv("PATH", `${bin}:${process.env.PATH}`);
    try {
      await expect(renderPdf(fakeResume)).rejects.toThrow(pinnedPattern);
    } finally {
      await rm(bin, { recursive: true, force: true });
    }
  });
});
