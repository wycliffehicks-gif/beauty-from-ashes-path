// Activation configuration for the CURRENT ten-day AI reflection path.
//
// DEFAULT OFF, and deliberately SEPARATE from the legacy Day-1 / weekly
// `LIVE_AI_ENABLED` flag. The old flag cannot switch this path on, and this
// flag cannot switch the old paths on. Nothing here reads or reveals a secret
// value; only the presence and exact literal form of two switches is inspected.
//
// TWO independent conditions must both be true before any paid generation:
//
//  1. ACTIVATION  — `JOURNEY_AI_ENABLED` is exactly "true" or "1".
//  2. READINESS   — `JOURNEY_AI_RELEASE_READY` is exactly "true" or "1".
//
// The readiness lock is a deliberate, server-owned hold. It exists so that the
// participant-facing processing disclosure cannot go live before:
//   (a) Lovable's reply about processing of sensitive participant answers is
//       received and reconciled with what this app actually sends, and
//   (b) the founder has approved the final disclosure wording.
//
// FUTURE ACTIVATION STEPS (all four, in order, by a person — never automatic):
//   1. Reconcile Lovable's written processing answer with the disclosure copy
//      in `journey-disclosure.ts`; correct the copy if it is not accurate.
//   2. Obtain the founder's approval of that exact wording and bump
//      `JOURNEY_AI_DISCLOSURE_VERSION` so consent is asked for again.
//   3. Set `JOURNEY_AI_RELEASE_READY=true` in the server environment.
//   4. Set `JOURNEY_AI_ENABLED=true` in the server environment.
// Removing or blanking either value returns the app to its authored path.

export const JOURNEY_AI_ACTIVATION_ENV = "JOURNEY_AI_ENABLED";
export const JOURNEY_AI_READINESS_ENV = "JOURNEY_AI_RELEASE_READY";

/** The only values that may switch a lock on. Everything else stays off. */
export const JOURNEY_AI_TRUE_VALUES = ["true", "1"] as const;

export type EnvLike = Record<string, string | undefined>;

function isOn(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return (JOURNEY_AI_TRUE_VALUES as readonly string[]).includes(normalized);
}

export interface JourneyAiActivation {
  /** The activation switch alone. */
  activationEnabled: boolean;
  /** The release / disclosure-readiness lock alone. */
  releaseReady: boolean;
  /** True only when BOTH are on. This is the only thing callers should gate on. */
  liveGenerationAllowed: boolean;
}

/**
 * Read the activation state from an explicit environment record. The record is
 * passed in so this stays pure and testable; the server function supplies
 * `process.env` inside its handler.
 */
export function readJourneyAiActivation(env: EnvLike | undefined): JourneyAiActivation {
  const activationEnabled = isOn(env?.[JOURNEY_AI_ACTIVATION_ENV]);
  const releaseReady = isOn(env?.[JOURNEY_AI_READINESS_ENV]);
  return {
    activationEnabled,
    releaseReady,
    liveGenerationAllowed: activationEnabled && releaseReady,
  };
}
