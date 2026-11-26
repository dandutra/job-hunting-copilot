#!/usr/bin/env node
// The mechanical half of local /tailor: the profile hash check, the Posting fetch, the Trace check
// with its blind-review packet, the draft.md render and .docx build, and the orphaned-Skills check.
// Run from the repo root: data/ and .env are read from the working directory.
//   tailor.mjs hash                          exit 3 when data/master-profile.yaml is not the latest stored version
//   tailor.mjs posting <id> [<folder>]       write posting.txt; with no folder, use data/tailored/<company>-<role>
//   tailor.mjs trace <folder> <scratchpad>   traceCheck draft.json; write <scratchpad>/review-packet.json
//   tailor.mjs build <folder> [--cover-letter] [--force]   render draft.md, then build the .docx
//   tailor.mjs orphans <folder>              compare the saved .docx with draft.json
// Why the work is split this way: docs/kb/decisions/tailoring-is-gated-by-the-api.md.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PROFILE = "data/master-profile.yaml";
const FIXED = "data/tailor-examples/fixed.md";

class Fail extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const fail = (message) => {
  throw new Fail(message);
};

const read = (path, what) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Fail(`${what} not found at ${path}; run from the repo root`);
  }
};

function apiBase() {
  const line = existsSync(".env") ? readFileSync(".env", "utf8").match(/^COPILOT_API_URL=(.*)$/m) : null;
  const base = line?.[1].replace(/["'\r]/g, "").replace(/\/$/, "");
  if (!base) throw new Fail("COPILOT_API_URL is not set in .env");
  return base;
}

// Requests send no Origin and need no token: Tailscale Serve adds the Mac's identity.
async function get(path) {
  const res = await fetch(`${apiBase()}${path}`).catch((e) => {
    throw new Fail(`could not reach the API for ${path}: ${e.cause?.code ?? e.message}`);
  });
  const text = await res.text();
  if (!res.ok) throw new Fail(`GET ${path} answered ${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Fail("the API answered with something other than JSON; check that COPILOT_API_URL ends in /api");
  }
}

// dist/ is built by `pnpm generate`, so a fresh clone must build master-profile first.
function loadProfile() {
  let pkg;
  try {
    pkg = createRequire(import.meta.url)("../../../../packages/master-profile/dist/index.js");
  } catch {
    throw new Fail("packages/master-profile/dist is missing; run pnpm --filter master-profile build");
  }
  const result = pkg.validateProfile(read(PROFILE, "the Master profile"));
  if (!result.ok) {
    throw new Fail(`${PROFILE} is invalid:\n${result.errors.map((e) => `${e.id} ${e.message}`).join("\n")}`);
  }
  return { profile: result.profile, traceCheck: pkg.traceCheck };
}

// `draft.json` is a TailoredDraft plus company, role and skillGroups, which the Trace check never sees.
function readDraft(folder) {
  let raw;
  try {
    raw = JSON.parse(read(join(folder, "draft.json"), "draft.json"));
  } catch (e) {
    throw e instanceof Fail ? e : new Fail(`${join(folder, "draft.json")} is not JSON`);
  }
  const { company, role, skillGroups, ...rest } = raw;
  if ("skills" in rest) throw new Fail("draft.json: write skillGroups, not skills; the script flattens skillGroups into skills");
  const groups = skillGroups ?? [];
  if (!Array.isArray(groups) || !groups.every((g) => typeof g?.label === "string" && Array.isArray(g.skills))) {
    throw new Fail('draft.json: skillGroups must be [{ "label": "...", "skills": [{ "skillId": "S1", "text": "..." }] }]');
  }
  return { draft: { ...rest, skills: groups.flatMap((g) => g.skills) }, company, role, groups };
}

// The block of exact draft.md lines for the fixed Experiences, under `<!-- E2 E4 cites: F.. F.. -->`.
function readFixed() {
  if (!existsSync(FIXED)) return null;
  const [head, ...lines] = readFileSync(FIXED, "utf8").split(/\r?\n/);
  const m = head.match(/^<!--\s*((?:E\d+\s+)+)cites:\s*((?:F\d+\s*)+)-->$/);
  if (!m) throw new Fail(`${FIXED}: the first line must read <!-- E2 E4 cites: F10 F11 -->`);
  return { ids: m[1].trim().split(/\s+/), cites: m[2].trim().split(/\s+/), lines: lines.filter((l) => l.trim()) };
}

function fixedFailures(profile, fixed) {
  const live = profile.experiences.filter((e) => e.fixed && !e.retired);
  const out = [];
  if (!fixed) {
    return live.map((e) => `${FIXED} is missing; it holds the block for ${e.id}`);
  }
  if (!fixed.lines.some((l) => l.startsWith("- "))) out.push("the block has no bullet line");
  for (const id of fixed.ids) {
    if (!live.some((e) => e.id === id)) out.push(`${id} is not a live fixed Experience`);
  }
  for (const e of live) {
    if (!fixed.ids.includes(e.id)) out.push(`${e.id} is fixed and has no block`);
  }
  for (const id of fixed.cites) {
    const fact = profile.facts.find((f) => f.id === id);
    if (!fact) out.push(`${id} is an unknown ID`);
    else if (fact.retired) out.push(`${id} is retired`);
    else if (!live.some((e) => e.id === fact.parent)) out.push(`${id} is not under a fixed Experience`);
  }
  return out;
}

const slug = (s) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function hash() {
  if (!existsSync(PROFILE)) throw new Fail(`the Master profile not found at ${PROFILE}; run from the repo root`);
  const local = createHash("sha256").update(readFileSync(PROFILE)).digest("hex");
  const { version } = await get("/master-profile/latest");
  if (version !== local) {
    throw new Fail(
      `${PROFILE} differs from the stored profile version. Run pnpm profile:import, then try again.`,
      3,
    );
  }
  console.log("profile version matches");
}

async function posting(id, folder) {
  if (!/^\d+$/.test(id ?? "")) throw new Fail("usage: tailor.mjs posting <numeric Posting ID> [<folder>]");
  const { posting: p } = await get(`/postings/${id}/tailoring-input`);
  const dir = folder ?? join("data/tailored", slug(`${p.company} ${p.title}`));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "posting.txt"), p.text);
  console.log(dir);
  if (p.thin) console.log("thin");
}

// The Trace check and the fixed block's own check. `build` runs it too, so a draft edited after
// the last `trace` cannot reach a .docx.
function checkDraft(profile, traceCheck, draft, fixed) {
  const result = traceCheck(profile, draft);
  const failures = result.ok ? [] : result.failures.map((f) => `${f.rule} ${f.location} ${f.detail}`);
  failures.push(...fixedFailures(profile, fixed).map((d) => `fixed ${FIXED} ${d}`));
  if (failures.length) throw new Fail(failures.join("\n"));
}

function trace(folder, scratch) {
  if (!folder || !scratch) throw new Fail("usage: tailor.mjs trace <folder> <scratchpad>");
  // The packet goes where the blind review can read it, and posting.txt sits in the folder.
  const rel = relative(resolve(folder), resolve(scratch));
  if (!rel.startsWith("..") && !isAbsolute(rel)) {
    throw new Fail("the scratchpad must be outside the application folder, which holds posting.txt");
  }
  const { profile, traceCheck } = loadProfile();
  const { draft } = readDraft(folder);
  const fixed = readFixed();
  checkDraft(profile, traceCheck, draft, fixed);

  const names = new Map([
    ...profile.experiences.map((e) => [e.id, e.employer]),
    ...profile.projects.map((p) => [p.id, p.name]),
    ...profile.education.map((d) => [d.id, d.program]),
    ...profile.skills.map((s) => [s.id, s.name]),
  ]);
  const facts = new Map(profile.facts.map((f) => [f.id, f]));
  const cited = (id) => {
    const f = facts.get(id);
    return f
      ? { id, text: f.text, ownership: f.ownership, ownershipNote: f.ownership_note }
      : { id, text: names.get(id) };
  };
  const lines = [];
  const add = (line, text, cites) => lines.push({ line, text, cites: cites.map(cited) });
  draft.summary.forEach((l, i) => add(`summary[${i}]`, l.text, l.cites));
  for (const key of ["experiences", "projects"]) {
    draft[key].forEach((s, i) => s.bullets.forEach((b, j) => add(`${key}[${i}].bullets[${j}]`, b.text, b.cites)));
  }
  fixed?.lines
    .filter((l) => l.startsWith("- "))
    .forEach((l, i) => add(`fixed[${i}]`, l.slice(2), fixed.cites));
  draft.coverLetter?.forEach((l, i) => add(`coverLetter[${i}]`, l.text, l.cites));
  const doNotClaims = profile.do_not_claims.filter((x) => !x.retired).map(({ id, text }) => ({ id, text }));
  mkdirSync(scratch, { recursive: true });
  const out = join(scratch, "review-packet.json");
  writeFileSync(out, JSON.stringify({ lines, doNotClaims }, null, 2));
  console.log(`trace check passed; ${lines.length} lines in ${out}`);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (d) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
function span(start, end) {
  if (!end) return `${month(start)} – Present`;
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return end.slice(0, 7) > thisMonth ? `Expected ${month(end)}` : `${month(start)} – ${month(end)}`;
}
const linkText = (u) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");
const link = (u) => `[${linkText(u)}](${u})`;

// One pipeline feeds both draft.md and `orphans`, so the lines the user cut in Word map back exactly.
// Each item is a draft.md line; a content line also carries the Entry IDs that back it.
function render(profile, draft, groups, fixed) {
  const must = (map, key, where) => map.get(key) ?? fail(`${where} names ${key}, which is not in the profile`);
  const items = [];
  const add = (md, cites, skillLine) => items.push({ md, cites, skillLine });
  const section = (title) => {
    add("");
    add(`## ${title}`);
  };
  const { contact } = profile;
  add(`# ${contact.name}`);
  add([contact.city, contact.phone, `[${contact.email}](mailto:${contact.email})`, ...contact.links.map(link)].filter(Boolean).join(" · "));

  section("Highlights of Qualifications");
  draft.summary.forEach((l) => add(`- ${l.text}`, l.cites));

  section("Experience");
  const experiences = new Map(profile.experiences.map((e) => [e.id, e]));
  let blockDone = false;
  for (const s of draft.experiences) {
    const e = must(experiences, s.id, "experiences");
    if (e.fixed) {
      if (!fixed?.ids.includes(e.id)) fail(`${e.id} is fixed and ${FIXED} has no block for it`);
      // One block covers every fixed Experience, and sits where the first of them is listed.
      if (!blockDone) fixed.lines.forEach((l) => add(l, l.startsWith("- ") ? fixed.cites : undefined));
      blockDone = true;
      continue;
    }
    add(`### **${e.titles.join(" / ")}**, ${e.employer}, ${e.location} | ${span(e.start, e.end)}`);
    s.bullets.forEach((b) => add(`- ${b.text}`, b.cites));
  }

  if (draft.projects.length) {
    section("Projects");
    const projects = new Map(profile.projects.map((p) => [p.id, p]));
    for (const s of draft.projects) {
      const p = must(projects, s.id, "projects");
      add(`### **${p.name}**${p.links[0] ? ` · ${link(p.links[0])}` : ""}`);
      s.bullets.forEach((b) => add(`- ${b.text}`, b.cites));
    }
  }

  section("Technical Skills");
  for (const g of groups) {
    const texts = g.skills.map((s) => s.text);
    add(`**${g.label}:** ${texts.join(", ")}`, undefined, { label: g.label, texts });
  }

  section("Education");
  const education = new Map(profile.education.map((d) => [d.id, d]));
  for (const eid of draft.educationIds) {
    const d = must(education, eid, "educationIds");
    add(`### **${d.program}**, ${d.school} | ${span(d.start, d.end)}`);
  }
  return items;
}

function coverLetter(profile, draft, company, role) {
  if (!draft.coverLetter?.length) throw new Fail("--cover-letter needs a coverLetter in draft.json");
  if (!company || !role) throw new Fail("--cover-letter needs company and role in draft.json");
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return [
    "# Cover letter",
    date,
    "",
    "Hiring Team",
    company,
    "",
    `**Re: ${role}**`,
    "",
    `Dear ${company} hiring team,`,
    "",
    ...draft.coverLetter.flatMap((l) => [l.text, ""]),
    "Sincerely,",
    profile.contact.name,
  ];
}

function build(folder, flags) {
  if (!folder) throw new Fail("usage: tailor.mjs build <folder> [--cover-letter] [--force]");
  const { profile, traceCheck } = loadProfile();
  const { draft, company, role, groups } = readDraft(folder);
  const fixed = readFixed();
  checkDraft(profile, traceCheck, draft, fixed);
  const items = render(profile, draft, groups, fixed);
  const cover = flags.includes("--cover-letter") ? coverLetter(profile, draft, company, role) : [];
  const md = [
    "<!-- rendered by tailor.mjs build from draft.json; change draft.json or the template, not this file -->",
    ...items.map((i) => i.md),
    ...(cover.length ? ["", ...cover] : []),
  ];
  writeFileSync(join(folder, "draft.md"), md.join("\n") + "\n");
  const docx = spawnSync(process.execPath, [join(here, "docx.mjs"), "build", folder, ...flags.filter((f) => f === "--force")], {
    stdio: "inherit",
  });
  if (docx.status !== 0) throw new Fail("docx.mjs build failed", docx.status ?? 1);
}

// What docx.mjs prints for a draft.md line: its marks gone, section titles upper-cased, dates after a tab.
function docxText(md) {
  const s = md.trim();
  const inline = (t) => t.replace(/\[([^\]]*)\]\([^)\s]+\)/g, "$1").replace(/\*\*/g, "");
  if (s.startsWith("## ")) return s.slice(3).toUpperCase();
  if (s.startsWith("### ")) {
    const at = s.lastIndexOf(" | ");
    return at < 0 ? inline(s.slice(4)) : `${inline(s.slice(4, at))}\t${s.slice(at + 3)}`;
  }
  return inline(s.replace(/^(# |- )/, ""));
}

// Word rewrites quotes and spaces on save, so both sides are compared in one plain form.
const norm = (s) =>
  s
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

function orphans(folder) {
  if (!folder) throw new Fail("usage: tailor.mjs orphans <folder>");
  const { profile } = loadProfile();
  const { draft, groups } = readDraft(folder);
  const expected = render(profile, draft, groups, readFixed())
    .map((i) => ({ ...i, key: norm(docxText(i.md)) }))
    .filter((i) => i.key);
  const file = join(folder, `${profile.contact.name.replace(/\s+/g, "-")}-Resume.docx`);
  if (!existsSync(file)) {
    const found = existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith("-Resume.docx")) : [];
    throw new Fail(`${file} not found${found.length ? `; the folder holds ${found.join(", ")}` : ""}`);
  }
  const text = spawnSync(process.execPath, [join(here, "docx.mjs"), "text", file], { encoding: "utf8" });
  if (text.status !== 0) throw new Fail(`docx.mjs text failed: ${text.stderr}`);
  const lines = text.stdout.split("\n").filter((l) => norm(l));

  const pool = [...expected];
  const present = new Set();
  const unmatched = [];
  // Deleting one Skill from its line is a cut, so a Skills line matches when its items are a subset.
  const isCutSkillsLine = (i, line) => {
    const prefix = `${norm(i.skillLine?.label ?? "")}: `;
    if (!i.skillLine || !norm(line).startsWith(prefix)) return false;
    const kept = norm(line).slice(prefix.length).split(", ");
    return kept.every((k) => i.skillLine.texts.some((t) => norm(t) === k));
  };
  for (const line of lines) {
    let at = pool.findIndex((i) => i.key === norm(line));
    if (at < 0) at = pool.findIndex((i) => isCutSkillsLine(i, line));
    if (at < 0) unmatched.push(line);
    else pool.splice(at, 1)[0].cites?.forEach((c) => present.add(c));
  }
  const skills = new Map(profile.skills.map((s) => [s.id, s]));
  const listed = new Set(groups.flatMap((g) => g.skills.map((s) => s.skillId)));
  const orphaned = [...listed]
    .map((id) => skills.get(id) ?? fail(`draft.json lists ${id}, which is not a Skill`))
    .filter((s) => !s.evidence.some((f) => present.has(f)));

  console.log(
    `found ${lines.length}, matched ${lines.length - unmatched.length}, unmatched ${unmatched.length}, orphaned skills ${orphaned.length}`,
  );
  orphaned.forEach((s) => console.log(`orphaned ${s.id} ${s.name}`));
  unmatched.forEach((l) => console.log(`unmatched ${l}`));
  if (!lines.length) throw new Fail(`${file} has no lines`);
  if (unmatched.length) {
    throw new Fail("a .docx line matches no line in draft.json: ask the user for the rule behind the edit, and offer it for TEMPLATE.md");
  }
}

const [cmd, ...args] = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flags = args.filter((a) => a.startsWith("--"));
try {
  if (cmd === "hash") await hash();
  else if (cmd === "posting") await posting(...positional);
  else if (cmd === "trace") trace(...positional);
  else if (cmd === "build") build(positional[0], flags);
  else if (cmd === "orphans") orphans(positional[0]);
  else throw new Fail("usage: tailor.mjs hash | posting <id> [<folder>] | trace <folder> <scratchpad> | build <folder> [--cover-letter] [--force] | orphans <folder>", 2);
} catch (e) {
  if (!(e instanceof Fail)) throw e;
  console.error(e.message);
  process.exit(e.code);
}
