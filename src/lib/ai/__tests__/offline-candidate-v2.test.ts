import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadBoundPack,
  COMBINED_POLICY_VERSION,
  sha256,
} from "../../../../scripts/offline-ai/comparison";
import {
  applyEvaluationRestraint,
  bindCandidateV2,
  loadBoundPackV2,
  CANDIDATE_V2_POLICY_VERSION,
  CANDIDATE_V2_INSTRUCTION_SHA256,
} from "../../../../scripts/offline-ai/candidate-v2";
import {
  createInputExport,
  createResultTemplate,
  importResults,
} from "../../../../scripts/offline-ai/result-exchange";
import { JOURNEY_MAX_PREPARED_CHARS } from "@/lib/ai/journey-generation";
import { JOURNEY_POLICY_VERSION } from "@/lib/ai/journey-policy";

const fixtureText = readFileSync("docs/pilot/fictional-ai-fixtures.v1.json", "utf8");
const v1Text = readFileSync("docs/pilot/SRT_RESPONSE_INSTRUCTIONS_v1.txt", "utf8");
const v2Text = readFileSync("docs/pilot/SRT_RESPONSE_INSTRUCTIONS_v2.txt", "utf8");
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

describe("Carl's v2 expression correction is isolated to fictional evaluation", () => {
  it("preserves all 22 sources, faith routing, baseline hashes and limits, changing only the evaluation policy", () => {
    const before = loadBoundPack();
    const snapshot = JSON.stringify(before);
    const revised = loadBoundPackV2();
    const candidate = v2Text
      .match(/BEGIN CANDIDATE INSTRUCTIONS\n([\s\S]*?)\nEND CANDIDATE INSTRUCTIONS/)![1]
      .trim();
    expect(JOURNEY_POLICY_VERSION).toBe("journey-p4");
    expect(before.manifest.policyVersion).toBe(COMBINED_POLICY_VERSION);
    expect(revised.manifest.policyVersion).toBe(CANDIDATE_V2_POLICY_VERSION);
    expect(revised.manifest.candidateInstructionSha256).toBe(CANDIDATE_V2_INSTRUCTION_SHA256);
    expect(revised.manifest.candidateFileSha256).toBe(sha256(v2Text));
    expect(revised.manifest.fixtureFileSha256).toBe(before.manifest.fixtureFileSha256);
    expect(revised.manifest.sourceCommit).toBe(before.manifest.sourceCommit);
    expect(revised.cases).toHaveLength(22);

    revised.cases.forEach((item, index) => {
      const original = before.cases[index];
      expect(item.fixture).toEqual(original.fixture);
      expect(item.prepared).toEqual(original.prepared);
      expect(item.request.groundedPayload).toBe(original.request.groundedPayload);
      expect(item.request.systemPolicy).toBe(
        `${applyEvaluationRestraint(original.prepared.policy)}\n\n${candidate}`,
      );
      expect(item.request.systemPolicy).not.toContain("Never both, and neither is required.");
      expect(item.request.maxOutputTokens).toBe(original.request.maxOutputTokens);
      expect(item.request.deadlineMs).toBe(original.request.deadlineMs);
      expect(Object.isFrozen(item.request)).toBe(true);
      expect(Object.keys(item.request).sort()).toEqual([
        "deadlineMs",
        "groundedPayload",
        "maxOutputTokens",
        "systemPolicy",
      ]);
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
      if (!item.prepared.grounding.spiritualAuthorised) {
        expect(item.prepared.grounding.spiritualPractice).toBeUndefined();
        expect(item.request.systemPolicy).toContain("Scripture and spiritual reflection are OFF.");
      } else {
        expect(item.request.systemPolicy).toContain(
          "Scripture and spiritual reflection are explicitly on.",
        );
      }
    });
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(JSON.stringify(loadBoundPack())).toBe(snapshot);
  });

  it("retains every rejection probe and refuses baseline/source or instruction drift", () => {
    const baseline = loadBoundPack();
    const revised = loadBoundPackV2();
    expect(revised.manifest.invalidProbes).toEqual(baseline.manifest.invalidProbes);
    expect(revised.manifest.invalidProbes).toHaveLength(12);
    expect(revised.manifest.invalidProbes.every((probe) => probe.adapterCalls === 0)).toBe(true);

    const sourceDrift = JSON.parse(fixtureText);
    sourceDrift.validCases[0].baseline.groundedPayloadSha256 = "changed";
    expect(() => bindCandidateV2(JSON.stringify(sourceDrift), v1Text, v2Text)).toThrow(
      "fixture-source-mismatch",
    );
    const rejectionDrift = JSON.parse(fixtureText);
    rejectionDrift.rejectionCases[0].expected.error = "changed";
    expect(() => bindCandidateV2(JSON.stringify(rejectionDrift), v1Text, v2Text)).toThrow(
      "rejection-probe-mismatch",
    );
    expect(() =>
      bindCandidateV2(
        fixtureText,
        v1Text.replace("BEGIN CANDIDATE INSTRUCTIONS", "MISSING"),
        v2Text,
      ),
    ).toThrow("candidate-markers-invalid");
    expect(() =>
      bindCandidateV2(
        fixtureText,
        v1Text,
        v2Text.replace("END CANDIDATE INSTRUCTIONS", "changed\nEND CANDIDATE INSTRUCTIONS"),
      ),
    ).toThrow("candidate-v2-hash-mismatch");
    expect(() => bindCandidateV2(fixtureText, v1Text, `${v2Text}\n${v2Text}`)).toThrow(
      "candidate-v2-markers-invalid",
    );
  });

  it("requires exactly one original restraint line before applying the evaluation exception", () => {
    const original = loadBoundPack().cases[0].prepared.policy;
    const line = original.split("\n").find((value) => value.startsWith("Include AT MOST ONE"))!;
    expect(() => applyEvaluationRestraint(original.replace(line, "Changed rule"))).toThrow(
      "candidate-v2-restraint-drift",
    );
    expect(() => applyEvaluationRestraint(`${original}\n${line}`)).toThrow(
      "candidate-v2-restraint-drift",
    );
  });

  it("keeps reviewer-only notes out of model input while recording their file provenance", () => {
    const original = loadBoundPackV2();
    const changed = bindCandidateV2(
      fixtureText,
      v1Text,
      `${v2Text}\nREVIEW_ONLY_CANARY_NOT_MODEL_INPUT`,
    );
    expect(changed.cases.map((item) => item.request)).toEqual(
      original.cases.map((item) => item.request),
    );
    expect(changed.manifest.candidateFileSha256).not.toBe(original.manifest.candidateFileSha256);
    expect(changed.manifest.candidateInstructionSha256).toBe(
      original.manifest.candidateInstructionSha256,
    );
    for (const item of changed.cases) {
      expect(JSON.stringify(item.request)).not.toContain("REVIEW_ONLY_CANARY_NOT_MODEL_INPUT");
      expect(JSON.stringify(item.request)).not.toContain("reviewChecks");
    }
  });

  it("labels both versions accurately and refuses cross-version result imports", () => {
    const v1 = loadBoundPack();
    const v2 = loadBoundPackV2();
    const exportV1 = createInputExport(v1);
    const exportV2 = createInputExport(v2);
    const resultV1 = JSON.stringify(createResultTemplate(exportV1));
    const resultV2 = JSON.stringify(createResultTemplate(exportV2));
    expect(exportV1.policyVersion).toBe("journey-p4+srt-candidate-v1");
    expect(exportV2.policyVersion).toBe(CANDIDATE_V2_POLICY_VERSION);
    expect(exportV2.source.candidateInstructionSha256).toBe(CANDIDATE_V2_INSTRUCTION_SHA256);
    expect(importResults(v1, JSON.stringify(exportV1), resultV1).records).toHaveLength(6);
    expect(importResults(v2, JSON.stringify(exportV2), resultV2).records).toHaveLength(6);
    expect(() => importResults(v1, JSON.stringify(exportV2), resultV2)).toThrow(
      "export-source-or-hash-drift",
    );
    expect(() => importResults(v2, JSON.stringify(exportV1), resultV1)).toThrow(
      "export-source-or-hash-drift",
    );
    expect(() => importResults(v2, JSON.stringify(exportV2), resultV1)).toThrow(
      "result-export-mismatch",
    );
  });
});
