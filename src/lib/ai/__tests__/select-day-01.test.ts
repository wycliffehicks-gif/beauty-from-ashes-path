import { describe, expect, it } from "vitest";
import { computeReflection } from "@/lib/ai/compute";
import { selectDay01Reflection } from "@/lib/ai/select-day-01";
import { validateReflectionOutput } from "@/lib/ai/validator";
import { DAY_01_VALID_IDS } from "@/content/ai/day-01";
import type { ReflectionInput } from "@/lib/ai/schemas";
import type { EmotionId, EnergyId, RoadTypeId } from "@/lib/ai/types";

function base(overrides: Partial<ReflectionInput> = {}): ReflectionInput {
  return {
    dayId: "day-01",
    roadType: "difficult-conversation",
    emotion: "fear",
    energy: "some",
    notSafeNow: false,
    adultConfirmed: true,
    spiritual: false,
    region: "CA",
    ...overrides,
  };
}

describe("selectDay01Reflection — deterministic curated selection", () => {
  const scenarios: Array<{ road: RoadTypeId; emotion: EmotionId; energy: EnergyId }> = [
    { road: "not-sure", emotion: "numbness", energy: "very-little" },
    { road: "difficult-conversation", emotion: "fear", energy: "some" },
    { road: "asking-for-help", emotion: "shame", energy: "some" },
    { road: "grief-set-aside", emotion: "grief", energy: "very-little" },
    { road: "boundary-postponed", emotion: "fear", energy: "some" },
    { road: "prefer-not-to-say", emotion: "uncertainty", energy: "some" },
  ];

  it.each(scenarios)(
    "produces a validator-clean reflection for %o (non-spiritual)",
    ({ road, emotion, energy }) => {
      const out = selectDay01Reflection(base({ roadType: road, emotion, energy }));
      expect(DAY_01_VALID_IDS.themes.has(out.theme.id)).toBe(true);
      expect(out.nextSteps).toHaveLength(3);
      for (const s of out.nextSteps) {
        expect(DAY_01_VALID_IDS.gentleSteps.has(s.id)).toBe(true);
      }
      expect(DAY_01_VALID_IDS.oneHonestSteps.has(out.oneHonestStep.id)).toBe(true);
      const res = validateReflectionOutput({ output: out, spiritualPreference: false });
      expect(res.ok).toBe(true);
    },
  );

  it.each(scenarios)(
    "produces a validator-clean reflection with spiritual section for %o",
    ({ road, emotion, energy }) => {
      const out = selectDay01Reflection(
        base({ roadType: road, emotion, energy, spiritual: true }),
      );
      expect(out.spiritualReflection).not.toBeNull();
      if (out.spiritualReflection) {
        expect(DAY_01_VALID_IDS.scriptures.has(out.spiritualReflection.scriptureId)).toBe(
          true,
        );
        if (out.spiritualReflection.prayerId) {
          expect(DAY_01_VALID_IDS.prayers.has(out.spiritualReflection.prayerId)).toBe(true);
        }
      }
      const res = validateReflectionOutput({ output: out, spiritualPreference: true });
      expect(res.ok).toBe(true);
    },
  );

  it("returns 3 distinct next steps", () => {
    const out = selectDay01Reflection(base());
    const ids = new Set(out.nextSteps.map((s) => s.id));
    expect(ids.size).toBe(3);
  });

  it("omits spiritual section when preference is off", () => {
    const out = selectDay01Reflection(base({ spiritual: false }));
    expect(out.spiritualReflection).toBeNull();
  });
});

describe("computeReflection — curated mode", () => {
  it("bypasses the kill switch in curated mode", () => {
    const res = computeReflection(base(), true, "curated");
    expect(res.kind).toBe("reflection");
    if (res.kind === "reflection") {
      expect(res.meta.curated).toBe(true);
      expect(res.meta.aiEnabled).toBe(false);
    }
  });

  it("still routes urgent safety in curated mode", () => {
    const res = computeReflection(
      base({ freeText: "I want to kill myself." }),
      false,
      "curated",
    );
    expect(res.kind).toBe("urgent-safety");
  });

  it("still honours notSafeNow explicit flag", () => {
    const res = computeReflection(base({ notSafeNow: true }), false, "curated");
    expect(res.kind).toBe("urgent-safety");
  });

  it("returns curated=false for auto/fallback mode", () => {
    const res = computeReflection(base(), false, "auto");
    if (res.kind === "reflection") {
      expect(res.meta.curated).toBe(false);
      expect(res.meta.fallbackUsed).toBe(true);
    }
  });
});
