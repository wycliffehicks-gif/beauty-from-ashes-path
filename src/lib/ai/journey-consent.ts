// Explicit, versioned AI consent envelope for the current ten-day path.
//
// A consent envelope records ONE thing honestly: that on this device, at this
// moment, the person read the current AI disclosure and chose to send this day's
// selections for generation. It is a client assertion about a choice — it is NOT
// verified age, identity, or clinical consent, and nothing here claims it is.
//
// Pure and transport-free.

import { JOURNEY_AI_DISCLOSURE_VERSION } from "@/lib/ai/journey-disclosure";

/** The consent envelope format currently accepted. */
export const JOURNEY_CONSENT_ENVELOPE_VERSION = "journey-consent-1";

export interface JourneyAiConsent {
  envelopeVersion: string;
  /** The disclosure version the person actually read. */
  disclosureVersion: string;
  /** Must be the literal boolean true. */
  accepted: true;
}

export type JourneyConsentResult =
  | { ok: true; consent: JourneyAiConsent }
  | { ok: false; code: "consent-invalid" | "consent-version-stale" | "consent-not-accepted" };

/**
 * Accept only an exact current envelope. A truthy string, 1, "yes", a missing
 * field, an older disclosure version or any extra shape is refused, and the
 * refusal never echoes the caller's value.
 */
export function parseJourneyAiConsent(raw: unknown): JourneyConsentResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, code: "consent-invalid" };
  }
  const r = raw as Record<string, unknown>;
  if (r.envelopeVersion !== JOURNEY_CONSENT_ENVELOPE_VERSION) {
    return { ok: false, code: "consent-invalid" };
  }
  if (typeof r.disclosureVersion !== "string") {
    return { ok: false, code: "consent-invalid" };
  }
  if (r.disclosureVersion !== JOURNEY_AI_DISCLOSURE_VERSION) {
    return { ok: false, code: "consent-version-stale" };
  }
  if (r.accepted !== true) {
    return { ok: false, code: "consent-not-accepted" };
  }
  return {
    ok: true,
    consent: {
      envelopeVersion: JOURNEY_CONSENT_ENVELOPE_VERSION,
      disclosureVersion: JOURNEY_AI_DISCLOSURE_VERSION,
      accepted: true,
    },
  };
}

/** The envelope a client should send once the person has explicitly chosen. */
export function currentJourneyAiConsent(): JourneyAiConsent {
  return {
    envelopeVersion: JOURNEY_CONSENT_ENVELOPE_VERSION,
    disclosureVersion: JOURNEY_AI_DISCLOSURE_VERSION,
    accepted: true,
  };
}
