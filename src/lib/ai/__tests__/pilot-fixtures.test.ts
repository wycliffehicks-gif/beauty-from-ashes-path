// Offline binding checks for the reviewed fictional comparison pack.
// No generation, provider import, credential access or real network request.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseJourneyRequest, JOURNEY_CONTRACT_VERSION } from "@/lib/ai/journey-contract";
import { prepareJourneyGeneration, JOURNEY_POLICY_VERSION } from "@/lib/ai/journey-policy";
import { JOURNEY_MAX_PREPARED_CHARS } from "@/lib/ai/journey-generation";
import { runJourneyBoundary } from "@/lib/ai/journey-boundary";
import { currentJourneyAiConsent } from "@/lib/ai/journey-consent";

const fixtures = JSON.parse(readFileSync("docs/pilot/fictional-ai-fixtures.v1.json", "utf8"));
const instructions = readFileSync("docs/pilot/SRT_RESPONSE_INSTRUCTIONS_v1.txt", "utf8");
const candidate = instructions.match(/BEGIN CANDIDATE INSTRUCTIONS\n([\s\S]*?)\nEND CANDIDATE INSTRUCTIONS/)?.[1]?.trim();
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const network = vi.fn(() => { throw new Error("This fixture check must remain offline"); });

beforeEach(() => {
  network.mockClear();
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  const calls = network.mock.calls.length;
  vi.unstubAllGlobals();
  expect(calls, "no network calls permitted").toBe(0);
});

describe("reviewed SRT fixture pack remains bound to current source", () => {
  it("accepts all 22 requests and preserves their reviewed labels, routing and source hashes", () => {
    expect(fixtures.contractVersion).toBe(JOURNEY_CONTRACT_VERSION);
    expect(fixtures.validCases).toHaveLength(22);
    expect(new Set(fixtures.validCases.map((item: { id: string }) => item.id)).size).toBe(22);
    expect([...new Set(fixtures.validCases.map((item: { request: { day: number } }) => item.request.day))].sort((a, b) => Number(a) - Number(b)))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    for (const item of fixtures.validCases) {
      const parsed = parseJourneyRequest(item.request);
      expect(parsed.ok, item.id).toBe(true);
      if (!parsed.ok) throw new Error(`Invalid reviewed fixture: ${item.id}`);
      const prepared = prepareJourneyGeneration(parsed.request);
      const source = prepared.grounding;
      expect({
        title: source.title,
        selections: source.selections,
        oneHonestStep: source.oneHonestStep,
        practiceRoutedBy: source.practiceRoutedBy,
        spiritualAuthorised: source.spiritualAuthorised,
        groundingVersion: source.groundingVersion,
      }, item.id).toEqual(item.expectedCanonicalSource);
      expect(source.oneHonestStep.reportedDone, item.id).toBe(false);
      if (!item.request.spiritual) expect(source.spiritualPractice, item.id).toBeUndefined();
      expect(item.baseline.policyVersion, item.id).toBe(JOURNEY_POLICY_VERSION);
      expect(hash(prepared.policy), item.id).toBe(item.baseline.policySha256);
      expect(hash(prepared.groundedPayload), item.id).toBe(item.baseline.groundedPayloadSha256);
      expect(prepared.policy.length + prepared.groundedPayload.length, item.id).toBe(item.baseline.preparedCharacters);
    }
    expect(fixtures.localVerification.validCasesAccepted).toBe(fixtures.validCases.length);
  });

  it("rejects all 12 invalid probes before admission or provider creation", async () => {
    expect(fixtures.rejectionCases).toHaveLength(12);
    const verifyPilotAdmission = vi.fn(async () => ({ ok: true as const }));
    const createProvider = vi.fn(() => { throw new Error("Invalid inputs must not construct a provider"); });
    for (const item of fixtures.rejectionCases) {
      const parsed = parseJourneyRequest(item.request);
      expect(parsed, item.id).toMatchObject({ ok: false, error: item.expected.error });
      expect(JSON.stringify(parsed), item.id).not.toContain("FICTIONAL_");
      const result = await runJourneyBoundary(
        { request: item.request, consent: currentJourneyAiConsent() },
        {
          // These are injected fictional test values, not runtime settings.
          env: { JOURNEY_AI_ENABLED: "true", JOURNEY_AI_RELEASE_READY: "true" },
          verifyPilotAdmission,
          createProvider,
        },
      );
      expect(result, item.id).toEqual({ ok: false, code: "invalid-request" });
    }
    expect(verifyPilotAdmission).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
    expect(fixtures.localVerification.invalidCasesRejected).toBe(12);
    expect(fixtures.localVerification.invalidBoundaryCasesRejected).toBe(12);
    expect(fixtures.localVerification.providerFactoriesCreated).toBe(0);
    expect(fixtures.localVerification.providerCalls).toBe(0);
  });

  it("keeps the exact candidate plus current-day source within the prepared-input ceiling", () => {
    expect(candidate).toBeTruthy();
    if (!candidate) throw new Error("Candidate instruction markers are missing");
    expect(hash(candidate)).toBe(fixtures.localVerification.candidateInstructionSha256);
    let maxBaseline = 0;
    let maxCombined = 0;
    for (const item of fixtures.validCases) {
      const parsed = parseJourneyRequest(item.request);
      if (!parsed.ok) throw new Error(`Invalid reviewed fixture: ${item.id}`);
      const prepared = prepareJourneyGeneration(parsed.request);
      const baseline = prepared.policy.length + prepared.groundedPayload.length;
      const combined = baseline + "\n\n".length + candidate.length;
      expect(combined, item.id).toBeLessThanOrEqual(JOURNEY_MAX_PREPARED_CHARS);
      maxBaseline = Math.max(maxBaseline, baseline);
      maxCombined = Math.max(maxCombined, combined);
    }
    expect(maxBaseline).toBe(fixtures.localVerification.maxBaselinePreparedCharacters);
    expect(maxCombined).toBe(fixtures.localVerification.maxCombinedCandidatePreparedCharacters);
  });
});
