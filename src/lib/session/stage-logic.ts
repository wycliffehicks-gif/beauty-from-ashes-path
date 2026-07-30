// Deterministic logic for weekly-session stages 9 and 10.
//
// RULES
// - Only IDs the person actually selected are ever used.
// - Nothing is inferred from what was left unselected.
// - No scoring, no ranking of the person, no diagnosis.
// - Output is tentative language only ("may", "might", "it sounds like").

import type { HonestStep } from "@/content/sessions";

/** Low-pressure suffixes that must never be treated as content. */
const LOW_PRESSURE_SUFFIXES = [
  "mixed",
  "numb",
  "unsure",
  "prefer-not",
  "none",
  "private",
  "not-today",
];

export function isLowPressureId(id: string): boolean {
  return LOW_PRESSURE_SUFFIXES.some(
    (s) => id === s || id.endsWith(`-${s}`),
  );
}

/** Human-readable fragments for integration synthesis, keyed by selected ID. */
const INTEGRATION_FRAGMENTS: Record<string, string> = {
  "un-protector-made-sense": "that how you have coped made sense",
  "un-two-forces": "that there are two honest forces in you rather than one failure",
  "un-not-laziness": "that this was never about discipline",
  "un-cost-visible": "that there is a present cost worth looking at",
  "un-grief-present": "that there is grief in this, not only difficulty",
  "un-still-connected": "that you are more connected than you assumed",
  "un-dignity": "that your dignity is not conditional on resolving this",
  "un-slower": "that this is allowed to take longer than you wanted",

  "uf-what-to-do": "what, if anything, to do about it",
  "uf-a-relationship": "a relationship that is not resolved",
  "uf-a-decision": "a decision you are not ready to make",
  "uf-grief": "grief that is not finished",
  "uf-trust-self": "whether you can trust your own read on this",
  "uf-worth": "whether you are worth the trouble of healing",
  "uf-almost-all": "most of it",

  "cr-tiredness": "how tired you are",
  "cr-grief": "the grief underneath this",
  "cr-protector": "the part of you that has been protecting you",
  "cr-loneliness": "how alone you have felt with it",
  "cr-shame": "the shame that shows up around this",
  "cr-body": "your body, which has been carrying it",
  "cr-hope": "the small amount of hope you still have",
};

function fragmentsFor(prefix: string, selected: string[]): string[] {
  return selected
    .filter((id) => id.startsWith(prefix) && !isLowPressureId(id))
    .map((id) => INTEGRATION_FRAGMENTS[id])
    .filter((x): x is string => Boolean(x));
}

function joinFragments(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export interface IntegrationSynthesis {
  lines: string[];
  /** True when nothing usable was selected — a complete outcome, not a failure. */
  empty: boolean;
}

/**
 * Builds a tentative synthesis from selected integration IDs only.
 * Selecting nothing (or only low-pressure answers) yields a complete,
 * non-inferring response rather than a guess.
 */
export function integrationSynthesis(selected: string[]): IntegrationSynthesis {
  const understood = fragmentsFor("un-", selected);
  const unfinished = fragmentsFor("uf-", selected);
  const care = fragmentsFor("cr-", selected);

  const lines: string[] = [];

  if (understood.length) {
    lines.push(
      `It sounds like something has shifted a little — ${joinFragments(understood)}. That may be small, and small is how this usually moves.`,
    );
  }
  if (unfinished.length) {
    lines.push(
      `And it seems that ${joinFragments(unfinished)} is still open. That is expected after one session, and leaving it open is not the same as avoiding it.`,
    );
  }
  if (care.length) {
    lines.push(
      `You named ${joinFragments(care)} as deserving care rather than pressure. Perhaps that is the part to be gentle with over the next few days.`,
    );
  }

  if (!lines.length) {
    return {
      empty: true,
      lines: [
        "Nothing needed to be gathered into words today, and that is a complete outcome. Something may settle later, when you are not looking at it directly — integration mostly happens after the session, not during it.",
      ],
    };
  }

  lines.push(
    "None of this is a conclusion. If any of it does not fit, it does not fit, and you are the one who knows.",
  );

  return { empty: false, lines };
}

/** Categories that must never appear as an offered step. */
export const FORBIDDEN_STEP_PATTERNS = [
  /confront/i,
  /reconcil/i,
  /forgiv/i,
  /\bconfess\b/i,
  /\bquit\b/i,
  /leave (your|the) (job|relationship|marriage)/i,
  /medication/i,
  /diagnos/i,
  /\bdisclose\b/i,
  /send (the|a) (message|letter|email)/i,
];

/**
 * Only the step's own label is screened. The `why` text is authored
 * explanation and often names a forbidden action precisely in order to rule
 * it out ("rehearsal is not confrontation"), so screening it would reject
 * safe steps.
 */
export function isApprovedStep(step: HonestStep): boolean {
  return !FORBIDDEN_STEP_PATTERNS.some((re) => re.test(step.label));
}

/**
 * Deterministically orders the approved steps so that ones adjacent to what
 * the person actually selected appear first. Nothing is added or removed on
 * the basis of unselected answers, and every approved step stays available.
 */
export function orderHonestSteps(
  steps: HonestStep[],
  priorIds: string[],
): HonestStep[] {
  const approved = steps.filter(isApprovedStep);
  const prior = new Set(priorIds.filter((id) => !isLowPressureId(id)));

  const boosted = new Set<HonestStep["category"]>();
  // Each mapping is a direct consequence of an explicitly selected ID.
  if (prior.has("os-very-little-energy") || prior.has("very-little-energy")) {
    boosted.add("rest");
    boosted.add("none");
  }
  if (prior.has("rc-safe-person") || prior.has("pf-connection") || prior.has("pf-help")) {
    boosted.add("relational");
  }
  if (prior.has("boundary") || prior.has("pr-pleasing")) {
    boosted.add("rehearsal");
  }
  if (prior.has("cost-body") || prior.has("cost-energy") || prior.has("cr-tiredness")) {
    boosted.add("rest");
  }
  if (prior.has("pr-numbing") || prior.has("pr-silence") || prior.has("cr-protector")) {
    boosted.add("noticing");
  }
  if (prior.has("rc-value") || prior.has("pf-faithfulness") || prior.has("rc-purpose")) {
    boosted.add("meaning");
  }
  if (prior.has("uf-worth") || prior.has("cr-shame") || prior.has("ask-help")) {
    boosted.add("support");
  }

  return approved
    .map((step, index) => ({ step, index }))
    .sort((a, b) => {
      const aB = boosted.has(a.step.category) ? 0 : 1;
      const bB = boosted.has(b.step.category) ? 0 : 1;
      if (aB !== bB) return aB - bB;
      return a.index - b.index;
    })
    .map((x) => x.step);
}

/** Tentative reflection shown after a step is chosen. */
export function stepReflection(step: HonestStep, theme: string | null): string[] {
  const lines = [step.why];
  if (theme) {
    lines.push(
      `It may also connect to what you named earlier — ${theme}. That link is a suggestion, not a finding; you may see it differently.`,
    );
  }
  lines.push(
    "Nothing follows automatically from this. If it does not happen, that is information rather than failure, and the step will still be here.",
  );
  return lines;
}

/** Plain-language label for the naming-stage theme, from selected IDs only. */
const NAMING_THEMES: Record<string, string> = {
  grief: "a grief that has not had room",
  boundary: "a boundary you have not set",
  "ask-help": "a request for help you have not made",
  relationship: "a relationship or a conversation",
  decision: "an unfinished decision",
  transition: "a change or transition",
  "no-words": "something that does not have words yet",
};

export function namingTheme(namingIds: string[]): string | null {
  for (const id of namingIds) {
    const theme = NAMING_THEMES[id];
    if (theme) return theme;
  }
  return null;
}
