import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBoundPack } from "../../../../scripts/offline-ai/comparison";
import { loadBoundPackV2 } from "../../../../scripts/offline-ai/candidate-v2";
import { runCandidateV2 } from "../../../../scripts/direct-openai-smoke/run-v2";
import {
  prepareV2Smoke,
  cumulativeReservation,
  parsePriorReconciliation,
  reconcileOldMarker,
  EXPECTED_PRIOR_RECONCILIATION,
  KNOWN_V1_ATTEMPT_MARKER,
  V2_ATTEMPT_GUARD,
} from "../../../../scripts/direct-openai-smoke/v2-preflight";
import type { DirectOpenAIResult } from "../../../../scripts/direct-openai-smoke/transport";

const network = vi.fn(() => {
  throw new Error("No network in v2 tests");
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
  root = mkdtempSync(join(tmpdir(), "bfa-v2-test-"));
  network.mockClear();
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  const calls = network.mock.calls.length;
  vi.unstubAllGlobals();
  rmSync(root, { recursive: true, force: true });
  expect(calls).toBe(0);
});

describe("candidate-v2 single-batch continuation", () => {
  it("pins v2 and carries both prior reservations within the ORIGINAL allowance", () => {
    const plan = prepareV2Smoke(loadBoundPackV2());
    expect(plan.budget).toEqual({
      priorReservationCarriedUsd: 0.013796375,
      newReservationUsd: 0.0120535,
      cumulativeReservationUsd: 0.025849875,
      remainingAllowanceUsd: 0.024150125,
      engineeringAllowanceUsd: 0.05,
    });
    expect(() => prepareV2Smoke(loadBoundPack())).toThrow("v2-policy-or-allowance-mismatch");
    const drift = loadBoundPackV2();
    drift.manifest.candidateInstructionSha256 = "wrong";
    expect(() => prepareV2Smoke(drift)).toThrow("v2-policy-or-allowance-mismatch");
    expect(() => cumulativeReservation(0.036203626)).toThrow("original-allowance-exceeded");
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
    expect(reconcileOldMarker(null)).toBe("absent-not-proof-of-no-history");
    expect(reconcileOldMarker(JSON.stringify(KNOWN_V1_ATTEMPT_MARKER))).toBe(
      "matched-known-funded-v1",
    );
    expect(() =>
      reconcileOldMarker(JSON.stringify({ ...KNOWN_V1_ATTEMPT_MARKER, directory: "unknown" })),
    ).toThrow("unknown-prior-attempt-marker");
  });

  it("dry-runs without a key read, receipt, transport or attempt marker", async () => {
    const factory = vi.fn(() => {
      throw new Error("No transport in dry run");
    });
    const destination = join(root, "dry");
    const result = await runCandidateV2(
      { live: false, destination },
      {
        artifactRoot: root,
        env: credentialForbidden(),
        transportFactory: factory,
      },
    );
    expect(result.attempts).toBe(0);
    expect(factory).not.toHaveBeenCalled();
    expect(existsSync(join(root, V2_ATTEMPT_GUARD))).toBe(false);
    const preflight = JSON.parse(readFileSync(join(destination, "private/preflight.json"), "utf8"));
    expect(preflight.priorHistoryClaim).toBe("fixed-known-history-pending-receipt");
    expect(preflight.cumulativeReservationUsd).toBe(0.025849875);
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
    await expect(runCandidateV2(options, dependencies)).rejects.toThrow(
      "prior-reconciliation-required",
    );
    let priorReceiptPath = writeReceipt({ ...receipt(), additionalKnownLiveAttempts: 1 });
    await expect(runCandidateV2({ ...options, priorReceiptPath }, dependencies)).rejects.toThrow(
      "prior-reconciliation-mismatch",
    );
    priorReceiptPath = writeReceipt();
    writeFileSync(join(root, "LIVE_ATTEMPTED.json"), JSON.stringify({ unknown: true }));
    await expect(runCandidateV2({ ...options, priorReceiptPath }, dependencies)).rejects.toThrow(
      "unknown-prior-attempt-marker",
    );
    expect(factory).not.toHaveBeenCalled();
    expect(existsSync(options.destination)).toBe(false);
  });

  it("a duplicate v2 guard blocks before key/fetch and preserves both guards and old evidence", async () => {
    const priorReceiptPath = writeReceipt();
    const oldMarker = JSON.stringify(KNOWN_V1_ATTEMPT_MARKER);
    writeFileSync(join(root, "LIVE_ATTEMPTED.json"), oldMarker);
    writeFileSync(join(root, V2_ATTEMPT_GUARD), "existing-v2-attempt");
    const factory = vi.fn(() => {
      throw new Error("Guard must stop dispatch");
    });
    const destination = join(root, "duplicate");
    await expect(
      runCandidateV2(
        { live: true, destination, priorReceiptPath },
        {
          artifactRoot: root,
          env: credentialForbidden(),
          transportFactory: factory,
        },
      ),
    ).rejects.toThrow("v2-already-attempted");
    expect(factory).not.toHaveBeenCalled();
    expect(existsSync(destination)).toBe(false);
    expect(readFileSync(join(root, "LIVE_ATTEMPTED.json"), "utf8")).toBe(oldMarker);
    expect(readFileSync(join(root, V2_ATTEMPT_GUARD), "utf8")).toBe("existing-v2-attempt");
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
      expect(existsSync(join(root, V2_ATTEMPT_GUARD))).toBe(true);
      expect(existsSync(join(destination, "private/prior-reconciliation.json"))).toBe(true);
      expect(existsSync(join(destination, "private/attempt-1-started.json"))).toBe(true);
      return failed;
    });
    const factory = vi.fn(() => {
      expect(existsSync(join(root, V2_ATTEMPT_GUARD))).toBe(true);
      return { generate };
    });
    const result = await runCandidateV2(
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
    expect(preflight.oldMarkerStatus).toBe("absent-not-proof-of-no-history");
    expect(preflight.priorReservationCarriedUsd).toBe(0.013796375);
    expect(existsSync(join(destination, "private/attempt-1-settled.json"))).toBe(true);
    expect(existsSync(join(destination, "private/attempt-2-started.json"))).toBe(false);
  });
});
