/** Evaluation-only preparation. No participant path, provider or credential access. */
import { readFileSync } from "node:fs";
import { bindFixturePack, sha256, type BoundPack } from "./comparison";
import { JOURNEY_MAX_PREPARED_CHARS } from "../../src/lib/ai/journey-generation";

export const CANDIDATE_V2_POLICY_VERSION = "journey-p4-eval-expression-v2+srt-candidate-v2";
// Pinned to the reviewed instruction block, not to prose outside the markers.
export const CANDIDATE_V2_INSTRUCTION_SHA256 =
  "c9278ab3af523d2df9f6259fdcf25256a95f4f89ebfbdf918ffe3f48db5aa1fe";

const ORIGINAL_RESTRAINT =
  "Include AT MOST ONE optional, proportionate question OR one possible next step. Never both, and neither is required.";
const EVALUATION_RESTRAINT =
  "Offer at most one connected, proportionate private reflection activity. A writing invitation pairs one specific sentence opening with exactly one gentle follow-through for the word or phrase the person chooses. A brief contextual spoken affirmation, a private prayer permitted by the supplied spiritual-on day material, or reading its supplied Scripture verse aloud may stand alone instead. Spiritual activities require the Christian-reflection preference to be on. Do not suggest talking or sharing with another person. Do not add a second exercise, unrelated question, extra action, or menu. An activity is not required.";

/** Change one reviewed evaluation rule; never mutate the participant policy. */
export function applyEvaluationRestraint(policy: string): string {
  const lines = policy.split("\n");
  if (lines.filter((line) => line === ORIGINAL_RESTRAINT).length !== 1)
    throw new Error("candidate-v2-restraint-drift");
  return lines
    .map((line) => (line === ORIGINAL_RESTRAINT ? EVALUATION_RESTRAINT : line))
    .join("\n");
}

export function bindCandidateV2(
  fixtureText: string,
  instructionV1Text: string,
  instructionV2Text: string,
): BoundPack {
  // Validate all original source hashes, v1 instructions and rejection probes first.
  // This keeps v1 evidence reproducible and prevents the new candidate from
  // silently accepting changed participant content, contracts or source rules.
  const baseline = bindFixturePack(fixtureText, instructionV1Text);
  const parts = [
    ...instructionV2Text.matchAll(
      /BEGIN CANDIDATE INSTRUCTIONS\r?\n([\s\S]*?)\r?\nEND CANDIDATE INSTRUCTIONS/g,
    ),
  ];
  if (parts.length !== 1 || !parts[0][1].trim()) throw new Error("candidate-v2-markers-invalid");
  const candidate = parts[0][1].trim();
  if (sha256(candidate) !== CANDIDATE_V2_INSTRUCTION_SHA256)
    throw new Error("candidate-v2-hash-mismatch");

  const cases = baseline.cases.map(({ fixture, prepared, request: original }) => {
    const request = Object.freeze({
      ...original,
      systemPolicy: `${applyEvaluationRestraint(prepared.policy)}\n\n${candidate}`,
    });
    if (request.systemPolicy.length + request.groundedPayload.length > JOURNEY_MAX_PREPARED_CHARS)
      throw new Error("preparation-too-large");
    return { fixture, prepared, request };
  });
  return {
    cases,
    manifest: {
      ...baseline.manifest,
      policyVersion: CANDIDATE_V2_POLICY_VERSION,
      candidateFileSha256: sha256(instructionV2Text),
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

export function loadBoundPackV2(): BoundPack {
  return bindCandidateV2(
    readFileSync("docs/pilot/fictional-ai-fixtures.v1.json", "utf8"),
    readFileSync("docs/pilot/SRT_RESPONSE_INSTRUCTIONS_v1.txt", "utf8"),
    readFileSync("docs/pilot/SRT_RESPONSE_INSTRUCTIONS_v2.txt", "utf8"),
  );
}
