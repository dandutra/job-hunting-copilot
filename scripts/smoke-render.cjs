// Runs inside the API image: renders a fake resume and a fake letter to PDF and DOCX with the
// image's own Typst, and prints the container's peak memory. Any failure exits non-zero.
// The model is inline because the image carries no test fixtures; a model change breaks it loudly.
const { readFileSync } = require("node:fs");
const {
  renderPdf,
  renderDocx,
  renderLetterPdf,
  renderLetterDocx,
} = require("/repo/packages/resume-render");

const contact = {
  name: "Jordan Rivers",
  city: "Toronto, ON",
  email: "jordan.rivers@example.com",
  phone: "416-555-0100",
  links: ["https://github.com/example-jordan"],
};
const resume = {
  title: "Jordan Rivers - Resume",
  contact,
  highlights: ["Five years of building business software."],
  experience: [
    {
      title: "Software Developer",
      org: "Northwind Systems Inc.",
      location: "Toronto, ON",
      start: "2022-03",
      end: "2024-08",
      lines: ["Cut the nightly report from 40 minutes to 6."],
    },
  ],
  projects: [{ name: "Trail Notes", links: [] }],
  education: [
    {
      school: "Lakeview College",
      program: "Computer Programming Diploma",
      start: "2018-09",
      end: "2020-04",
    },
  ],
  skills: ["TypeScript", "PostgreSQL"],
  volunteer: [],
};
const letter = {
  title: "Jordan Rivers - Cover letter",
  contact,
  date: "2026-11-19",
  company: "Fabrikam Analytics Inc.",
  greeting: "Dear Hiring Manager,",
  paragraphs: ["I am applying for the Software Developer role."],
  signOff: "Sincerely,",
};

// cgroup v2 first, then v1. A host with neither prints "unavailable"; the render result still decides the exit code.
function peakMemory() {
  for (const file of [
    "/sys/fs/cgroup/memory.peak",
    "/sys/fs/cgroup/memory/memory.max_usage_in_bytes",
  ]) {
    try {
      return `${(Number(readFileSync(file, "utf8")) / 1048576).toFixed(0)} MiB`;
    } catch {
      /* try the next file */
    }
  }
  return "unavailable";
}

async function main() {
  const outputs = {
    "resume.pdf": await renderPdf(resume),
    "resume.docx": await renderDocx(resume),
    "letter.pdf": await renderLetterPdf(letter),
    "letter.docx": await renderLetterDocx(letter),
  };
  for (const [name, buf] of Object.entries(outputs)) {
    const magic = name.endsWith(".pdf") ? "%PDF-" : "PK";
    if (buf.length < 1000 || buf.subarray(0, magic.length).toString() !== magic) {
      throw new Error(`${name} is ${buf.length} bytes and does not start with ${magic}`);
    }
    console.log(`${name}: ${buf.length} bytes`);
  }
  console.log(`peak container memory (node and Typst, with page cache): ${peakMemory()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
