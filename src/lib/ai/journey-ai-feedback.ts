// Presentation policy only. Recognising a prepared usage refusal does not wire
// the dormant participant/usage adapter into the current server endpoint.
export interface JourneyAiFailure {
  message: string;
  recovery: "check-availability" | "review-consent" | "none";
}
const unavailable: JourneyAiFailure = {
  message: "The AI reflection is unavailable right now. You can choose the written reflection.", recovery: "none",
};
const uncertain: JourneyAiFailure = {
  message: "We cannot confirm whether this AI request finished. You can choose the written reflection.", recovery: "none",
};
const consent: JourneyAiFailure = {
  message: "Please read the current AI explanation before choosing whether to send today’s selections. The written reflection remains available.", recovery: "review-consent",
};
const access: JourneyAiFailure = {
  message: "We could not confirm your access to AI reflections. You can check access again without sending your answers, or choose the written reflection.", recovery: "check-availability",
};
const checkUnavailable: JourneyAiFailure = {
  message: "The AI availability check could not be completed. You can check again without sending your answers, or choose the written reflection.", recovery: "check-availability",
};
const outputUnavailable: JourneyAiFailure = {
  message: "A usable AI reflection could not be provided. You can choose the written reflection.", recovery: "none",
};
const failures = {
  "reflection-unavailable": unavailable,
  "ai-not-activated": unavailable, "ai-not-released": unavailable, "generation-disabled": unavailable,
  "pilot-not-verified": access, "pilot-admission-not-established": access,
  "pilot-check-unavailable": checkUnavailable, "availability-check-unavailable": checkUnavailable,
  "consent-invalid": consent, "consent-version-stale": consent,
  "consent-not-accepted": consent, "consent-not-established": consent,
  "invalid-request": unavailable, "preparation-too-large": unavailable,
  "provider-timeout": uncertain, "provider-network": uncertain, "provider-threw": uncertain,
  "request-status-unknown": {
    message: "This request is taking longer than expected. We cannot confirm whether it finished. You can choose the written reflection.", recovery: "none",
  },
  "provider-unavailable": unavailable, "provider-budget-exhausted": unavailable,
  "provider-rate-limited": { message: "The AI service is busy right now. You can choose the written reflection.", recovery: "none" },
  "provider-invalid-output": outputUnavailable, "response-incomplete": outputUnavailable,
  "response-model-mismatch": outputUnavailable, "output-empty": outputUnavailable,
  "output-not-text": outputUnavailable, "output-too-large": outputUnavailable,
  "output-contains-markup": outputUnavailable, "output-not-prose": outputUnavailable,
  "unsupported-therapeutic-guarantee": outputUnavailable, "affirmative-diagnosis": outputUnavailable,
  "devotional-leakage": outputUnavailable,
  "usage-participant-day-limit": {
    message: "Your daily AI reflection allowance has been reached. You can continue with the written reflection.", recovery: "none",
  },
  "usage-participant-total-limit": {
    message: "Your AI reflection allowance for this pilot has been reached. You can continue with the written reflection.", recovery: "none",
  },
  "usage-global-day-limit": {
    message: "The pilot’s daily AI reflection allowance has been reached. You can continue with the written reflection.", recovery: "none",
  },
  "usage-global-total-limit": {
    message: "AI reflections are unavailable because the pilot’s shared allowance has been reached. You can continue with the written reflection.", recovery: "none",
  },
  "usage-attempt-already-reserved": {
    message: "This AI request cannot be started again here. Its earlier outcome may be uncertain. You can choose the written reflection.", recovery: "none",
  },
  "usage-control-unavailable": {
    message: "We cannot confirm whether this AI request can proceed. You can choose the written reflection.", recovery: "none",
  },
  "usage-configuration-invalid": unavailable, "usage-ledger-invalid": unavailable, "usage-attempt-conflict": unavailable,
} as const satisfies Record<string, JourneyAiFailure>;
export type JourneyAiFailureCode = keyof typeof failures;
/** Unknown details never become participant copy or stored warning content. */
export function normalizeJourneyAiFailure(code: unknown): JourneyAiFailureCode {
  return typeof code === "string" && Object.hasOwn(failures, code)
    ? code as JourneyAiFailureCode : "reflection-unavailable";
}
export function getJourneyAiFailure(code: unknown): JourneyAiFailure {
  return { ...failures[normalizeJourneyAiFailure(code)] };
}
