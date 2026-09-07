// MOCK-ONLY regression checks for the fixed completion-diagnostic profile.
// No network, no gateway, no participant imports, no storage.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  DIAGNOSTIC_FIXTURE_ORDER,
  DIAGNOSTIC_OUT_DIR,
  DIAGNOSTIC_PROFILE,
  DIAGNOSTIC_PROFILE_ID,
  diagnosticEnvelope,
  shouldStopAfter,
  summariseEntry,
  type DiagnosticEntry,
} from "@/lib/ai/eval/completion-diagnostic";
import {
  buildEvalPayload,
  runEvalFixture,
  EVAL_MAX_OUTPUT_TOKENS,
  EVAL_INPUT_CHAR_CAP,
  EVAL_TIMEOUT_MS,
  EVAL_PROFILES,
  type EvalProvider,
  type EvalRunRecord,
} from "@/lib/ai/eval/harness";

const COMPLETE_TEXT =
  "It sounds like grief has been close, and that sleep has been where you notice it most. " +
  "That may be one honest thing to hold today, without needing to explain or fix it. " +
  "If it feels right, you might notice one small moment of rest; if not, letting it be is enough.";

function mockProvider(
  over: Partial<Extract<Awaited<ReturnType<EvalProvider["generate"]>>, { ok: true }>> = {},
  kind: "live" | "mock" = "mock",
): EvalProvider {
  return {
    kind,
    name: "mock-provider",
    async generate() {
      return {
        ok: true,
        text: COMPLETE_TEXT,
        requestedModel: "google/gemini-3.6-flash",
        returnedModel: "google/gemini-3.6-flash",
        finishReason: "stop",
        ...over,
      };
    },
  };
}

describe("fixed completion-diagnostic profile", () => {
  it("uses a 4096-token ceiling, three calls, and the existing input/deadline caps", () => {
    expect(DIAGNOSTIC_PROFILE.maxOutputTokens).toBe(4096);
    expect(DIAGNOSTIC_PROFILE.maxCalls).toBe(3);
    expect(DIAGNOSTIC_PROFILE.inputCharCap).toBe(EVAL_INPUT_CHAR_CAP);
    expect(DIAGNOSTIC_PROFILE.timeoutMs).toBe(EVAL_TIMEOUT_MS);
  });

  it("leaves the legacy default profile limits unchanged", () => {
    expect(EVAL_PROFILES.default.maxOutputTokens).toBe(EVAL_MAX_OUTPUT_TOKENS);
    expect(EVAL_PROFILES.default.maxCalls).toBe(6);
    expect(buildEvalPayload("fx-day3-grief-sleep")).toMatchObject({
      ok: true,
      payload: { maxOutputTokens: EVAL_MAX_OUTPUT_TOKENS },
    });
  });

  it("runs exactly the three fixed Day 3 fixtures in order", () => {
    expect(DIAGNOSTIC_FIXTURE_ORDER).toEqual([
      "fx-day3-grief-sleep",
      "fx-day3-anger-patience",
      "fx-day3-private-uncertain",
    ]);
  });

  it("applies the profile ceiling to the payload and manifest", () => {
    const built = buildEvalPayload("fx-day3-grief-sleep", DIAGNOSTIC_PROFILE_ID);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload.maxOutputTokens).toBe(4096);
    expect(built.payload.timeoutMs).toBe(EVAL_TIMEOUT_MS);
    expect(built.manifest.profileId).toBe(DIAGNOSTIC_PROFILE_ID);
    expect(built.manifest.maxOutputTokens).toBe(4096);
    expect(built.manifest.totalChars).toBeLessThanOrEqual(EVAL_INPUT_CHAR_CAP);
  });

  it("refuses an unknown profile id rather than defaulting", () => {
    expect(buildEvalPayload("fx-day3-grief-sleep", "big-tokens")).toEqual({
      ok: false,
      error: "unknown-profile",
    });
  });

  it("refuses a fixture outside the diagnostic allowlist", () => {
    expect(buildEvalPayload("fx-day10-spiritual-on", DIAGNOSTIC_PROFILE_ID)).toEqual({
      ok: false,
      error: "unknown-fixture",
    });
    expect(buildEvalPayload("anything-else", DIAGNOSTIC_PROFILE_ID)).toEqual({
      ok: false,
      error: "unknown-fixture",
    });
  });

  it("writes to a new fixed directory and never the legacy artefact paths", () => {
    expect(DIAGNOSTIC_OUT_DIR).toBe("artifacts/ai-eval/completion-diagnostic-v1");
    const runner = readFileSync("scripts/ai-eval/run-completion-diagnostic.ts", "utf8");
    expect(runner).not.toContain("artifacts/ai-eval/results.json");
    expect(runner).not.toContain("artifacts/ai-eval/payload-manifests.json");
    expect(runner).toContain("DIAGNOSTIC_OUT_DIR");
  });
});

describe("diagnostic metadata capture", () => {
  it("keeps a numeric reasoning-token count when the provider returns one", async () => {
    const record = (await runEvalFixture(
      "fx-day3-grief-sleep",
      mockProvider({ usage: { completionTokens: 210, totalTokens: 1500, reasoningTokens: 640 } }),
      { profileId: DIAGNOSTIC_PROFILE_ID },
    )) as EvalRunRecord;
    const entry = summariseEntry(record);
    expect(entry.reasoningTokensStatus).toBe("returned");
    expect(entry.reasoningTokens).toBe(640);
    expect(entry.wordCount).toBeGreaterThan(20);
  });

  it("marks reasoning tokens explicitly unavailable when none are returned", async () => {
    const record = (await runEvalFixture(
      "fx-day3-anger-patience",
      mockProvider({ usage: { completionTokens: 190 } }),
      { profileId: DIAGNOSTIC_PROFILE_ID },
    )) as EvalRunRecord;
    const entry = summariseEntry(record);
    expect(entry.reasoningTokensStatus).toBe("unavailable");
    expect(entry).not.toHaveProperty("reasoningTokens");
  });

  it("records profile, caps and fixture order in the persisted envelope", () => {
    const envelope = diagnosticEnvelope([]);
    expect(envelope.profileId).toBe(DIAGNOSTIC_PROFILE_ID);
    expect(envelope.caps.maxOutputTokens).toBe(4096);
    expect(envelope.caps.maxCalls).toBe(3);
    expect(envelope.fixtureOrder).toEqual(DIAGNOSTIC_FIXTURE_ORDER);
  });
});

describe("stop on first failure or rejection", () => {
  const base = {
    fixtureId: "fx-day3-grief-sleep" as const,
    fixtureLabel: "FICTIONAL",
    fictional: true as const,
    day: 3,
    fingerprint: "eval-g1:d3:v1:test",
    providerName: "mock-provider",
    providerKind: "mock" as const,
    provenance: "mock" as const,
    validatorVersion: "eval-v2",
    durationMs: 10,
    accepted: true,
    reviewRequired: false,
    acceptanceSummary: "",
    manifest: {} as EvalRunRecord["manifest"],
  };

  it("continues only for an accepted, issue-free record", () => {
    expect(
      shouldStopAfter({ ...base, status: "ai_generated", validationIssues: [] } as EvalRunRecord),
    ).toBe(false);
  });

  it("stops on truncation, rejection, failure and policy flags", () => {
    for (const record of [
      { ...base, status: "rejected", validationIssues: ["output-truncated-by-token-cap"] },
      { ...base, status: "rejected", validationIssues: ["possibly-truncated"] },
      { ...base, status: "failure", validationIssues: [] },
      { ...base, status: "rejected", validationIssues: ["spiritual-language:god"] },
    ] as EvalRunRecord[]) {
      expect(shouldStopAfter(record)).toBe(true);
    }
  });

  it("stops on a returned-model mismatch", () => {
    expect(
      shouldStopAfter({
        ...base,
        status: "ai_generated",
        validationIssues: [],
        requestedModel: "google/gemini-3.6-flash",
        returnedModel: "some/other-model",
      } as EvalRunRecord),
    ).toBe(true);
  });

  it("persists every attempt immediately and marks the rest not attempted", () => {
    const entries: DiagnosticEntry[] = [
      { fixtureId: "fx-day3-grief-sleep", attempted: true, reasoningTokensStatus: "unavailable" },
      {
        fixtureId: "fx-day3-anger-patience",
        attempted: false,
        notAttemptedReason: "diagnostic stopped after an earlier failure or rejection",
        reasoningTokensStatus: "n/a",
      },
    ];
    const envelope = diagnosticEnvelope(entries);
    expect(envelope.entries).toHaveLength(2);
    expect(envelope.entries[1]?.attempted).toBe(false);

    const runner = readFileSync("scripts/ai-eval/run-completion-diagnostic.ts", "utf8");
    // Persisted before anything else happens with the record.
    expect(runner).toContain("persist(entries); // persisted immediately");
    // No retry, no cap escalation, no rerun loop.
    expect(runner).not.toMatch(/retry|maxOutputTokens\s*[:=]\s*\d/i);
  });
});

describe("isolation from the participant app", () => {
  it("does not import routes, storage or production AI wiring", () => {
    for (const file of [
      "src/lib/ai/eval/completion-diagnostic.ts",
      "scripts/ai-eval/run-completion-diagnostic.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/@\/routes|localStorage|sessionStorage|ai-reflection\.functions/);
      expect(src).not.toMatch(/live-pipeline|generateDay01Reflection/);
    }
  });

  it("is not imported by any route, client or server-function module", async () => {
    const { execSync } = await import("node:child_process");
    const hits = execSync(
      "grep -rl 'completion-diagnostic' src --include=*.ts --include=*.tsx || true",
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);
    expect(hits.sort()).toEqual([
      "src/lib/ai/eval/__tests__/completion-diagnostic.test.ts",
      "src/lib/ai/eval/completion-diagnostic.ts",
    ]);
  });
});
