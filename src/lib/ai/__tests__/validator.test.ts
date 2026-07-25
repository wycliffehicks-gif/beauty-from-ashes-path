import { describe, expect, it } from "vitest";
import { buildDay01Fallback } from "@/content/ai/fallback-day-01";
import { validateReflectionOutput } from "@/lib/ai/validator";
import type { ReflectionOutput } from "@/lib/ai/types";

function fallback(spiritual: boolean): ReflectionOutput {
  return buildDay01Fallback(spiritual);
}

describe("validator", () => {
  it("accepts the human-authored fallback (spiritual off)", () => {
    const res = validateReflectionOutput({
      output: fallback(false),
      spiritualPreference: false,
    });
    expect(res.ok).toBe(true);
  });

  it("accepts the human-authored fallback (spiritual on)", () => {
    const res = validateReflectionOutput({
      output: fallback(true),
      spiritualPreference: true,
    });
    expect(res.ok).toBe(true);
  });

  it("rejects unknown theme id", () => {
    const out = fallback(false);
    out.theme.id = "t-does-not-exist";
    expect(
      validateReflectionOutput({ output: out, spiritualPreference: false }).failure,
    ).toBe("unknown-theme-id");
  });

  it("rejects unknown next-step id", () => {
    const out = fallback(false);
    out.nextSteps[0].id = "s-fake";
    expect(
      validateReflectionOutput({ output: out, spiritualPreference: false }).failure,
    ).toBe("unknown-next-step-id");
  });

  it("rejects unknown one-honest-step id", () => {
    const out = fallback(false);
    out.oneHonestStep.id = "ohs-fake";
    expect(
      validateReflectionOutput({ output: out, spiritualPreference: false }).failure,
    ).toBe("unknown-one-honest-step-id");
  });

  it("rejects prohibited claim (God told the user)", () => {
    const out = fallback(false);
    out.hearing = out.hearing + " God told me you have depression.";
    expect(
      validateReflectionOutput({ output: out, spiritualPreference: false }).failure,
    ).toBe("prohibited-phrase");
  });

  it("rejects phone number anywhere in output", () => {
    const out = fallback(false);
    out.supportNote = "Call 1-800-555-0199 for help.";
    const res = validateReflectionOutput({ output: out, spiritualPreference: false });
    // Either unapproved-support-wording or phone-number-detected — both are
    // acceptable rejections; the important thing is that ok=false.
    expect(res.ok).toBe(false);
  });

  it("rejects spiritual content when preference is off", () => {
    const out = fallback(true); // has spiritualReflection
    const res = validateReflectionOutput({ output: out, spiritualPreference: false });
    expect(res.failure).toBe("spiritual-preference-violated");
  });

  it("rejects non-tentative hearing", () => {
    const out = fallback(false);
    out.hearing = "You are avoiding a road and you must walk it today.";
    expect(
      validateReflectionOutput({ output: out, spiritualPreference: false }).failure,
    ).toBe("hearing-not-tentative");
  });

  it("rejects unapproved support wording", () => {
    const out = fallback(false);
    out.supportNote = "You should just cheer up.";
    expect(
      validateReflectionOutput({ output: out, spiritualPreference: false }).failure,
    ).toBe("unapproved-support-wording");
  });

  it("rejects wrong number of next steps", () => {
    const out = fallback(false);
    out.nextSteps = out.nextSteps.slice(0, 2);
    expect(
      validateReflectionOutput({ output: out, spiritualPreference: false }).failure,
    ).toBe("schema-invalid");
  });
});
