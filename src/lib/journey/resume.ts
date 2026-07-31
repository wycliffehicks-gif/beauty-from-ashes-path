// Pure resume logic for the First Journey day flow.
//
// Browser storage is NEVER read here. Callers read the stored locator once,
// after hydration, and pass it in. That keeps server rendering and the first
// client render identical (no hydration mismatch), while still restoring the
// exact saved screen deterministically.

import type { JourneyLocator } from "./progress";

export interface ResumeRequest {
  /** Ordered step keys for the day being rendered, e.g. ["arrive", …]. */
  stepKeys: string[];
  /** The day currently on screen, e.g. "day-02". */
  dayId: string;
  /** The stored locator, or null when nothing is saved yet. */
  locator: JourneyLocator | null;
  /** True when the URL asked to resume (`?resume=true`). */
  requested: boolean;
}

/**
 * The index the flow should open on, or -1 when there is nothing valid to
 * restore and the flow should simply begin at the opening screen.
 *
 * Falls back to -1 for a missing, foreign-day, or stale/unknown-step locator,
 * so an invalid stored value can never strand a person on a blank screen.
 */
export function resolveResumeIndex({
  stepKeys,
  dayId,
  locator,
  requested,
}: ResumeRequest): number {
  if (!requested || !locator) return -1;
  if (locator.dayId !== dayId) return -1;

  const byStep = stepKeys.indexOf(locator.step);
  if (byStep >= 0) return byStep;

  // The step key is unknown for this day (content changed since it was saved).
  // A stored index is only trusted when it is still inside the flow.
  const idx = locator.index;
  if (typeof idx === "number" && idx > 0 && idx < stepKeys.length) return idx;
  return -1;
}

/**
 * Structured, low-sensitivity answer IDs. Only the step key and the option
 * position are stored — never the option wording a person chose.
 */
export function answerId(stepKey: string, optionIndex: number): string {
  return `${stepKey}.${optionIndex}`;
}

/** Option indexes previously chosen on a given step, in stored order. */
export function optionIndexesFor(
  answerIds: string[] | undefined,
  stepKey: string,
  optionCount: number,
): number[] {
  if (!answerIds) return [];
  const prefix = `${stepKey}.`;
  const out: number[] = [];
  for (const id of answerIds) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n >= 0 && n < optionCount && !out.includes(n)) {
      out.push(n);
    }
  }
  return out;
}

/**
 * Merge one step's selections into the day's stored answer IDs, leaving every
 * other step's answers untouched.
 */
export function mergeStepAnswers(
  existing: string[] | undefined,
  stepKey: string,
  optionIndexes: number[],
): string[] {
  const prefix = `${stepKey}.`;
  const others = (existing ?? []).filter((id) => !id.startsWith(prefix));
  return [...others, ...optionIndexes.map((n) => answerId(stepKey, n))];
}
