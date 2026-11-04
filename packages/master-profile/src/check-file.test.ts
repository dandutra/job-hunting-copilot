import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkProfileFile } from "./check-file";
import { validRaw, yamlOf } from "./fixtures";

const dir = mkdtempSync(join(tmpdir(), "mp-"));
function write(name: string, content: string) {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

describe("checkProfileFile", () => {
  it("passes the committed sample", () => {
    const result = checkProfileFile(
      join(__dirname, "../sample/master-profile.yaml"),
    );
    expect(result.ok).toBe(true);
  });

  it("prints the Entry counts of a valid file", () => {
    const result = checkProfileFile(write("ok.yaml", yamlOf(validRaw())));
    expect(result).toEqual({
      ok: true,
      output: expect.stringContaining("1 Experience"),
    });
    expect(result.output).toContain("1 Fact");
    expect(result.output).toContain("1 Do-not-claim");
  });

  it("fails on a missing file and says so", () => {
    const result = checkProfileFile(join(dir, "absent.yaml"));
    expect(result.ok).toBe(false);
    expect(result.output).toContain("absent.yaml");
  });

  it("fails on a profile with 0 Entries and prints the counts", () => {
    const empty = { contact: validRaw().contact };
    const result = checkProfileFile(
      write("empty.yaml", yamlOf(empty as never)),
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain("0 Entries");
  });

  it("fails on a broken profile and lists each error with its Entry ID", () => {
    const raw = validRaw();
    (raw.skills as Record<string, unknown>[])[0].evidence = [];
    const result = checkProfileFile(write("bad.yaml", yamlOf(raw)));
    expect(result.ok).toBe(false);
    expect(result.output).toContain("S1");
  });
});
