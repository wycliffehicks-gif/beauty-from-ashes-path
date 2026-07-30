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

describe("DayContent — Block 3 provisional teach + branches", () => {
  const BRANCH_KEYS = [
    "notSure",
    "preferNotToSay",
    "notToday",
    "veryLittleEnergy",
    "numb",
    "mixed",
  ] as const;

  for (const n of [2, 4, 5, 6, 7]) {
    it(`Day ${n} has a teach fragment, a paired practice, and all six branches`, () => {
      const d = DAYS.find((x) => x.day === n)!;
      expect((d.teach ?? "").trim().length).toBeGreaterThan(80);
      expect((d.practiceId ?? "").length).toBeGreaterThan(0);
      for (const key of BRANCH_KEYS) {
        expect(d.branches?.[key]?.trim().length ?? 0).toBeGreaterThan(20);
      }
    });
  }

  it("Day 3 stays reserved for the deep-session anchor", () => {
    const d = DAYS.find((x) => x.day === 3)!;
    expect(d.teach).toBeUndefined();
    expect(d.branches).toBeUndefined();
  });

  it("all provisional branch copy avoids scoring, diagnosis or re-asking language", () => {
    const forbidden = /(score|diagnos|you must|try again|please answer|failure|failed|wrong)/i;
    for (const d of DAYS) {
      for (const key of BRANCH_KEYS) {
        const t = d.branches?.[key];
        if (t) expect(t, `day ${d.day} ${key}`).not.toMatch(forbidden);
      }
    }
  });
});
