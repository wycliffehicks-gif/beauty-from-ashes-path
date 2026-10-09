import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBoundPack } from "../../../../scripts/offline-ai/comparison";
import { loadBoundPackV3 } from "../../../../scripts/offline-ai/candidate-v3";
import { runCandidateV3 } from "../../../../scripts/direct-openai-smoke/run-v3";
import {
  prepareV3Smoke,
  cumulativeReservation,
  parsePriorReconciliation,
  reconcileOldMarker,
  EXPECTED_PRIOR_RECONCILIATION,
  KNOWN_V1_ATTEMPT_MARKER,
  KNOWN_V2_ATTEMPT_MARKER,
  V3_ATTEMPT_GUARD,
} from "../../../../scripts/direct-openai-smoke/v3-preflight";
import type { DirectOpenAIResult } from "../../../../scripts/direct-openai-smoke/transport";

const network = vi.fn(() => {
  throw new Error("No network in v3 tests");
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
  root = mkdtempSync(join(tmpdir(), "bfa-v3-test-"));
  network.mockClear();
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  const calls = network.mock.calls.length;
  vi.unstubAllGlobals();
  rmSync(root, { recursive: true, force: true });
  expect(calls).toBe(0);
});

describe("candidate-v3 single-batch continuation", () => {
  it("pins v3 and carries all three prior reservations within the ORIGINAL allowance", () => {
    const plan = prepareV3Smoke(loadBoundPackV3());
    expect(plan.budget).toEqual({
      priorReservationCarriedUsd: 0.025849875,
      newReservationUsd: 0.013422625,
      cumulativeReservationUsd: 0.0392725,
      remainingAllowanceUsd: 0.0107275,
      engineeringAllowanceUsd: 0.05,
    });
    expect(() => prepareV3Smoke(loadBoundPack())).toThrow("v3-policy-or-allowance-mismatch");
    const drift = loadBoundPackV3();
    drift.manifest.candidateInstructionSha256 = "wrong";
    expect(() => prepareV3Smoke(drift)).toThrow("v3-policy-or-allowance-mismatch");
    expect(() => cumulativeReservation(0.024150126)).toThrow("original-allowance-exceeded");
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
    const result = await runCandidateV3(
      { live: false, destination },
      {
        artifactRoot: root,
        env: credentialForbidden(),
        transportFactory: factory,
      },
    );
    expect(result.attempts).toBe(0);
    expect(factory).not.toHaveBeenCalled();
    expect(existsSync(join(root, V3_ATTEMPT_GUARD))).toBe(false);
    const preflight = JSON.parse(readFileSync(join(destination, "private/preflight.json"), "utf8"));
    expect(preflight.priorHistoryClaim).toBe("fixed-known-history-pending-receipt");
    expect(preflight.cumulativeReservationUsd).toBe(0.0392725);
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
    await expect(runCandidateV3(options, dependencies)).rejects.toThrow(
      "prior-reconciliation-required",
    );
    let priorReceiptPath = writeReceipt({ ...receipt(), additionalKnownLiveAttempts: 1 });
    await expect(runCandidateV3({ ...options, priorReceiptPath }, dependencies)).rejects.toThrow(
      "prior-reconciliation-mismatch",
    );
    priorReceiptPath = writeReceipt();
    writeFileSync(join(root, "LIVE_ATTEMPTED.json"), JSON.stringify({ unknown: true }));
    await expect(runCandidateV3({ ...options, priorReceiptPath }, dependencies)).rejects.toThrow(
      "unknown-prior-attempt-marker",
    );
    writeFileSync(join(root, "LIVE_ATTEMPTED.json"), JSON.stringify(KNOWN_V1_ATTEMPT_MARKER));
    writeFileSync(
      join(root, "LIVE_CANDIDATE_V2_ATTEMPTED.json"),
      JSON.stringify({ unknown: true }),
    );
    await expect(runCandidateV3({ ...options, priorReceiptPath }, dependencies)).rejects.toThrow(
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
        runCandidateV3(
          { live: true, destination: join(root, "flag-blocked") },
          { artifactRoot: root, env },
        ),
      ).rejects.toThrow("participant-ai-must-stay-off");
      expect(existsSync(join(root, V3_ATTEMPT_GUARD))).toBe(false);
    },
  );

  it("a duplicate v3 guard blocks before key/fetch and preserves both guards and old evidence", async () => {
    const priorReceiptPath = writeReceipt();
    const oldMarker = JSON.stringify(KNOWN_V1_ATTEMPT_MARKER);
    writeFileSync(join(root, "LIVE_ATTEMPTED.json"), oldMarker);
    const v2Marker = JSON.stringify(KNOWN_V2_ATTEMPT_MARKER);
    writeFileSync(join(root, "LIVE_CANDIDATE_V2_ATTEMPTED.json"), v2Marker);
    writeFileSync(join(root, V3_ATTEMPT_GUARD), "existing-v3-attempt");
    const factory = vi.fn(() => {
      throw new Error("Guard must stop dispatch");
    });
    const destination = join(root, "duplicate");
    await expect(
      runCandidateV3(
        { live: true, destination, priorReceiptPath },
        {
          artifactRoot: root,
          env: credentialForbidden(),
          transportFactory: factory,
        },
      ),
    ).rejects.toThrow("v3-already-attempted");
    expect(factory).not.toHaveBeenCalled();
    expect(existsSync(destination)).toBe(false);
    expect(readFileSync(join(root, "LIVE_ATTEMPTED.json"), "utf8")).toBe(oldMarker);
    expect(readFileSync(join(root, V3_ATTEMPT_GUARD), "utf8")).toBe("existing-v3-attempt");
    expect(readFileSync(join(root, "LIVE_CANDIDATE_V2_ATTEMPTED.json"), "utf8")).toBe(v2Marker);
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
      expect(existsSync(join(root, V3_ATTEMPT_GUARD))).toBe(true);
      expect(existsSync(join(destination, "private/prior-reconciliation.json"))).toBe(true);
      expect(existsSync(join(destination, "private/attempt-1-started.json"))).toBe(true);
      return failed;
    });
    const factory = vi.fn(() => {
      expect(existsSync(join(root, V3_ATTEMPT_GUARD))).toBe(true);
      return { generate };
    });
    const result = await runCandidateV3(
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
    });
    expect(preflight.priorReservationCarriedUsd).toBe(0.025849875);
    expect(existsSync(join(destination, "private/attempt-1-settled.json"))).toBe(true);
    expect(existsSync(join(destination, "private/attempt-2-started.json"))).toBe(false);
  });
});
