// Correction-pass regression tests for local preferences and the agreement
// version, matching the audit findings.

import { beforeEach, describe, expect, it } from "vitest";

// Minimal in-memory storage stub so preferences can be read without a DOM.
class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}
(globalThis as unknown as { window: unknown }).window = {
  localStorage: new MemoryStorage(),
  sessionStorage: new MemoryStorage(),
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class {
  constructor(public type: string) {}
};

import { hasCurrentAcceptance } from "@/lib/agreement";
import { LEGAL_BUNDLE_VERSION } from "@/lib/prefs";

describe("legal bundle version", () => {
  it("is the current dated bundle, so earlier acceptances are asked again", () => {
    expect(LEGAL_BUNDLE_VERSION).toBe("2026-08-16.1");
    expect(
      hasCurrentAcceptance({
        onboarded: true,
        legalAcceptance: { version: "2026-07-27", acceptedAt: "2026-07-27" },
      }),
    ).toBe(false);
    expect(
      hasCurrentAcceptance({
        onboarded: true,
        legalAcceptance: { version: LEGAL_BUNDLE_VERSION, acceptedAt: "2026-08-16.1" },
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
