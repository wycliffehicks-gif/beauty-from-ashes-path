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

export type PilotAdmission =
  | { ok: true }
  | { ok: false; reason: "not-verified" | "unavailable" };

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

export async function runJourneyBoundary(
  input: JourneyBoundaryInput,
  deps: JourneyBoundaryDeps,
): Promise<JourneyBoundaryResult> {
  const activation = readJourneyAiActivation(deps.env);
  if (!activation.activationEnabled) return { ok: false, code: "ai-not-activated" };
  if (!activation.releaseReady) return { ok: false, code: "ai-not-released" };

  const consent = parseJourneyAiConsent(input.consent);
  if (!consent.ok) return { ok: false, code: consent.code };

  // A shape check first, so an invalid day request cannot reach the gateway even
  // when everything else is in order.
  if (!parseJourneyRequest(input.request).ok) {
    return { ok: false, code: "invalid-request" };
  }

  // The client gate and any caller-supplied "admitted" claim are NOT proof. Only
  // the server-side session check is, and any failure fails closed.
  let admission: PilotAdmission;
  try {
    admission = await deps.verifyPilotAdmission();
  } catch {
    return { ok: false, code: "pilot-check-unavailable" };
  }
  if (!admission.ok) {
    return {
      ok: false,
      code: admission.reason === "unavailable" ? "pilot-check-unavailable" : "pilot-not-verified",
    };
  }

  const provider = await deps.createProvider();
  const result = await generateJourneyReflection({
    rawRequest: input.request,
    gates: { activationEnabled: true, consentEstablished: true, pilotAdmitted: true },
    provider,
  });

  if (!result.ok) return { ok: false, code: result.code };

  return {
    ok: true,
    text: result.reflection.text,
    paragraphs: result.reflection.paragraphs,
    identity: result.meta.identity,
    ...(result.meta.usage ? { usage: { ...result.meta.usage } as Record<string, number> } : {}),
  };
}
