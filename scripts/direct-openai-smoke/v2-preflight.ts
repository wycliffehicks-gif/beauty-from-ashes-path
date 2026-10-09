/** Fixed-history preparation for one private candidate-v2 batch; no IO or provider calls. */
import { isDeepStrictEqual } from "node:util";
import type { BoundPack } from "../offline-ai/comparison";
import { prepareSmoke, SMOKE_BUDGET_USD, SMOKE_MODEL } from "./smoke";

export const V2_POLICY = "journey-p4-eval-expression-v2+srt-candidate-v2";
export const V2_INSTRUCTION_SHA256 =
  "c9278ab3af523d2df9f6259fdcf25256a95f4f89ebfbdf918ffe3f48db5aa1fe";
export const V2_ATTEMPT_GUARD = "LIVE_CANDIDATE_V2_ATTEMPTED.json";
export const PRIOR_RESERVED_USD = 0.013796375;
const PRIOR_NANO_USD = 13_796_375;
const ALLOWANCE_NANO_USD = 50_000_000;

export const KNOWN_V1_ATTEMPT_MARKER = {
  createdAt: "2026-10-09T02:11:37.976Z",
  directory: "/dev-server/artifacts/direct-openai-smoke/funded-2026-10-08-02",
  model: "gpt-6-luna",
} as const;

export const EXPECTED_PRIOR_RECONCILIATION = {
  schemaVersion: "bfa-openai-v2-prior-reconciliation-1",
  claim: "reported-history-not-reconstructed-raw-evidence",
  model: "gpt-6-luna",
  reasoning: "none",
  candidatePolicyVersion: V2_POLICY,
  candidateInstructionSha256: V2_INSTRUCTION_SHA256,
  engineeringAllowanceUsd: 0.05,
  priorBatches: [
    {
      id: "unfunded-v1",
      status: "settled-429",
      requestIds: ["req_a662934ce915414184fe9a276cd05909"],
      reservedCarryUsd: 0.003450375,
    },
    {
      id: "funded-v1",
      status: "settled-three-complete",
      requestIds: [
        "req_369a19eeab114dac9984c48916f66c06",
        "req_4d42309838de4961bccfa273201f9889",
        "req_c8edf8b555c744b68d97f9ebb4b57844",
      ],
      reservedCarryUsd: 0.010346,
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

export function reconcileOldMarker(raw: string | null) {
  if (raw === null) return "absent-not-proof-of-no-history" as const;
  if (!isDeepStrictEqual(parseSmallJson(raw), KNOWN_V1_ATTEMPT_MARKER))
    throw new Error("unknown-prior-attempt-marker");
  return "matched-known-funded-v1" as const;
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

export function prepareV2Smoke(bound: BoundPack) {
  if (
    bound.manifest.policyVersion !== V2_POLICY ||
    bound.manifest.candidateInstructionSha256 !== V2_INSTRUCTION_SHA256 ||
    SMOKE_MODEL !== "gpt-6-luna" ||
    SMOKE_BUDGET_USD !== 0.05
  )
    throw new Error("v2-policy-or-allowance-mismatch");
  const prepared = prepareSmoke(bound);
  return { prepared, budget: cumulativeReservation(prepared.reservedUsd) };
}
