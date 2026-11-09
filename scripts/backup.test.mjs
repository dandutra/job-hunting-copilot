// Round trip over real Postgres and an S3-compatible server (moto) in Docker, with real age and curl.
// Needs docker and age on PATH.
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const MOTO_IMAGE = "motoserver/moto:5.0.26";
const PG_IMAGE = "postgres:17";
const suffix = `${process.pid}-${Date.now()}`;
const pgName = `backup-test-pg-${suffix}`;
const s3Name = `backup-test-s3-${suffix}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
// Over TCP, because the image's init server answers on the socket and then restarts.
const psql = (sql) => sh("docker", ["exec", pgName, "psql", "-h", "127.0.0.1", "-U", "copilot", "-d", "copilot", "-v", "ON_ERROR_STOP=1", "-tAc", sql]);

let work, endpoint, recipient, identityFile, pings, pingServer, pingUrl, bucketN = 0;

async function waitFor(fn, what) {
  for (let i = 0; i < 60; i++) {
    try { if (await fn()) return; } catch { /* not ready yet */ }
    await sleep(1000);
  }
  throw new Error(`${what} never became ready`);
}

before(async () => {
  work = mkdtempSync(join(tmpdir(), "backup-test-"));
  identityFile = join(work, "identity.txt");
  sh("age-keygen", ["-o", identityFile]);
  recipient = sh("age-keygen", ["-y", identityFile]).trim();

  sh("docker", ["run", "-d", "--name", s3Name, "-p", "127.0.0.1::5000", MOTO_IMAGE]);
  const port = sh("docker", ["port", s3Name, "5000/tcp"]).trim().split("\n")[0].split(":").pop();
  endpoint = `http://127.0.0.1:${port}`;
  await waitFor(() => spawnSync("curl", ["-fs", endpoint]).status === 0, "the S3 server");

  sh("docker", ["run", "-d", "--name", pgName, "-e", "POSTGRES_USER=copilot", "-e", "POSTGRES_PASSWORD=pw", "-e", "POSTGRES_DB=copilot", PG_IMAGE]);
  await waitFor(() => psql("SELECT 1").trim() === "1", "Postgres");
  psql(`
    CREATE TABLE master_profile_version (id text PRIMARY KEY, raw_yaml text NOT NULL);
    CREATE TABLE merge_log_entry (id serial PRIMARY KEY, rule text NOT NULL);
    CREATE TABLE tailored_resume (id serial PRIMARY KEY, draft jsonb NOT NULL);
    INSERT INTO master_profile_version VALUES ('v1', 'synthetic'), ('v2', 'synthetic too');
    INSERT INTO merge_log_entry (rule) SELECT 'direct_url' FROM generate_series(1, 5);
    INSERT INTO tailored_resume (draft) VALUES ('{"a":1}');
  `);

  pings = [];
  pingServer = createServer((req, res) => { pings.push(req.url); res.end("OK"); });
  await new Promise((r) => pingServer.listen(0, "127.0.0.1", r));
  pingUrl = `http://127.0.0.1:${pingServer.address().port}/ping`;
});

after(() => {
  for (const name of [pgName, s3Name]) spawnSync("docker", ["rm", "-f", name]);
  pingServer?.close();
  if (work) rmSync(work, { recursive: true, force: true });
});

function newBucket() {
  const bucket = `drill-${++bucketN}`;
  sh("curl", ["-fs", "-X", "PUT", `${endpoint}/${bucket}`]);
  return bucket;
}

// Async, because the ping server lives in this process and a blocking spawn would starve it.
function run(script, env, args = []) {
  return new Promise((resolveRun) => {
    const child = spawn(join(root, "deploy", script), args, {
      cwd: work, // no .env here, so backup.sh reads only the environment below
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolveRun({ code, out }));
  });
}

const backupEnv = (bucket, over = {}) => ({
  BACKUP_AGE_RECIPIENT: recipient,
  BACKUP_S3_ENDPOINT: endpoint,
  BACKUP_S3_REGION: "us-east-1",
  BACKUP_BUCKET: bucket,
  BACKUP_KEY_ID: "writer",
  BACKUP_KEY: "writer-secret",
  BACKUP_HEALTHCHECK_URL: pingUrl,
  BACKUP_POSTGRES_CONTAINER: pgName,
  POSTGRES_USER: "copilot",
  POSTGRES_DB: "copilot",
  ...over,
});

const drillEnv = (bucket, over = {}) => ({
  BACKUP_S3_ENDPOINT: endpoint,
  BACKUP_S3_REGION: "us-east-1",
  BACKUP_BUCKET: bucket,
  RESTORE_KEY_ID: "reader",
  RESTORE_KEY: "reader-secret",
  RESTORE_AGE_IDENTITY_FILE: identityFile,
  ...over,
});

const listing = (bucket) => sh("curl", ["-fs", `${endpoint}/${bucket}?list-type=2`]);

test("dump, encrypt, upload, download, decrypt, restore and compare row counts", async () => {
  const bucket = newBucket();
  pings.length = 0;

  const backup = await run("backup.sh", backupEnv(bucket));
  assert.equal(backup.code, 0, backup.out);
  assert.match(backup.out, /uploaded=1 pinged=1/);
  assert.deepEqual(pings, ["/ping"]);
  assert.match(listing(bucket), /dumps\/\d{8}T\d{6}Z-nightly\.dump\.age/);

  const drill = await run("restore-drill.sh", drillEnv(bucket));
  assert.equal(drill.code, 0, drill.out);
  assert.match(drill.out, /master_profile_version\s+2\b/);
  assert.match(drill.out, /merge_log_entry\s+5\b/);
  assert.match(drill.out, /tailored_resume\s+1\b/);
  assert.match(drill.out, /total_rows=8/);
});

test("the uploaded object is encrypted: it holds no plaintext row data", async () => {
  const bucket = newBucket();
  assert.equal((await run("backup.sh", backupEnv(bucket))).code, 0);
  const key = listing(bucket).match(/<Key>([^<]+)<\/Key>/)[1];
  const body = sh(
    "curl",
    ["-fs", "--aws-sigv4", "aws:amz:us-east-1:s3", "--user", "reader:reader-secret", `${endpoint}/${bucket}/${key}`],
    { encoding: "buffer" },
  );
  assert.ok(body.subarray(0, 21).toString().startsWith("age-encryption.org/v1"));
  assert.ok(!body.includes("synthetic"));
});

test("an empty dump exits non-zero, uploads nothing and sends no ping", async () => {
  const bucket = newBucket();
  pings.length = 0;
  // A stand-in docker whose pg_dump prints nothing and succeeds.
  const bin = join(work, "fake-bin");
  sh("mkdir", ["-p", bin]);
  writeFileSync(join(bin, "docker"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(bin, "docker"), 0o755);

  const r = await run("backup.sh", backupEnv(bucket, { PATH: `${bin}:${process.env.PATH}` }));
  assert.notEqual(r.code, 0);
  assert.match(r.out, /dump is empty/);
  assert.match(r.out, /dump_bytes=0 .*uploaded=0 pinged=0/);
  assert.deepEqual(pings, []);
  assert.doesNotMatch(listing(bucket), /<Key>/);
});

test("a failed upload exits non-zero and sends no ping", async () => {
  const bucket = newBucket();
  pings.length = 0;

  const r = await run("backup.sh", backupEnv(bucket, { BACKUP_S3_ENDPOINT: "http://127.0.0.1:1" }));
  assert.notEqual(r.code, 0);
  assert.match(r.out, /upload to .* failed/);
  assert.match(r.out, /uploaded=0 pinged=0/);
  assert.deepEqual(pings, []);
});

test("a pre-deploy run uploads but does not ping, so deploys can't stand in for the nightly timer", async () => {
  const bucket = newBucket();
  pings.length = 0;
  const r = await run("backup.sh", backupEnv(bucket), ["pre-deploy"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /uploaded=1 pinged=0/);
  assert.deepEqual(pings, []);
  assert.match(listing(bucket), /dumps\/\d{8}T\d{6}Z-pre-deploy\.dump\.age/);
});

test("a failed ping warns but keeps the uploaded backup", async () => {
  const bucket = newBucket();
  const r = await run("backup.sh", backupEnv(bucket, { BACKUP_HEALTHCHECK_URL: "http://127.0.0.1:1/ping" }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /WARN: the healthchecks.io ping failed/);
  assert.match(r.out, /uploaded=1 pinged=0/);
});

test("the drill fails on an empty bucket", async () => {
  const r = await run("restore-drill.sh", drillEnv(newBucket()));
  assert.notEqual(r.code, 0);
  assert.match(r.out, /found=0/);
});

test("the drill fails when the restore holds 0 rows", async () => {
  const bucket = newBucket();
  assert.equal((await run("backup.sh", backupEnv(bucket))).code, 0);
  // The seeded tables hold rows, so a table that exists but is empty stands in for an all-empty database.
  psql("CREATE TABLE empty_one (id int)");
  try {
    assert.equal((await run("backup.sh", backupEnv(bucket))).code, 0);
    const r = await run("restore-drill.sh", drillEnv(bucket, { DRILL_TABLES: "empty_one" }));
    assert.notEqual(r.code, 0);
    assert.match(r.out, /total_rows=0/);
  } finally {
    psql("DROP TABLE empty_one");
  }
});

test("the drill fails when a table is missing from the restore", async () => {
  const bucket = newBucket();
  assert.equal((await run("backup.sh", backupEnv(bucket))).code, 0);
  const r = await run("restore-drill.sh", drillEnv(bucket, { DRILL_TABLES: "master_profile_version label" }));
  assert.notEqual(r.code, 0);
  assert.match(r.out, /label: MISSING/);
});

test("the Droplet's B2 key can write but not read, delete or lift the lock", async () => {
  const tf = readFileSync(join(root, "infra", "backups.tf"), "utf8");
  const block = tf.match(/resource "b2_application_key" "backups_writer" \{[\s\S]*?\n\}/)[0];
  const caps = block.match(/capabilities\s*=\s*\[([^\]]*)\]/)[1].match(/"(\w+)"/g).map((c) => c.slice(1, -1));
  assert.ok(caps.includes("writeFiles"));
  for (const forbidden of ["deleteFiles", "readFiles", "bypassGovernance", "writeBucketRetentions"]) {
    assert.ok(!caps.includes(forbidden), `${forbidden} must not be on the Droplet's key`);
  }
});
