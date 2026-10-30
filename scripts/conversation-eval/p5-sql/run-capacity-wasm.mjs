// Capacity extension plus unchanged admission regression, isolated PostgreSQL WASM.
// Single-connection evidence only; never native concurrency or provider acceptance.
// Supply a separately installed pinned package. No app dependencies are added.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== "--module" || args[2] !== "--output" ||
    !path.isAbsolute(args[1]) || !path.isAbsolute(args[3])) {
  throw new Error("Usage: node run-capacity-wasm.mjs --module ABS_PGLITE_DIST_INDEX_JS --output ABS_NEW_DIRECTORY");
}
const modulePath = await fs.realpath(args[1]);
const packageInfo = JSON.parse(await fs.readFile(path.resolve(modulePath, "../../package.json"), "utf8"));
assert.equal(packageInfo.name, "@electric-sql/pglite");
assert.equal(packageInfo.version, "0.5.12", "Use the reviewed pinned test engine");
const out = args[3];
await fs.mkdir(out); // Refuse to overwrite any existing evidence directory.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const report = {
  status: "running", engine: "PostgreSQL WASM, one exclusive connection",
  package: packageInfo.name, packageVersion: packageInfo.version,
  database: "bfa_p5_offline_fixture", nativeConcurrency: "not run",
  httpAuthProviderDeviceAcceptance: "not run", remoteDatabaseTouched: false,
  stages: [],
  capacityScope: "combined admission/capacity and trusted normalized reconciliation fixtures only",
};
const CAPACITY_ASSERTIONS = 129; // Includes explicit fixture loops.
const CAPACITY_ROLE_ASSERTIONS = 116; // 5 RPCs, 6 tables, 5 private helpers, service success path.
const EXTENSION_TABLES = ['pools','routes','allocations','evidence','sessions','conflicts'];
let seed, db;
const errorInfo = error => ({ message: error.message, code: error.code, position: error.position, where: error.where });
async function stage(relative, label) {
  const bytes = await fs.readFile(path.join(root, relative));
  const item = { label, source: relative, sha256: createHash("sha256").update(bytes).digest("hex"), notices: [], status: "running" };
  report.stages.push(item);
  // psql's stop-on-error directive is the sole permitted textual adaptation.
  // db.exec throws on the first SQL error. Database guard and SQL are unchanged.
  const text = bytes.toString("utf8");
  const sql = text.replace(/^\\set ON_ERROR_STOP on\r?\n/m, "");
  assert.ok(!/^\s*\\/m.test(sql), "Unexpected psql directive; do not silently rewrite fixture SQL");
  try {
    const result = await db.exec(sql, { onNotice: n => item.notices.push({ severity: n.severity, code: n.code, message: n.message }) });
    item.commands = result.map(r => r.command);
    item.assertions = item.notices.filter(n => /^(BFA_SQL_PASS:|P5_CAPACITY_ASSERT:|P5_CAPACITY_ROLE_PASS:)/.test(n.message)).map(n => n.message.replace(/^[A-Z0-9_]+:/, ""));
    item.status = "passed";
  } catch (error) {
    item.status = "failed";
    item.error = errorInfo(error);
    throw error;
  } finally {
    item.assertions = item.notices.filter(n => /^(BFA_SQL_PASS:|P5_CAPACITY_ASSERT:|P5_CAPACITY_ROLE_PASS:)/.test(n.message)).map(n => n.message.replace(/^[A-Z0-9_]+:/, ""));
    await fs.writeFile(path.join(out, `${label}.json`), JSON.stringify(item, null, 2) + "\n");
  }
}
async function assertEmpty(label, extension = false) {
  const tables = (await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('bfa_p5_voice','bfa_p5_capacity') OR (schemaname='public' AND tablename LIKE 'bfa_p3b_%') ORDER BY 1,2")).rows;
  const rows = [];
  for (const table of tables) {
    assert.match(table.schemaname, /^[a-z0-9_]+$/); assert.match(table.tablename, /^[a-z0-9_]+$/);
    const count = Number((await db.query(`SELECT count(*) AS count FROM ${table.schemaname}.${table.tablename}`)).rows[0].count);
    rows.push({ ...table, count });
    assert.equal(count, 0, `${label}: retained fixture data in ${table.tablename}`);
  }
  const required = [
    'public.bfa_p3b_staging_accounts', 'public.bfa_p3b_threads',
    'public.bfa_p3b_allowances', 'public.bfa_p3b_admissions',
    ...['generations','owner_clocks','session_fences','issuances','quotas','approvals',
      'cleanup_owners','proofs','attempts','claims'].map(n => `bfa_p5_voice.${n}`),
    ...(extension ? EXTENSION_TABLES.map(n => `bfa_p5_capacity.${n}`) : []),
  ].sort();
  assert.deepEqual(rows.map(r => `${r.schemaname}.${r.tablename}`).sort(), required,
    'Expected exact fixture table inventory; missing tables are not a passing rollback');
  report.stages.push({ label, status: "passed", emptyTables: rows });
}
try {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  seed = await PGlite.create();
  await seed.exec("CREATE DATABASE bfa_p5_offline_fixture;");
  const bundle = await seed.dumpDataDir("none");
  await seed.close(); seed = undefined;
  db = await PGlite.create({ loadDataDir: bundle, database: report.database });
  report.identity = (await db.query("SELECT version(),current_database(),current_user")).rows[0];
  assert.equal(report.identity.current_database, report.database);
  await stage("scripts/conversation-eval/p5-sql/bootstrap.sql", "bootstrap");
  const migrations = (await fs.readdir(path.join(root, "drizzle/migrations"))).filter(n => /^000[0-5]_.*\.sql$/.test(n)).sort();
  assert.equal(migrations.length, 6);
  for (const name of migrations) await stage(`drizzle/migrations/${name}`, name.slice(0, 4));
  await stage("docs/pilot/conversation/sql-drafts/p5-voice-admission.sql", "draft-installation");
  await assertEmpty("installation-seeded-no-rows");
  await stage("docs/pilot/conversation/sql-drafts/p5-voice-admission-fixtures.sql", "sequential-fixtures");
  assert.equal(report.stages.at(-1).assertions.length, 57, "Sequential assertion evidence incomplete");
  await assertEmpty("sequential-rollback");
  await stage("scripts/conversation-eval/p5-sql/roles.sql", "role-execution");
  assert.equal(report.stages.at(-1).assertions.length, 145, "Role assertion evidence incomplete");
  await assertEmpty("roles-rollback");
  await stage("docs/pilot/conversation/sql-drafts/p5-voice-capacity.sql", "capacity-installation");
  await assertEmpty("capacity-installation-seeded-no-rows", true);
  await stage("docs/pilot/conversation/sql-drafts/p5-voice-capacity-fixtures.sql", "capacity-fixtures");
  assert.equal(report.stages.at(-1).assertions.length, CAPACITY_ASSERTIONS, "Capacity assertion evidence incomplete");
  await assertEmpty("capacity-fixtures-rollback", true);
  await stage("scripts/conversation-eval/p5-sql/capacity-roles.sql", "capacity-role-execution");
  assert.equal(report.stages.at(-1).assertions.length, CAPACITY_ROLE_ASSERTIONS, "Capacity role evidence incomplete");
  await assertEmpty("capacity-roles-rollback", true);
  report.status = "passed";
} catch (error) {
  report.status = "failed"; report.error = errorInfo(error); process.exitCode = 1;
} finally {
  for (const instance of [seed, db]) {
    if (!instance) continue;
    try { await instance.close(); } catch (error) {
      report.status = "failed"; report.cleanupError = errorInfo(error); process.exitCode = 1;
    }
  }
  report.closed = (!seed || seed.closed) && (!db || db.closed);
  await fs.writeFile(path.join(out, "results.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ status: report.status, identity: report.identity,
    assertions: report.stages.reduce((n, s) => n + (s.assertions?.length || 0), 0),
    nativeConcurrency: report.nativeConcurrency, closed: report.closed, error: report.error }));
}
