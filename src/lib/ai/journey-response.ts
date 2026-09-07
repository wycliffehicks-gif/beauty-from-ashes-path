// Output contract and deterministic checks for a CURRENT ten-day reflection.
//
// TRANSPORT-FREE and pure. No provider, gateway, fetch, environment, storage or
// route access. This module only decides whether a string of prose is an
// acceptable, complete, plain-text reflection for a given grounded day.
//
// The expected output is ORIGINAL PLAIN PROSE. There is deliberately:
//   - no six-section JSON schema (that belonged to the obsolete Day-1 pipeline);
//   - no compulsory question;
//   - no minimum word count. A restrained three-sentence reflection for a
//     private or sparse day is a complete reflection.
//
// HONEST LIMITS OF THESE CHECKS
// The checks below are LEXICAL HEURISTICS. They can catch a small set of clearly
// unsafe or off-path phrasings. They do NOT prove that a response is grounded in
// the supplied material, clinically safe, theologically sound, or free of subtle
// over-claiming. Only human review of actual outputs can support those claims.

import type { GroundedJourneySource } from "@/lib/ai/journey-grounding";

export const JOURNEY_OUTPUT_VERSION = "journey-o1";
export const JOURNEY_VALIDATOR_VERSION = "journey-v1";

/**
 * Generous upper bound on accepted prose. It exists to bound memory and render
 * cost, not to shape the writing. Anything longer is REJECTED whole: a trimmed
 * fragment is never presented as a complete reflection.
 */
export const MAX_JOURNEY_OUTPUT_CHARS = 12_000;

export type JourneyOutputRejection =
  | "output-empty"
  | "output-not-text"
  | "output-too-large"
  | "output-contains-markup"
  | "unsupported-therapeutic-guarantee"
  | "affirmative-diagnosis"
  | "devotional-leakage";

export interface JourneyReflection {
  /** Plain text. Rendered later as text, never as executable HTML. */
  text: string;
  paragraphs: string[];
  outputVersion: string;
  validatorVersion: string;
}

export type JourneyOutputResult =
  | { ok: true; reflection: JourneyReflection }
  | { ok: false; code: JourneyOutputRejection };

/**
 * Clearly unsupported guarantees of therapeutic outcome. Tentative language
 * ("may", "might", "sometimes") is not matched.
 */
const GUARANTEE_PATTERNS: RegExp[] = [
  /\b(?:this|that|the practice|the journey|these steps?)\b[^.!?]{0,60}\bwill\b[^.!?]{0,40}\b(?:cure|heal|fix|resolve|remove|eliminate)\b/i,
  /\byou\s+will\s+(?:be\s+)?(?:cured|healed|fixed|fine|better|recovered|whole)\b/i,
  /\byou\s+will\s+(?:recover|heal|overcome this)\b/i,
  /\bguarantee[sd]?\b[^.!?]{0,40}\b(?:recovery|healing|relief|outcome|results?)\b/i,
  /\bis\s+guaranteed\s+to\b/i,
  /\bwill\s+(?:definitely|certainly)\s+(?:get|feel)\s+better\b/i,
];

/**
 * AFFIRMATIVE diagnosis only. The obsolete blanket rejection of the substring
 * "diagnos" is deliberately NOT inherited: a benign sentence such as "this is
 * not about diagnosing yourself" is acceptable and must pass.
 */
const DIAGNOSIS_PATTERNS: RegExp[] = [
  /\bi\s+diagnose\s+you\b/i,
  /\byou\s+(?:clearly\s+|obviously\s+|certainly\s+)?have\s+(?:ptsd|c-?ptsd|depression|clinical\s+depression|an?\s+anxiety\s+disorder|bipolar(?:\s+disorder)?|ocd|adhd|borderline\s+personality\s+disorder|a\s+personality\s+disorder|a\s+mental\s+illness|a\s+disorder)\b/i,
  /\byou\s+are\s+(?:clinically\s+)?(?:depressed|traumatised|traumatized|bipolar|psychotic|mentally\s+ill)\b/i,
  /\byour\s+diagnosis\s+is\b/i,
  /\bthis\s+is\s+(?:clearly\s+)?(?:ptsd|c-?ptsd|clinical\s+depression|a\s+trauma\s+disorder)\b/i,
  /\byou\s+(?:are|meet)\s+(?:the\s+)?(?:criteria|diagnostic\s+criteria)\s+for\b/i,
];

/** Devotional material that must never appear when spiritual reflection is off. */
const DEVOTIONAL_PATTERNS: RegExp[] = [
  /\bgod(?:'s)?\b/i,
  /\bjesus\b/i,
  /\bchrist(?:ian|'s)?\b/i,
  /\bthe\s+lord\b/i,
  /\bholy\s+spirit\b/i,
  /\bscriptures?\b/i,
  /\bbible\b|\bbiblical\b/i,
  /\bpray(?:s|ed|er|ers|ing)?\b/i,
  /\bpsalm\b/i,
  /\bgospel\b/i,
  /\bamen\b/i,
  /\bfaith\s+in\s+(?:god|christ|jesus)\b/i,
  /\bdivine\b/i,
];

const MARKUP_PATTERNS: RegExp[] = [
  /<\s*\/?\s*[a-z][\s\S]{0,40}>/i,
  /<\s*script\b/i,
  /javascript\s*:/i,
  /&(?:#\d{2,5}|lt|gt|amp|quot);/i,
];

function matches(patterns: RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Deterministic acceptance of a candidate reflection.
 *
 * `source.spiritualAuthorised === false` means NO devotional material at all.
 * When it is true, spiritual language is permitted; whether it actually stayed
 * inside the supplied authorised practice is a semantic judgement these checks
 * cannot make, and is not claimed here.
 */
export function validateJourneyReflection(args: {
  text: unknown;
  source: GroundedJourneySource;
}): JourneyOutputResult {
  const { text, source } = args;
  if (typeof text !== "string") return { ok: false, code: "output-not-text" };
  if (text.length > MAX_JOURNEY_OUTPUT_CHARS) {
    return { ok: false, code: "output-too-large" };
  }

  const normalised = text.replace(/\r\n/g, "\n").trim();
  if (normalised.length === 0) return { ok: false, code: "output-empty" };

  if (matches(MARKUP_PATTERNS, normalised)) {
    return { ok: false, code: "output-contains-markup" };
  }
  if (matches(GUARANTEE_PATTERNS, normalised)) {
    return { ok: false, code: "unsupported-therapeutic-guarantee" };
  }
  if (matches(DIAGNOSIS_PATTERNS, normalised)) {
    return { ok: false, code: "affirmative-diagnosis" };
  }
  if (!source.spiritualAuthorised && matches(DEVOTIONAL_PATTERNS, normalised)) {
    return { ok: false, code: "devotional-leakage" };
  }

  const paragraphs = normalised
    .split(/\n{2,}/)
    .map((p) => p.replace(/[ \t]+\n/g, "\n").trim())
    .filter((p) => p.length > 0);

  return {
    ok: true,
    reflection: {
      text: normalised,
      paragraphs,
      outputVersion: JOURNEY_OUTPUT_VERSION,
      validatorVersion: JOURNEY_VALIDATOR_VERSION,
    },
  };
}
