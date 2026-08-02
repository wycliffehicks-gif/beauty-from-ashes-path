// One-time v1 → v2 compatibility path for stored structured answers.
//
// v1 saved a positional token (`<stepKey>.<index>`). v2 saves each option's own
// stable id (`<stepKey>:<optionId>`). Every valid old position is translated
// through that day's current frozen option list, preserving order and every
// valid many-answer combination. Invalid or out-of-range tokens are ignored
// safely. Tokens that belong to no current step key are left untouched so
// nothing is silently destroyed.
//
// Completion is deliberately NOT carried across. Older builds could mark a day
// complete merely by opening a close URL, so an old marker is not proof that a
// day was finished. Leaving a day unfinished is the conservative choice; the
// person can simply walk it again, and all locator, answer and saved-reflection
// data is preserved.

import { FIRST_JOURNEY_DAYS } from "@/content/first-journey";
import { dayIdFor } from "@/content/journey";
import type { Choice } from "@/content/journey-types";
import { mergeStableStepAnswers, optionIdsFor } from "./answers";

interface DayStep {
  key: string;
  options: Choice[];
}

/** Stable storage keys and frozen option lists for every day, by day id. */
function dayStepIndex(): Map<string, DayStep[]> {
  const map = new Map<string, DayStep[]>();
  for (const day of FIRST_JOURNEY_DAYS) {
    const steps: DayStep[] = day.questions.map((q) => ({
      key: `q.${q.id}`,
      options: q.options,
    }));
    steps.push({ key: "step", options: day.step.options });
    map.set(dayIdFor(day.day), steps);
  }
  return map;
}

/** Rewrite one day's answer tokens into stable option ids. */
export function migrateDayAnswers(dayId: string, tokens: string[]): string[] {
  const steps = dayStepIndex().get(dayId);
  if (!steps) return tokens;

  let carried = tokens;
  let out: string[] = [];

  for (const step of steps) {
    const ids = optionIdsFor(carried, step.key, step.options);
    // Drop this step's tokens from what is carried forward, in either format.
    carried = carried.filter(
      (t) => !t.startsWith(`${step.key}:`) && !t.startsWith(`${step.key}.`),
    );
    if (ids.length > 0) out = mergeStableStepAnswers(out, step.key, ids);
  }

  // Anything not addressed by a current step key is preserved verbatim.
  return [...out, ...carried];
}

export function migrateAnswersToStableIds(
  answers: Record<string, string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [dayId, tokens] of Object.entries(answers)) {
    const next = migrateDayAnswers(dayId, tokens);
    if (next.length > 0) out[dayId] = next;
  }
  return out;
}
