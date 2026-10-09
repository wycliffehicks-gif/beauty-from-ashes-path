/** Evaluation-only preparation. No participant path, provider or credential access. */
import { readFileSync } from "node:fs";
import { bindFixturePack, sha256, type BoundPack } from "./comparison";
import { JOURNEY_MAX_PREPARED_CHARS } from "../../src/lib/ai/journey-generation";

export const CANDIDATE_V5_POLICY_VERSION = "journey-p4-eval-expression-v5+srt-candidate-v5";
// Pinned to the reviewed instruction block, not to prose outside the markers.
export const CANDIDATE_V5_INSTRUCTION_SHA256 =
  "cb58209c5d93ded7ad155a84a8bcc8f1dab95bc20df268922fd5f0a6198e81d1";

const ORIGINAL_RESTRAINT =
  "Include AT MOST ONE optional, proportionate question OR one possible next step. Never both, and neither is required.";
const EVALUATION_RESTRAINT =
  "Offer at most one connected, proportionate private reflection activity, grounded in the day and actual selections with one concrete anchor and one linked exploration; this is one focus, not a question-count rule. Every writing invitation pairs an explicit sentence opening with one distinct AFTER-writing exploration of meaning, context or chosen direction in the person's own words, without presuming fault or requiring repair. For Day 1 uncertain or private input, one private invitation to name a change they would wish for and why it would matter can stand alone; do not assume the change, add an observable sign, or default to sensory grounding. A blank or null answer is unknown. Preserve A-or-B uncertainty. Respect explicit privacy and no-question/no-exercise choices. A brief contextual spoken affirmation, a private prayer permitted by the supplied spiritual-on day material, or reading its supplied Scripture verse aloud may stand alone instead. Spiritual activities require the Christian-reflection preference to be on. Do not suggest talking or sharing with another person. Do not add a second exercise, unrelated question, extra action, or menu. An activity is not required.";

/** Change one reviewed evaluation rule; never mutate the participant policy. */
export function applyEvaluationRestraintV5(policy: string): string {
  const lines = policy.split("\n");
  if (lines.filter((line) => line === ORIGINAL_RESTRAINT).length !== 1)
    throw new Error("candidate-v5-restraint-drift");
  return lines
    .map((line) => (line === ORIGINAL_RESTRAINT ? EVALUATION_RESTRAINT : line))
    .join("\n");
}

export function bindCandidateV5(
  fixtureText: string,
  instructionV1Text: string,
  instructionV5Text: string,
): BoundPack {
  // Validate all original source hashes, v1 instructions and rejection probes first.
  const baseline = bindFixturePack(fixtureText, instructionV1Text);
  const parts = [
    ...instructionV5Text.matchAll(
      /BEGIN CANDIDATE INSTRUCTIONS\r?\n([\s\S]*?)\r?\nEND CANDIDATE INSTRUCTIONS/g,
    ),
  ];
  if (parts.length !== 1 || !parts[0][1].trim()) throw new Error("candidate-v5-markers-invalid");
  const candidate = parts[0][1].trim();
  if (sha256(candidate) !== CANDIDATE_V5_INSTRUCTION_SHA256)
    throw new Error("candidate-v5-hash-mismatch");

  const cases = baseline.cases.map(({ fixture, prepared, request: original }) => {
    const request = Object.freeze({
      ...original,
      systemPolicy: `${applyEvaluationRestraintV5(prepared.policy)}\n\n${candidate}`,
    });
    if (request.systemPolicy.length + request.groundedPayload.length > JOURNEY_MAX_PREPARED_CHARS)
      throw new Error("preparation-too-large");
    return { fixture, prepared, request };
  });
  return {
    cases,
    manifest: {
      ...baseline.manifest,
      policyVersion: CANDIDATE_V5_POLICY_VERSION,
      candidateFileSha256: sha256(instructionV5Text),
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

export function loadBoundPackV5(): BoundPack {
  return bindCandidateV5(
    readFileSync("docs/pilot/fictional-ai-fixtures.v1.json", "utf8"),
    readFileSync("docs/pilot/SRT_RESPONSE_INSTRUCTIONS_v1.txt", "utf8"),
    readFileSync("docs/pilot/SRT_RESPONSE_INSTRUCTIONS_v5.txt", "utf8"),
  );
}
