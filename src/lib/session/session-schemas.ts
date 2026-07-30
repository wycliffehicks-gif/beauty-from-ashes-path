// Strict input/output schemas for the Week 1 session reflection (stage 6).
//
// Separate from the Day 1 schemas — the Day 1 pipeline must not be weakened
// or altered by anything here.
//
// Notable: the output schema is `.strict()` and has NO spiritual field at
// all. A model that emits a spiritual section fails schema validation, which
// enforces the rule that spirituality belongs to stage 7.

import { z } from "zod";

export const SESSION_SCHEMAS_VERSION = "2026-07-30.1";

export const MAX_SESSION_NOTE_LENGTH = 400;

/** Low-sensitivity curated choice IDs only. */
const ChoiceIdSchema = z.string().regex(/^[a-z0-9-]{1,40}$/);

export const SessionReflectionInputSchema = z
  .object({
    sessionId: z.literal("week-01"),
    naming: z.array(ChoiceIdSchema).max(32),
    exploration: z.array(ChoiceIdSchema).max(32),
    meaning: z.array(ChoiceIdSchema).max(32),
    noticing: z.array(ChoiceIdSchema).max(32),
    note: z.string().max(MAX_SESSION_NOTE_LENGTH).optional(),
    adultConfirmed: z.literal(true),
    aiConsent: z.literal(true),
    notSafeNow: z.boolean(),
    region: z.enum(["CA", "GLOBAL"]),
  })
  .strict();

export type SessionReflectionInput = z.infer<typeof SessionReflectionInputSchema>;

const SectionSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
  })
  .strict();

export const SessionReflectionOutputSchema = z
  .object({
    hearing: SectionSchema,
    pulls: SectionSchema,
    protection: SectionSchema,
    cost: SectionSchema,
    holding: SectionSchema,
    support: SectionSchema.nullable(),
  })
  .strict();

export type SessionReflectionOutputSchemaType = z.infer<
  typeof SessionReflectionOutputSchema
>;
