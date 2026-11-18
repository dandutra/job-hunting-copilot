import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ResumeModel } from "./model";
import { viewOf } from "./view";

const run = promisify(execFile);

// Resolves from both src/ and dist/.
const PACKAGE = join(__dirname, "..");
const TEMPLATE = join(PACKAGE, "src", "resume.typ");
const FONTS = join(PACKAGE, "fonts");

async function pinnedVersion(): Promise<string> {
  return (await readFile(join(PACKAGE, "typst-version"), "utf8")).trim();
}

async function assertPinnedTypst(want: string): Promise<void> {
  const hint = `Typst ${want} is required (the version in packages/resume-render/typst-version); see docs/kb/gotchas/resume-render-typst.md`;
  let out: string;
  try {
    out = (await run("typst", ["--version"])).stdout;
  } catch {
    throw new Error(`Cannot run typst. ${hint}`);
  }
  if (out.split(/\s+/)[1] !== want) {
    throw new Error(`Found "${out.trim()}". ${hint}`);
  }
}

export async function renderPdf(model: ResumeModel): Promise<Buffer> {
  await assertPinnedTypst(await pinnedVersion());
  // The folder holds personal data, so it goes away whether or not the render worked.
  const dir = await mkdtemp(join(tmpdir(), "resume-render-"));
  try {
    await writeFile(join(dir, "resume.json"), JSON.stringify(viewOf(model)));
    await copyFile(TEMPLATE, join(dir, "resume.typ"));
    // No shell, no system fonts: the font is the one we ship, on every machine.
    await run(
      "typst",
      [
        "compile",
        "--ignore-system-fonts",
        "--font-path",
        FONTS,
        "--pdf-standard",
        "ua-1",
        join(dir, "resume.typ"),
        join(dir, "out.pdf"),
      ],
      { timeout: 30_000 },
    );
    return await readFile(join(dir, "out.pdf"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
