import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findStale } from "./check-generated.mjs";

function tree(t) {
  const dir = mkdtempSync(join(tmpdir(), "check-generated-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const spec = join(dir, "openapi.json");
  const types = join(dir, "schema.d.ts");
  writeFileSync(spec, "old spec");
  writeFileSync(types, "old types");
  return { spec, types };
}

test("reports nothing when generation reproduces the files", (t) => {
  const { spec, types } = tree(t);

  const stale = findStale([spec, types], () => writeFileSync(spec, "old spec"));

  assert.deepEqual(stale, []);
});

test("reports a stale file and restores it", (t) => {
  const { spec, types } = tree(t);

  const stale = findStale([spec, types], () => writeFileSync(spec, "new spec"));

  assert.deepEqual(stale, [spec]);
  assert.equal(readFileSync(spec, "utf8"), "old spec");
});

test("removes a file that did not exist before", (t) => {
  const { spec } = tree(t);
  const missing = spec.replace("openapi.json", "new.d.ts");

  const stale = findStale([missing], () => writeFileSync(missing, "x"));

  assert.deepEqual(stale, [missing]);
  assert.equal(existsSync(missing), false);
});

test("restores files when generation fails partway", (t) => {
  const { spec, types } = tree(t);

  assert.throws(() =>
    findStale([spec, types], () => {
      writeFileSync(spec, "new spec");
      throw new Error("uv not found");
    }),
  );
  assert.equal(readFileSync(spec, "utf8"), "old spec");
});
