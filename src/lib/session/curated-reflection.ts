// Deterministic curated reflection for Week 1 stage 6 (Compassionate
// Attunement).
//
// Pure. No I/O, no model, no storage. Given the person's stage 3–5 selections
// it maps to founder-approved content IDs and assembles the fixed six-section
// reflection in warm, coherent prose.
//
// Rules honoured here:
//   - Never infer anything from an option the person did NOT choose.
//   - Mixed / unsure / private / numb are acknowledged as real answers, never
//     treated as missing data or as hidden knowledge.
//   - No spiritual content — stage 7 owns spirituality and the complete
//     nonreligious path.
//   - Tentative language only.

import {
  SESSION_SECTION_ORDER,
  SESSION_W1_CONTENT_PACK,
  SESSION_W1_PACK_VERSION,
  findPackItem,
  type PackItem,
  type SessionSectionKey,
} from "@/content/ai/session-week-01";

export const CURATED_SELECTOR_VERSION = "2026-07-30.1";

export interface CuratedSelectionInput {
  /** Stage 3 choice IDs. */
  naming: string[];
  /** Stage 4 choice IDs (pf-*, pb-*, pr-*, and low-pressure ids). */
  exploration: string[];
  /** Stage 5 choice IDs (fn-*, cost-*, and low-pressure ids). */
  meaning: string[];
  /** Stage 2 choice IDs — used only to notice a numb/low-arousal state. */
  noticing?: string[];
  /** Whether the person wrote an optional note (content is NOT used to infer). */
  hasNote?: boolean;
}

export interface SessionReflectionSection {
  key: SessionSectionKey;
  heading: string;
  id: string;
  text: string;
}

export interface SessionReflectionOutput {
  hearing: { id: string; text: string };
  pulls: { id: string; text: string };
  protection: { id: string; text: string };
  cost: { id: string; text: string };
  holding: { id: string; text: string };
  support: { id: string; text: string } | null;
}

// -- helpers ----------------------------------------------------------------

const has = (list: string[], ...ids: string[]) => ids.some((id) => list.includes(id));

const LOW_PRESSURE_KINDS = ["mixed", "numb", "unsure", "prefer-not", "none"] as const;

/** True when a low-pressure answer of this kind was chosen anywhere in the list. */
const hasLowPressure = (list: string[], kind: (typeof LOW_PRESSURE_KINDS)[number]) =>
  list.some((id) => id === kind || id.endsWith(`-${kind}`));

const isLowPressure = (id: string) =>
  LOW_PRESSURE_KINDS.some((k) => id === k || id.endsWith(`-${k}`));

/** True when a substantive (non low-pressure) id with this prefix was chosen. */
const hasPrefix = (list: string[], prefix: string) =>
  list.some((id) => id.startsWith(prefix) && !isLowPressure(id));

function item(section: keyof typeof SESSION_W1_CONTENT_PACK | "support", id: string): PackItem {
  const found = findPackItem(
    section as "hearing" | "pulls" | "protection" | "cost" | "holding" | "support",
    id,
  );
  if (!found) throw new Error(`curated-reflection: unknown pack id ${id}`);
  return found;
}

// -- section selectors ------------------------------------------------------

export function selectHearingId(input: CuratedSelectionInput): string {
  const { naming, noticing = [] } = input;
  if (has(naming, "private") || hasLowPressure(input.exploration, "prefer-not")) {
    return "hearing-private";
  }
  if (hasLowPressure(noticing, "numb") || hasLowPressure(input.exploration, "numb"))
    return "hearing-numb";
  if (has(naming, "grief")) return "hearing-grief";
  if (has(naming, "relationship", "boundary", "ask-help")) return "hearing-relational";
  if (has(naming, "decision", "transition")) return "hearing-decision";
  if (has(naming, "truth-self")) return "hearing-self";
  return "hearing-general";
}

export function selectPullsId(input: CuratedSelectionInput): string {
  const { exploration } = input;
  if (hasLowPressure(exploration, "mixed")) return "pulls-mixed";
  const forward = hasPrefix(exploration, "pf-");
  const back = hasPrefix(exploration, "pb-");
  if (forward && back) return "pulls-both";
  if (forward) return "pulls-forward";
  if (back) return "pulls-back";
  return "pulls-unclear";
}

export function selectProtectionId(input: CuratedSelectionInput): string {
  const { exploration } = input;
  if (has(exploration, "pr-silence", "pr-withdrawing", "pr-numbing")) {
    return "protection-quiet";
  }
  if (has(exploration, "pr-busy", "pr-overthinking", "pr-controlling", "pr-pleasing")) {
    return "protection-effort";
  }
  if (has(exploration, "pr-anger", "pr-humour", "pr-spiritualising")) {
    return "protection-expression";
  }
  if (has(exploration, "pr-postponing")) return "protection-timing";
  return "protection-unnamed";
}

export function selectCostId(input: CuratedSelectionInput): string {
  const { meaning } = input;
  if (has(meaning, "cost-none-yet") || has(meaning, "fn-still-necessary")) {
    return "cost-not-yet";
  }
  if (has(meaning, "cost-grief")) return "cost-grief";
  if (has(meaning, "cost-relationships")) return "cost-relational";
  if (has(meaning, "cost-self-trust")) return "cost-self-trust";
  if (has(meaning, "cost-meaning")) return "cost-meaning";
  if (has(meaning, "cost-choice")) return "cost-choice";
  if (has(meaning, "cost-body", "cost-energy")) return "cost-body";
  return "cost-not-yet";
}

export function selectHoldingId(input: CuratedSelectionInput): string {
  const { meaning, exploration } = input;
  if (has(meaning, "fn-still-necessary") || has(meaning, "cost-none-yet")) {
    return "holding-not-yet";
  }
  if (has(meaning, "fn-accepted", "fn-protect-other", "fn-preserve-relationship", "fn-belonging")) {
    return "holding-companioned";
  }
  if (has(meaning, "fn-feel-less", "fn-hope-distance")) return "holding-dignity";
  if (has(meaning, "fn-control", "fn-functioning")) return "holding-both-and";
  if (hasLowPressure(exploration, "unsure") || has(meaning, "fn-unknown"))
    return "holding-slow";
  return "holding-both-and";
}

export function selectSupportId(input: CuratedSelectionInput): string {
  const { naming, meaning } = input;
  if (has(naming, "relationship", "boundary", "ask-help")) return "support-relational";
  if (has(naming, "grief") || has(meaning, "cost-grief")) return "support-heavy";
  return "support-general";
}

// -- assembly ---------------------------------------------------------------

export function buildCuratedReflection(
  input: CuratedSelectionInput,
): SessionReflectionOutput {
  const hearing = item("hearing", selectHearingId(input));
  const pulls = item("pulls", selectPullsId(input));
  const protection = item("protection", selectProtectionId(input));
  const cost = item("cost", selectCostId(input));
  const holding = item("holding", selectHoldingId(input));
  const support = item("support", selectSupportId(input));

  return {
    hearing: { id: hearing.id, text: hearing.text },
    pulls: { id: pulls.id, text: pulls.text },
    protection: { id: protection.id, text: protection.text },
    cost: { id: cost.id, text: cost.text },
    holding: { id: holding.id, text: holding.text },
    support: { id: support.id, text: support.text },
  };
}

/** Render the fixed six sections, in order, for display. */
export function toSections(
  output: SessionReflectionOutput,
): SessionReflectionSection[] {
  const headings: Record<SessionSectionKey, string> = {
    hearing: "What I’m hearing",
    pulls: "The two pulls that may be present",
    protection: "What this may have protected",
    cost: "What it may be costing now",
    holding: "A more compassionate way to hold it",
    support: "When more support may help",
  };

  return SESSION_SECTION_ORDER.flatMap((key) => {
    const section = output[key];
    if (!section) return [];
    return [{ key, heading: headings[key], id: section.id, text: section.text }];
  });
}

export function reflectionWordCount(output: SessionReflectionOutput): number {
  return toSections(output)
    .map((s) => s.text)
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export const CURATED_PACK_VERSION = SESSION_W1_PACK_VERSION;
