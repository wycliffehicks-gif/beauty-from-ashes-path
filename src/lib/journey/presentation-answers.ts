// Presentation-answer filtering for optional Christian choices.
//
// Some canonical choices exist ONLY for someone who has explicitly turned
// Scripture and spiritual reflection on (`Choice.spiritualOnly`). Storage is
// never rewritten for a preference change: the coded selection stays exactly
// where the person left it, and this pure helper simply decides what may be
// PRESENTED right now.
//
// RULES
//  - While preferences are unhydrated, or while `showSpiritual` is false, any
//    token selecting a spiritualOnly choice is withheld from presentation.
//  - When hydrated and on, the canonical answer returns to presentation with no
//    storage write of any kind.
//  - Both supported token forms are handled: the stable `q.route:god` form and
//    the legacy positional `q.route.7` form (the frozen canonical position of
//    Day 8's optional Christian choice), decoded exactly as the existing

//    answer helpers decode them.
//  - Unknown or malformed tokens are passed through untouched, so existing
//    normalization keeps sole authority over their meaning.

import type { JourneyDayContent, Question } from "@/content/journey-types";
import { answerKeyFor } from "@/lib/journey/reflection-engine";

interface StepSpec {
  stepKey: string;
  question: Question;
}

function stepsFor(day: JourneyDayContent): StepSpec[] {
  const out: StepSpec[] = day.questions.map((question) => ({
    stepKey: answerKeyFor(day, question.id),
    question,
  }));
  out.push({ stepKey: answerKeyFor(day, day.step.id), question: day.step });
  return out;
}

/**
 * The option id a single token selects on `stepKey`, or undefined when this
 * token does not belong to that step or does not decode to a real option.
 */
function decodeToken(
  token: string,
  stepKey: string,
  options: readonly { id: string }[],
): string | undefined {
  if (token.startsWith(`${stepKey}:`)) {
    const candidate = token.slice(stepKey.length + 1);
    return options.some((o) => o.id === candidate) ? candidate : undefined;
  }
  if (token.startsWith(`${stepKey}.`)) {
    const n = Number(token.slice(stepKey.length + 1));
    if (Number.isInteger(n) && n >= 0 && n < options.length) return options[n]!.id;
  }
  return undefined;
}

/** True when this stored token selects a spiritualOnly choice on this day. */
export function isSpiritualOnlyToken(day: JourneyDayContent, token: string): boolean {
  for (const { stepKey, question } of stepsFor(day)) {
    const id = decodeToken(token, stepKey, question.options);
    if (!id) continue;
    return question.options.some((o) => o.id === id && o.spiritualOnly === true);
  }
  return false;
}

/**
 * A new array safe to present right now. Raw storage is never mutated, and no
 * token is ever rewritten — tokens are only withheld or kept.
 */
export function presentationAnswers(
  day: JourneyDayContent,
  raw: string[] | undefined,
  opts: { hydrated: boolean; showSpiritual: boolean },
): string[] {
  const answers = raw ?? [];
  const allowSpiritual = opts.hydrated && opts.showSpiritual;
  if (allowSpiritual) return [...answers];
  return answers.filter((token) => !isSpiritualOnlyToken(day, token));
}

/** Canonical options visible on a question screen right now, order preserved. */
export function presentationOptions(
  question: Question,
  opts: { hydrated: boolean; showSpiritual: boolean },
): { option: Question["options"][number]; index: number }[] {
  const allowSpiritual = opts.hydrated && opts.showSpiritual;
  return question.options
    .map((option, index) => ({ option, index }))
    .filter(({ option }) => allowSpiritual || option.spiritualOnly !== true);
}
