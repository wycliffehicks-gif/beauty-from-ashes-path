// Choice-selection rules for question screens.
//
// Some questions carry a choice that cannot honestly co-exist with the others
// (for example "Nothing much registers right now"). Such a choice is marked
// `exclusive` in the content model, and this helper keeps the two directions
// consistent: choosing the exclusive option clears the rest, and choosing any
// other option clears the exclusive one.

import type { Question } from "@/content/journey-types";

export function toggleSelection(
  question: Question,
  selected: number[],
  idx: number,
): number[] {
  if (question.select === "one") {
    return selected.includes(idx) ? [] : [idx];
  }

  if (selected.includes(idx)) return selected.filter((n) => n !== idx);

  const next = [...selected, idx];
  if (question.options[idx]?.exclusive) return [idx];
  return next.filter((n) => !question.options[n]?.exclusive);
}
