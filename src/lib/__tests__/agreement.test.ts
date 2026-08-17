// The one agreement gate: which routes stay reachable without acceptance, and
// what counts as a current acceptance. The root `/` is now a public landing page,
// so it can be visited before acceptance. Every other surface — including
// root-level day routes and settings — must be closed until the current bundle
// is accepted.

import { describe, expect, it } from "vitest";
import { hasCurrentAcceptance, isPublicPath, PUBLIC_PATHS } from "@/lib/agreement";
import { LEGAL_BUNDLE_VERSION } from "@/lib/prefs";

describe("public paths", () => {
  it("keeps the landing page, safety, information and the opening reachable", () => {
    for (const p of PUBLIC_PATHS) expect(isPublicPath(p)).toBe(true);
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/support")).toBe(true);
    expect(isPublicPath("/support/")).toBe(true);
  });

  it("closes the journey, days, settings and other practices", () => {
    for (const p of ["/day/1", "/day/10", "/settings", "/practices", "/practice/naming"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });
});

describe("current acceptance", () => {
  const base = { onboarded: true } as const;

  it("requires both the opening and the current bundle version", () => {
    expect(
      hasCurrentAcceptance({
        ...base,
        legalAcceptance: { version: LEGAL_BUNDLE_VERSION, acceptedAt: "2026-08-02" },
      }),
    ).toBe(true);
  });

  it("rejects a missing, older or unversioned acceptance", () => {
    expect(hasCurrentAcceptance({ onboarded: true })).toBe(false);
    expect(
      hasCurrentAcceptance({
        onboarded: true,
        legalAcceptance: { version: "1999-01-01", acceptedAt: "1999-01-01" },
      }),
    ).toBe(false);
    expect(
      hasCurrentAcceptance({
        onboarded: false,
        legalAcceptance: { version: LEGAL_BUNDLE_VERSION, acceptedAt: "2026-08-02" },
      }),
    ).toBe(false);
  });
});
