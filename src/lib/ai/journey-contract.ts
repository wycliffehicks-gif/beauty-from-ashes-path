// Pure input contract for the CURRENT ten-day First Journey.
//
// TRANSPORT-FREE. This module has no provider, gateway, fetch, environment,
// storage or route access of any kind. It only decides whether an unknown
// caller-supplied object is a valid, current, understandable request.
//
// What may ever be supplied:
//   { day, answerMeaningVersion, answers: string[], spiritual: boolean }
// Nothing else. No free text, no identifiers, no prior-day history, no whole
// storage object, no caller-supplied teaching or content.
//
// Validation is deliberately strict and fails closed:
//   - the day must exist in FIRST_JOURNEY_DAYS;
//   - `answerMeaningVersion` must equal that day's CURRENT meaning exactly, so
//     an outdated coded answer is never reinterpreted;
//   - every token must be owned by a real step of that day and decode to a real
//     canonical option, using the existing answer-token semantics;
//   - the canonical single/multi and exclusivity semantics of each question are
//     enforced, rather than inventing meanings from a generic list of IDs;
//   - a real boolean spiritual preference is required. Absent, null or unknown
//     NEVER authorises spiritual content.
//
// Nothing here mutates its input or the canonical content.

import { FIRST_JOURNEY_DAYS, getFirstJourneyDay } from "@/content/first-journey";
import type { JourneyDayContent, Question } from "@/content/journey-types";
import { answerKeyFor } from "@/lib/journey/reflection-engine";

export const JOURNEY_CONTRACT_VERSION = "journey-c1";

/** Generous but bounded: no journey day has anywhere near this many answers. */
export const MAX_JOURNEY_ANSWER_TOKENS = 64;

const ALLOWED_FIELDS = ["day", "answerMeaningVersion", "answers", "spiritual"] as const;

export type JourneyContractErrorCode =
  | "not-an-object"
  | "unexpected-field"
  | "missing-field"
  | "unknown-day"
  | "outdated-answer-meaning"
  | "answers-not-string-array"
  | "too-many-tokens"
  | "malformed-token"
  | "unknown-token"
  | "duplicate-token"
  | "single-select-violation"
  | "exclusive-selection-conflict"
  | "excess-selections"
  | "spiritual-preference-required";

export interface JourneyContractFailure {
  ok: false;
  error: JourneyContractErrorCode;
  /**
   * Fixed internal identifiers only: a canonical field name from
   * ALLOWED_FIELDS, a canonical step key, or a canonical option id. Untrusted
   * caller input — arbitrary field names, supplied versions, tokens, counts —
   * is never echoed back.
   */
  detail?: string;
}


export interface JourneyStepSelection {
  questionId: string;
  stepKey: string;
  select: "one" | "many";
  /** Canonical option ids, in the order supplied. Never repaired. */
  optionIds: string[];
}

export interface JourneyRequest {
  day: JourneyDayContent;
  answerMeaningVersion: string;
  /** Raw coded answers, byte-for-byte as supplied. Never rewritten. */
  answers: string[];
  spiritual: boolean;
  /** Decoded per-question selections, questions then One Honest Step. */
  selections: JourneyStepSelection[];
  contractVersion: string;
}

export type JourneyContractResult =
  | { ok: true; request: JourneyRequest }
  | JourneyContractFailure;

function fail(
  error: JourneyContractErrorCode,
  detail?: string,
): JourneyContractFailure {
  return detail === undefined ? { ok: false, error } : { ok: false, error, detail };
}

function stepsOf(day: JourneyDayContent): Array<{ question: Question; stepKey: string }> {
  const out = day.questions.map((question) => ({
    question,
    stepKey: answerKeyFor(day, question.id),
  }));
  out.push({ question: day.step, stepKey: answerKeyFor(day, day.step.id) });
  return out;
}

/** Decode one owned token to a canonical option id, or null when unknown. */
function decodeToken(
  token: string,
  stepKey: string,
  options: readonly { id: string }[],
): string | null {
  if (token.startsWith(`${stepKey}:`)) {
    const candidate = token.slice(stepKey.length + 1);
    return options.some((o) => o.id === candidate) ? candidate : null;
  }
  const suffix = token.slice(stepKey.length + 1);
  if (!/^(0|[1-9]\d*)$/.test(suffix)) return null;
  const index = Number(suffix);
  return index < options.length ? options[index]!.id : null;
}

/** The canonical day numbers of the current journey. */
export function currentJourneyDayNumbers(): number[] {
  return FIRST_JOURNEY_DAYS.map((d) => d.day);
}

export function parseJourneyRequest(raw: unknown): JourneyContractResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return fail("not-an-object");
  }
  const input = raw as Record<string, unknown>;

  for (const key of Object.keys(input)) {
    if (!(ALLOWED_FIELDS as readonly string[]).includes(key)) {
      return fail("unexpected-field", key);
    }
  }
  for (const key of ALLOWED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) {
      return fail("missing-field", key);
    }
  }

  if (typeof input.spiritual !== "boolean") {
    return fail("spiritual-preference-required");
  }
  const spiritual = input.spiritual;

  if (typeof input.day !== "number" || !Number.isInteger(input.day)) {
    return fail("unknown-day");
  }
  const day = getFirstJourneyDay(input.day);
  if (!day) return fail("unknown-day", String(input.day));

  if (typeof input.answerMeaningVersion !== "string") {
    return fail("outdated-answer-meaning");
  }
  if (input.answerMeaningVersion !== day.answerMeaningVersion) {
    return fail("outdated-answer-meaning", input.answerMeaningVersion);
  }

  if (
    !Array.isArray(input.answers) ||
    input.answers.some((t) => typeof t !== "string")
  ) {
    return fail("answers-not-string-array");
  }
  const answers = input.answers as string[];
  if (answers.length > MAX_JOURNEY_ANSWER_TOKENS) {
    return fail("too-many-tokens", String(answers.length));
  }

  const steps = stepsOf(day);
  const byStep = new Map<string, string[]>();
  const seen = new Set<string>();

  for (const token of answers) {
    if (seen.has(token)) return fail("duplicate-token", token);
    seen.add(token);

    const owner = steps.find(
      (s) => token.startsWith(`${s.stepKey}:`) || token.startsWith(`${s.stepKey}.`),
    );
    if (!owner) return fail("malformed-token", token);

    const optionId = decodeToken(token, owner.stepKey, owner.question.options);
    if (!optionId) return fail("unknown-token", token);

    const list = byStep.get(owner.stepKey) ?? [];
    if (list.includes(optionId)) return fail("duplicate-token", token);
    list.push(optionId);
    byStep.set(owner.stepKey, list);
  }

  const selections: JourneyStepSelection[] = [];
  for (const { question, stepKey } of steps) {
    const optionIds = byStep.get(stepKey) ?? [];
    if (optionIds.length > question.options.length) {
      return fail("excess-selections", stepKey);
    }
    if (question.select === "one" && optionIds.length > 1) {
      return fail("single-select-violation", stepKey);
    }
    if (optionIds.length > 1) {
      const exclusive = optionIds.find(
        (id) => question.options.find((o) => o.id === id)?.exclusive,
      );
      if (exclusive) return fail("exclusive-selection-conflict", exclusive);
    }
    selections.push({
      questionId: question.id,
      stepKey,
      select: question.select,
      optionIds,
    });
  }

  return {
    ok: true,
    request: {
      day,
      answerMeaningVersion: day.answerMeaningVersion,
      answers: [...answers],
      spiritual,
      selections,
      contractVersion: JOURNEY_CONTRACT_VERSION,
    },
  };
}
