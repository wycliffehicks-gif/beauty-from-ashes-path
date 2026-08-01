import { describe, expect, it } from "vitest";
import { getFirstJourneyDay } from "@/content/first-journey";
import { toggleSelection } from "../selection";

const day2 = getFirstJourneyDay(2)!;
const body = day2.questions.find((q) => q.id === "body")!;
const nothingIdx = body.options.findIndex((o) => o.id === "nothing");
const chestIdx = body.options.findIndex((o) => o.id === "chest");
const headIdx = body.options.findIndex((o) => o.id === "head");

describe("exclusive choice selection", () => {
  it("choosing the exclusive option clears the others", () => {
    expect(toggleSelection(body, [chestIdx, headIdx], nothingIdx)).toEqual([nothingIdx]);
  });

  it("choosing another option clears the exclusive one", () => {
    expect(toggleSelection(body, [nothingIdx], chestIdx)).toEqual([chestIdx]);
  });

  it("non-exclusive options still accumulate", () => {
    expect(toggleSelection(body, [chestIdx], headIdx)).toEqual([chestIdx, headIdx]);
  });

  it("toggling off removes just that option", () => {
    expect(toggleSelection(body, [chestIdx, headIdx], chestIdx)).toEqual([headIdx]);
  });

  it("single-select questions keep one-at-a-time behaviour", () => {
    expect(toggleSelection(day2.step, [1], 3)).toEqual([3]);
    expect(toggleSelection(day2.step, [3], 3)).toEqual([]);
  });
});

describe("Day 2 revision", () => {
  it("marks only the 'nothing' body option exclusive", () => {
    expect(body.options.filter((o) => o.exclusive).map((o) => o.id)).toEqual(["nothing"]);
  });

  it("labels the educational screen 'Listen'", () => {
    expect(day2.understand.label).toBe("Listen");
  });

  it("carries the physical-symptom note and neutral explore heading", () => {
    expect(body.info?.some((n) => n.term === "A note about physical symptoms")).toBe(true);
    expect(body.echo?.heading).toBe("What you noticed");
  });

  it("drops the redundant combined load option and the removed reflection line", () => {
    const load = day2.questions.find((q) => q.id === "load")!;
    expect(load.options.map((o) => o.id)).not.toContain("mixed");
    const underneath = day2.reflection.sections.find((s) => s.id === "underneath")!;
    expect(underneath.lines?.["mixed"]).toBeUndefined();
  });

  it("offers the safe sharing step with its caution", () => {
    const share = day2.step.options.find((o) => o.id === "share")!;
    expect(share.note).toMatch(/feels safe/i);
    const next = day2.reflection.sections.find((s) => s.id === "next")!;
    expect(next.lines?.["share"]).toBeTruthy();
  });

  it("avoids causal or promissory language in the revised copy", () => {
    const text = JSON.stringify(day2).toLowerCase();
    for (const phrase of [
      "grief and fear",
      "unsaid",
      "makes the load smaller",
      "no one else sees it",
      "tomorrow",
      "feet flat",
    ]) {
      expect(text, `unexpected phrase: ${phrase}`).not.toContain(phrase);
    }
  });

  it("offers an outward alternative in the reflection practice", () => {
    const steps = day2.practise.reflection.steps.join(" ").toLowerCase();
    expect(steps).toContain("five neutral things");
    expect(day2.practise.spiritual.scripture?.reference).toMatch(/Psalm 42/);
  });
});
