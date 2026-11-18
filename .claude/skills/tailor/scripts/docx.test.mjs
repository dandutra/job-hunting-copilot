import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const script = join(dirname(fileURLToPath(import.meta.url)), "docx.mjs");

// Synthetic person: the repo is public.
const RESUME = `<!-- draft 42 -->
# Alex Example
Toronto, ON · 416-555-0100 · [alex@example.com](mailto:alex@example.com) · [github.com/alex](https://github.com/alex)

## Highlights of Qualifications
- First highlight from a college program.
- Second highlight from a job.

## Experience
### **Developer**, Example Co, Toronto, ON | Jan 2024 – Present
- Built a tool that saved time.
- Fixed a bug that cost money.

## Projects
### **Tool** · [github.com/alex/tool](https://github.com/alex/tool)
- Wrote the tool.

## Technical Skills
**Languages:** TypeScript, Python

## Education
### **Computer Programming**, Example College | Expected Dec 2026
`;

const COVER = `
# Cover letter
November 18, 2026

Hiring Team
Example Co

**Re: Developer**

Dear Example Co hiring team,

I would like to apply.

Sincerely,
Alex Example
`;

function folderWith(draft) {
  const dir = mkdtempSync(join(tmpdir(), "tailor-docx-"));
  writeFileSync(join(dir, "draft.md"), draft);
  return dir;
}

const run = (...args) =>
  spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

async function xmlOf(file) {
  const zip = await JSZip.loadAsync(await readFile(file));
  return { zip, doc: await zip.file("word/document.xml").async("string") };
}

const textOf = (doc) =>
  [...doc.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");

test("builds the resume in draft order, Letter size, 0.5 in sides", async () => {
  const dir = folderWith(RESUME);
  const r = run("build", dir);
  assert.equal(r.status, 0, r.stderr);
  const { doc } = await xmlOf(join(dir, "Alex-Example-Resume.docx"));
  const text = textOf(doc);
  const order = [
    "Alex Example",
    "alex@example.com",
    "HIGHLIGHTS OF QUALIFICATIONS",
    "First highlight",
    "EXPERIENCE",
    "Developer",
    "Jan 2024 – Present",
    "Built a tool",
    "PROJECTS",
    "Wrote the tool",
    "TECHNICAL SKILLS",
    "Languages:",
    "EDUCATION",
    "Computer Programming",
  ];
  let at = -1;
  for (const s of order) {
    const i = text.indexOf(s, at + 1);
    assert.ok(i > at, `"${s}" missing or out of order`);
    at = i;
  }
  assert.ok(!text.includes("draft 42"), "the draft ID comment printed");
  assert.match(doc, /<w:pgSz w:w="12240" w:h="15840"/);
  assert.match(doc, /<w:pgMar [^>]*w:right="720"[^>]*w:left="720"/);
});

test("no text run is below 11 pt", async () => {
  const dir = folderWith(RESUME + COVER);
  assert.equal(run("build", dir).status, 0);
  for (const name of ["Alex-Example-Resume.docx", "Alex-Example-Cover-Letter.docx"]) {
    const { zip, doc } = await xmlOf(join(dir, name));
    const styles = await zip.file("word/styles.xml").async("string");
    // docx-js ships Caption and Footnote styles below 11 pt; only the styles a paragraph names render.
    assert.match(styles, /<w:rPrDefault><w:rPr>.*?<w:sz w:val="22"\/>.*?<\/w:rPrDefault>/s);
    const used = new Set([...doc.matchAll(/<w:pStyle w:val="([^"]+)"/g)].map((m) => m[1]));
    assert.ok([...used].every((s) => s === "ListParagraph"), `${name} uses styles ${[...used]}`);
    const sizes = [...doc.matchAll(/<w:sz w:val="(\d+)"/g)].map((m) => +m[1]);
    assert.ok(sizes.length > 0, `${name} sets no sizes`);
    assert.ok(Math.min(...sizes) >= 22, `${name} has a size of ${Math.min(...sizes)} half-points`);
  }
});

test("links are hyperlinks and the zip has no folder entries", async () => {
  const dir = folderWith(RESUME);
  assert.equal(run("build", dir).status, 0);
  const { zip, doc } = await xmlOf(join(dir, "Alex-Example-Resume.docx"));
  assert.equal((doc.match(/<w:hyperlink /g) ?? []).length, 3);
  assert.deepEqual(
    Object.values(zip.files).filter((f) => f.dir).map((f) => f.name),
    [],
  );
});

test("the cover letter carries the header and its blocks", async () => {
  const dir = folderWith(RESUME + COVER);
  assert.equal(run("build", dir).status, 0);
  const text = textOf((await xmlOf(join(dir, "Alex-Example-Cover-Letter.docx"))).doc);
  assert.ok(text.startsWith("Alex Example"));
  assert.ok(text.includes("Re: Developer"));
  assert.ok(text.endsWith("Sincerely,Alex Example"));
  assert.ok(!text.includes("Cover letter"));
});

test("a malformed draft names its line", () => {
  for (const [draft, line] of [
    ["## Experience\n- orphan\n", 1],
    ["# Alex Example\n\n## Experience\n", 3],
    [RESUME.replace("**Developer**", "**Developer"), 10],
    [RESUME.replace("](https://github.com/alex/tool)", "(oops"), 15],
  ]) {
    const r = run("build", folderWith(draft));
    assert.equal(r.status, 1, `exit for line ${line}: ${r.stderr}`);
    assert.match(r.stderr, new RegExp(`draft\\.md:${line}:`));
  }
});

test("refuses to overwrite a .docx saved in Word until --force", async () => {
  const dir = folderWith(RESUME);
  assert.equal(run("build", dir).status, 0);
  const out = join(dir, "Alex-Example-Resume.docx");
  // A Word save rewrites lastModifiedBy with the user's name.
  const { zip } = await xmlOf(out);
  const core = await zip.file("docProps/core.xml").async("string");
  zip.file("docProps/core.xml", core.replace(/(<cp:lastModifiedBy>)[^<]*/, "$1Alex Example"));
  writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }));
  const r = run("build", dir);
  assert.equal(r.status, 4);
  assert.match(r.stderr, /Alex-Example-Resume\.docx/);
  assert.equal(run("build", dir, "--force").status, 0);
  assert.equal(run("build", dir).status, 0);
});

test("text prints a .docx paragraph by paragraph", () => {
  const dir = folderWith(RESUME);
  assert.equal(run("build", dir).status, 0);
  const out = execFileSync(process.execPath, [script, "text", join(dir, "Alex-Example-Resume.docx")], {
    encoding: "utf8",
  });
  const lines = out.trim().split("\n");
  assert.equal(lines[0], "Alex Example");
  assert.ok(lines.includes("Built a tool that saved time."));
  assert.ok(lines.includes("Developer, Example Co, Toronto, ON\tJan 2024 – Present"));
});
