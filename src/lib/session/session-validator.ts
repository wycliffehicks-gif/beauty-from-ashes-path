// Deterministic post-generation validator for the Week 1 session reflection.
//
// Runs on any candidate output — model-produced or curated. Pure code.
//
// Checks, in order:
//   1. Schema shape (strict; a spiritual field fails here by construction).
//   2. Every section id exists in the approved session content pack.
//   3. "hearing" uses at least one tentative-language marker.
//   4. No prohibited phrase anywhere.
//   5. No phone-number pattern anywhere.
//   6. No religious/spiritual content (stage 7 owns spirituality).
//   7. Support wording, if present, matches an approved reminder id.
//   8. Total word count between 250 and 420.

import {
  SESSION_W1_CONTENT_PACK,
  SESSION_W1_VALID_IDS,
} from "@/content/ai/session-week-01";
import { SessionReflectionOutputSchema } from "@/lib/session/session-schemas";
import type { SessionReflectionOutput } from "@/lib/session/curated-reflection";

export const SESSION_VALIDATOR_VERSION = "2026-07-30.1";

export const SESSION_MIN_WORDS = 250;
export const SESSION_MAX_WORDS = 420;

export type SessionValidatorFailure =
  | "schema-invalid"
  | "unknown-hearing-id"
  | "unknown-pulls-id"
  | "unknown-protection-id"
  | "unknown-cost-id"
  | "unknown-holding-id"
  | "unknown-support-id"
  | "hearing-not-tentative"
  | "prohibited-phrase"
  | "phone-number-detected"
  | "spiritual-content-detected"
  | "word-count-out-of-range";

export interface SessionValidatorResult {
  ok: boolean;
  failure?: SessionValidatorFailure;
  /** Internal only. Never surfaced to users. */
  detail?: string;
}

const TENTATIVE_MARKERS = [
  /\bmay\b/i,
  /\bmight\b/i,
  /\bperhaps\b/i,
  /\bit\s+sounds\s+like\b/i,
  /\bit\s+seems\b/i,
];

const PHONE_PATTERNS = [
  /\+\d[\d\s\-().]{6,}\d/,
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/,
  /\b1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  /\b\d{3}[-.\s]?\d{4}\b/,
  /\b\d{10,}\b/,
];

// Stage 6 must contain no spiritual or religious framing at all.
const SPIRITUAL_PATTERNS = [
  /\bgod\b/i,
  /\bjesus\b/i,
  /\bchrist\b/i,
  /\bscripture\b/i,
  /\bbible\b/i,
  /\bpray(er|ing|s)?\b/i,
  /\bholy\b/i,
  /\bpsalm\b/i,
  /\blord\b/i,
  /\bfaithfulness of god\b/i,
  /\bblessing\b/i,
  /\bsin\b/i,
];

export function validateSessionReflection(output: unknown): SessionValidatorResult {
  const parsed = SessionReflectionOutputSchema.safeParse(output);
  if (!parsed.success) {
    return { ok: false, failure: "schema-invalid", detail: parsed.error.message };
  }
  const o = parsed.data as SessionReflectionOutput;

  const idChecks: Array<[keyof typeof SESSION_W1_VALID_IDS, string | undefined, SessionValidatorFailure]> = [
    ["hearing", o.hearing.id, "unknown-hearing-id"],
    ["pulls", o.pulls.id, "unknown-pulls-id"],
    ["protection", o.protection.id, "unknown-protection-id"],
    ["cost", o.cost.id, "unknown-cost-id"],
    ["holding", o.holding.id, "unknown-holding-id"],
    ["support", o.support?.id, "unknown-support-id"],
  ];
  for (const [section, id, failure] of idChecks) {
    if (id === undefined) continue;
    if (!SESSION_W1_VALID_IDS[section].has(id)) {
      return { ok: false, failure, detail: id };
    }
  }

  if (!TENTATIVE_MARKERS.some((r) => r.test(o.hearing.text))) {
    return { ok: false, failure: "hearing-not-tentative" };
  }

  const raw = collectText(o);
  const lower = raw.toLowerCase();
  for (const phrase of SESSION_W1_CONTENT_PACK.prohibitedClaims) {
    if (lower.includes(phrase.toLowerCase())) {
      return { ok: false, failure: "prohibited-phrase", detail: phrase };
    }
  }

  for (const p of PHONE_PATTERNS) {
    if (p.test(raw)) return { ok: false, failure: "phone-number-detected" };
  }

  for (const p of SPIRITUAL_PATTERNS) {
    if (p.test(raw)) return { ok: false, failure: "spiritual-content-detected" };
  }

  const wc = raw.trim().split(/\s+/).filter(Boolean).length;
  if (wc < SESSION_MIN_WORDS || wc > SESSION_MAX_WORDS) {
    return { ok: false, failure: "word-count-out-of-range", detail: String(wc) };
  }

  return { ok: true };
}

function collectText(o: SessionReflectionOutput): string {
  return [
    o.hearing.text,
    o.pulls.text,
    o.protection.text,
    o.cost.text,
    o.holding.text,
    o.support?.text ?? "",
  ].join(" ");
}
