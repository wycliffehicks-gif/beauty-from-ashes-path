// The shared pilot passcode: a gate, not a login. One code, compared only on
// the server, forgiving of stray spacing and capitalisation on a phone keyboard.

import { describe, expect, it } from "vitest";
import { passcodeMatches } from "@/lib/gate.server";

describe("pilot passcode", () => {
  it("accepts the exact code", () => {
    expect(passcodeMatches("New Paths", "New Paths")).toBe(true);
  });

  it("forgives casing and stray spacing", () => {
    expect(passcodeMatches("  new paths ", "New Paths")).toBe(true);
    expect(passcodeMatches("NEW   PATHS", "New Paths")).toBe(true);
  });

  it("rejects anything else, including near misses and empty input", () => {
    for (const wrong of ["", "newpaths", "New Path", "new-paths", "hope"]) {
      expect(passcodeMatches(wrong, "New Paths")).toBe(false);
    }
  });
});
