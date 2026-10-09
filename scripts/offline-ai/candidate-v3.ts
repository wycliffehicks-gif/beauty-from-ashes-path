/** Evaluation-only preparation. No participant path, provider or credential access. */
import { readFileSync } from "node:fs";
import { bindFixturePack, sha256, type BoundPack } from "./comparison";
import { JOURNEY_MAX_PREPARED_CHARS } from "../../src/lib/ai/journey-generation";

export const CANDIDATE_V3_POLICY_VERSION = "journey-p4-eval-expression-v3+srt-candidate-v3";
// Pinned to the reviewed instruction block, not to prose outside the markers.
export const CANDIDATE_V3_INSTRUCTION_SHA256 =
  "2af673b16bb6765a405208811cf7139bdc01155d059e29b353346dc458e07a0a";

const ORIGINAL_RESTRAINT =
  "Include AT MOST ONE optional, proportionate question OR one possible next step. Never both, and neither is required.";
const EVALUATION_RESTRAINT =
  "Offer at most one connected, proportionate private reflection activity. Every writing invitation pairs one specific sentence opening with exactly one distinct follow-through about the meaning or possible direction of the word or phrase the person chooses. With sparse or ambiguous inputs, one gentle day-linked narrative, preferred-difference or dignity-informed thought question can stand alone instead; do not combine it with writing or another task. A blank or null answer is unknown, never an inferred preference or inability. Respect explicit privacy and no-question/no-exercise choices. A brief contextual spoken affirmation, a private prayer permitted by the supplied spiritual-on day material, or reading its supplied Scripture verse aloud may stand alone instead. Spiritual activities require the Christian-reflection preference to be on. Do not suggest talking or sharing with another person. Do not add a second exercise, unrelated question, extra action, or menu. An activity is not required.";

/** Change one reviewed evaluation rule; never mutate the participant policy. */
export function applyEvaluationRestraintV3(policy: string): string {
  const lines = policy.split("\n");
  if (lines.filter((line) => line === ORIGINAL_RESTRAINT).length !== 1)
    throw new Error("candidate-v3-restraint-drift");
  return lines
    .map((line) => (line === ORIGINAL_RESTRAINT ? EVALUATION_RESTRAINT : line))
    .join("\n");
}

export function bindCandidateV3(
  fixtureText: string,
  instructionV1Text: string,
  instructionV3Text: string,
): BoundPack {
  // Validate all original source hashes, v1 instructions and rejection probes first.
  // This keeps v1 evidence reproducible and prevents the new candidate from
  // silently accepting changed participant content, contracts or source rules.
  const baseline = bindFixturePack(fixtureText, instructionV1Text);
  const parts = [
    ...instructionV3Text.matchAll(
      /BEGIN CANDIDATE INSTRUCTIONS\r?\n([\s\S]*?)\r?\nEND CANDIDATE INSTRUCTIONS/g,
    ),
  ];
  if (parts.length !== 1 || !parts[0][1].trim()) throw new Error("candidate-v3-markers-invalid");
  const candidate = parts[0][1].trim();
  if (sha256(candidate) !== CANDIDATE_V3_INSTRUCTION_SHA256)
    throw new Error("candidate-v3-hash-mismatch");

  const cases = baseline.cases.map(({ fixture, prepared, request: original }) => {
    const request = Object.freeze({
      ...original,
      systemPolicy: `${applyEvaluationRestraintV3(prepared.policy)}\n\n${candidate}`,
    });
    if (request.systemPolicy.length + request.groundedPayload.length > JOURNEY_MAX_PREPARED_CHARS)
      throw new Error("preparation-too-large");
    return { fixture, prepared, request };
  });
  return {
    cases,
    manifest: {
      ...baseline.manifest,
      policyVersion: CANDIDATE_V3_POLICY_VERSION,
      candidateFileSha256: sha256(instructionV3Text),
      candidateInstructionSha256: sha256(candidate),
      cases: cases.map(({ fixture, prepared, request }) => ({
        id: fixture.id,
        baselinePolicySha256: sha256(prepared.policy),
        combinedPolicySha256: sha256(request.systemPolicy),
        groundedPayloadSha256: sha256(request.groundedPayload),
        preparedCharacters: request.systemPolicy.length + request.groundedPayload.length,
        systemPolicy: request.systemPolicy,
        groundedPayload: request.groundedPayload,
      })),
    },
  };
}

export function loadBoundPackV3(): BoundPack {
  return bindCandidateV3(
    readFileSync("docs/pilot/fictional-ai-fixtures.v1.json", "utf8"),
    readFileSync("docs/pilot/SRT_RESPONSE_INSTRUCTIONS_v1.txt", "utf8"),
    readFileSync("docs/pilot/SRT_RESPONSE_INSTRUCTIONS_v3.txt", "utf8"),
  );
}
