/** Fixed-history preparation for one private candidate-v4 batch; no IO or provider calls. */
import { isDeepStrictEqual } from "node:util";
import type { BoundPack } from "../offline-ai/comparison";
import { createInputExport } from "../offline-ai/result-exchange";
import { SMOKE_BUDGET_USD, SMOKE_MODEL } from "./smoke";
import {
  KNOWN_V1_ATTEMPT_MARKER,
  KNOWN_V2_ATTEMPT_MARKER,
  EXPECTED_PRIOR_RECONCILIATION as V3_PRIOR_RECONCILIATION,
} from "./v3-preflight";

export { KNOWN_V1_ATTEMPT_MARKER, KNOWN_V2_ATTEMPT_MARKER };
export const V4_POLICY = "journey-p4-eval-expression-v4+srt-candidate-v4";
export const V4_INSTRUCTION_SHA256 =
  "0938b3f500fe4cf7c02490259ffc67897c6c34e3d02e7ead0a6a68f7f7c41e1e";
export const V4_ATTEMPT_GUARD = "LIVE_CANDIDATE_V4_ATTEMPTED.json";
export const V4_CASE_IDS = ["d1-private-uncertain-off", "d3-regret-off"] as const;
export const PRIOR_RESERVED_USD = 0.0392725;
const PRIOR_NANO_USD = 39_272_500;
const ALLOWANCE_NANO_USD = 50_000_000;

export const KNOWN_V3_ATTEMPT_MARKER = {
  createdAt: "2026-10-09T12:54:48.996Z",
  directory: "/dev-server/artifacts/direct-openai-smoke/v3-live-2026-10-09",
  model: "gpt-6-luna",
  policyVersion: "journey-p4-eval-expression-v3+srt-candidate-v3",
  candidateInstructionSha256: "2af673b16bb6765a405208811cf7139bdc01155d059e29b353346dc458e07a0a",
  priorReconciliationSha256: "8e18183af9fde3dfaacce7a6c8bcd46e1dea54b2a474be59c67bc89852f93add",
  oldMarkerStatuses: {
    v1: "absent-not-proof-of-no-history",
    v2: "absent-not-proof-of-no-history",
  },
  oldMarkerSha256: {
    v1: null,
    v2: null,
  },
  priorReservationCarriedUsd: 0.025849875,
  newReservationUsd: 0.013422625,
  cumulativeReservationUsd: 0.0392725,
  remainingAllowanceUsd: 0.0107275,
  engineeringAllowanceUsd: 0.05,
} as const;

export const EXPECTED_PRIOR_RECONCILIATION = {
  schemaVersion: "bfa-openai-v4-prior-reconciliation-1",
  claim: "reported-history-not-reconstructed-raw-evidence",
  model: "gpt-6-luna",
  reasoning: "none",
  candidatePolicyVersion: V4_POLICY,
  candidateInstructionSha256: V4_INSTRUCTION_SHA256,
  engineeringAllowanceUsd: 0.05,
  priorBatches: [
    ...V3_PRIOR_RECONCILIATION.priorBatches,
    {
      id: "candidate-v3",
      status: "settled-three-complete",
      requestIds: [
        "req_c6027731c9ea4867b0f07da24e2ac8c1",
        "req_d11e3bd6828c43cfa484f5a8043edb85",
        "req_321a2edd72e649e3ac48c80799a2a6ea",
      ],
      reservedCarryUsd: 0.013422625,
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

export function reconcileOldMarker(version: "v1" | "v2" | "v3", raw: string | null) {
  if (raw === null) return "absent-not-proof-of-no-history" as const;
  const expected = {
    v1: KNOWN_V1_ATTEMPT_MARKER,
    v2: KNOWN_V2_ATTEMPT_MARKER,
    v3: KNOWN_V3_ATTEMPT_MARKER,
  }[version];
  if (!isDeepStrictEqual(parseSmallJson(raw), expected))
    throw new Error("unknown-prior-attempt-marker");
  return version === "v1"
    ? ("matched-known-funded-v1" as const)
    : version === "v2"
      ? ("matched-known-candidate-v2" as const)
      : ("matched-known-candidate-v3" as const);
}

export function cumulativeReservation(newReservationUsd: number) {
  if (!Number.isFinite(newReservationUsd) || newReservationUsd < 0)
    throw new Error("invalid-new-reservation");
  // Round upward in USD nanounits; never reduce reservations using estimated billing.
  const newNanoUsd = Math.ceil(newReservationUsd * 1_000_000_000);
  const cumulativeNanoUsd = PRIOR_NANO_USD + newNanoUsd;
  if (!Number.isSafeInteger(cumulativeNanoUsd) || cumulativeNanoUsd > ALLOWANCE_NANO_USD)
    throw new Error("original-allowance-exceeded");
  return {
    priorReservationCarriedUsd: PRIOR_RESERVED_USD,
    newReservationUsd: newNanoUsd / 1_000_000_000,
    cumulativeReservationUsd: cumulativeNanoUsd / 1_000_000_000,
    remainingAllowanceUsd: (ALLOWANCE_NANO_USD - cumulativeNanoUsd) / 1_000_000_000,
    engineeringAllowanceUsd: SMOKE_BUDGET_USD,
  };
}

export function prepareV4Smoke(bound: BoundPack) {
  if (
    bound.manifest.policyVersion !== V4_POLICY ||
    bound.manifest.candidateInstructionSha256 !== V4_INSTRUCTION_SHA256 ||
    SMOKE_MODEL !== "gpt-6-luna" ||
    SMOKE_BUDGET_USD !== 0.05
  )
    throw new Error("v4-policy-or-allowance-mismatch");
  const exported = createInputExport(
    bound,
    [{ candidateId: "direct-openai-luna", requestedModelId: SMOKE_MODEL }],
    V4_CASE_IDS,
  );
  // Existing source-bound requests are unchanged; no forced mode or extra selection.
  const reservationNanoUsd = exported.cases.map((c) => {
    const bytes = Buffer.byteLength(c.input.systemPolicy + c.input.groundedPayload, "utf8");
    if (bytes > 80_000 || c.input.maxOutputTokens !== 4096 || c.input.deadlineMs !== 45_000)
      throw new Error("smoke-limits-mismatch");
    // USD .125 / million input and .50 / million output, in integer nanounits.
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
