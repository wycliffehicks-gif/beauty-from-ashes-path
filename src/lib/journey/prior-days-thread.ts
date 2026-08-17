// Optional Day 10 gathering of earlier coded choices — PURE and EPHEMERAL.
//
// HARD RULES (enforced by tests)
//  - No browser API, storage read/write, network, model call, Date or random.
//  - No mutation of any input.
//  - Never reads or interprets `progress.answers` (the legacy mirror); only
//    `answerSets` for each day's CURRENT answer-meaning version.
//  - Never hard-codes an optional Christian choice: the generic presentation
//    filter runs BEFORE any decoding or validation, so a withheld choice leaves
//    no label, marker or indirect trace.
//  - Never outputs a raw option id, free text or anything typed.
//  - Nothing here is saved, fingerprinted, announced to a server or added to a
//    reflection: the caller renders it and drops it.

import { FIRST_JOURNEY_DAYS } from "@/content/first-journey";
import { dayIdFor } from "@/content/journey";
import type {
  JourneyDayContent,
  PriorDaysThreadDefinition,
  PriorDaysThreadSource,
  Question,
} from "@/content/journey-types";
import { answerKeyFor } from "@/lib/journey/reflection-engine";
import { presentationAnswers } from "@/lib/journey/presentation-answers";
import type { JourneyProgress } from "@/lib/journey/progress";
import { answersForDay } from "@/lib/journey/progress";

export interface PriorDaysThreadGroupView {
  id: string;
  title: string;
  paragraph: string;
}

export interface PriorDaysThreadView {
  heading: string;
  intro: string;
  groups: PriorDaysThreadGroupView[];
  /** Exact approved copy when nothing compatible could be gathered. */
  empty: string | null;
}

export interface PriorDaysThreadOptions {
  hydrated: boolean;
  showSpiritual: boolean;
}

const KEPT_PRIVATE = "kept private";
const LEFT_UNCLEAR = "left unclear";
const MULTI =
  "more than one option was selected; none is treated as the main one";
const MALFORMED = "stored choices could not be summarized safely";
const OLDER = "earlier choices used older wording and are not summarized here";

function canonicalDay(day: number): JourneyDayContent | undefined {
  return FIRST_JOURNEY_DAYS.find((d) => d.day === day);
}

function questionOn(day: JourneyDayContent, id: string): Question | undefined {
  if (day.step.id === id) return day.step;
  return day.questions.find((q) => q.id === id);
}

/** True when this token belongs to exactly this step key, in either form. */
function ownsToken(token: string, stepKey: string): boolean {
  return token.startsWith(`${stepKey}:`) || token.startsWith(`${stepKey}.`);
}

/**
 * The option id a step-owned token selects, or null when it does not decode to
 * a real canonical option. Only the accepted canonical decimal legacy form is
 * a position; everything else stays unknown.
 */
function decodeOwned(
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
  const n = Number(suffix);
  if (n >= options.length) return null;
  return options[n]!.id;
}

function labelFor(question: Question, id: string): string | null {
  const option = question.options.find((o) => o.id === id);
  return option ? option.label : null;
}

function quoted(label: string): string {
  return `\u201C${label}\u201D`;
}

/** One clause for one source, or null when the source contributes nothing. */
function clauseFor(
  source: PriorDaysThreadSource,
  progress: JourneyProgress,
  opts: PriorDaysThreadOptions,
): string | null {
  const day = canonicalDay(source.day);
  if (!day) return null;
  const question = questionOn(day, source.from);
  if (!question) return null;

  const stepKey = answerKeyFor(day, source.from);
  const sets = progress.answerSets?.[dayIdFor(day.day)];
  const hasCurrent =
    !!sets &&
    Object.prototype.hasOwnProperty.call(sets, day.answerMeaningVersion);

  if (!hasCurrent) {
    // Never decode an older set. Only detect whether an older set holds a token
    // owned by THIS exact source step, so an unrelated older answer cannot
    // manufacture a notice for this source.
    const older = sets
      ? Object.entries(sets).some(
          ([version, ids]) =>
            version !== day.answerMeaningVersion &&
            (ids ?? []).some((token) => ownsToken(token, stepKey)),
        )
      : false;
    return older ? `${source.descriptor}: ${OLDER}` : null;
  }

  const raw = answersForDay(progress, day);
  const presented = presentationAnswers(day, [...raw], opts);
  const owned = presented.filter((token) => ownsToken(token, stepKey));
  if (owned.length === 0) return null;

  const decoded = owned.map((token) => decodeOwned(token, stepKey, question.options));
  const known = decoded.filter((id): id is string => id !== null);

  const privateIds = source.privateIds ?? [];
  const unclearIds = source.unclearIds ?? [];
  const noneIds = source.noneIds ?? [];

  // Private dominates everything, including corruption and coexistence.
  if (known.some((id) => privateIds.includes(id))) {
    return `${source.descriptor}: ${KEPT_PRIVATE}`;
  }

  const malformed = (): string => `${source.descriptor}: ${MALFORMED}`;

  if (decoded.some((id) => id === null)) return malformed();
  if (new Set(known).size !== known.length) return malformed();
  if (known.length > 1 && question.select === "one") return malformed();

  const exclusiveCoexists =
    known.length > 1 &&
    known.some((id) =>
      question.options.some((o) => o.id === id && o.exclusive === true),
    );
  if (exclusiveCoexists) return malformed();

  const specials = known.filter(
    (id) => unclearIds.includes(id) || noneIds.includes(id),
  );
  if (specials.length > 1) return malformed();
  if (specials.length === 1 && known.length > 1) return malformed();

  if (known.length === 1) {
    const id = known[0]!;
    if (unclearIds.includes(id)) return `${source.descriptor}: ${LEFT_UNCLEAR}`;
    const label = labelFor(question, id);
    if (!label) return malformed();
    return `${source.descriptor}: ${quoted(label)}`;
  }

  // More than one substantive choice on a true multi-select.
  return `${source.descriptor}: ${MULTI}`;
}

/**
 * Build the optional Day 10 gathering. Deterministic, pure and ephemeral: the
 * same inputs always give the same words, and nothing is stored.
 */
export function buildPriorDaysThread(
  definition: PriorDaysThreadDefinition,
  progress: JourneyProgress,
  opts: PriorDaysThreadOptions,
): PriorDaysThreadView {
  const groups: PriorDaysThreadGroupView[] = [];

  for (const group of definition.groups) {
    const clauses: string[] = [];
    for (const source of group.sources) {
      const clause = clauseFor(source, progress, opts);
      if (clause) clauses.push(clause);
    }
    if (clauses.length === 0) continue;
    groups.push({
      id: group.id,
      title: group.title,
      paragraph: group.template.replace("{clauses}", clauses.join("; ")),
    });
  }

  return {
    heading: definition.heading,
    intro: definition.intro,
    groups,
    empty: groups.length === 0 ? definition.empty : null,
  };
}
