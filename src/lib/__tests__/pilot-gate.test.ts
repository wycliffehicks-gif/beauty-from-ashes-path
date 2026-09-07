// The shared pilot passcode: a gate, not a login. One code, compared only on
// the server, forgiving of stray spacing and capitalisation on a phone keyboard.

import { describe, expect, it } from "vitest";
import { passcodeMatches } from "@/lib/gate.server";

describe("pilot passcode", () => {
  it("accepts the exact code", () => {
    expect(passcodeMatches("samplecode", "samplecode")).toBe(true);
  });

  it("forgives casing and surrounding whitespace", () => {
    expect(passcodeMatches("  samplecode ", "samplecode")).toBe(true);
    expect(passcodeMatches("SAMPLECODE", "samplecode")).toBe(true);
    expect(passcodeMatches("SampleCode", "samplecode")).toBe(true);
  });

  it("rejects an internal space when the configured code has none", () => {
    expect(passcodeMatches("Sample Code", "samplecode")).toBe(false);
    expect(passcodeMatches("sample code", "samplecode")).toBe(false);
    expect(passcodeMatches("SAMPLE   CODE", "samplecode")).toBe(false);
  });

  it("rejects anything else, including near misses and empty input", () => {
    for (const wrong of ["", "samplecod", "sample-code", "hope"]) {
      expect(passcodeMatches(wrong, "samplecode")).toBe(false);
    }
  });
});

