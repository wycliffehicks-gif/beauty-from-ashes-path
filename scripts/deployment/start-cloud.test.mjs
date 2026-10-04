import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const launcher = fileURLToPath(new URL("./start-cloud.mjs", import.meta.url));
const flags = ["JOURNEY_AI_ENABLED", "JOURNEY_AI_RELEASE_READY", "LIVE_AI_ENABLED"];
const canary = "SYNTHETIC_PRIVATE_STARTUP_DETAIL_NEVER_LOG";

function run(script, args = [], overrides = {}) {
  const env = { ...process.env };
  // Keep each child independent of the caller's flags and Node preload options.
  for (const flag of flags) delete env[flag];
  delete env.NODE_OPTIONS;
  Object.assign(env, overrides);
  const result = spawnSync(process.execPath, [script, ...args], {
    env,
    encoding: "utf8",
    timeout: 5_000,
    maxBuffer: 64 * 1024,
  });
  assert.equal(result.error, undefined, "the bounded child process must finish");
  assert.equal(result.signal, null);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(canary));
  return result;
}

function fixture(t, entry) {
  const root = mkdtempSync(join(tmpdir(), "bfa-cloud-start-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const script = join(root, "scripts", "deployment", "start-cloud.mjs");
  mkdirSync(dirname(script), { recursive: true });
  copyFileSync(launcher, script);
  if (entry !== undefined) {
    const target = join(root, ".output", "server", "index.mjs");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry);
  }
  return script;
}

test("check mode accepts default-off and existing non-enabling values without a bundle", (t) => {
  const script = fixture(t);
  for (const value of [undefined, "false", "0", "", "  ", "yes", "on", "FALSE"]) {
    const overrides =
      value === undefined ? {} : Object.fromEntries(flags.map((flag) => [flag, value]));
    const result = run(script, ["--check"], overrides);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "BFA_CLOUD_STARTUP configuration-valid-ai-off\n");
    assert.equal(result.stderr, "");
  }
});

test("every enabling flag is rejected before importing a missing bundle, including in check mode", (t) => {
  const script = fixture(t);
  for (const flag of flags) {
    for (const value of ["true", "1", " TrUe ", "\t1\n"]) {
      for (const args of [[], ["--check"]]) {
        const result = run(script, args, { [flag]: value });
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.equal(result.stderr, "BFA_CLOUD_STARTUP ai-must-remain-disabled\n");
      }
    }
  }
});

test("invalid arguments fail with a fixed code and never echo their contents", (t) => {
  const result = run(fixture(t), [canary]);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "BFA_CLOUD_STARTUP invalid-arguments\n");
  assert.equal(result.stdout, "");
});

test("default mode imports only the relative built server and check mode never imports it", (t) => {
  const script = fixture(t, 'process.stdout.write("SYNTHETIC_SERVER_IMPORTED\\n");');
  const started = run(script);
  assert.equal(started.status, 0);
  assert.equal(started.stdout, "SYNTHETIC_SERVER_IMPORTED\n");
  assert.equal(started.stderr, "");
  const checked = run(script, ["--check"]);
  assert.equal(checked.status, 0);
  assert.equal(checked.stdout, "BFA_CLOUD_STARTUP configuration-valid-ai-off\n");
  assert.equal(checked.stderr, "");
});

test("missing bundles and startup exceptions terminate without raw diagnostic detail", (t) => {
  for (const script of [fixture(t), fixture(t, `throw new Error(${JSON.stringify(canary)});`)]) {
    const result = run(script);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "BFA_CLOUD_STARTUP server-start-failed\n");
  }
});

test("uncaught asynchronous exceptions terminate instead of being swallowed", (t) => {
  const script = fixture(t, `setImmediate(() => { throw new Error(${JSON.stringify(canary)}); });`);
  const result = run(script);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "BFA_CLOUD_STARTUP uncaught-exception\n");
});

test("unhandled rejections terminate instead of being swallowed", (t) => {
  const script = fixture(
    t,
    `setImmediate(() => { void Promise.reject(new Error(${JSON.stringify(canary)})); });`,
  );
  const result = run(script);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "BFA_CLOUD_STARTUP unhandled-rejection\n");
});
