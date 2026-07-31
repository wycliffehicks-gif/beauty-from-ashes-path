import { describe, expect, it } from "vitest";
import {
  answerId,
  mergeStepAnswers,
  optionIndexesFor,
  resolveResumeIndex,
} from "@/lib/journey/resume";

const STEPS = ["arrive", "teach", "notice", "name", "listen", "close"];

describe("resolveResumeIndex", () => {
  it("restores the exact saved step for the day being viewed", () => {
    expect(
      resolveResumeIndex({
        stepKeys: STEPS,
        dayId: "day-02",
        locator: { dayId: "day-02", step: "name", index: 3 },
        requested: true,
      }),
    ).toBe(3);
  });

  it("does not resume when the URL did not ask for it", () => {
    expect(
      resolveResumeIndex({
        stepKeys: STEPS,
        dayId: "day-02",
        locator: { dayId: "day-02", step: "name", index: 3 },
        requested: false,
      }),
    ).toBe(-1);
  });

  it("falls back to the opening screen with no saved locator", () => {
    expect(
      resolveResumeIndex({ stepKeys: STEPS, dayId: "day-02", locator: null, requested: true }),
    ).toBe(-1);
  });

  it("ignores a locator saved for a different day", () => {
    expect(
      resolveResumeIndex({
        stepKeys: STEPS,
        dayId: "day-02",
        locator: { dayId: "day-05", step: "name", index: 3 },
        requested: true,
      }),
    ).toBe(-1);
  });

  it("uses a still-valid stored index when the step key is stale", () => {
    expect(
      resolveResumeIndex({
        stepKeys: STEPS,
        dayId: "day-02",
        locator: { dayId: "day-02", step: "retired-step", index: 4 },
        requested: true,
      }),
    ).toBe(4);
  });

  it("falls back to the opening screen when a stale index is out of range", () => {
    expect(
      resolveResumeIndex({
        stepKeys: STEPS,
        dayId: "day-02",
        locator: { dayId: "day-02", step: "retired-step", index: 99 },
        requested: true,
      }),
    ).toBe(-1);
  });

  it("handles a day whose flow has no Teach step (different indexes)", () => {
    const noTeach = ["arrive", "notice", "name", "listen", "close"];
    expect(
      resolveResumeIndex({
        stepKeys: noTeach,
        dayId: "day-04",
        locator: { dayId: "day-04", step: "name", index: 3 },
        requested: true,
      }),
    ).toBe(2);
  });
});

describe("structured answer IDs", () => {
  it("stores only the step key and option position", () => {
    expect(answerId("notice", 2)).toBe("notice.2");
  });

  it("restores option indexes for one step only", () => {
    const ids = ["notice.2", "name.0", "name.5"];
    expect(optionIndexesFor(ids, "name", 9)).toEqual([0, 5]);
    expect(optionIndexesFor(ids, "notice", 7)).toEqual([2]);
  });

  it("drops indexes outside the current option list", () => {
    expect(optionIndexesFor(["name.99"], "name", 9)).toEqual([]);
  });

  it("merges one step without disturbing other steps", () => {
    expect(mergeStepAnswers(["notice.2", "name.0"], "name", [1, 3])).toEqual([
      "notice.2",
      "name.1",
      "name.3",
    ]);
  });

  it("returns nothing when no answers were recorded", () => {
    expect(optionIndexesFor(undefined, "name", 9)).toEqual([]);
  });
});
