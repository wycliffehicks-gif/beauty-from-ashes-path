import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBoundPack, sha256 } from "../../../../scripts/offline-ai/comparison";
import { loadBoundPackV2 } from "../../../../scripts/offline-ai/candidate-v2";
import { loadBoundPackV3 } from "../../../../scripts/offline-ai/candidate-v3";
import {
  applyEvaluationRestraintV5,
  bindCandidateV5,
  loadBoundPackV5,
  CANDIDATE_V5_POLICY_VERSION,
  CANDIDATE_V5_INSTRUCTION_SHA256,
} from "../../../../scripts/offline-ai/candidate-v5";
import {
  createInputExport,
  createResultTemplate,
  importResults,
} from "../../../../scripts/offline-ai/result-exchange";
import { JOURNEY_MAX_PREPARED_CHARS } from "@/lib/ai/journey-generation";

const fixtureText = readFileSync("docs/pilot/fictional-ai-fixtures.v1.json", "utf8");
const v1Text = readFileSync("docs/pilot/SRT_RESPONSE_INSTRUCTIONS_v1.txt", "utf8");
const v5Text = readFileSync("docs/pilot/SRT_RESPONSE_INSTRUCTIONS_v5.txt", "utf8");
const network = vi.fn(() => {
  throw new Error("Candidate preparation must remain offline");
});

beforeEach(() => {
  network.mockClear();
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  const calls = network.mock.calls.length;
  vi.unstubAllGlobals();
  expect(calls).toBe(0);
});

describe("Carl's v5 concrete-reflection correction stays offline", () => {
  it("retains source-bound cases and payloads while applying only the complete v5 candidate", () => {
    const before = loadBoundPack();
    const snapshot = JSON.stringify(before);
    const v2Snapshot = JSON.stringify(loadBoundPackV2());
    const v3Snapshot = JSON.stringify(loadBoundPackV3());
    const revised = loadBoundPackV5();
    const candidate = v5Text
      .match(/BEGIN CANDIDATE INSTRUCTIONS\n([\s\S]*?)\nEND CANDIDATE INSTRUCTIONS/)![1]
      .trim();
    expect(revised.manifest.policyVersion).toBe(CANDIDATE_V5_POLICY_VERSION);
    expect(revised.manifest.candidateInstructionSha256).toBe(CANDIDATE_V5_INSTRUCTION_SHA256);
    expect(revised.manifest.candidateFileSha256).toBe(sha256(v5Text));
    expect(revised.manifest.fixtureFileSha256).toBe(before.manifest.fixtureFileSha256);
    expect(revised.manifest.sourceCommit).toBe(before.manifest.sourceCommit);
    expect(revised.manifest.invalidProbes).toEqual(before.manifest.invalidProbes);
    expect(revised.manifest.invalidProbes).toHaveLength(12);
    expect(revised.cases).toHaveLength(22);
    revised.cases.forEach((item, index) => {
      const original = before.cases[index];
      expect(item.fixture).toEqual(original.fixture);
      expect(item.prepared).toEqual(original.prepared);
      expect(item.request).toEqual({
        ...original.request,
        systemPolicy: `${applyEvaluationRestraintV5(original.prepared.policy)}\n\n${candidate}`,
      });
      expect(Object.isFrozen(item.request)).toBe(true);
      expect(item.request.systemPolicy).not.toContain("Never both, and neither is required.");
      expect(
        item.request.systemPolicy.length + item.request.groundedPayload.length,
      ).toBeLessThanOrEqual(JOURNEY_MAX_PREPARED_CHARS);
      expect(revised.manifest.cases[index].baselinePolicySha256).toBe(
        before.manifest.cases[index].baselinePolicySha256,
      );
      expect(revised.manifest.cases[index].groundedPayloadSha256).toBe(
        before.manifest.cases[index].groundedPayloadSha256,
      );
      expect(revised.manifest.cases[index].combinedPolicySha256).toBe(
        sha256(item.request.systemPolicy),
      );
    });
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(JSON.stringify(loadBoundPack())).toBe(snapshot);
    expect(JSON.stringify(loadBoundPackV2())).toBe(v2Snapshot);
    expect(JSON.stringify(loadBoundPackV3())).toBe(v3Snapshot);
  });

  it("rejects source, instruction and original-restraint drift", () => {
    const sourceDrift = JSON.parse(fixtureText);
    sourceDrift.validCases[0].baseline.groundedPayloadSha256 = "changed";
    expect(() => bindCandidateV5(JSON.stringify(sourceDrift), v1Text, v5Text)).toThrow(
      "fixture-source-mismatch",
    );
    expect(() =>
      bindCandidateV5(
        fixtureText,
        v1Text.replace("BEGIN CANDIDATE INSTRUCTIONS", "MISSING"),
        v5Text,
      ),
    ).toThrow("candidate-markers-invalid");
    expect(() =>
      bindCandidateV5(
        fixtureText,
        v1Text,
        v5Text.replace("END CANDIDATE INSTRUCTIONS", "changed\nEND CANDIDATE INSTRUCTIONS"),
      ),
    ).toThrow("candidate-v5-hash-mismatch");
    expect(() => bindCandidateV5(fixtureText, v1Text, `${v5Text}\n${v5Text}`)).toThrow(
      "candidate-v5-markers-invalid",
    );
    const policy = loadBoundPack().cases[0].prepared.policy;
    const restraint = policy.split("\n").find((line) => line.startsWith("Include AT MOST ONE"))!;
    expect(() => applyEvaluationRestraintV5(policy.replace(restraint, "Changed"))).toThrow(
      "candidate-v5-restraint-drift",
    );
    expect(() => applyEvaluationRestraintV5(`${policy}\n${restraint}`)).toThrow(
      "candidate-v5-restraint-drift",
    );
  });

  it("records review-only file provenance without adding it to model input", () => {
    const original = loadBoundPackV5();
    const changed = bindCandidateV5(fixtureText, v1Text, `${v5Text}\nREVIEW_ONLY_CANARY`);
    expect(changed.cases.map((item) => item.request)).toEqual(
      original.cases.map((item) => item.request),
    );
    expect(changed.manifest.candidateFileSha256).not.toBe(original.manifest.candidateFileSha256);
    expect(changed.manifest.candidateInstructionSha256).toBe(
      original.manifest.candidateInstructionSha256,
    );
  });

  it("keeps v1, v2, v3 and v5 exports and result identities separate", () => {
    const packs = [loadBoundPack(), loadBoundPackV2(), loadBoundPackV3(), loadBoundPackV5()];
    const exports = packs.map((pack) => createInputExport(pack));
    const results = exports.map((exported) => JSON.stringify(createResultTemplate(exported)));
    for (let a = 0; a < packs.length; a++) {
      expect(exports[a].candidates.every((candidate) => candidate.requestedModelId === null)).toBe(
        true,
      );
      expect(importResults(packs[a], JSON.stringify(exports[a]), results[a]).records).toHaveLength(
        6,
      );
      for (let b = 0; b < packs.length; b++) {
        if (a === b) continue;
        expect(() => importResults(packs[a], JSON.stringify(exports[b]), results[b])).toThrow(
          "export-source-or-hash-drift",
        );
        expect(() => importResults(packs[a], JSON.stringify(exports[a]), results[b])).toThrow(
          "result-export-mismatch",
        );
      }
    }
  });

  it("runs the offline CLI with explicit v5 while preserving v1 default and no-call templates", () => {
    const root = mkdtempSync(join(tmpdir(), "bfa-v5-cli-"));
    const cli = (...args: string[]) =>
      execFileSync(
        process.execPath,
        [
          "--import",
          "./scripts/offline-ai/register.mjs",
          "scripts/offline-ai/exchange-results.ts",
          ...args,
        ],
        { encoding: "utf8", stdio: "pipe", timeout: 10_000 },
      );
    const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
    try {
      const v1 = join(root, "v1");
      const v5 = join(root, "v5");
      expect(() => cli("export", "--policy", "v6", "--out", join(root, "invalid"))).toThrow(
        /Policy must be v1, v2, v3, v5 or v5/,
      );
      expect(cli("export", "--out", v1)).toContain("Zero provider calls");
      expect(cli("export", "--policy", "v5", "--out", v5)).toContain("Zero provider calls");
      expect(readJson(join(v1, "input-export.json")).policyVersion).toBe(
        "journey-p4+srt-candidate-v1",
      );
      expect(readJson(join(v5, "input-export.json")).policyVersion).toBe(
        CANDIDATE_V5_POLICY_VERSION,
      );
      const template = readJson(join(v5, "result-template.json"));
      expect(
        template.results.every(
          (result: { status: string; text: unknown; requestedModelId: unknown }) =>
            result.status === "not-run" && result.text === null && result.requestedModelId === null,
        ),
      ).toBe(true);
      const imported = [
        "--export",
        join(v5, "input-export.json"),
        "--results",
        join(v5, "result-template.json"),
      ];
      expect(() => cli("import", "--out", join(root, "wrong-version"), ...imported)).toThrow(
        /export-source-or-hash-drift/,
      );
      expect(cli("import", "--policy", "v5", "--out", join(root, "review"), ...imported)).toContain(
        "0 complete texts",
      );
      expect(() =>
        execFileSync(
          process.execPath,
          [
            "--import",
            "./scripts/offline-ai/register.mjs",
            "--input-type=module",
            "-e",
            "await import('node:https');",
          ],
          { encoding: "utf8", stdio: "pipe", timeout: 10_000 },
        ),
      ).toThrow(/offline-transport-import-forbidden/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves the exact prior instructions, builders, live runners and participant policies", () => {
    const historicalFiles: Record<string, string> = {
      "docs/pilot/SRT_RESPONSE_INSTRUCTIONS_v3.txt":
        "f57f08420aa4f6792beec79b25349bfc069611ca7a437c3f1a1a40a303ca9c1e",
      "scripts/offline-ai/candidate-v3.ts":
        "6aea886ef7b173d056a34260305c45fbf58efab319e24bfa39f108e2ed80554e",
      "scripts/direct-openai-smoke/run-v3.ts":
        "7f88ea35d9a841f6f53621a926b18c948df05af4003cd9f51beaa53db25c6f93",
      "scripts/direct-openai-smoke/v3-preflight.ts":
        "2a5b143b9095debcfe14b034321059926f8e2e18865317a7146ba7307346b904",
      "docs/pilot/SRT_RESPONSE_INSTRUCTIONS_v1.txt":
        "c278a1d1ca5f68e8830c4dba8e86ff9aa1fd4b94285b5262b8f2aad8c2c76a0d",
      "docs/pilot/SRT_RESPONSE_INSTRUCTIONS_v2.txt":
        "4a37f7299dff5d028f2e98781f04fa3f5d089360fb5e87e743a75f8d8f2596e5",
      "docs/pilot/fictional-ai-fixtures.v1.json":
        "7d6b6cfb399d1636c1fde1e364519622821ff9bf34f63c8105a1bc5ca4920964",
      "scripts/offline-ai/candidate-v2.ts":
        "be467aade129ee6f648ed3c0845b14b7013e7631d3f7c5337f7eeccce7b616fa",
      "scripts/direct-openai-smoke/run.ts":
        "a7204637a9b06948a8204fd9d6f34bfa40cca620caa5e70104e8a864f21958b7",
      "scripts/direct-openai-smoke/run-v2.ts":
        "d718b9600c5015363bfa1c9c88b18e47dc52264a91f97345e1b30ada2929b15f",
      "scripts/direct-openai-smoke/v2-preflight.ts":
        "170a34cf0d0b82f4cc291f97e7a77bc2b4c41ba8ca12638f5c50886aa926d901",
      "scripts/direct-openai-smoke/smoke.ts":
        "990419a6a13d0b491d61b52c2fc19edccca8cf1e88fba47f611688a4ea08f11a",
      "scripts/direct-openai-smoke/transport.ts":
        "c6efcba796b2cf6bfb23e06ab120672ab6320c193cc4141d7e9c47a2fd7c9529",
      "src/lib/ai/journey-policy.ts":
        "1dccf6f881dc47464253cc681362f4dbcfb0856956d0709de7a495b577fafc6b",
      "src/lib/ai/journey-generation.ts":
        "514c9441b15d7666e22ef1ab209c5b3f45239f3cd06fd401e8b51e1244246162",
    };
    for (const [path, expected] of Object.entries(historicalFiles)) {
      expect(sha256(readFileSync(path, "utf8")), path).toBe(expected);
    }
  });
});
