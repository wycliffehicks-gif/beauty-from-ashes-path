// Pure generation core for the CURRENT ten-day journey.
//
// TRANSPORT-FREE. This module never imports a `.server` provider, never opens a
// network connection, never reads an environment variable, never touches
// storage, and defines no route. The transport is INJECTED, so the pure core can
// be exercised entirely with mocks.
//
// What this core owns:
//   - strict canonical request validation (via the existing contract);
//   - server-owned preparation, immutable policy and engineering defaults —
//     a caller can never supply teaching, model, policy, caps or provenance;
//   - exactly ONE generation attempt per invocation: no automatic corrective
//     retry, and no hidden paid second call;
//   - bounded fixed status codes, never raw input, exception text or provider
//     error bodies;
//   - honest provenance: a mock response can never be recorded as live AI.
//
// What this core does NOT do, and does not claim: it does not activate AI, it
// does not establish consent or pilot admission (those arrive as explicit
// injected evidence and will be established by the later server batch), and its
// deterministic checks are limited lexical heuristics, not proof of grounding or
// clinical safety.

import { LIVE_MODEL_ID } from "@/lib/ai/live-provider";
import { JOURNEY_CONTRACT_VERSION, parseJourneyRequest } from "@/lib/ai/journey-contract";
import {
  prepareJourneyGeneration,
  type JourneyResponseIdentity,
  type PreparedJourneyGeneration,
} from "@/lib/ai/journey-policy";
import {
  JOURNEY_OUTPUT_VERSION,
  JOURNEY_VALIDATOR_VERSION,
  validateJourneyReflection,
  type JourneyOutputRejection,
  type JourneyReflection,
} from "@/lib/ai/journey-response";

export const JOURNEY_GENERATION_VERSION = "journey-gen1";

/* ---------------------------------------------------------------- defaults -- */

/** The only model identity this core will accept. Callers cannot change it. */
export const JOURNEY_MODEL_ID = LIVE_MODEL_ID;

/** Output token ceiling, INCLUDING any reasoning tokens the model spends. */
export const JOURNEY_MAX_OUTPUT_TOKENS = 4096;

/** Whole-response deadline, to be enforced by the later transport. */
export const JOURNEY_DEADLINE_MS = 45_000;

/**
 * Finite ceiling on the outgoing prepared text (policy + grounded payload).
 *
 * Measured across all ten canonical days with every allowable selection made
 * (see the focused tests, which assert the real headroom). The largest current
 * day measures well under this bound, so no canonical source needs truncating.
 * If a future authored change exceeds it, the request FAILS with
 * `preparation-too-large` rather than silently losing meaning.
 *
 * This is an engineering bound only. It approves no paid call and states no
 * monetary cap.
 */
export const JOURNEY_MAX_PREPARED_CHARS = 24_000;

/* ---------------------------------------------------------------- provider -- */

/** Exactly what a transport is given. Every field is server-owned. */
export interface JourneyProviderRequest {
  readonly systemPolicy: string;
  readonly groundedPayload: string;
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly deadlineMs: number;
}

/** Bounded transport failure codes. No provider body or message is carried. */
export type JourneyProviderErrorCode =
  | "provider-unavailable"
  | "provider-network"
  | "provider-timeout"
  | "provider-rate-limited"
  | "provider-budget-exhausted"
  | "provider-invalid-output";

export interface JourneyProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

export type JourneyProviderResponse =
  | {
      ok: true;
      /** Plain text only. Reasoning text is never carried or exposed. */
      text: unknown;
      /** Model the provider says actually answered. */
      model?: unknown;
      /** Provider finish status; only a complete stop is acceptable. */
      finishReason?: unknown;
      usage?: unknown;
    }
  | { ok: false; error: JourneyProviderErrorCode };

/**
 * A transport. `provenance` is declared by the trusted server-side transport,
 * not by a participant request. A mock harness declares "mock" and its output
 * can never be accepted as actual live AI.
 */
export interface JourneyModelProvider {
  readonly provenance: "mock" | "live-model";
  generate(request: JourneyProviderRequest): Promise<JourneyProviderResponse>;
}

/* ------------------------------------------------------------------ result -- */

export type JourneyGenerationFailureCode =
  | "generation-disabled"
  | "consent-not-established"
  | "pilot-admission-not-established"
  | "invalid-request"
  | "preparation-too-large"
  | "provider-threw"
  | "response-incomplete"
  | "response-model-mismatch"
  | JourneyProviderErrorCode
  | JourneyOutputRejection;

export interface JourneyGenerationMeta {
  identity: JourneyResponseIdentity;
  generationVersion: string;
  outputVersion: string;
  validatorVersion: string;
  model: string;
  maxOutputTokens: number;
  deadlineMs: number;
  /** True only for a validated response from a live-model transport. */
  acceptedAsLiveAi: boolean;
  usage?: JourneyProviderUsage;
}

export type JourneyGenerationResult =
  | { ok: true; reflection: JourneyReflection; meta: JourneyGenerationMeta }
  | {
      ok: false;
      code: JourneyGenerationFailureCode;
      /** True when no provider call was made at all. */
      providerCalled: boolean;
    };

/** Explicit injected evidence. A participant's own request is never gate proof. */
export interface JourneyGenerationGates {
  /** Server-side activation. Absent or false means no provider call. */
  activationEnabled: boolean;
  /** Evidence that this adult participant's processing consent is on record. */
  consentEstablished: boolean;
  /** Evidence that this device/session was admitted to the private pilot. */
  pilotAdmitted: boolean;
}

export interface JourneyGenerationArgs {
  /** Untrusted caller payload. Validated by the canonical contract. */
  rawRequest: unknown;
  gates: JourneyGenerationGates;
  provider: JourneyModelProvider;
}

/* -------------------------------------------------------------- internals -- */

function preparedSize(prepared: PreparedJourneyGeneration): number {
  return prepared.policy.length + prepared.groundedPayload.length;
}

/** Only finite, non-negative, bounded integers survive. Never invents cost. */
function safeUsage(raw: unknown): JourneyProviderUsage | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const source = raw as Record<string, unknown>;
  const out: JourneyProviderUsage = {};
  const keys = ["inputTokens", "outputTokens", "reasoningTokens", "totalTokens"] as const;
  for (const key of keys) {
    const value = source[key];
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 10_000_000
    ) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const COMPLETE_FINISH_REASONS = ["stop", "end_turn", "complete", "completed"];

function isCompleteFinish(raw: unknown): boolean {
  return typeof raw === "string" && COMPLETE_FINISH_REASONS.includes(raw.toLowerCase());
}

/* ------------------------------------------------------------------- core -- */

/**
 * One invocation, at most ONE provider call, one deterministic verdict.
 *
 * Nothing rejected is echoed: no raw caller input, no exception text and no
 * provider error body ever reaches the result.
 */
export async function generateJourneyReflection(
  args: JourneyGenerationArgs,
): Promise<JourneyGenerationResult> {
  const { gates, provider } = args;

  if (!gates.activationEnabled) {
    return { ok: false, code: "generation-disabled", providerCalled: false };
  }
  if (!gates.consentEstablished) {
    return { ok: false, code: "consent-not-established", providerCalled: false };
  }
  if (!gates.pilotAdmitted) {
    return { ok: false, code: "pilot-admission-not-established", providerCalled: false };
  }

  const parsed = parseJourneyRequest(args.rawRequest);
  if (!parsed.ok) {
    return { ok: false, code: "invalid-request", providerCalled: false };
  }

  const prepared = prepareJourneyGeneration(parsed.request);
  if (preparedSize(prepared) > JOURNEY_MAX_PREPARED_CHARS) {
    // Fail rather than truncate: a shortened source would change meaning.
    return { ok: false, code: "preparation-too-large", providerCalled: false };
  }

  const providerRequest: JourneyProviderRequest = {
    systemPolicy: prepared.policy,
    groundedPayload: prepared.groundedPayload,
    model: JOURNEY_MODEL_ID,
    maxOutputTokens: JOURNEY_MAX_OUTPUT_TOKENS,
    deadlineMs: JOURNEY_DEADLINE_MS,
  };

  let response: JourneyProviderResponse;
  try {
    response = await provider.generate(providerRequest);
  } catch {
    // The thrown value is deliberately discarded, not logged or returned.
    return { ok: false, code: "provider-threw", providerCalled: true };
  }

  if (!response || typeof response !== "object") {
    return { ok: false, code: "provider-invalid-output", providerCalled: true };
  }
  if (response.ok !== true) {
    return { ok: false, code: response.error, providerCalled: true };
  }

  // A complete finish status is required. A truncated or refused generation is
  // not a reflection, and there is NO corrective retry.
  if (!isCompleteFinish(response.finishReason)) {
    return { ok: false, code: "response-incomplete", providerCalled: true };
  }
  if (response.model !== JOURNEY_MODEL_ID) {
    return { ok: false, code: "response-model-mismatch", providerCalled: true };
  }

  const checked = validateJourneyReflection({
    text: response.text,
    source: prepared.grounding,
  });
  if (!checked.ok) {
    return { ok: false, code: checked.code, providerCalled: true };
  }

  const usage = safeUsage(response.usage);
  const identity: JourneyResponseIdentity = {
    ...prepared.identity,
    provenance: provider.provenance,
    canonicalIdentity: [
      prepared.identity.canonicalIdentity,
      JOURNEY_GENERATION_VERSION,
      JOURNEY_OUTPUT_VERSION,
      JOURNEY_VALIDATOR_VERSION,
      provider.provenance,
    ].join("|"),
  };

  return {
    ok: true,
    reflection: checked.reflection,
    meta: {
      identity,
      generationVersion: JOURNEY_GENERATION_VERSION,
      outputVersion: JOURNEY_OUTPUT_VERSION,
      validatorVersion: JOURNEY_VALIDATOR_VERSION,
      model: JOURNEY_MODEL_ID,
      maxOutputTokens: JOURNEY_MAX_OUTPUT_TOKENS,
      deadlineMs: JOURNEY_DEADLINE_MS,
      acceptedAsLiveAi: provider.provenance === "live-model",
      ...(usage ? { usage } : {}),
    },
  };
}

export { JOURNEY_CONTRACT_VERSION };
