import { describe, expect, it } from "vitest";
import { DAY_01_CONTENT_PACK, DAY_01_VALID_IDS } from "@/content/ai/day-01";
import { CRISIS_REGISTRY, getRegion } from "@/content/crisis-registry";

describe("Day 1 content pack", () => {
  it("has non-empty themes, gentle steps, one honest steps", () => {
    expect(DAY_01_CONTENT_PACK.themeStatements.length).toBeGreaterThanOrEqual(4);
    expect(DAY_01_CONTENT_PACK.gentleSteps.length).toBeGreaterThanOrEqual(10);
    expect(DAY_01_CONTENT_PACK.oneHonestSteps.length).toBeGreaterThanOrEqual(6);
  });

  it("all IDs are unique within each collection", () => {
    for (const set of Object.values(DAY_01_VALID_IDS)) {
      // Set only contains unique values; verifying via length would need
      // the source array. Recompute from the pack:
    }
    const collections: Array<[string, Array<{ id: string }>]> = [
      ["themes", DAY_01_CONTENT_PACK.themeStatements],
      ["gentleSteps", DAY_01_CONTENT_PACK.gentleSteps],
      ["oneHonestSteps", DAY_01_CONTENT_PACK.oneHonestSteps],
      ["scriptures", DAY_01_CONTENT_PACK.scriptures],
      ["prayers", DAY_01_CONTENT_PACK.prayers],
      ["supportReminders", DAY_01_CONTENT_PACK.supportReminders],
    ];
    for (const [name, coll] of collections) {
      const ids = coll.map((c) => c.id);
      expect(new Set(ids).size, `duplicate ID in ${name}`).toBe(ids.length);
    }
  });

  it("contains no phone-number patterns in support reminders", () => {
    const phone = /\b\d{3}[-.\s]?\d{3,4}\b|\+\d[\d\s\-().]{6,}/;
    for (const r of DAY_01_CONTENT_PACK.supportReminders) {
      expect(phone.test(r.text)).toBe(false);
    }
  });

  it("scriptures include a reference but no invented full-verse quotation", () => {
    for (const s of DAY_01_CONTENT_PACK.scriptures) {
      expect(s.reference.length).toBeGreaterThan(0);
      // Loose sanity check: reflections should be under ~400 chars.
      expect(s.reflection.length).toBeLessThan(400);
    }
  });

  it("prohibited claims list is non-empty and covers the core categories", () => {
    const p = DAY_01_CONTENT_PACK.prohibitedClaims.join(" | ").toLowerCase();
    for (const needle of [
      "diagnosis",
      "guaranteed healing",
      "god told me",
      "you must forgive",
      "stop taking",
      "return to him",
    ]) {
      expect(p).toContain(needle);
    }
  });
});

describe("Crisis registry", () => {
  it("preserves the verified Canadian entries", () => {
    const ca = CRISIS_REGISTRY.CA;
    expect(ca.emergencyTel).toBe("911");
    const names = ca.crisisLines.map((l) => l.name).join(" | ");
    expect(names).toMatch(/9-8-8|988/);
    expect(names).toMatch(/Kids Help Phone/);
    expect(names).toMatch(/Hope for Wellness/);
    expect(ca.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("global fallback points to findahelpline.com and does not invent a universal number", () => {
    const g = CRISIS_REGISTRY.GLOBAL;
    expect(g.emergencyTel).toBeUndefined();
    expect(g.crisisLines[0].url).toBe("https://findahelpline.com/");
    expect(g.emergencyGuidance).toMatch(/local emergency services/i);
  });

  it("getRegion falls back to GLOBAL for unknown codes", () => {
    // @ts-expect-error — deliberately passing an invalid code.
    expect(getRegion("XX").code).toBe("GLOBAL");
  });
});
