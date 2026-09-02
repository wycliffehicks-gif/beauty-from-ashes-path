// The shared pilot passcode: a gate, not a login. One code, compared only on
// the server, forgiving of stray spacing and capitalisation on a phone keyboard.

import { describe, expect, it } from "vitest";
import { passcodeMatches } from "@/lib/gate.server";

describe("pilot passcode", () => {
  it("accepts the exact code", () => {
    expect(passcodeMatches("newpaths", "newpaths")).toBe(true);
  });

  it("forgives casing and surrounding whitespace", () => {
    expect(passcodeMatches("  newpaths ", "newpaths")).toBe(true);
    expect(passcodeMatches("NEWPATHS", "newpaths")).toBe(true);
    expect(passcodeMatches("NewPaths", "newpaths")).toBe(true);
  });

  it("rejects an internal space, including the old two-word form", () => {
    expect(passcodeMatches("New Paths", "newpaths")).toBe(false);
    expect(passcodeMatches("new paths", "newpaths")).toBe(false);
    expect(passcodeMatches("NEW   PATHS", "newpaths")).toBe(false);
  });

  it("rejects anything else, including near misses and empty input", () => {
    for (const wrong of ["", "newpath", "new-paths", "hope"]) {
      expect(passcodeMatches(wrong, "newpaths")).toBe(false);
    }
  });
});
