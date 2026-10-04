// The pure decision pipeline behind the participant AI boundary.
//
// Every dependency is injected: environment record, pilot-admission check and
// transport factory. That makes the whole order of checks testable with mocks,
// and it keeps the guarantee visible in one place — the transport factory is
// only ever CALLED once every check has already passed, so a disabled, unready,
// unadmitted, unconsented or malformed request makes zero gateway calls.

import { readJourneyAiActivation, type EnvLike } from "@/lib/ai/journey-activation";
import { parseJourneyAiConsent } from "@/lib/ai/journey-consent";
import { parseJourneyRequest } from "@/lib/ai/journey-contract";
import {
  generateJourneyReflection,
  type JourneyGenerationFailureCode,
  type JourneyGenerationResult,
  type JourneyModelProvider,
} from "@/lib/ai/journey-generation";
import type { JourneyResponseIdentity } from "@/lib/ai/journey-policy";

export type JourneyBoundaryRefusal =
  | "ai-not-activated"
  | "ai-not-released"
  | "pilot-not-verified"
  | "pilot-check-unavailable"
  | "consent-invalid"
  | "consent-version-stale"
  | "consent-not-accepted"
  | "invalid-request";

export type JourneyBoundaryResult =
  | {
      ok: true;
      text: string;
      paragraphs: string[];
      identity: JourneyResponseIdentity;
      usage?: Record<string, number>;
    }
  | { ok: false; code: JourneyBoundaryRefusal | JourneyGenerationFailureCode };

export type PilotAdmission = { ok: true } | { ok: false; reason: "not-verified" | "unavailable" };

export type JourneyAiAvailability =
  | { available: true }
  | {
      available: false;
      code:
        | "ai-not-activated"
        | "ai-not-released"
        | "pilot-not-verified"
        | "pilot-check-unavailable";
    };

export interface JourneyBoundaryDeps {
  env: EnvLike | undefined;
  /** Server-side verification of the existing signed pilot session. */
  verifyPilotAdmission: () => Promise<PilotAdmission>;
  /** Created lazily, only after every check passes. */
  createProvider: () => JourneyModelProvider | Promise<JourneyModelProvider>;
}

export interface JourneyBoundaryInput {
  /** The canonical four-field day request, untrusted. */
  request: unknown;
  /** The separately validated AI consent envelope, untrusted. */
  consent: unknown;
}

type AvailabilityDeps = Pick<JourneyBoundaryDeps, "env" | "verifyPilotAdmission">;

/** Detached four-field snapshot; no caller object survives an asynchronous gate. */
export interface JourneyBoundaryRequest {
  readonly day: number;
  readonly answerMeaningVersion: string;
  readonly answers: readonly string[];
  readonly spiritual: boolean;
}

type BoundaryPreflight =
  | { ok: true; request: JourneyBoundaryRequest }
  | { ok: false; code: JourneyBoundaryRefusal };

function activationAvailability(env: EnvLike | undefined): JourneyAiAvailability {
  const activation = readJourneyAiActivation(env);
  if (!activation.activationEnabled) return { available: false, code: "ai-not-activated" };
  if (!activation.releaseReady) return { available: false, code: "ai-not-released" };
  return { available: true };
}

async function pilotAvailability(deps: AvailabilityDeps): Promise<JourneyAiAvailability> {
  let raw: unknown;
  try {
    raw = await deps.verifyPilotAdmission();
  } catch {
    return { available: false, code: "pilot-check-unavailable" };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { available: false, code: "pilot-check-unavailable" };
  }
  const admission = raw as Record<string, unknown>;
  if (admission.ok === true && Object.keys(admission).length === 1) {
    return { available: true };
  }
  if (
    admission.ok === false &&
    Object.keys(admission).length === 2 &&
    admission.reason === "not-verified"
  ) {
    return { available: false, code: "pilot-not-verified" };
  }
  return { available: false, code: "pilot-check-unavailable" };
}

/** A read-only availability check. It receives no answers and owns no provider. */
export async function readJourneyAiAvailability(
  deps: AvailabilityDeps,
): Promise<JourneyAiAvailability> {
  const activation = activationAvailability(deps.env);
  return activation.available ? pilotAvailability(deps) : activation;
}

export async function preflightJourneyBoundary(
  input: unknown,
  deps: AvailabilityDeps,
): Promise<BoundaryPreflight> {
  const activation = activationAvailability(deps.env);
  if (!activation.available) return { ok: false, code: activation.code };

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, code: "invalid-request" };
  }
  const envelope = input as Record<string, unknown>;
  if (
    Object.keys(envelope).length !== 2 ||
    !Object.prototype.hasOwnProperty.call(envelope, "request") ||
    !Object.prototype.hasOwnProperty.call(envelope, "consent")
  ) {
    return { ok: false, code: "invalid-request" };
  }

  const consent = parseJourneyAiConsent(envelope.consent);
  if (!consent.ok) return { ok: false, code: consent.code };

  // A shape check first, so an invalid day request cannot reach the gateway even
  // when everything else is in order.
  const parsed = parseJourneyRequest(envelope.request);
  if (!parsed.ok) {
    return { ok: false, code: "invalid-request" };
  }
  const request = Object.freeze({
    day: parsed.request.day.day,
    answerMeaningVersion: parsed.request.answerMeaningVersion,
    answers: Object.freeze([...parsed.request.answers]),
    spiritual: parsed.request.spiritual,
  });

  // The client gate and any caller-supplied "admitted" claim are NOT proof. Only
  // the server-side session check is, and any failure fails closed.
  const admission = await pilotAvailability(deps);
  if (!admission.available) return { ok: false, code: admission.code };
  return { ok: true, request };
}

/** Shared lazy factory and response boundary; callers establish all gates first. */
export async function dispatchJourneyBoundary(
  createProvider: JourneyBoundaryDeps["createProvider"],
  generate: (provider: JourneyModelProvider) => Promise<JourneyGenerationResult>,
): Promise<JourneyBoundaryResult> {
  let provider: JourneyModelProvider;
  try {
    provider = await createProvider();
  } catch {
    return { ok: false, code: "provider-unavailable" };
  }
  if (
    !provider ||
    provider.provenance !== "live-model" ||
    typeof provider.generate !== "function"
  ) {
    return { ok: false, code: "provider-invalid-output" };
  }
  const result = await generate(provider);

  if (!result.ok) return { ok: false, code: result.code };
  if (!result.meta.acceptedAsLiveAi || result.meta.identity.provenance !== "live-model") {
    return { ok: false, code: "provider-invalid-output" };
  }

  return {
    ok: true,
    text: result.reflection.text,
    paragraphs: result.reflection.paragraphs,
    identity: result.meta.identity,
    ...(result.meta.usage ? { usage: { ...result.meta.usage } as Record<string, number> } : {}),
  };
}

export async function runJourneyBoundary(
  input: unknown,
  deps: JourneyBoundaryDeps,
): Promise<JourneyBoundaryResult> {
  const checked = await preflightJourneyBoundary(input, deps);
  if (!checked.ok) return checked;
  return dispatchJourneyBoundary(deps.createProvider, (provider) =>
    generateJourneyReflection({
      rawRequest: checked.request,
      gates: { activationEnabled: true, consentEstablished: true, pilotAdmitted: true },
      provider,
    }),
  );
}
