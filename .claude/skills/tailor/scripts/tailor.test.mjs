import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "tailor.mjs");
// Synthetic data only: the repo is public, so the tests read the sample profile.
const SAMPLE = readFileSync(join(here, "../../../../packages/master-profile/sample/master-profile.yaml"), "utf8");

const FIXED = `<!-- E1 cites: F1 F2 -->
### **Developer (Co-op)**, Northwind Example Inc., Exampleton | Jan 2022 – Aug 2022
- Built a nightly report on a team of five that shipped weekly.
`;

const DRAFT = {
  company: "Acme Example",
  role: "Backend Developer",
  summary: [
    { text: "Rebuilt a club site with React and an Express API.", cites: ["F3"] },
    { text: "Wrote a planner app with offline sync.", cites: ["F4"] },
  ],
  experiences: [
    { id: "E1", bullets: [] },
    {
      id: "E2",
      bullets: [
        { text: "Rebuilt the club site with React and Express.", cites: ["F3"] },
        { text: "Answered member emails about the site.", cites: ["F7"] },
      ],
    },
  ],
  projects: [{ id: "P1", bullets: [{ text: "Wrote a planner app that syncs offline.", cites: ["F4"] }] }],
  educationIds: ["D1"],
  skillGroups: [
    { label: "Languages", skills: [{ skillId: "S1", text: "TypeScript" }] },
    { label: "Practice", skills: [{ skillId: "S3", text: "Customer support" }] },
  ],
  coverLetter: [{ text: "I would like to apply for the role.", cites: ["F7"] }],
};

// A repo root in miniature: the scripts read data/ and .env from the working directory.
function workspace({ draft = DRAFT, fixed = FIXED, profile = SAMPLE, env } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "tailor-"));
  mkdirSync(join(cwd, "data/tailor-examples"), { recursive: true });
  const folder = join(cwd, "data/tailored/acme-backend");
  mkdirSync(folder, { recursive: true });
  const scratch = join(cwd, "scratch");
  mkdirSync(scratch);
  writeFileSync(join(cwd, "data/master-profile.yaml"), profile);
  if (fixed !== null) writeFileSync(join(cwd, "data/tailor-examples/fixed.md"), fixed);
  if (draft !== null) writeFileSync(join(folder, "draft.json"), JSON.stringify(draft));
  if (env) writeFileSync(join(cwd, ".env"), env);
  return { cwd, folder, scratch };
}

const run = (cwd, ...args) =>
  new Promise((resolve) => {
    execFile(process.execPath, [script, ...args], { cwd, encoding: "utf8" }, (err, stdout, stderr) =>
      resolve({ status: err ? err.code : 0, stdout, stderr }),
    );
  });

const withDraft = (change) => {
  const d = structuredClone(DRAFT);
  change(d);
  return d;
};

async function withApi(routes, fn) {
  const server = createServer((req, res) => {
    const body = routes[req.url];
    res.statusCode = body ? 200 : 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body ?? { message: "Not Found" }));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  try {
    await fn(`http://127.0.0.1:${server.address().port}/api`);
  } finally {
    server.close();
  }
}

async function editDocx(file, change) {
  const zip = await JSZip.loadAsync(readFileSync(file));
  zip.file("word/document.xml", change(await zip.file("word/document.xml").async("string")));
  writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }));
}
const dropParagraph = (xml, text) => xml.replace(/<w:p[ >].*?<\/w:p>/gs, (p) => (p.includes(text) ? "" : p));

const RESUME = "Sam-Sample-Resume.docx";

test("trace: a clean draft passes and writes a packet of lines, cited Facts and Do-not-claims", async () => {
  const { cwd, folder, scratch } = workspace();
  const r = await run(cwd, "trace", folder, scratch);
  assert.equal(r.status, 0, r.stderr);
  const packet = JSON.parse(readFileSync(join(scratch, "review-packet.json"), "utf8"));
  const line = (key) => packet.lines.find((l) => l.line === key);
  assert.equal(line("summary[0]").text, DRAFT.summary[0].text);
  assert.equal(line("experiences[1].bullets[1]").cites[0].text, "Answered member emails about the site.");
  assert.equal(line("projects[0].bullets[0]").cites[0].ownership, "maintained");
  // The fixed block's bullet is judged with its own cites, and carries each Fact's ownership note.
  const fixed = line("fixed[0]");
  assert.equal(fixed.text, "Built a nightly report on a team of five that shipped weekly.");
  assert.deepEqual(fixed.cites.map((c) => c.id), ["F1", "F2"]);
  assert.equal(fixed.cites[0].ownershipNote, "Solo for the report, not the mail relay.");
  assert.equal(line("coverLetter[0]").text, DRAFT.coverLetter[0].text);
  assert.deepEqual(packet.doNotClaims.map((x) => x.id), ["X1", "X2"]);
});

test("trace: the packet holds nothing from posting.txt, the company or the role", async () => {
  const { cwd, folder, scratch } = workspace();
  writeFileSync(join(folder, "posting.txt"), "ZEBRA-POSTING-TOKEN wants a Rust wizard");
  assert.equal((await run(cwd, "trace", folder, scratch)).status, 0);
  const raw = readFileSync(join(scratch, "review-packet.json"), "utf8");
  for (const leak of ["ZEBRA-POSTING-TOKEN", "Rust wizard", "Acme Example", "Backend Developer", "skillGroups", '"company"', '"role"']) {
    assert.ok(!raw.includes(leak), `the packet holds "${leak}"`);
  }
});

test("trace: a scratchpad inside the folder that holds posting.txt is refused", async () => {
  const { cwd, folder } = workspace();
  const r = await run(cwd, "trace", folder, join(folder, "inside"));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /scratchpad/);
  assert.ok(!existsSync(join(folder, "inside", "review-packet.json")));
});

test("trace: a bullet citing a Fact under another Experience exits 1 with rule 3", async () => {
  const { cwd, folder, scratch } = workspace({
    draft: withDraft((d) => (d.experiences[1].bullets[0].cites = ["F4"])),
  });
  const r = await run(cwd, "trace", folder, scratch);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^3 experiences\[1\]\.bullets\[0\] F4 belongs to P1, not E2$/m);
  assert.ok(!existsSync(join(scratch, "review-packet.json")));
});

test("trace: a bullet under a fixed Experience fails rule 5", async () => {
  const { cwd, folder, scratch } = workspace({
    draft: withDraft((d) => (d.experiences[0].bullets = [{ text: "Reworded.", cites: ["F1"] }])),
  });
  const r = await run(cwd, "trace", folder, scratch);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^5 experiences\[0\] E1 is fixed and was reworded$/m);
});

test("trace: skillGroups are flattened into skills before the check", async () => {
  const { cwd, folder, scratch } = workspace({
    draft: withDraft((d) => (d.skillGroups[1].skills[0].text = "Support")),
  });
  const r = await run(cwd, "trace", folder, scratch);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^4 skills\[1\] text is not the name or an alias of S3$/m);
});

test("trace: a fixed.md citing a retired Fact fails", async () => {
  const { cwd, folder, scratch } = workspace({ fixed: FIXED.replace("F1 F2", "F1 F6") });
  const r = await run(cwd, "trace", folder, scratch);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /fixed\.md.*F6 is retired/);
});

test("trace: a fixed.md naming an Experience that is not fixed, or missing, fails", async () => {
  for (const fixed of [FIXED.replace("E1 cites", "E1 E2 cites"), null]) {
    const { cwd, folder, scratch } = workspace({ fixed });
    const r = await run(cwd, "trace", folder, scratch);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /fixed\.md/);
  }
});

test("build: renders draft.md with the fixed block, then builds a .docx that docx.mjs reads", async () => {
  const { cwd, folder } = workspace();
  const r = await run(cwd, "build", folder);
  assert.equal(r.status, 0, r.stderr);
  const md = readFileSync(join(folder, "draft.md"), "utf8");
  assert.match(md.split("\n")[0], /^<!--.*-->$/);
  const body = md.split("\n").slice(1).join("\n");
  assert.equal(
    body,
    `# Sam Sample
Exampleton · [sam@example.com](mailto:sam@example.com) · [example.com/sam](https://example.com/sam) · [github.com/example-sam](https://github.com/example-sam)

## Highlights of Qualifications
- Rebuilt a club site with React and an Express API.
- Wrote a planner app with offline sync.

## Experience
${FIXED.split("\n").slice(1).join("\n").trimEnd()}
### **Volunteer Web Lead / Volunteer Webmaster**, Example Community Club, Remote | Mar 2023 – Present
- Rebuilt the club site with React and Express.
- Answered member emails about the site.

## Projects
### **Pocket Planner** · [example.com/pocket-planner](https://example.com/pocket-planner)
- Wrote a planner app that syncs offline.

## Technical Skills
**Languages:** TypeScript
**Practice:** Customer support

## Education
### **BSc Computer Science**, Example State University | Sep 2019 – Jun 2023
`,
  );
  assert.ok(existsSync(join(folder, RESUME)));
  assert.ok(!existsSync(join(folder, "Sam-Sample-Cover-Letter.docx")));
  const text = await run(cwd, "orphans", folder);
  assert.equal(text.status, 0, text.stderr);
});

test("build: a future education end prints Expected", async () => {
  const { cwd, folder } = workspace({ profile: SAMPLE.replace("end: 2023-06", "end: 2099-12") });
  assert.equal((await run(cwd, "build", folder)).status, 0);
  assert.match(
    readFileSync(join(folder, "draft.md"), "utf8"),
    /^### \*\*BSc Computer Science\*\*, Example State University \| Expected Dec 2099$/m,
  );
});

test("build: a fixed Experience with no block exits non-zero and builds nothing", async () => {
  const { cwd, folder } = workspace({ fixed: null });
  const r = await run(cwd, "build", folder);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /E1/);
  assert.ok(!existsSync(join(folder, RESUME)));
});

test("build: --cover-letter adds the letter from draft.json's company and role", async () => {
  const { cwd, folder } = workspace();
  const r = await run(cwd, "build", folder, "--cover-letter");
  assert.equal(r.status, 0, r.stderr);
  const md = readFileSync(join(folder, "draft.md"), "utf8");
  assert.match(md, /^# Cover letter\n[A-Z][a-z]+ \d{1,2}, \d{4}\n\nHiring Team\nAcme Example\n\n\*\*Re: Backend Developer\*\*\n\nDear Acme Example hiring team,\n\nI would like to apply for the role\.\n\nSincerely,\nSam Sample\n$/m);
  assert.ok(existsSync(join(folder, "Sam-Sample-Cover-Letter.docx")));
});

test("build: an unknown ID names its location", async () => {
  const { cwd, folder } = workspace({ draft: withDraft((d) => (d.projects[0].id = "P9")) });
  const r = await run(cwd, "build", folder);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /^1 projects\[0\] an unknown ID$/m);
});

test("orphans: a bullet cut in Word lists the Skill whose only evidence it was", async () => {
  const { cwd, folder } = workspace();
  assert.equal((await run(cwd, "build", folder)).status, 0);
  await editDocx(join(folder, RESUME), (xml) => dropParagraph(xml, "Answered member emails"));
  const r = await run(cwd, "orphans", folder);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /found \d+, matched \d+, unmatched 0, orphaned skills 1/);
  assert.match(r.stdout, /S3 Customer support/);
  assert.ok(!r.stdout.includes("S1"));
});

test("orphans: a reworded line is unmatched and exits non-zero", async () => {
  const { cwd, folder } = workspace();
  assert.equal((await run(cwd, "build", folder)).status, 0);
  await editDocx(join(folder, RESUME), (xml) => xml.replace("Answered member emails", "Replied to member emails"));
  const r = await run(cwd, "orphans", folder);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /unmatched 1/);
  assert.match(r.stdout, /Replied to member emails about the site\./);
});

test("orphans: the characters Word rewrites on save still match", async () => {
  const { cwd, folder } = workspace({
    draft: withDraft((d) => (d.summary[1].text = "Wrote the planner app's offline sync.")),
  });
  assert.equal((await run(cwd, "build", folder)).status, 0);
  await editDocx(join(folder, RESUME), (xml) =>
    xml.replace(/app(?:&apos;|')s/, "app’s").replace("Answered member emails", "Answered member emails"),
  );
  const r = await run(cwd, "orphans", folder);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /unmatched 0/);
});

test("orphans: a .docx with no lines exits non-zero with its counts", async () => {
  const { cwd, folder } = workspace();
  assert.equal((await run(cwd, "build", folder)).status, 0);
  await editDocx(join(folder, RESUME), (xml) => xml.replace(/<w:body>.*<\/w:body>/s, "<w:body></w:body>"));
  const r = await run(cwd, "orphans", folder);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /found 0, matched 0, unmatched 0, orphaned skills \d+/);
});

test("build: a draft that leaves out the fixed Experience, or a block with no bullet, builds nothing", async () => {
  for (const change of [
    { draft: withDraft((d) => d.experiences.shift()) },
    { fixed: FIXED.split("\n").slice(0, 2).join("\n") + "\n" },
    { draft: withDraft((d) => (d.experiences[1].bullets[0].cites = ["F4"])) },
  ]) {
    const { cwd, folder } = workspace(change);
    const r = await run(cwd, "build", folder);
    assert.equal(r.status, 1, r.stdout);
    assert.ok(!existsSync(join(folder, RESUME)));
    assert.ok(!existsSync(join(folder, "draft.md")));
  }
});

test("trace: a draft.json in the API shape, with skills and no skillGroups, is refused", async () => {
  const { cwd, folder } = workspace({
    draft: withDraft((d) => {
      delete d.skillGroups;
      d.skills = [{ skillId: "S1", text: "TypeScript" }];
    }),
  });
  const r = await run(cwd, "trace", folder, join(cwd, "scratch"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /skillGroups/);
});

test("orphans: a Skill deleted from its line in Word is a cut, not a rewording", async () => {
  const { cwd, folder } = workspace({
    draft: withDraft((d) => d.skillGroups[0].skills.push({ skillId: "S2", text: "SQL" })),
  });
  assert.equal((await run(cwd, "build", folder)).status, 0);
  await editDocx(join(folder, RESUME), (xml) => xml.replace("TypeScript, SQL", "TypeScript"));
  const r = await run(cwd, "orphans", folder);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /unmatched 0/);
  await editDocx(join(folder, RESUME), (xml) => xml.replace("TypeScript", "Rust"));
  assert.equal((await run(cwd, "orphans", folder)).status, 1);
});

test("hash: a missing profile names the file", async () => {
  const { cwd } = workspace({ env: "COPILOT_API_URL=http://127.0.0.1:9/api\n" });
  rmSync(join(cwd, "data/master-profile.yaml"));
  const r = await run(cwd, "hash");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /master-profile\.yaml/);
  assert.doesNotMatch(r.stderr, /at .*node:/);
});

test("hash: exit 0 on a matching version and 3 on a different one", async () => {
  const sha = createHash("sha256").update(SAMPLE).digest("hex");
  const importedAt = "2026-11-26T12:00:00.000Z";
  for (const [version, status] of [[sha, 0], ["0".repeat(64), 3]]) {
    await withApi({ "/api/master-profile/latest": { version, importedAt } }, async (base) => {
      const { cwd } = workspace({ env: `COPILOT_API_URL=${base}\n` });
      const r = await run(cwd, "hash");
      assert.equal(r.status, status, r.stderr);
      if (status === 3) assert.match(r.stderr, /pnpm profile:import/);
    });
  }
});

test("posting: writes posting.txt, prints the folder, and prints thin for a Thin Posting", async () => {
  const posting = (thin) => ({
    posting: { id: 7, title: "Backend Developer", company: "Acme Example", location: "Toronto", text: "The full text.", ats: null, thin },
  });
  await withApi({ "/api/postings/7/tailoring-input": posting(true) }, async (base) => {
    const { cwd, folder } = workspace({ env: `COPILOT_API_URL=${base}\n` });
    const named = await run(cwd, "posting", "7", folder);
    assert.equal(named.status, 0, named.stderr);
    assert.equal(readFileSync(join(folder, "posting.txt"), "utf8"), "The full text.");
    assert.match(named.stdout, /^thin$/m);
    const derived = await run(cwd, "posting", "7");
    assert.equal(derived.status, 0, derived.stderr);
    assert.match(derived.stdout, /data\/tailored\/acme-example-backend-developer/);
    assert.ok(existsSync(join(cwd, "data/tailored/acme-example-backend-developer/posting.txt")));
  });
  await withApi({ "/api/postings/7/tailoring-input": posting(false) }, async (base) => {
    const { cwd, folder } = workspace({ env: `COPILOT_API_URL=${base}\n` });
    assert.doesNotMatch((await run(cwd, "posting", "7", folder)).stdout, /thin/);
  });
});

test("posting: a Posting the API does not know exits non-zero", async () => {
  await withApi({}, async (base) => {
    const { cwd, folder } = workspace({ env: `COPILOT_API_URL=${base}\n` });
    const r = await run(cwd, "posting", "7", folder);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /404/);
  });
});
