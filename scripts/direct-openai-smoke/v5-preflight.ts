/** Fixed-history preparation for one private candidate-v5 batch; no IO or provider calls. */
import { isDeepStrictEqual } from "node:util";
import type { BoundPack } from "../offline-ai/comparison";
import { createInputExport } from "../offline-ai/result-exchange";
import { SMOKE_BUDGET_USD, SMOKE_MODEL } from "./smoke";
import {
  KNOWN_V1_ATTEMPT_MARKER,
  KNOWN_V2_ATTEMPT_MARKER,
  KNOWN_V3_ATTEMPT_MARKER,
  EXPECTED_PRIOR_RECONCILIATION as V4_PRIOR_RECONCILIATION,
} from "./v4-preflight";

export { KNOWN_V1_ATTEMPT_MARKER, KNOWN_V2_ATTEMPT_MARKER, KNOWN_V3_ATTEMPT_MARKER };
export const V5_POLICY = "journey-p4-eval-expression-v5+srt-candidate-v5";
export const V5_INSTRUCTION_SHA256 =
  "cb58209c5d93ded7ad155a84a8bcc8f1dab95bc20df268922fd5f0a6198e81d1";
export const V5_FILE_SHA256 =
  "d243c4950d8a657276f1a249db319318ef78a22731f26b077028237a46cd1f65";
export const V5_ATTEMPT_GUARD = "LIVE_CANDIDATE_V5_ATTEMPTED.json";
export const V5_CASE_IDS = ["d1-private-uncertain-off", "d3-regret-off"] as const;
export const PRIOR_RESERVED_USD = 0.0487345;
export const V5_BUDGET_USD = 0.06;
const PRIOR_NANO_USD = 48_734_500;
const ALLOWANCE_NANO_USD = 60_000_000;

// Carl explicitly answered yes to the proposed increase for these two examples.
// This does not change the shared USD 0.05 constant or authorise later batches.
export const V5_ALLOWANCE_APPROVAL = {
  approvedAt: "2026-10-09T23:51:11Z",
  originalAllowanceUsd: 0.05,
  approvedCumulativeAllowanceUsd: V5_BUDGET_USD,
  scope: "one-candidate-v5-batch-two-fictional-examples-no-retry",
} as const;

export const KNOWN_V4_ATTEMPT_MARKER = {
  createdAt: "2026-10-09T17:00:01.879Z",
  directory: "/dev-server/artifacts/direct-openai-smoke/v4-live-2026-10-09",
  model: "gpt-6-luna",
  policyVersion: "journey-p4-eval-expression-v4+srt-candidate-v4",
  candidateInstructionSha256: "0938b3f500fe4cf7c02490259ffc67897c6c34e3d02e7ead0a6a68f7f7c41e1e",
  priorReconciliationSha256: "768e7ef78f3e7a021c0c2704b1c314cdf8116a75abaf9a89ac4b1aceccfedaf6",
  oldMarkerStatuses: {
    v1: "absent-not-proof-of-no-history",
    v2: "absent-not-proof-of-no-history",
    v3: "absent-not-proof-of-no-history",
  },
  oldMarkerSha256: { v1: null, v2: null, v3: null },
  priorReservationCarriedUsd: 0.0392725,
  newReservationUsd: 0.009462,
  cumulativeReservationUsd: 0.0487345,
  remainingAllowanceUsd: 0.0012655,
  engineeringAllowanceUsd: 0.05,
} as const;

export const EXPECTED_PRIOR_RECONCILIATION = {
  schemaVersion: "bfa-openai-v5-prior-reconciliation-1",
  claim: "reported-history-not-reconstructed-raw-evidence",
  model: "gpt-6-luna",
  reasoning: "none",
  candidatePolicyVersion: V5_POLICY,
  candidateInstructionSha256: V5_INSTRUCTION_SHA256,
  candidateFileSha256: V5_FILE_SHA256,
  engineeringAllowanceUsd: V5_BUDGET_USD,
  allowanceApproval: V5_ALLOWANCE_APPROVAL,
  priorBatches: [
    ...V4_PRIOR_RECONCILIATION.priorBatches,
    {
      id: "candidate-v4",
      status: "settled-two-complete",
      requestIds: [
        "req_62f0c89f79e5418c9b3fa019e9e7380b",
        "req_634faac5a746440d8c24958c0679739d",
      ],
      reservedCarryUsd: 0.009462,
    },
  ],
  priorReservationCarriedUsd: PRIOR_RESERVED_USD,
  additionalKnownLiveAttempts: 0,
  unresolvedPriorAttempts: 0,
} as const;

function parseSmallJson(raw: string): Record<string, unknown> {
  if (Buffer.byteLength(raw, "utf8") > 16_384) throw new Error("reconciliation-too-large");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("reconciliation-shape");
  return parsed as Record<string, unknown>;
}

export function parsePriorReconciliation(raw: string) {
  const { reconciledAt, ...history } = parseSmallJson(raw);
  if (
    typeof reconciledAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(reconciledAt) ||
    !Number.isFinite(Date.parse(reconciledAt)) ||
    !isDeepStrictEqual(history, EXPECTED_PRIOR_RECONCILIATION)
  )
    throw new Error("prior-reconciliation-mismatch");
  return { ...EXPECTED_PRIOR_RECONCILIATION, reconciledAt };
}

export function reconcileOldMarker(version: "v1" | "v2" | "v3" | "v4", raw: string | null) {
  if (raw === null) return "absent-not-proof-of-no-history" as const;
  const expected = {
    v1: KNOWN_V1_ATTEMPT_MARKER,
    v2: KNOWN_V2_ATTEMPT_MARKER,
    v3: KNOWN_V3_ATTEMPT_MARKER,
    v4: KNOWN_V4_ATTEMPT_MARKER,
  }[version];
  if (!isDeepStrictEqual(parseSmallJson(raw), expected))
    throw new Error("unknown-prior-attempt-marker");
  return version === "v1"
    ? ("matched-known-funded-v1" as const)
    : version === "v2"
      ? ("matched-known-candidate-v2" as const)
      : version === "v3"
        ? ("matched-known-candidate-v3" as const)
        : ("matched-known-candidate-v4" as const);
}

export function cumulativeReservation(newReservationUsd: number) {
  if (!Number.isFinite(newReservationUsd) || newReservationUsd < 0)
    throw new Error("invalid-new-reservation");
  // Round upward in USD nanounits; estimated billing never releases reservations.
  const newNanoUsd = Math.ceil(newReservationUsd * 1_000_000_000);
  const cumulativeNanoUsd = PRIOR_NANO_USD + newNanoUsd;
  if (!Number.isSafeInteger(cumulativeNanoUsd) || cumulativeNanoUsd > ALLOWANCE_NANO_USD)
    throw new Error("approved-allowance-exceeded");
  return {
    priorReservationCarriedUsd: PRIOR_RESERVED_USD,
    newReservationUsd: newNanoUsd / 1_000_000_000,
    cumulativeReservationUsd: cumulativeNanoUsd / 1_000_000_000,
    remainingAllowanceUsd: (ALLOWANCE_NANO_USD - cumulativeNanoUsd) / 1_000_000_000,
    engineeringAllowanceUsd: V5_BUDGET_USD,
  };
}

export function prepareV5Smoke(bound: BoundPack) {
  if (
    bound.manifest.policyVersion !== V5_POLICY ||
    bound.manifest.candidateInstructionSha256 !== V5_INSTRUCTION_SHA256 ||
    bound.manifest.candidateFileSha256 !== V5_FILE_SHA256 ||
    SMOKE_MODEL !== "gpt-6-luna" ||
    SMOKE_BUDGET_USD !== 0.05 ||
    V5_BUDGET_USD !== 0.06
  )
    throw new Error("v5-policy-or-allowance-mismatch");
  const exported = createInputExport(
    bound,
    [{ candidateId: "direct-openai-luna", requestedModelId: SMOKE_MODEL }],
    V5_CASE_IDS,
  );
  const reservationNanoUsd = exported.cases.map((c) => {
    const bytes = Buffer.byteLength(c.input.systemPolicy + c.input.groundedPayload, "utf8");
    if (bytes > 80_000 || c.input.maxOutputTokens !== 4096 || c.input.deadlineMs !== 45_000)
      throw new Error("smoke-limits-mismatch");
    // Carry the established conservative rates: input .125 and output .50 / million USD.
    return (bytes + 1024) * 125 + c.input.maxOutputTokens * 500;
  });
  const reservedUsd = reservationNanoUsd.reduce((a, b) => a + b, 0) / 1_000_000_000;
  const prepared = {
    exported,
    reservations: reservationNanoUsd.map((n) => n / 1_000_000_000),
    reservedUsd,
  };
  return { prepared, budget: cumulativeReservation(reservedUsd) };
}
