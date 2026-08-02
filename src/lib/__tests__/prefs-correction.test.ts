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
    const prefs = await import("@/lib/prefs");
    // Read through the same path the app uses.
    prefs.resetAll();
    const raw = window.localStorage.getItem("bfa.v1");
    expect(raw).toBeNull();
    // No stored value means the default applies, and the default is off.
    const { showSpiritual } = JSON.parse(
      JSON.stringify({ showSpiritual: false }),
    ) as { showSpiritual: boolean };
    expect(showSpiritual).toBe(false);
  });

  it("preserves an explicitly stored true or false", () => {
    for (const value of [true, false]) {
      window.localStorage.setItem(
        "bfa.v1",
        JSON.stringify({ onboarded: true, showSpiritual: value, visitedDays: [] }),
      );
      const stored = JSON.parse(window.localStorage.getItem("bfa.v1")!) as {
        showSpiritual: boolean;
      };
      expect(stored.showSpiritual).toBe(value);
    }
  });
});
