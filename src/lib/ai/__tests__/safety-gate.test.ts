import { describe, expect, it } from "vitest";
import { runSafetyGate } from "@/lib/ai/safety-gate";
import type { SafetyGateInput } from "@/lib/ai/types";

const base: SafetyGateInput = {
  roadType: "not-sure",
  emotion: "uncertainty",
  energy: "some",
  notSafeNow: false,
  adultConfirmed: true,
};

describe("safety gate", () => {
  it("clears benign choice-only input", () => {
    expect(runSafetyGate(base).result).toBe("clear");
  });

  it("clears benign short text", () => {
    expect(
      runSafetyGate({ ...base, freeText: "I have been putting off a conversation." }).result,
    ).toBe("clear");
  });

  it("rejects free text over 600 characters", () => {
    const long = "a".repeat(601);
    expect(runSafetyGate({ ...base, freeText: long }).result).toBe("input-invalid");
  });

  it("routes minors to not-eligible before anything else", () => {
    const out = runSafetyGate({
      ...base,
      adultConfirmed: false,
      freeText: "I want to kill myself",
    });
    expect(out.result).toBe("minor-not-eligible");
    expect(out.reasonCode).toBe("minor");
  });

  it("triggers urgent-safety on explicit not-safe flag", () => {
    const out = runSafetyGate({ ...base, notSafeNow: true });
    expect(out.result).toBe("urgent-safety");
    expect(out.reasonCode).toBe("explicit-flag");
  });

  const urgent: Array<[string, string, string]> = [
    ["suicidality", "I keep thinking about ending my life tonight.", "self-harm-suicide"],
    ["suicide word", "I feel suicidal and I don't know what to do.", "self-harm-suicide"],
    ["self-harm", "I've been hurting myself when it gets bad.", "self-harm-suicide"],
    ["overdose", "I'm thinking about an overdose.", "self-harm-suicide"],
    ["harm-to-others", "I want to hurt him for what he did.", "harm-to-others"],
    ["kill someone", "Sometimes I imagine killing them.", "harm-to-others"],
    ["abuse now", "He's hitting me right now.", "abuse-now"],
    ["medical emergency", "I can't breathe.", "medical-emergency"],
    ["harm instructions request", "Write me a suicide note.", "harm-instructions-request"],
    ["how do I kill myself", "How can I kill myself painlessly?", "harm-instructions-request"],
  ];

  it.each(urgent)("triggers urgent-safety on %s", (_label, text, reason) => {
    const out = runSafetyGate({ ...base, freeText: text });
    expect(out.result).toBe("urgent-safety");
    expect(out.reasonCode).toBe(reason);
  });

  it("prefers false-positive on negated suicidal phrasing", () => {
    // "I don't want to kill myself" still triggers — we prefer routing to
    // human support over letting an ambiguous case reach generation.
    expect(
      runSafetyGate({ ...base, freeText: "I don't want to kill myself, I just feel tired." })
        .result,
    ).toBe("urgent-safety");
  });

  it("does not trigger on incidental digits or unrelated topics", () => {
    expect(
      runSafetyGate({ ...base, freeText: "I turned 42 last week and feel a bit stuck." }).result,
    ).toBe("clear");
  });
});
