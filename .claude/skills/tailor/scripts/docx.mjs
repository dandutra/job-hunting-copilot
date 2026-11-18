#!/usr/bin/env node
// Builds the resume (and cover letter) .docx from a local-mode draft.md, and reads a .docx back as
// text. The format of draft.md is in ../references/local-mode.md. The layout copies the HOOPP resume
// the user sent, with every run at 11 pt or more.
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  LevelFormat,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
} from "docx";
import JSZip from "jszip";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FONT = "Calibri";
// docx sizes are half-points. 22 is the 11 pt floor.
const BODY = 22;
const NAME = 36;
const SECTION = 24;
const LINK = "1F4E79";
const RULE = "1F3864";
// US Letter less two 0.5 in margins, in twentieths of a point.
const TEXT_WIDTH = 10800;
// Word writes its own name here on save, so a different value means the user edited the file.
const BUILT_BY = "tailor build";

class DraftError extends Error {
  constructor(line, reason) {
    super(`draft.md:${line}: ${reason}`);
  }
}

// `**bold**` and `[text](url)`; anything else is literal text.
function inline(src, line, base = {}) {
  if ((src.match(/\*\*/g) ?? []).length % 2 !== 0) throw new DraftError(line, "unclosed **");
  const out = [];
  let bold = false;
  for (const part of src.split(/(\*\*|\[[^\]]*\]\([^)\s]+\))/)) {
    if (part === "**") {
      bold = !bold;
    } else if (part.startsWith("[") && part.endsWith(")") && part.includes("](")) {
      const [, text, url] = part.match(/^\[([^\]]*)\]\(([^)\s]+)\)$/);
      out.push(
        new ExternalHyperlink({
          link: url,
          children: [new TextRun({ text, font: FONT, color: LINK, bold, ...base })],
        }),
      );
    } else if (part) {
      if (/\[|\]\(/.test(part)) throw new DraftError(line, "malformed link; write [text](url)");
      out.push(new TextRun({ text: part, font: FONT, bold, ...base }));
    }
  }
  return out;
}

const plain = (src, line, spacing = { after: 10 }) =>
  new Paragraph({ children: inline(src, line), spacing });

const section = (title) =>
  new Paragraph({
    children: [new TextRun({ text: title.toUpperCase(), font: FONT, bold: true, color: RULE, size: SECTION })],
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: RULE } },
    spacing: { before: 100, after: 40 },
  });

// `### lead | dates`: the dates sit on a right tab stop at the margin.
function entry(src, line) {
  const at = src.lastIndexOf(" | ");
  const lead = at < 0 ? src : src.slice(0, at);
  const children = inline(lead, line);
  if (at >= 0) children.push(new TextRun({ children: [new Tab(), src.slice(at + 3)], font: FONT }));
  return new Paragraph({
    children,
    keepNext: true,
    tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }],
    spacing: { before: 40, after: 10 },
  });
}

const bullet = (src, line) =>
  new Paragraph({ children: inline(src, line), numbering: { reference: "bullet", level: 0 }, spacing: { after: 10 } });

export function parse(md) {
  const lines = md.split(/\r?\n/);
  let name = null;
  let contact = null;
  let inSection = false;
  let cover = null;
  const resume = [];
  lines.forEach((raw, i) => {
    const n = i + 1;
    const s = raw.trim();
    if (!s || /^<!--.*-->$/.test(s)) return;
    if (cover) {
      if (s.startsWith("#")) throw new DraftError(n, "headings end at # Cover letter");
      cover.push({ text: s, line: n, gapBefore: !lines[i - 1]?.trim() });
      return;
    }
    if (/^# cover letter$/i.test(s)) {
      cover = [];
      return;
    }
    if (!name) {
      if (!s.startsWith("# ")) throw new DraftError(n, "the draft starts with # <name>");
      name = { text: s.slice(2), line: n };
      return;
    }
    if (!contact) {
      if (s.startsWith("#")) throw new DraftError(n, "the contact row goes right under # <name>");
      contact = { text: s, line: n };
      return;
    }
    if (s.startsWith("# ")) throw new DraftError(n, "only # <name> and # Cover letter are top headings");
    if (s.startsWith("## ")) {
      inSection = true;
      resume.push(section(s.slice(3)));
      return;
    }
    if (!inSection) throw new DraftError(n, "content before the first ## section");
    if (s.startsWith("### ")) resume.push(entry(s.slice(4), n));
    else if (s.startsWith("- ")) resume.push(bullet(s.slice(2), n));
    else resume.push(plain(s, n));
  });
  if (!name) throw new DraftError(1, "the draft starts with # <name>");
  if (!contact) throw new DraftError(name.line + 1, "the contact row goes right under # <name>");
  return { name, contact, resume, cover };
}

function header({ name, contact }) {
  return [
    new Paragraph({
      children: [new TextRun({ text: name.text, font: FONT, bold: true, size: NAME })],
      spacing: { after: 30 },
    }),
    plain(contact.text, contact.line, { after: 40 }),
  ];
}

// Lines in one block (no blank line between) sit tight; blocks are spaced apart.
function coverBody(cover) {
  return cover.map((l, i) => {
    const lastOfBlock = i === cover.length - 1 || cover[i + 1].gapBefore;
    return plain(l.text, l.line, { before: i === 0 ? 240 : 0, after: lastOfBlock ? 200 : 0 });
  });
}

function document(title, author, children) {
  return new Document({
    title,
    creator: author,
    lastModifiedBy: BUILT_BY,
    styles: { default: { document: { run: { font: FONT, size: BODY } } } },
    numbering: {
      config: [
        {
          reference: "bullet",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 300, hanging: 200 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 580, right: 720, bottom: 580, left: 720 },
          },
        },
        children,
      },
    ],
  });
}

async function editedByUser(file) {
  if (!existsSync(file)) return false;
  const zip = await JSZip.loadAsync(readFileSync(file));
  const core = (await zip.file("docProps/core.xml")?.async("string")) ?? "";
  return !core.includes(`<cp:lastModifiedBy>${BUILT_BY}</cp:lastModifiedBy>`);
}

// docx writes folder entries into the zip, and Word has refused such files opened through a cloud
// co-editing service (Anthropic's docx skill).
async function withoutFolders(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  for (const f of Object.values(zip.files)) if (f.dir) zip.remove(f.name);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function build(folder, force) {
  const draft = parse(readFileSync(join(folder, "draft.md"), "utf8"));
  const stem = draft.name.text.replace(/\s+/g, "-");
  const outputs = [[`${stem}-Resume.docx`, "Resume", [...header(draft), ...draft.resume]]];
  if (draft.cover?.length) {
    outputs.push([`${stem}-Cover-Letter.docx`, "Cover letter", [...header(draft), ...coverBody(draft.cover)]]);
  }
  if (!force) {
    for (const [file] of outputs) {
      if (await editedByUser(join(folder, file))) {
        console.error(
          `${file} was edited after the last build. Copy its edits into draft.md (docx.mjs text), then build with --force.`,
        );
        process.exit(4);
      }
    }
  }
  for (const [file, kind, children] of outputs) {
    const doc = document(`${draft.name.text} ${kind}`, draft.name.text, children);
    writeFileSync(join(folder, file), await withoutFolders(await Packer.toBuffer(doc)));
    console.log(join(folder, file));
  }
}

async function text(file) {
  const zip = await JSZip.loadAsync(readFileSync(file));
  const xml = await zip.file("word/document.xml").async("string");
  for (const [p] of xml.matchAll(/<w:p[ >].*?<\/w:p>/gs)) {
    const parts = [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g)].map((m) =>
      m[1] === undefined ? "\t" : m[1],
    );
    console.log(
      parts
        .join("")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&"),
    );
  }
}

const [cmd, target, flag] = process.argv.slice(2);
try {
  if (cmd === "build" && target) await build(target, flag === "--force");
  else if (cmd === "text" && target) await text(target);
  else {
    console.error("usage: docx.mjs build <folder> [--force] | docx.mjs text <file.docx>");
    process.exit(2);
  }
} catch (e) {
  console.error(e instanceof DraftError ? e.message : e);
  process.exit(1);
}
