import { describe, expect, it } from "vitest";
import { getJourneyAiFailure, normalizeJourneyAiFailure } from "../journey-ai-feedback";

describe("participant refusal presentation policy", () => {
  it("reserves recovery actions for access checks and separately reviewed consent", () => {
    for (const code of ["pilot-not-verified", "pilot-check-unavailable", "pilot-admission-not-established", "availability-check-unavailable"])
      expect(getJourneyAiFailure(code).recovery).toBe("check-availability");
    for (const code of ["consent-invalid", "consent-not-accepted", "consent-version-stale", "consent-not-established"])
      expect(getJourneyAiFailure(code).recovery).toBe("review-consent");
    expect(getJourneyAiFailure("pilot-not-verified").message).not.toBe(getJourneyAiFailure("pilot-check-unavailable").message);
  });
  it("offers no repeat-generation action or promised reset for usage, provider or output failures", () => {
    for (const code of [
      "ai-not-activated", "ai-not-released", "generation-disabled", "invalid-request", "preparation-too-large",
      "usage-participant-day-limit", "usage-participant-total-limit", "usage-global-day-limit", "usage-global-total-limit",
      "usage-control-unavailable", "usage-configuration-invalid", "usage-ledger-invalid", "usage-attempt-already-reserved", "usage-attempt-conflict",
      "request-status-unknown", "provider-unavailable", "provider-network", "provider-timeout", "provider-rate-limited",
      "provider-budget-exhausted", "provider-invalid-output", "provider-threw", "response-incomplete", "response-model-mismatch",
      "output-empty", "output-not-text", "output-too-large", "output-contains-markup", "output-not-prose",
      "unsupported-therapeutic-guarantee", "affirmative-diagnosis", "devotional-leakage",
    ]) {
      const failure = getJourneyAiFailure(code);
      expect(failure.recovery).toBe("none");
      expect(failure.message).toContain("written reflection");
      expect(failure.message).not.toMatch(/try again|tomorrow|no charge|nothing was sent|clear.*journey/i);
      expect(normalizeJourneyAiFailure(code)).toBe(code);
    }
  });
  it("discards unknown and malformed details without invoking their conversion methods", () => {
    for (const code of ["FICTIONAL_PRIVATE_ERROR", "__proto__", null, undefined, 17, { toString() { throw Error("do not inspect"); } }]) {
      expect(normalizeJourneyAiFailure(code)).toBe("reflection-unavailable");
      expect(getJourneyAiFailure(code)).toEqual(getJourneyAiFailure("reflection-unavailable"));
    }
  });
});
