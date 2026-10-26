// P4 — the real evaluator CLI, OFFLINE. Spawns the actual command (not just
// helper functions) and proves the default mode performs no network access
// and no dispatch, and that --live with the unapproved draft fails closed.
import { describe, expect, it } from "vitest";
import { execFile, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLI = "scripts/conversation-eval/run.ts";
const runtime = spawnSync("bun", ["--version"]).status === 0 ? { command: "bun", args: [] } : { command: process.execPath, args: ["--import", "tsx"] };
const DRAFT = "scripts/conversation-eval/draft-manifest.v1.json";

describe("P4 eval CLI — default validate mode is offline", () => {
  it("the actual bare command chooses a fresh output despite committed old evidence", async () => {
    const { stdout } = await execFileAsync(runtime.command, [...runtime.args, CLI], { timeout: 60_000 });
    const path = stdout.match(/Summary: (.+)\/run-summary.json/)?.[1];
    expect(path).toBeTruthy();
    try {
      const result = JSON.parse(readFileSync(join(path!, "run-summary.json"), "utf8"));
      expect(result.structural).toBe("pass");
      expect(result.providerCalls).toBe(0);
    } finally { if (path) rmSync(path, { recursive: true, force: true }); }
  }, 90_000);
  it("runs the real command with zero provider calls and writes a summary", async () => {
    const dir = mkdtempSync(join(tmpdir(), "p4-cli-"));
    try {
      const outDir = join(dir, "out");
      const { stdout } = await execFileAsync(
        runtime.command,
        [...runtime.args, CLI, "--manifest", DRAFT, "--out", outDir],
        { timeout: 60_000 },
      );
      expect(stdout).toContain("OFFLINE VALIDATION");
      expect(stdout).toContain("0 provider calls");
      const summary = JSON.parse(readFileSync(join(outDir, "run-summary.json"), "utf8"));
      expect(summary).toMatchObject({
        mode: "validate",
        structural: "pass",
        approval: "absent",
        dispatchAttempts: 0,
        providerCalls: 0,
        estimatedProviderCostMicros: 0,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000);

  it("explicit existing output refuses without overwriting evidence", async () => {
    const dir = mkdtempSync(join(tmpdir(), "p4-cli-existing-"));
    try {
      const result = await execFileAsync(runtime.command, [...runtime.args, CLI, "--out", dir], { timeout: 60_000 }).catch(e => e);
      expect(result.code).not.toBe(0);
      expect(String(result.stderr)).toContain("output directory already exists");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90_000);

  it("--live with the unapproved draft exits non-zero before any dispatch", async () => {
    const dir = mkdtempSync(join(tmpdir(), "p4-cli-"));
    try {
      const outDir = join(dir, "out");
      const result = await execFileAsync(
        runtime.command,
        [...runtime.args, CLI, "--live", "--manifest", DRAFT, "--out", outDir],
        { timeout: 60_000 },
      ).catch((e) => e);
      expect(result.code).not.toBe(0);
      expect(String(result.stderr)).toContain("manifest-unapproved");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000);
});
