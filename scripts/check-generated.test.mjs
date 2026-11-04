import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findStale } from "./check-generated.mjs";

function tree() {
  const dir = mkdtempSync(join(tmpdir(), "check-generated-"));
  const spec = join(dir, "openapi.json");
  const types = join(dir, "schema.d.ts");
  writeFileSync(spec, "old spec");
  writeFileSync(types, "old types");
  return { spec, types };
}

test("reports nothing when generation reproduces the files", () => {
  const { spec, types } = tree();

  const stale = findStale([spec, types], () => writeFileSync(spec, "old spec"));

  assert.deepEqual(stale, []);
});

test("reports a stale file and restores it", () => {
  const { spec, types } = tree();

  const stale = findStale([spec, types], () => writeFileSync(spec, "new spec"));

  assert.deepEqual(stale, [spec]);
  assert.equal(readFileSync(spec, "utf8"), "old spec");
});

test("removes a file that did not exist before", () => {
  const { spec } = tree();
  const missing = spec.replace("openapi.json", "new.d.ts");

  const stale = findStale([missing], () => writeFileSync(missing, "x"));

  assert.deepEqual(stale, [missing]);
  assert.equal(existsSync(missing), false);
});

test("restores files when generation fails partway", () => {
  const { spec, types } = tree();

  assert.throws(() =>
    findStale([spec, types], () => {
      writeFileSync(spec, "new spec");
      throw new Error("uv not found");
    }),
  );
  assert.equal(readFileSync(spec, "utf8"), "old spec");
});
