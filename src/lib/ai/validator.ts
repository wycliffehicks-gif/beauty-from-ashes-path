// Deterministic output validator.
//
// Runs on any candidate `ReflectionOutput`, whether produced by a future
// model call or by the human-authored fallback. Pure code, no model calls.
//
// Checks, in order:
//   1. Schema shape.
//   2. All referenced IDs exist in the Day 1 content pack.
//   3. Total word count between 250 and 400 words.
//   4. "hearing" uses at least one tentative-language marker.
//   5. No prohibited phrases anywhere.
//   6. Spiritual section respects the caller's preference.
//   7. No phone-number patterns anywhere.
//   8. supportNote wording, if present, matches an approved supportReminder.

import { DAY_01_CONTENT_PACK, DAY_01_VALID_IDS } from "@/content/ai/day-01";
import { ReflectionOutputSchema } from "@/lib/ai/schemas";
import type { ReflectionOutput } from "@/lib/ai/types";

export const VALIDATOR_VERSION = "2026-07-25.1";

export type ValidatorFailure =
  | "schema-invalid"
  | "unknown-theme-id"
  | "unknown-next-step-id"
  | "unknown-one-honest-step-id"
  | "unknown-scripture-id"
  | "unknown-prayer-id"
  | "word-count-out-of-range"
  | "hearing-not-tentative"
  | "prohibited-phrase"
  | "spiritual-preference-violated"
  | "phone-number-detected"
  | "unapproved-support-wording";

export interface ValidatorResult {
  ok: boolean;
  failure?: ValidatorFailure;
  detail?: string; // internal-only, never surfaced to users
}

const TENTATIVE_MARKERS = [
  /\bmay\b/i,
  /\bmight\b/i,
  /\bperhaps\b/i,
  /\bit\s+sounds\s+like\b/i,
  /\bit\s+seems\b/i,
];

// International-ish phone-number heuristic. Intentionally broad: matches
// long digit runs typical of phone numbers while ignoring incidental short
// numbers (dates, "1 sentence").
const PHONE_PATTERNS = [
  /\+\d[\d\s\-().]{6,}\d/,
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/,
  /\b1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  /\b\d{3}[-.\s]?\d{4}\b/,
  /\b\d{10,}\b/,
];

interface ValidateArgs {
  output: unknown;
  spiritualPreference: boolean;
}

export function validateReflectionOutput(
  args: ValidateArgs,
): ValidatorResult {
  const parsed = ReflectionOutputSchema.safeParse(args.output);
  if (!parsed.success) {
    return { ok: false, failure: "schema-invalid", detail: parsed.error.message };
  }
  const output: ReflectionOutput = parsed.data;

  // 2. IDs must exist in the content pack.
  if (!DAY_01_VALID_IDS.themes.has(output.theme.id)) {
    return { ok: false, failure: "unknown-theme-id", detail: output.theme.id };
  }
  for (const step of output.nextSteps) {
    if (!DAY_01_VALID_IDS.gentleSteps.has(step.id)) {
      return { ok: false, failure: "unknown-next-step-id", detail: step.id };
    }
  }
  if (!DAY_01_VALID_IDS.oneHonestSteps.has(output.oneHonestStep.id)) {
    return {
      ok: false,
      failure: "unknown-one-honest-step-id",
      detail: output.oneHonestStep.id,
    };
  }
  if (output.spiritualReflection) {
    if (!DAY_01_VALID_IDS.scriptures.has(output.spiritualReflection.scriptureId)) {
      return {
        ok: false,
        failure: "unknown-scripture-id",
        detail: output.spiritualReflection.scriptureId,
      };
    }
    if (
      output.spiritualReflection.prayerId &&
      !DAY_01_VALID_IDS.prayers.has(output.spiritualReflection.prayerId)
    ) {
      return {
        ok: false,
        failure: "unknown-prayer-id",
        detail: output.spiritualReflection.prayerId,
      };
    }
  }

  // 3. Tentative language in hearing (substantive check first).
  if (!TENTATIVE_MARKERS.some((r) => r.test(output.hearing))) {
    return { ok: false, failure: "hearing-not-tentative" };
  }

  // 4. Prohibited phrases anywhere.
  const allText = collectText(output).toLowerCase();
  for (const phrase of DAY_01_CONTENT_PACK.prohibitedClaims) {
    if (allText.includes(phrase.toLowerCase())) {
      return { ok: false, failure: "prohibited-phrase", detail: phrase };
    }
  }

  // 5. Spiritual preference respected.
  if (!args.spiritualPreference && output.spiritualReflection !== null) {
    return { ok: false, failure: "spiritual-preference-violated" };
  }

  // 6. No phone numbers anywhere.
  const raw = collectText(output);
  for (const p of PHONE_PATTERNS) {
    if (p.test(raw)) {
      return { ok: false, failure: "phone-number-detected" };
    }
  }

  // 7. supportNote wording, if present, must map to a known reminder.
  if (output.supportNote !== null) {
    const approved = DAY_01_CONTENT_PACK.supportReminders.map((r) =>
      r.text.toLowerCase(),
    );
    if (!approved.includes(output.supportNote.toLowerCase())) {
      return { ok: false, failure: "unapproved-support-wording" };
    }
  }

  // 8. Word count last — cheap structural checks and substantive checks
  //    run first so mutation-based tests get the more diagnostic failure.
  const wc = actualWordCount(output);
  if (wc < 250 || wc > 400) {
    return { ok: false, failure: "word-count-out-of-range", detail: String(wc) };
  }

  return { ok: true };
}

function collectText(o: ReflectionOutput): string {
  return [
    o.hearing,
    o.theme.gloss,
    ...o.nextSteps.map((s) => s.text),
    o.oneHonestStep.text,
    o.spiritualReflection?.reflection ?? "",
    o.supportNote ?? "",
  ].join(" ");
}

function actualWordCount(o: ReflectionOutput): number {
  return collectText(o).trim().split(/\s+/).filter(Boolean).length;
}
