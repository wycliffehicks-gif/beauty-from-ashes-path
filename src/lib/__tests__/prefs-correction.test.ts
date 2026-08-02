// Correction-pass regression tests for local preferences and the agreement
// version, matching the audit findings.

import { beforeEach, describe, expect, it } from "vitest";
import { hasCurrentAcceptance } from "@/lib/agreement";
import { LEGAL_BUNDLE_VERSION } from "@/lib/prefs";

describe("legal bundle version", () => {
  it("is the current dated bundle, so earlier acceptances are asked again", () => {
    expect(LEGAL_BUNDLE_VERSION).toBe("2026-08-02");
    expect(
      hasCurrentAcceptance({
        onboarded: true,
        legalAcceptance: { version: "2026-07-27", acceptedAt: "2026-07-27" },
      }),
    ).toBe(false);
    expect(
      hasCurrentAcceptance({
        onboarded: true,
        legalAcceptance: { version: LEGAL_BUNDLE_VERSION, acceptedAt: "2026-08-02" },
      }),
    ).toBe(true);
  });
});

describe("spiritual preference is opt-in", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("is off for a fresh or cleared device", async () => {
    const { PREF_DEFAULTS, readPrefs, resetAll } = await import("@/lib/prefs");
    expect(PREF_DEFAULTS.showSpiritual).toBe(false);
    resetAll();
    expect(readPrefs().showSpiritual).toBe(false);
  });

  it("preserves an explicitly stored true or false", async () => {
    const { readPrefs } = await import("@/lib/prefs");
    for (const value of [true, false]) {
      window.localStorage.setItem(
        "bfa.v1",
        JSON.stringify({ onboarded: true, showSpiritual: value, visitedDays: [] }),
      );
      expect(readPrefs().showSpiritual).toBe(value);
    }
  });
});
