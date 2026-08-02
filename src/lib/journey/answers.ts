// Stable structured-answer identity for The First Journey.
//
// PRIVACY RULES
//  - Only a question/step key and a founder-frozen option id are ever stored.
//  - Never option wording, never free text, never anything in a URL or a log.
//
// FORMATS
//  - v2 (current): `<stepKey>:<optionId>` — the option's own stable id.
//  - v1 (legacy):  `<stepKey>.<optionIndex>` — a positional token.
//
// Decoding accepts BOTH so no valid existing selection disappears before the
// one-time migration rewrites it (see ./answer-migration.ts).

export interface OptionLike {
  id: string;
}

export function stableAnswerId(stepKey: string, optionId: string): string {
  return `${stepKey}:${optionId}`;
}

/** True when this token belongs to `stepKey`, in either format. */
function belongsToStep(token: string, stepKey: string): boolean {
  return token.startsWith(`${stepKey}:`) || token.startsWith(`${stepKey}.`);
}

/**
 * The option ids chosen on a step, in stored order, decoding both formats.
 * Invalid or out-of-range tokens are ignored safely.
 */
export function optionIdsFor(
  answerIds: string[] | undefined,
  stepKey: string,
  options: readonly OptionLike[],
): string[] {
  if (!answerIds) return [];
  const valid = new Set(options.map((o) => o.id));
  const out: string[] = [];

  for (const token of answerIds) {
    let id: string | undefined;

    if (token.startsWith(`${stepKey}:`)) {
      const candidate = token.slice(stepKey.length + 1);
      if (valid.has(candidate)) id = candidate;
    } else if (token.startsWith(`${stepKey}.`)) {
      const n = Number(token.slice(stepKey.length + 1));
      if (Number.isInteger(n) && n >= 0 && n < options.length) {
        id = options[n]!.id;
      }
    }

    if (id && !out.includes(id)) out.push(id);
  }

  return out;
}

/** The option positions chosen on a step, for rendering pressed buttons. */
export function optionIndexesForOptions(
  answerIds: string[] | undefined,
  stepKey: string,
  options: readonly OptionLike[],
): number[] {
  return optionIdsFor(answerIds, stepKey, options)
    .map((id) => options.findIndex((o) => o.id === id))
    .filter((n) => n >= 0);
}

/**
 * Merge one step's selections into a day's stored answers, leaving every other
 * step untouched. Existing tokens for this step are dropped in either format.
 */
export function mergeStableStepAnswers(
  existing: string[] | undefined,
  stepKey: string,
  optionIds: string[],
): string[] {
  const others = (existing ?? []).filter((token) => !belongsToStep(token, stepKey));
  return [...others, ...optionIds.map((id) => stableAnswerId(stepKey, id))];
}
