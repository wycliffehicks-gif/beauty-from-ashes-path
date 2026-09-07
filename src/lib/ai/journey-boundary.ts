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

export async function runJourneyBoundary(
  input: unknown,
  deps: JourneyBoundaryDeps,
): Promise<JourneyBoundaryResult> {
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
  if (!parseJourneyRequest(envelope.request).ok) {
    return { ok: false, code: "invalid-request" };
  }

  // The client gate and any caller-supplied "admitted" claim are NOT proof. Only
  // the server-side session check is, and any failure fails closed.
  const admission = await pilotAvailability(deps);
  if (!admission.available) return { ok: false, code: admission.code };

  let provider: JourneyModelProvider;
  try {
    provider = await deps.createProvider();
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
  const result = await generateJourneyReflection({
    rawRequest: envelope.request,
    gates: { activationEnabled: true, consentEstablished: true, pilotAdmitted: true },
    provider,
  });

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
