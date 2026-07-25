// Strict input and output schemas for the Day 1 pilot.
//
// - Input is Day 1 only, enumerated response IDs, optional 600-char text,
//   spiritual boolean, region CA|GLOBAL, and adult confirmation.
// - Output is the six approved sections only, referencing curated IDs.
// - These schemas are enforced by the server function and by the validator.

import { z } from "zod";
import { MAX_FREE_TEXT_LENGTH } from "@/lib/ai/safety-gate";

export const SCHEMAS_VERSION = "2026-07-25.1";

// ---------- Input ----------

export const RoadTypeIdSchema = z.enum([
  "difficult-conversation",
  "grief-set-aside",
  "boundary-postponed",
  "asking-for-help",
  "truth-about-self",
  "meaningful-calling-or-decision",
  "not-sure",
  "prefer-not-to-say",
]);

export const EmotionIdSchema = z.enum([
  "fear",
  "shame",
  "grief",
  "anger",
  "numbness",
  "uncertainty",
  "mixed",
]);

export const EnergyIdSchema = z.enum(["very-little", "some", "more-than-usual"]);

export const RegionCodeSchema = z.enum(["CA", "GLOBAL"]);

export const ReflectionInputSchema = z
  .object({
    dayId: z.literal("day-01"),
    roadType: RoadTypeIdSchema,
    emotion: EmotionIdSchema,
    energy: EnergyIdSchema,
    notSafeNow: z.boolean(),
    adultConfirmed: z.literal(true, {
      errorMap: () => ({ message: "Adult confirmation is required." }),
    }),
    freeText: z
      .string()
      .max(MAX_FREE_TEXT_LENGTH, {
        message: `Free text must be ${MAX_FREE_TEXT_LENGTH} characters or fewer.`,
      })
      .optional(),
    spiritual: z.boolean(),
    region: RegionCodeSchema,
  })
  .strict();

export type ReflectionInput = z.infer<typeof ReflectionInputSchema>;

// ---------- Output ----------

const NextStepSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
  })
  .strict();

export const ReflectionOutputSchema = z
  .object({
    hearing: z.string().min(1),
    theme: z
      .object({
        id: z.string().min(1),
        gloss: z.string().min(1),
      })
      .strict(),
    nextSteps: z.array(NextStepSchema).length(3),
    oneHonestStep: NextStepSchema,
    spiritualReflection: z
      .object({
        scriptureId: z.string().min(1),
        reflection: z.string().min(1),
        prayerId: z.string().min(1).optional(),
      })
      .strict()
      .nullable(),
    supportNote: z.string().nullable(),
    totalWordsEstimate: z.number().int().nonnegative(),
  })
  .strict();

export type ReflectionOutputSchemaType = z.infer<typeof ReflectionOutputSchema>;
