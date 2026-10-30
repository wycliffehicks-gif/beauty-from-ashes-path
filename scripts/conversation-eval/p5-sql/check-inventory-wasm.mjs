// Execute only the native runner's generated inventory guard in local PostgreSQL
// WASM. This does not run native processes, contention cases or application code.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
assert.ok(args.length === 4 && args[0] === "--module" && args[2] === "--output"
  && path.isAbsolute(args[1]) && path.isAbsolute(args[3]),
"Usage: node check-inventory-wasm.mjs --module ABS_PGLITE_DIST_INDEX_JS --output ABS_NEW_DIRECTORY");
const modulePath = await fs.realpath(args[1]);
const pkg = JSON.parse(await fs.readFile(path.resolve(modulePath, "../../package.json"), "utf8"));
assert.equal(pkg.name, "@electric-sql/pglite");
assert.equal(pkg.version, "0.5.12");
const out = args[3];
await fs.mkdir(out); // Never overwrite prior evidence.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const report = { status: "running", scope: "single-connection inventory SQL only",
  packageVersion: pkg.version, sourceSha256: {}, checks: [],
  nativeConcurrencyExecuted: false, remoteDatabaseTouched: false };
let seed, db;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const errorInfo = e => ({ message: e.message, code: e.code });
async function source(relative) {
  const bytes = await fs.readFile(path.join(root, relative));
  report.sourceSha256[relative] = sha(bytes);
  return bytes.toString("utf8");
}
async function rejects(label, sql, pattern) {
  let rejected = false;
  try { await db.exec(sql); }
  catch (error) {
    assert.equal(error.code, "P0001");
    assert.match(error.message, pattern);
    rejected = true;
  }
  assert.ok(rejected, label);
  report.checks.push({ label, status: "passed" });
}
try {
  const runner = "scripts/conversation-eval/p5-sql/run-local.py";
  await source(runner);
  await source("scripts/conversation-eval/p5-sql/check-inventory-wasm.mjs");
  const extraction = spawnSync("python3", ["-I", "-c",
    "import importlib.util,json,sys; s=importlib.util.spec_from_file_location('inventory',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps([m.empty_table_check(False),m.empty_table_check(True)]))",
    path.join(root, runner)], { encoding: "utf8", timeout: 10000,
    env: { PATH: "/usr/bin:/bin", LANG: "C" } });
  assert.equal(extraction.status, 0, extraction.error?.message || extraction.stderr);
  const [baseGuard, capacityGuard] = JSON.parse(extraction.stdout);
  report.generatedGuardSha256 = [sha(baseGuard), sha(capacityGuard)];
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  seed = await PGlite.create();
  await seed.exec("CREATE DATABASE bfa_p5_offline_fixture;");
  const bundle = await seed.dumpDataDir("none");
  await seed.close(); seed = undefined;
  db = await PGlite.create({ loadDataDir: bundle, database: "bfa_p5_offline_fixture" });
  report.identity = (await db.query("SELECT version(),current_database(),current_user")).rows[0];
  assert.equal(report.identity.current_database, "bfa_p5_offline_fixture");
  await db.exec(await source("scripts/conversation-eval/p5-sql/bootstrap.sql"));
  const migrations = (await fs.readdir(path.join(root, "drizzle/migrations"))).filter(n => /^000[0-5]_.*\.sql$/.test(n)).sort();
  assert.equal(migrations.length, 6);
  for (const name of migrations) await db.exec(await source(`drizzle/migrations/${name}`));
  await db.exec(await source("docs/pilot/conversation/sql-drafts/p5-voice-admission.sql"));
  await db.exec(baseGuard);
  report.checks.push({ label: "Exact empty base14-table inventory accepted", status: "passed" });
  await db.exec(await source("docs/pilot/conversation/sql-drafts/p5-voice-capacity.sql"));
  await db.exec(capacityGuard);
  report.checks.push({ label: "Exact empty capacity20-table inventory accepted", status: "passed" });
  await rejects("Base mode rejects an unexpected capacity schema", baseGuard, /Fixture table inventory mismatch/);
  try {
    await db.exec("BEGIN; ALTER TABLE bfa_p5_capacity.conflicts RENAME TO replacement_conflicts;");
    await rejects("Same table count cannot disguise a renamed/missing required table", capacityGuard, /Fixture table inventory mismatch/);
  } finally { await db.exec("ROLLBACK;"); }
  try {
    await db.exec("BEGIN; INSERT INTO bfa_p5_capacity.pools(pool_id,active_limit,unit_limit,reservation_units) VALUES('00000000-0000-4000-8000-000000000001',1,1,1);");
    await rejects("Exact inventory with retained fictional rows fails rollback check", capacityGuard, /Fixture rollback leaked rows/);
  } finally { await db.exec("ROLLBACK;"); }
  await db.exec(capacityGuard);
  report.checks.push({ label: "All20 tables empty again after negative-fixture rollbacks", status: "passed" });
  assert.equal(report.checks.length, 6);
  report.status = "passed";
} catch (error) {
  report.status = "failed"; report.error = errorInfo(error); process.exitCode = 1;
} finally {
  for (const instance of [seed, db]) {
    if (!instance) continue;
    try { await instance.close(); }
    catch (error) { report.status = "failed"; report.cleanupError = errorInfo(error); process.exitCode = 1; }
  }
  report.closed = (!seed || seed.closed) && (!db || db.closed);
  if (!report.closed) { report.status = "failed"; process.exitCode = 1; }
  await fs.writeFile(path.join(out, "inventory-results.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length,
    closed: report.closed, nativeConcurrencyExecuted: false, error: report.error }));
}
