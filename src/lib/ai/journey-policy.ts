// Standalone generation policy and deterministic preparation for the CURRENT
// ten-day journey.
//
// TRANSPORT-FREE. Nothing here calls, imports or configures a provider, a
// gateway, an endpoint, an environment variable or storage. It produces the
// text of an immutable policy plus a deterministic local request identity, so a
// later integration has something exact to build on.
//
// This module deliberately does NOT import the obsolete Day-1-only six-section
// policy, its content pack, or its output schema.

import type {
  GroundedJourneySource,
} from "@/lib/ai/journey-grounding";
import {
  buildJourneyGrounding,
  JOURNEY_GROUNDING_VERSION,
} from "@/lib/ai/journey-grounding";
import type { JourneyRequest } from "@/lib/ai/journey-contract";
import { JOURNEY_CONTRACT_VERSION } from "@/lib/ai/journey-contract";

export const JOURNEY_POLICY_VERSION = "journey-p1";

/**
 * Provenance of a response that a later integration may show. Explicit and
 * minimal. A mock is never described as AI, and this contract does not change
 * the present authored reflection snapshot format in any way.
 */
export type JourneyResponseProvenance = "authored-deterministic" | "mock" | "live-model";

export interface JourneyResponseIdentity {
  provenance: JourneyResponseProvenance;
  contractVersion: string;
  groundingVersion: string;
  policyVersion: string;
  answerMeaningVersion: string;
  day: number;
  /**
   * Local metadata used to decide whether a stored response still belongs to
   * these presentable answers. It is NOT an anonymity claim about the data and
   * is not intended for inclusion in provider text.
   */
  canonicalIdentity: string;
}

export interface PreparedJourneyGeneration {
  grounding: GroundedJourneySource;
  /** The immutable system policy text for this request. */
  policy: string;
  /** Exactly the grounded material a provider would be given, as JSON. */
  groundedPayload: string;
  identity: JourneyResponseIdentity;
}

/**
 * Order-insensitive canonical view of everything that materially changes a
 * response. Reordering the same selections yields the same string; a different
 * selection, day, version, practice or spiritual preference does not.
 */
function canonicalIdentityOf(source: GroundedJourneySource): string {
  const canonical = {
    day: source.day,
    meaning: source.answerMeaningVersion,
    contract: JOURNEY_CONTRACT_VERSION,
    grounding: source.groundingVersion,
    policy: JOURNEY_POLICY_VERSION,
    spiritual: source.spiritualAuthorised,
    practice: source.practice.title,
    routedBy: source.practiceRoutedBy,
    step: source.oneHonestStep.selectedLabel,
    selections: [...source.selections]
      .map((s) => ({ q: s.questionId, labels: [...s.labels].sort() }))
      .sort((a, b) => (a.q < b.q ? -1 : a.q > b.q ? 1 : 0)),
  };
  return JSON.stringify(canonical);
}

export function buildJourneyPolicy(source: GroundedJourneySource): string {
  const lines: string[] = [
    "You are writing one short reflection inside Beauty from Ashes: The First Journey, a guided psycho-spiritual companion from Resurgence Therapeutics.",
    "",
    "GROUNDING",
    "Use only the supplied day material and the supplied selections. The day's teaching describes general possibilities; it is never a fact about this person.",
    "Never introduce teaching, history, or content that is not supplied.",
    "",
    "VOICE",
    "Warm, human, pastoral, plain Canadian English. Original prose, not a summary or a restatement of the supplied lines.",
    "Make meaningful, specific connections between what was selected, and offer interpretations tentatively.",
    "",
    "HONESTY",
    "Do not invent history, duration, causes, diagnoses, progress, or anything the person did.",
    "A question with no selection is unknown. It is not avoidance, denial, or resistance.",
    "One Honest Step names what was selected as possible. Never say it was carried out.",
    "Do not infer an unselected opposite, and do not direct major life decisions.",
    "",
    "RESTRAINT",
    "Do not force positivity, resolution, or a task. At most one optional, proportionate question or step.",
    "Sparse, private, or uncertain answers deserve a shorter and quieter response. There is no required length.",
    "Never diagnose, prescribe, promise an outcome, or imitate psychotherapy.",
    "",
    "SPIRITUAL BOUNDARY",
    source.spiritualAuthorised
      ? "Scripture and spiritual reflection are explicitly on. You may draw only on the supplied Christian practice and its supplied passage, tentatively, without certainty about God's intentions."
      : "Scripture and spiritual reflection are OFF. Introduce no prayer, no Scripture, no devotional teaching, and no religious framing of any kind.",
  ];
  return lines.join("\n");
}

export function prepareJourneyGeneration(
  request: JourneyRequest,
): PreparedJourneyGeneration {
  const grounding = buildJourneyGrounding(request);
  const canonicalIdentity = canonicalIdentityOf(grounding);
  return {
    grounding,
    policy: buildJourneyPolicy(grounding),
    groundedPayload: JSON.stringify(grounding),
    identity: {
      provenance: "live-model",
      contractVersion: JOURNEY_CONTRACT_VERSION,
      groundingVersion: JOURNEY_GROUNDING_VERSION,
      policyVersion: JOURNEY_POLICY_VERSION,
      answerMeaningVersion: grounding.answerMeaningVersion,
      day: grounding.day,
      canonicalIdentity,
    },
  };
}
