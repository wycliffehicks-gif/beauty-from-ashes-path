/** DORMANT Node-only keyed binding. No environment lookup, default key or network. */
import { createHmac, randomBytes } from "node:crypto";
import { parseJourneyRequest } from "./journey-contract";
import { presentationAnswers } from "../journey/presentation-answers";
import type { JourneyBoundaryRequest } from "./journey-boundary";
import type { JourneyDispatchBinding } from "./journey-reserved-flow";
import type { PilotControlConfig } from "./journey-participant-attempt";
import type { UsagePolicy } from "./journey-usage-reservation";

export interface VerifiedJourneyPrincipal {
  readonly issuer: string;
  readonly subject: string;
}
export interface JourneyPricing {
  readonly pricingVersion: string;
  readonly reservedSpendMicros: number;
}
export interface JourneyHmacConfiguration {
  readonly pilotId: string;
  readonly hmacKeyId: string;
  /** Exactly 32 secret random bytes provisioned outside this module. */
  readonly secret: Uint8Array;
}
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
const fail = (): never => {
  throw new Error("JOURNEY_BINDING_CONFIGURATION_INVALID");
};

/**
 * Validate before normalization: no extra/invalid client field is repaired.
 * Stable IDs, canonical step order and sorted options produce identical outgoing
 * material for index/ID aliases and reordered selections. Existing faith-off
 * filtering also removes dormant tokens which contribute no outgoing material.
 */
export function canonicalJourneyRequest(raw: unknown): JourneyBoundaryRequest | null {
  const parsed = parseJourneyRequest(raw);
  if (!parsed.ok) return null;
  const stable = parsed.request.selections.flatMap((selection) =>
    [...selection.optionIds].sort().map((option) => `${selection.stepKey}:${option}`),
  );
  const visible = presentationAnswers(parsed.request.day, stable, {
    hydrated: true,
    showSpiritual: parsed.request.spiritual,
  });
  return Object.freeze({
    day: parsed.request.day.day,
    answerMeaningVersion: parsed.request.answerMeaningVersion,
    answers: Object.freeze([...visible]),
    spiritual: parsed.request.spiritual,
  });
}

export function isVerifiedPrincipalShape(raw: unknown): raw is VerifiedJourneyPrincipal {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const item = raw as Record<string, unknown>;
  return (
    Object.keys(item).length === 2 &&
    Object.hasOwn(item, "issuer") &&
    Object.hasOwn(item, "subject") &&
    [item.issuer, item.subject].every(
      (value) =>
        typeof value === "string" &&
        value.length > 0 &&
        value.length <= 512 &&
        !/[\u0000-\u001f\u007f]/.test(value),
    )
  );
}

export function createJourneyBindingTools(configuration: JourneyHmacConfiguration) {
  if (
    !TOKEN.test(configuration.pilotId) ||
    !TOKEN.test(configuration.hmacKeyId) ||
    !(configuration.secret instanceof Uint8Array) ||
    configuration.secret.byteLength !== 32
  )
    fail();
  // A private copy prevents later mutation of a caller-held byte array. It is
  // never returned, persisted, logged or passed to the provider/store.
  const secret = Buffer.from(configuration.secret);
  const pilotId = configuration.pilotId;
  const hmacKeyId = configuration.hmacKeyId;
  const digest = (domain: string, value: unknown): string =>
    createHmac("sha256", secret)
      .update(JSON.stringify([domain, pilotId, hmacKeyId, value]), "utf8")
      .digest("base64url");
  const config: PilotControlConfig = Object.freeze({
    pilotId,
    hmacKeyId,
    keyCheck: digest("bfa-key-continuity-v1", null),
  });
  return Object.freeze({
    config,
    identityKey(principal: VerifiedJourneyPrincipal): string {
      if (!isVerifiedPrincipalShape(principal)) fail();
      return digest("bfa-verified-identity-v1", [principal.issuer, principal.subject]);
    },
    logicalRequestKey(participantKey: string, request: JourneyBoundaryRequest): string {
      if (!TOKEN.test(participantKey)) fail();
      const canonical = canonicalJourneyRequest(request);
      if (!canonical) fail();
      return digest("bfa-logical-request-v1", [participantKey, canonical]);
    },
    dispatchFingerprint(
      binding: JourneyDispatchBinding,
      pricing: JourneyPricing,
      policy: UsagePolicy,
    ): string {
      const canonical = canonicalJourneyRequest(binding.request);
      if (
        !canonical ||
        !TOKEN.test(pricing.pricingVersion) ||
        !Number.isSafeInteger(pricing.reservedSpendMicros) ||
        pricing.reservedSpendMicros <= 0 ||
        !TOKEN.test(policy.budgetId) ||
        !["CAD", "USD"].includes(policy.currency)
      )
        fail();
      const cap = (value: UsagePolicy["globalTotal"]) => {
        if (
          !value ||
          !Number.isSafeInteger(value.requests) ||
          value.requests <= 0 ||
          !Number.isSafeInteger(value.spendMicros) ||
          value.spendMicros <= 0
        )
          fail();
        return { requests: value.requests, spendMicros: value.spendMicros };
      };
      // Exact prepared bytes plus all output/pricing/accounting configuration.
      // Only this digest enters the ledger, never the plaintext material below.
      return digest("bfa-exact-dispatch-v1", {
        request: canonical,
        preparationIdentity: {
          contractVersion: binding.preparationIdentity.contractVersion,
          groundingVersion: binding.preparationIdentity.groundingVersion,
          policyVersion: binding.preparationIdentity.policyVersion,
          answerMeaningVersion: binding.preparationIdentity.answerMeaningVersion,
          day: binding.preparationIdentity.day,
          canonicalIdentity: binding.preparationIdentity.canonicalIdentity,
        },
        systemPolicy: binding.systemPolicy,
        groundedPayload: binding.groundedPayload,
        generationVersion: binding.generationVersion,
        outputVersion: binding.outputVersion,
        validatorVersion: binding.validatorVersion,
        model: binding.model,
        maxOutputTokens: binding.maxOutputTokens,
        deadlineMs: binding.deadlineMs,
        pricingVersion: pricing.pricingVersion,
        reservedSpendMicros: pricing.reservedSpendMicros,
        budgetId: policy.budgetId,
        currency: policy.currency,
        participantDay: cap(policy.participantDay),
        participantTotal: cap(policy.participantTotal),
        globalDay: cap(policy.globalDay),
        globalTotal: cap(policy.globalTotal),
      });
    },
  });
}

/** Candidate only; the atomic decision retains an existing attempt on retry. */
export function createServerAttemptCandidate(): string {
  return randomBytes(24).toString("base64url");
}
