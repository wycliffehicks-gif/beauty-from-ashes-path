// Grounding builder for the isolated AI evaluation harness.
//
// Pure. Builds the ONLY material that may leave this machine for one fictional
// fixture: the current day's purpose, theme, teaching, the relevant
// nonreligious practice (and the approved spiritual practice ONLY when
// spiritual reflection is explicitly on), the labels of the selections that may
// be presented right now, and the optional One Honest Step label when one was
// selected.
//
// Not included: whole content archives, other days, session or library
// material, raw storage, browser state, or any selection withheld by the
// spiritual-presentation filter.

import type { JourneyDayContent, Question } from "@/content/journey-types";
import { FIRST_JOURNEY_DAYS } from "@/content/first-journey";
import { answerKeyFor, selectedOptionIds } from "@/lib/journey/reflection-engine";
import { presentationAnswers } from "@/lib/journey/presentation-answers";

export const EVAL_GROUNDING_VERSION = "eval-g1";

export interface GroundedSelection {
  questionId: string;
  prompt: string;
  /** Labels of the selections that may be presented right now. */
  labels: string[];
  /** True when the person explicitly kept this private. */
  keptPrivate: boolean;
  /** True when the person explicitly marked it unclear / unsure / unknown. */
  markedUnclear: boolean;
  /** True when the person explicitly reported none. */
  reportedNone: boolean;
  /** True when nothing presentable was selected. */
  unanswered: boolean;
}

export interface GroundedPractice {
  title: string;
  summary: string;
  steps: string[];
  notRequired: string;
  scripture?: { reference: string; body: string; note: string };
}

export interface GroundedSource {
  day: number;
  title: string;
  theme: string;
  purpose: string;
  teaching: string[];
  selections: GroundedSelection[];
  /** Selected One Honest Step label, when one was selected and presentable. */
  stepChoice?: string;
  practice: GroundedPractice;
  /** Present ONLY when spiritual reflection is explicitly on. */
  spiritualPractice?: GroundedPractice;
  spiritualAuthorised: boolean;
  answerMeaningVersion: string;
  groundingVersion: string;
  /** Stable non-secret fingerprint of exactly the strings above. */
  fingerprint: string;
}

const PRIVATE_IDS = new Set(["private"]);
const UNCLEAR_IDS = new Set(["unsure", "unclear", "unknown"]);
const NONE_IDS = new Set(["none", "nothing", "unavailable"]);

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function labelsFor(question: Question, ids: string[]): string[] {
  return ids
    .map((id) => question.options.find((o) => o.id === id)?.label)
    .filter((label): label is string => typeof label === "string");
}

function groundPractice(path: GroundedPractice): GroundedPractice {
  return {
    title: path.title,
    summary: path.summary,
    steps: [...path.steps],
    notRequired: path.notRequired,
    ...(path.scripture ? { scripture: { ...path.scripture } } : {}),
  };
}

export function getEvalDay(day: number): JourneyDayContent | undefined {
  return FIRST_JOURNEY_DAYS.find((d) => d.day === day);
}

/**
 * Build the grounded source for one day and one coded answer set.
 *
 * `showSpiritual` is applied BEFORE anything is assembled: withheld tokens are
 * filtered out by the existing presentation filter, and the spiritual practice
 * is omitted entirely when spiritual reflection is off.
 */
export function buildGroundedSource(args: {
  day: JourneyDayContent;
  answers: string[];
  showSpiritual: boolean;
}): GroundedSource {
  const { day, showSpiritual } = args;

  const presentable = presentationAnswers(day, args.answers, {
    hydrated: true,
    showSpiritual,
  });

  const selections: GroundedSelection[] = day.questions.map((question) => {
    const ids = selectedOptionIds(day, question.id, presentable);
    return {
      questionId: question.id,
      prompt: question.prompt,
      labels: labelsFor(question, ids),
      keptPrivate: ids.some((id) => PRIVATE_IDS.has(id)),
      markedUnclear: ids.some((id) => UNCLEAR_IDS.has(id)),
      reportedNone: ids.some((id) => NONE_IDS.has(id)),
      unanswered: ids.length === 0,
    };
  });

  const stepIds = selectedOptionIds(day, day.step.id, presentable);
  const stepLabel = labelsFor(day.step, stepIds)[0];

  const practice = groundPractice(day.practise.reflection);
  const spiritual = showSpiritual ? groundPractice(day.practise.spiritual) : undefined;

  const source: Omit<GroundedSource, "fingerprint"> = {
    day: day.day,
    title: day.title,
    theme: day.theme,
    purpose: day.arrive.purpose,
    teaching: [...day.understand.body],
    selections,
    ...(stepLabel ? { stepChoice: stepLabel } : {}),
    practice,
    ...(spiritual ? { spiritualPractice: spiritual } : {}),
    spiritualAuthorised: showSpiritual,
    answerMeaningVersion: day.answerMeaningVersion,
    groundingVersion: EVAL_GROUNDING_VERSION,
  };

  const canonical = JSON.stringify(source);
  return {
    ...source,
    fingerprint: `${EVAL_GROUNDING_VERSION}:d${day.day}:${day.answerMeaningVersion}:${fnv1a(canonical)}`,
  };
}

/** Key used only to identify the answer key of a question in manifests. */
export const groundedAnswerKeyFor = answerKeyFor;
