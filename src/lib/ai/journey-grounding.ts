// Grounding for the current ten-day journey.
//
// TRANSPORT-FREE and pure. Every teaching, theme, purpose, label and practice
// step comes from canonical app content only. A caller can never supply a
// teaching, a source passage, or wording of any kind.
//
// Rules encoded here:
//   - spiritual-only choices are filtered by the existing presentation filter
//     BEFORE anything outgoing is assembled, while the raw answers stay exactly
//     as supplied;
//   - the actual selected practice is resolved through resolvePractice(), so a
//     Day 9 routed rehearsal is honoured, and the canonical fallback is used for
//     private / unclear / none / unanswered;
//   - a skipped question is UNKNOWN, never evidence of avoidance;
//   - selections describe what was selected or considered. Nothing here records
//     that the person did anything, including One Honest Step;
//   - source teachings are general possibilities, never facts about the person;
//   - the ephemeral Day 10 prior-days thread is never included.

import type { JourneyDayContent, PracticePath, Question } from "@/content/journey-types";
import { presentationAnswers } from "@/lib/journey/presentation-answers";
import { resolvePractice } from "@/lib/journey/practice-router";
import { selectedOptionIds } from "@/lib/journey/reflection-engine";
import type { JourneyRequest } from "@/lib/ai/journey-contract";

export const JOURNEY_GROUNDING_VERSION = "journey-g2";

export interface GroundedJourneySelection {
  questionId: string;
  prompt: string;
  /**
   * Labels of selections that may be presented right now, exactly as authored.
   * No further categorisation is inferred: "nothing settled" and "something
   * named" can honestly coexist, and only the authored wording carries meaning.
   */
  labels: string[];
  /** Nothing presentable was selected. This means UNKNOWN, not avoidance. */
  unknown: boolean;
}


export interface GroundedJourneyPractice {
  title: string;
  summary: string;
  steps: string[];
  notRequired: string;
  /** Present only on the Christian path, and only when spiritual is on. */
  scripture?: { reference: string; body: string; note: string };
}

export interface GroundedJourneySource {
  day: number;
  title: string;
  theme: string;
  purpose: string;
  /** Canonical teaching for this day: general possibilities only. */
  teaching: string[];
  selections: GroundedJourneySelection[];
  /**
   * One Honest Step: what was SELECTED as a possible next step. Never a claim
   * that it was carried out.
   */
  oneHonestStep: {
    prompt: string;
    selectedLabel: string | null;
    /** Always false in this foundation: nothing records a completed action. */
    reportedDone: false;
  };
  /** The practice actually selected by this day's route, or the fallback. */
  practice: GroundedJourneyPractice;
  /** Which coded option routed the practice, when one did. */
  practiceRoutedBy: string | null;
  /** Present ONLY when spiritual reflection is explicitly on. */
  spiritualPractice?: GroundedJourneyPractice;
  spiritualAuthorised: boolean;
  answerMeaningVersion: string;
  groundingVersion: string;
}

function labelsFor(question: Question, ids: string[]): string[] {
  return ids
    .map((id) => question.options.find((o) => o.id === id)?.label)
    .filter((label): label is string => typeof label === "string");
}

function groundPractice(path: PracticePath, includeScripture: boolean): GroundedJourneyPractice {
  return {
    title: path.title,
    summary: path.summary,
    steps: [...path.steps],
    notRequired: path.notRequired,
    ...(includeScripture && path.scripture ? { scripture: { ...path.scripture } } : {}),
  };
}

/**
 * Build the grounded source for one validated request.
 *
 * The raw answers are read, never written. Presentation filtering decides what
 * may be described; withheld spiritual-only selections simply do not appear.
 */
export function buildJourneyGrounding(request: JourneyRequest): GroundedJourneySource {
  const day: JourneyDayContent = request.day;
  const showSpiritual = request.spiritual;

  const presentable = presentationAnswers(day, request.answers, {
    hydrated: true,
    showSpiritual,
  });

  const selections: GroundedJourneySelection[] = day.questions.map((question) => {
    const ids = selectedOptionIds(day, question.id, presentable);
    return {
      questionId: question.id,
      prompt: question.prompt,
      labels: labelsFor(question, ids),
      unknown: ids.length === 0,
    };
  });


  const stepIds = selectedOptionIds(day, day.step.id, presentable);
  const stepLabel = labelsFor(day.step, stepIds)[0] ?? null;

  // The practice the person is actually working with, including all Day 9
  // routed rehearsals and the canonical fallback.
  const resolved = resolvePractice(day, presentable);

  return {
    day: day.day,
    title: day.title,
    theme: day.theme,
    purpose: day.arrive.purpose,
    teaching: [...day.understand.body],
    selections,
    oneHonestStep: {
      prompt: day.step.prompt,
      selectedLabel: stepLabel,
      reportedDone: false,
    },
    practice: groundPractice(resolved.reflection, false),
    practiceRoutedBy: resolved.routedBy,
    ...(showSpiritual
      ? { spiritualPractice: groundPractice(resolved.spiritual, true) }
      : {}),
    spiritualAuthorised: showSpiritual,
    answerMeaningVersion: day.answerMeaningVersion,
    groundingVersion: JOURNEY_GROUNDING_VERSION,
  };
}
