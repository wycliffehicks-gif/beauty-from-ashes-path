import { describe, expect, it } from "vitest";
import { WEEK_01_SESSION } from "@/content/sessions";
import {
  FORBIDDEN_STEP_PATTERNS,
  integrationSynthesis,
  isApprovedStep,
  namingTheme,
  orderHonestSteps,
  stepReflection,
} from "@/lib/session/stage-logic";
import type { HonestStep } from "@/content/sessions";

const STEPS = WEEK_01_SESSION.stages.find((s) => s.key === "one-honest-step")!.steps ?? [];

describe("integration synthesis", () => {
  it("returns a complete, non-inferring response when nothing was selected", () => {
    const result = integrationSynthesis([]);
    expect(result.empty).toBe(true);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatch(/complete outcome/i);
  });

  it("treats low-pressure answers as no signal", () => {
    const result = integrationSynthesis(["un-not-sure", "uf-prefer-not"]);
    expect(result.empty).toBe(true);
  });

  it("reflects only what was explicitly selected", () => {
    const result = integrationSynthesis(["un-two-forces"]);
    expect(result.empty).toBe(false);
    expect(result.lines.join(" ")).toContain("two honest forces");
    expect(result.lines.join(" ")).not.toContain("still open");
  });

  it("always closes with an invitation to disagree", () => {
    const result = integrationSynthesis(["un-dignity", "uf-grief", "cr-tiredness"]);
    expect(result.lines[result.lines.length - 1]).toMatch(/is not a conclusion/i);
  });

  it("stays tentative in its language", () => {
    const text = integrationSynthesis(["un-dignity", "cr-shame"]).lines.join(" ");
    expect(text).toMatch(/sounds like|seems|perhaps|may/i);
  });
});

describe("honest steps", () => {
  it("every authored step is approved and small", () => {
    expect(STEPS.length).toBeGreaterThanOrEqual(8);
    for (const step of STEPS) {
      expect(isApprovedStep(step)).toBe(true);
    }
  });

  it("rejects directive or high-risk steps", () => {
    const bad: HonestStep = {
      id: "x",
      label: "Confront the person who hurt you",
      category: "relational",
      why: "It is time.",
    };
    expect(isApprovedStep(bad)).toBe(false);
    expect(FORBIDDEN_STEP_PATTERNS.length).toBeGreaterThan(5);
  });

  it("orders by explicit prior selections without removing options", () => {
    const ordered = orderHonestSteps(STEPS, ["os-very-little-energy"]);
    expect(ordered).toHaveLength(STEPS.length);
    expect(["rest", "none"]).toContain(ordered[0].category);
  });

  it("is stable when nothing relevant was selected", () => {
    const ordered = orderHonestSteps(STEPS, []);
    expect(ordered.map((s) => s.id)).toEqual(STEPS.map((s) => s.id));
  });

  it("ignores low-pressure IDs when ordering", () => {
    const a = orderHonestSteps(STEPS, ["na-not-sure", "na-prefer-not"]);
    expect(a.map((s) => s.id)).toEqual(STEPS.map((s) => s.id));
  });

  it("reflects a chosen step tentatively and without obligation", () => {
    const lines = stepReflection(STEPS[0], "a grief that has not had room");
    expect(lines.join(" ")).toMatch(/suggestion, not a finding/);
    expect(lines.join(" ")).toMatch(/information rather than failure/);
  });

  it("omits the theme link when nothing was named", () => {
    expect(stepReflection(STEPS[0], null)).toHaveLength(2);
  });
});

describe("naming theme", () => {
  it("maps known IDs and ignores unknown ones", () => {
    expect(namingTheme(["grief"])).toMatch(/grief/);
    expect(namingTheme(["na-not-sure"])).toBeNull();
    expect(namingTheme([])).toBeNull();
  });
});
