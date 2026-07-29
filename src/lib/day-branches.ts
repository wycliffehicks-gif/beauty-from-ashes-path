// Deterministic routing for the six low-pressure branch responses on the
// daily Notice step. Content lives in src/content/days.ts under
// DayContent.branches; this module maps a branch key to (a) the curated
// response text and (b) the flow behaviour the UI should take next.
//
// No AI. No persistence. No re-asking. Each mode acknowledges the choice
// without shame and either carries the user forward gently or offers a
// safe, short close.

import type { DayBranches, DayContent } from "@/content/days";

export type BranchKey = keyof DayBranches;

export const BRANCH_KEYS: BranchKey[] = [
  "notSure",
  "preferNotToSay",
  "notToday",
  "veryLittleEnergy",
  "numb",
  "mixed",
];

export const BRANCH_LABELS: Record<BranchKey, string> = {
  notSure: "I’m not sure",
  preferNotToSay: "I’d rather not say",
  notToday: "Not today",
  veryLittleEnergy: "Very little energy",
  numb: "Numb",
  mixed: "Mixed",
};

/**
 * How the daily flow should behave after a branch response is shown.
 *
 * - forward: continue the day but skip the Name step (no re-asking).
 *   Used by notSure, preferNotToSay, mixed.
 * - low-arousal-grounding: offer a brief body/grounding moment instead of
 *   an emotion-naming prompt, then continue. Used by numb.
 * - tiny-step: shorten the remainder to a single genuinely small
 *   preparation step, then close. Used by veryLittleEnergy.
 * - grounding-close: offer a 60–90s grounding-and-blessing close and let
 *   the person leave safely; the day is still marked as visited (marking
 *   already happens on load — no pretence the full practice was completed).
 *   Used by notToday.
 */
export type BranchMode =
  | "forward"
  | "low-arousal-grounding"
  | "tiny-step"
  | "grounding-close";

export const BRANCH_MODES: Record<BranchKey, BranchMode> = {
  notSure: "forward",
  preferNotToSay: "forward",
  mixed: "forward",
  numb: "low-arousal-grounding",
  veryLittleEnergy: "tiny-step",
  notToday: "grounding-close",
};

export interface ResolvedBranch {
  key: BranchKey;
  label: string;
  response: string;
  mode: BranchMode;
}

export function resolveBranch(
  day: Pick<DayContent, "branches"> | undefined,
  key: BranchKey,
): ResolvedBranch | null {
  const response = day?.branches?.[key];
  if (!response) return null;
  return {
    key,
    label: BRANCH_LABELS[key],
    response,
    mode: BRANCH_MODES[key],
  };
}
