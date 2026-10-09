import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBoundPack, SMOKE_IDS } from "../../../../scripts/offline-ai/comparison";
import { loadBoundPackV4 } from "../../../../scripts/offline-ai/candidate-v4";
import { runCandidateV4 } from "../../../../scripts/direct-openai-smoke/run-v4";
import {
  prepareV4Smoke,
  cumulativeReservation,
  parsePriorReconciliation,
  reconcileOldMarker,
  EXPECTED_PRIOR_RECONCILIATION,
  KNOWN_V1_ATTEMPT_MARKER,
  KNOWN_V2_ATTEMPT_MARKER,
  KNOWN_V3_ATTEMPT_MARKER,
  V4_CASE_IDS,
  V4_ATTEMPT_GUARD,
} from "../../../../scripts/direct-openai-smoke/v4-preflight";
import {
  createInputExport,
  createResultTemplate,
  importResults,
} from "../../../../scripts/offline-ai/result-exchange";
import type { DirectOpenAIResult } from "../../../../scripts/direct-openai-smoke/transport";

const network = vi.fn(() => {
  throw new Error("No network in v4 tests");
});
let root: string;
const receipt = () => ({ ...EXPECTED_PRIOR_RECONCILIATION, reconciledAt: "2026-10-09T03:00:00Z" });
function writeReceipt(value: unknown = receipt()) {
  const path = join(root, "prior-reconciliation.json");
  writeFileSync(path, JSON.stringify(value));
  return path;
}
const credentialForbidden = () =>
  new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === "OPENAI_API_KEY") throw new Error("Credential must not be read");
        return undefined;
      },
    },
  );
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "bfa-v4-test-"));
  network.mockClear();
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  const calls = network.mock.calls.length;
  vi.unstubAllGlobals();
  rmSync(root, { recursive: true, force: true });
  expect(calls).toBe(0);
});

describe("candidate-v4 single-batch continuation", () => {
  it("pins v4 and carries all four prior reservations within the ORIGINAL allowance", () => {
    const plan = prepareV4Smoke(loadBoundPackV4());
    expect(plan.budget).toEqual({
      priorReservationCarriedUsd: 0.0392725,
      newReservationUsd: 0.009462,
      cumulativeReservationUsd: 0.0487345,
      remainingAllowanceUsd: 0.0012655,
      engineeringAllowanceUsd: 0.05,
    });
    expect(() => prepareV4Smoke(loadBoundPack())).toThrow("v4-policy-or-allowance-mismatch");
    const drift = loadBoundPackV4();
    drift.manifest.candidateInstructionSha256 = "wrong";
    expect(() => prepareV4Smoke(drift)).toThrow("v4-policy-or-allowance-mismatch");
    expect(() => cumulativeReservation(0.010727501)).toThrow("original-allowance-exceeded");
    expect(() => cumulativeReservation(NaN)).toThrow("invalid-new-reservation");
    expect(() => cumulativeReservation(-0.001)).toThrow("invalid-new-reservation");
  });

  it("requires the exact reconciled predecessor history and rejects unknown or reduced history", () => {
    expect(parsePriorReconciliation(JSON.stringify(receipt()))).toEqual(receipt());
    for (const change of [
      { additionalKnownLiveAttempts: 1 },
      { unresolvedPriorAttempts: 1 },
      { priorReservationCarriedUsd: 0 },
      { engineeringAllowanceUsd: 1 },
      { schemaVersion: "unknown" },
      { extra: true },
      { priorBatches: [] },
      { claim: "verified-billing" },
      {
        priorBatches: [
          { ...EXPECTED_PRIOR_RECONCILIATION.priorBatches[0], status: "unknown" },
          EXPECTED_PRIOR_RECONCILIATION.priorBatches[1],
        ],
      },
    ])
      expect(() => parsePriorReconciliation(JSON.stringify({ ...receipt(), ...change }))).toThrow(
        "prior-reconciliation-mismatch",
      );
    expect(EXPECTED_PRIOR_RECONCILIATION.priorBatches.flatMap((b) => b.requestIds)).toHaveLength(
      10,
    );
    expect(reconcileOldMarker("v3", JSON.stringify(KNOWN_V3_ATTEMPT_MARKER))).toBe(
      "matched-known-candidate-v3",
    );
    expect(reconcileOldMarker("v1", null)).toBe("absent-not-proof-of-no-history");
    expect(reconcileOldMarker("v1", JSON.stringify(KNOWN_V1_ATTEMPT_MARKER))).toBe(
      "matched-known-funded-v1",
    );
    expect(reconcileOldMarker("v2", JSON.stringify(KNOWN_V2_ATTEMPT_MARKER))).toBe(
      "matched-known-candidate-v2",
    );
    expect(() =>
      reconcileOldMarker(
        "v1",
        JSON.stringify({ ...KNOWN_V1_ATTEMPT_MARKER, directory: "unknown" }),
      ),
    ).toThrow("unknown-prior-attempt-marker");
  });

  it("dry-runs without a key read, receipt, transport or attempt marker", async () => {
    const factory = vi.fn(() => {
      throw new Error("No transport in dry run");
    });
    const destination = join(root, "dry");
    const result = await runCandidateV4(
      { live: false, destination },
      {
        artifactRoot: root,
        env: credentialForbidden(),
        transportFactory: factory,
      },
    );
    expect(result.attempts).toBe(0);
    expect(factory).not.toHaveBeenCalled();
    expect(existsSync(join(root, V4_ATTEMPT_GUARD))).toBe(false);
    const preflight = JSON.parse(readFileSync(join(destination, "private/preflight.json"), "utf8"));
    expect(preflight.priorHistoryClaim).toBe("fixed-known-history-pending-receipt");
    expect(preflight.cumulativeReservationUsd).toBe(0.0487345);
  });

  it("rejects missing/mismatched receipts and unknown old guards before credential access or dispatch", async () => {
    const factory = vi.fn(() => {
      throw new Error("No transport before reconciliation");
    });
    const dependencies = {
      artifactRoot: root,
      env: credentialForbidden(),
      transportFactory: factory,
    };
    const options = { live: true, destination: join(root, "blocked") };
    await expect(runCandidateV4(options, dependencies)).rejects.toThrow(
      "prior-reconciliation-required",
    );
    let priorReceiptPath = writeReceipt({ ...receipt(), additionalKnownLiveAttempts: 1 });
    await expect(runCandidateV4({ ...options, priorReceiptPath }, dependencies)).rejects.toThrow(
      "prior-reconciliation-mismatch",
    );
    priorReceiptPath = writeReceipt();
    writeFileSync(join(root, "LIVE_ATTEMPTED.json"), JSON.stringify({ unknown: true }));
    await expect(runCandidateV4({ ...options, priorReceiptPath }, dependencies)).rejects.toThrow(
      "unknown-prior-attempt-marker",
    );
    writeFileSync(join(root, "LIVE_ATTEMPTED.json"), JSON.stringify(KNOWN_V1_ATTEMPT_MARKER));
    writeFileSync(
      join(root, "LIVE_CANDIDATE_V2_ATTEMPTED.json"),
      JSON.stringify({ unknown: true }),
    );
    await expect(runCandidateV4({ ...options, priorReceiptPath }, dependencies)).rejects.toThrow(
      "unknown-prior-attempt-marker",
    );
    writeFileSync(
      join(root, "LIVE_CANDIDATE_V2_ATTEMPTED.json"),
      JSON.stringify(KNOWN_V2_ATTEMPT_MARKER),
    );
    writeFileSync(
      join(root, "LIVE_CANDIDATE_V3_ATTEMPTED.json"),
      JSON.stringify({ unknown: true }),
    );
    await expect(runCandidateV4({ ...options, priorReceiptPath }, dependencies)).rejects.toThrow(
      "unknown-prior-attempt-marker",
    );
    expect(factory).not.toHaveBeenCalled();
    expect(existsSync(options.destination)).toBe(false);
  });

  it.each(["JOURNEY_AI_ENABLED", "JOURNEY_AI_RELEASE_READY", "LIVE_AI_ENABLED"])(
    "rejects enabled participant flag %s before key access",
    async (flag) => {
      const env = new Proxy(
        { [flag]: "true" },
        {
          get: (target, key) => {
            if (key === "OPENAI_API_KEY") throw new Error("Credential must not be read");
            return target[key as string];
          },
        },
      );
      await expect(
        runCandidateV4(
          { live: true, destination: join(root, "flag-blocked") },
          { artifactRoot: root, env },
        ),
      ).rejects.toThrow("participant-ai-must-stay-off");
      expect(existsSync(join(root, V4_ATTEMPT_GUARD))).toBe(false);
    },
  );

  it("a duplicate v4 guard blocks before key/fetch and preserves all old guards and evidence", async () => {
    const priorReceiptPath = writeReceipt();
    const oldMarker = JSON.stringify(KNOWN_V1_ATTEMPT_MARKER);
    writeFileSync(join(root, "LIVE_ATTEMPTED.json"), oldMarker);
    const v2Marker = JSON.stringify(KNOWN_V2_ATTEMPT_MARKER);
    writeFileSync(join(root, "LIVE_CANDIDATE_V2_ATTEMPTED.json"), v2Marker);
    const v3Marker = JSON.stringify(KNOWN_V3_ATTEMPT_MARKER);
    writeFileSync(join(root, "LIVE_CANDIDATE_V3_ATTEMPTED.json"), v3Marker);
    const oldEvidence = join(root, "preserved-old-results.json");
    writeFileSync(oldEvidence, "unaltered historical evidence");
    writeFileSync(join(root, V4_ATTEMPT_GUARD), "existing-v4-attempt");
    const factory = vi.fn(() => {
      throw new Error("Guard must stop dispatch");
    });
    const destination = join(root, "duplicate");
    await expect(
      runCandidateV4(
        { live: true, destination, priorReceiptPath },
        {
          artifactRoot: root,
          env: credentialForbidden(),
          transportFactory: factory,
        },
      ),
    ).rejects.toThrow("v4-already-attempted");
    expect(factory).not.toHaveBeenCalled();
    expect(existsSync(destination)).toBe(false);
    expect(readFileSync(join(root, "LIVE_ATTEMPTED.json"), "utf8")).toBe(oldMarker);
    expect(readFileSync(join(root, V4_ATTEMPT_GUARD), "utf8")).toBe("existing-v4-attempt");
    expect(readFileSync(join(root, "LIVE_CANDIDATE_V2_ATTEMPTED.json"), "utf8")).toBe(v2Marker);
    expect(readFileSync(join(root, "LIVE_CANDIDATE_V3_ATTEMPTED.json"), "utf8")).toBe(v3Marker);
    expect(readFileSync(oldEvidence, "utf8")).toBe("unaltered historical evidence");
  });

  it("a reconciled missing old marker retains history, checkpoints before simulated dispatch and stops after failure", async () => {
    const priorReceiptPath = writeReceipt();
    const destination = join(root, "simulated-dispatch");
    const failed: DirectOpenAIResult = {
      status: "failed",
      text: null,
      failureCode: "rate-limited",
      requestedModel: "gpt-6-luna",
      reportedModel: null,
      responseId: null,
      requestId: "fictional-test-request",
      modelMismatch: true,
      incompleteReason: null,
      usage: { inputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null },
    };
    const generate = vi.fn(async () => {
      expect(existsSync(join(root, V4_ATTEMPT_GUARD))).toBe(true);
      expect(existsSync(join(destination, "private/prior-reconciliation.json"))).toBe(true);
      expect(existsSync(join(destination, "private/attempt-1-started.json"))).toBe(true);
      return failed;
    });
    const factory = vi.fn(() => {
      expect(existsSync(join(root, V4_ATTEMPT_GUARD))).toBe(true);
      return { generate };
    });
    const result = await runCandidateV4(
      { live: true, destination, priorReceiptPath },
      {
        artifactRoot: root,
        env: { OPENAI_API_KEY: "fictional-unit-test-key" },
        transportFactory: factory,
      },
    );
    expect(result.attempts).toBe(1);
    expect(result.complete).toBe(0);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith({
      apiKey: "fictional-unit-test-key",
      model: "gpt-6-luna",
      reasoningEffort: "none",
    });
    const preflight = JSON.parse(readFileSync(join(destination, "private/preflight.json"), "utf8"));
    expect(preflight.oldMarkerStatuses).toEqual({
      v1: "absent-not-proof-of-no-history",
      v2: "absent-not-proof-of-no-history",
      v3: "absent-not-proof-of-no-history",
    });
    expect(preflight.priorReservationCarriedUsd).toBe(0.0392725);
    expect(existsSync(join(destination, "private/attempt-1-settled.json"))).toBe(true);
    expect(existsSync(join(destination, "private/attempt-2-started.json"))).toBe(false);
  });

  it("exports exactly the caller-selected source requests while preserving the old three-case default", () => {
    const bound = loadBoundPackV4();
    const candidates = [{ candidateId: "direct-openai-luna", requestedModelId: "gpt-6-luna" }];
    const subset = createInputExport(bound, candidates, V4_CASE_IDS);
    expect(subset.cases.map((c) => c.caseId)).toEqual(V4_CASE_IDS);
    expect(subset.expectedMatrix).toHaveLength(2);
    for (const row of subset.cases)
      expect(row.input).toEqual(bound.cases.find((c) => c.fixture.id === row.caseId)!.request);
    expect(JSON.parse(subset.cases[1].input.groundedPayload).oneHonestStep).toMatchObject({
      selectedLabel: "Write one honest sentence somewhere outside this app",
      reportedDone: false,
    });
    const oldDefault = createInputExport(bound, candidates);
    expect(oldDefault.cases.map((c) => c.caseId)).toEqual(SMOKE_IDS);
    expect(
      importResults(
        bound,
        JSON.stringify(oldDefault),
        JSON.stringify(createResultTemplate(oldDefault)),
      ).records,
    ).toHaveLength(3);
    expect(
      importResults(
        bound,
        JSON.stringify(subset),
        JSON.stringify(createResultTemplate(subset)),
        V4_CASE_IDS,
      ).records,
    ).toHaveLength(2);
    // The caller, not the untrusted export, controls the required case matrix.
    expect(() =>
      importResults(bound, JSON.stringify(subset), JSON.stringify(createResultTemplate(subset))),
    ).toThrow("export-source-or-hash-drift");
    expect(() =>
      importResults(
        bound,
        JSON.stringify(oldDefault),
        JSON.stringify(createResultTemplate(oldDefault)),
        V4_CASE_IDS,
      ),
    ).toThrow("export-source-or-hash-drift");
    const missing = createResultTemplate(subset);
    missing.results.pop();
    expect(() =>
      importResults(bound, JSON.stringify(subset), JSON.stringify(missing), V4_CASE_IDS),
    ).toThrow("matrix-incomplete");
  });

  it("rejects empty, duplicate, excessive and unknown source subsets", () => {
    const bound = loadBoundPackV4();
    for (const ids of [
      [],
      [V4_CASE_IDS[0], V4_CASE_IDS[0]],
      ["unknown-case"],
      Array(23).fill(V4_CASE_IDS[0]),
    ])
      expect(() => createInputExport(bound, undefined, ids)).toThrow("case-subset");
    expect(() => createInputExport(bound, undefined, null as unknown as string[])).toThrow(
      "case-subset",
    );
    const allIds = bound.cases.map((c) => c.fixture.id);
    expect(allIds).toHaveLength(22);
    expect(createInputExport(bound, undefined, allIds).cases).toHaveLength(22);
  });

  it.each(["incomplete", "model-uncertain", "complete"] as const)(
    "bounds simulated %s responses to the fixed two cases and preserves checkpoints",
    async (scenario) => {
      const priorReceiptPath = writeReceipt();
      const destination = join(root, scenario);
      const response: DirectOpenAIResult = {
        status: scenario === "incomplete" ? "incomplete" : "complete",
        text: "A fictional local test response only.",
        failureCode: null,
        requestedModel: "gpt-6-luna",
        reportedModel: scenario === "model-uncertain" ? null : "gpt-6-luna",
        responseId: "fictional-response",
        requestId: "fictional-request",
        modelMismatch: scenario === "model-uncertain",
        incompleteReason: scenario === "incomplete" ? "max_output_tokens" : null,
        usage: { inputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null },
      };
      const generate = vi.fn(async (input) => {
        const index = generate.mock.calls.length;
        expect(existsSync(join(destination, `private/attempt-${index}-started.json`))).toBe(true);
        if (index > 1)
          expect(existsSync(join(destination, "private/attempt-1-settled.json"))).toBe(true);
        const expected = loadBoundPackV4().cases.find(
          (c) => c.fixture.id === V4_CASE_IDS[index - 1],
        )!.request;
        expect(input).toEqual(expected);
        return response;
      });
      const result = await runCandidateV4(
        { live: true, destination, priorReceiptPath },
        {
          artifactRoot: root,
          env: { OPENAI_API_KEY: "fictional-unit-test-key" },
          transportFactory: () => ({ generate }),
        },
      );
      const expectedAttempts = scenario === "complete" ? 2 : 1;
      expect(result.attempts).toBe(expectedAttempts);
      expect(generate).toHaveBeenCalledTimes(expectedAttempts);
      expect(existsSync(join(destination, "private/attempt-3-started.json"))).toBe(false);
      const imported = JSON.parse(
        readFileSync(join(destination, "private/imported-records.json"), "utf8"),
      );
      expect(imported.records.map((r: { caseId: string }) => r.caseId)).toEqual(V4_CASE_IDS);
      if (expectedAttempts === 1) expect(imported.records[1].status).toBe("not-run");
      expect(
        existsSync(join(destination, `private/attempt-${expectedAttempts}-settled.json`)),
      ).toBe(true);
    },
  );
});
