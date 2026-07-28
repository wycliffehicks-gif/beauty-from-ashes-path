import { describe, it, expect } from "vitest";
import { DAYS } from "@/content/days";

describe("DayContent model — Module 1 expansion (Block 1)", () => {
  const day1 = DAYS.find((d) => d.day === 1)!;

  it("Day 1 exists", () => {
    expect(day1).toBeDefined();
  });

  it("Day 1 has a founder-authored Teach fragment", () => {
    expect(typeof day1.teach).toBe("string");
    expect((day1.teach ?? "").trim().length).toBeGreaterThan(80);
  });

  it("Day 1 pairs with a curated practice ID", () => {
    expect(typeof day1.practiceId).toBe("string");
    expect((day1.practiceId ?? "").length).toBeGreaterThan(0);
  });

  it("Day 1 provides all six curated branch responses", () => {
    expect(day1.branches).toBeDefined();
    const b = day1.branches!;
    for (const key of [
      "notSure",
      "preferNotToSay",
      "notToday",
      "veryLittleEnergy",
      "numb",
      "mixed",
    ] as const) {
      expect(typeof b[key]).toBe("string");
      expect(b[key].trim().length).toBeGreaterThan(20);
    }
  });

  it("All seven days remain present and non-empty", () => {
    expect(DAYS).toHaveLength(7);
    for (const d of DAYS) {
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.coreReflection.length).toBeGreaterThan(0);
    }
  });
});
