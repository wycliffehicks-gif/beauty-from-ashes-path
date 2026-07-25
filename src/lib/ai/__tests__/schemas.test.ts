import { describe, expect, it } from "vitest";
import { ReflectionInputSchema } from "@/lib/ai/schemas";

const validInput = {
  dayId: "day-01" as const,
  roadType: "difficult-conversation" as const,
  emotion: "fear" as const,
  energy: "some" as const,
  notSafeNow: false,
  adultConfirmed: true as const,
  spiritual: false,
  region: "CA" as const,
};

describe("ReflectionInputSchema", () => {
  it("accepts a well-formed choice-only input", () => {
    expect(ReflectionInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("accepts optional free text up to 600 chars", () => {
    const ok = ReflectionInputSchema.safeParse({
      ...validInput,
      freeText: "a".repeat(600),
    });
    expect(ok.success).toBe(true);
  });

  it("rejects free text over 600 chars", () => {
    const bad = ReflectionInputSchema.safeParse({
      ...validInput,
      freeText: "a".repeat(601),
    });
    expect(bad.success).toBe(false);
  });

  it("rejects unknown fields", () => {
    const bad = ReflectionInputSchema.safeParse({
      ...validInput,
      extraField: "nope",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects adultConfirmed: false", () => {
    expect(
      ReflectionInputSchema.safeParse({ ...validInput, adultConfirmed: false }).success,
    ).toBe(false);
  });

  it("rejects unknown enums", () => {
    expect(
      ReflectionInputSchema.safeParse({ ...validInput, emotion: "ennui" }).success,
    ).toBe(false);
    expect(
      ReflectionInputSchema.safeParse({ ...validInput, region: "US" }).success,
    ).toBe(false);
  });
});
