import { describe, expect, it } from "vitest";
import {
  BRANCH_KEYS,
  BRANCH_MODES,
  resolveBranch,
  type BranchKey,
} from "@/lib/day-branches";
import { getDay } from "@/content/days";

describe("day-branches routing (Block 2)", () => {
  const day1 = getDay(1)!;

  it("exposes all six branch keys", () => {
    expect(BRANCH_KEYS).toEqual([
      "notSure",
      "preferNotToSay",
      "notToday",
      "veryLittleEnergy",
      "numb",
      "mixed",
    ]);
  });

  it("maps each branch to its documented behaviour mode", () => {
    expect(BRANCH_MODES.notSure).toBe("forward");
    expect(BRANCH_MODES.preferNotToSay).toBe("forward");
    expect(BRANCH_MODES.mixed).toBe("forward");
    expect(BRANCH_MODES.numb).toBe("low-arousal-grounding");
    expect(BRANCH_MODES.veryLittleEnergy).toBe("tiny-step");
    expect(BRANCH_MODES.notToday).toBe("grounding-close");
  });

  it("resolves every Day 1 branch to a curated response and its mode", () => {
    for (const key of BRANCH_KEYS) {
      const r = resolveBranch(day1, key);
      expect(r, `branch ${key}`).not.toBeNull();
      expect(r!.response.length).toBeGreaterThan(20);
      expect(r!.mode).toBe(BRANCH_MODES[key]);
      expect(r!.label.length).toBeGreaterThan(0);
    }
  });

  it("returns null for a day without curated branches", () => {
    expect(resolveBranch(undefined, "notSure")).toBeNull();
    expect(resolveBranch({ branches: undefined }, "numb")).toBeNull();
  });

  it("Day 1 branch copy avoids scoring, diagnosis, or re-asking language", () => {
    const forbidden =
      /(score|diagnos|you must|try again|please answer|failure|failed|wrong)/i;
    for (const key of BRANCH_KEYS) {
      const r = resolveBranch(day1, key)!;
      expect(r.response, `branch ${key}`).not.toMatch(forbidden);
    }
  });

  it("notToday routes to grounding-close so the person can leave safely", () => {
    const r = resolveBranch(day1, "notToday" as BranchKey)!;
    expect(r.mode).toBe("grounding-close");
  });

  it("veryLittleEnergy routes to a tiny-step ending", () => {
    const r = resolveBranch(day1, "veryLittleEnergy")!;
    expect(r.mode).toBe("tiny-step");
  });

  it("numb routes away from emotion-naming into low-arousal grounding", () => {
    const r = resolveBranch(day1, "numb")!;
    expect(r.mode).toBe("low-arousal-grounding");
  });
});
